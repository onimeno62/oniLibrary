"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { Work } from "@/lib/types";
import { useApp } from "@/lib/store";

/* ============================================================
   EpubBookView — typographic continuous reader for parsed EPUBs
   (FMT-002). Progress is stored as chapter.lastPage ratio (0..1).
   ============================================================ */

/* The book content is a MEMOIZED leaf: reader re-renders (scroll progress
   saves, search typing, chrome toggles) must never re-apply
   dangerouslySetInnerHTML — that would wipe resolved image srcs and the
   search-hit flash highlight. Only html/font/size changes re-render it. */
const EpubArticle = memo(function EpubArticle({
  html,
  font,
  fontSize,
  workTitle,
  chapterTitle,
  contentRef,
}: {
  html: string;
  font: "serif" | "sans";
  fontSize: number;
  workTitle: string;
  chapterTitle?: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <article dir="auto" className="mx-auto max-w-[560px] px-6 pb-24 pt-6" style={{ fontSize }}>
      {/* chapter heading */}
      <header className="mb-6 border-b border-current/10 pb-4">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-50"
          style={{ fontFamily: "var(--font-nunito), sans-serif" }}
        >
          {workTitle}
        </p>
        <h2 className="mt-1.5 text-[1.35em] font-black leading-snug">{chapterTitle}</h2>
      </header>

      {/* sanitized book content */}
      <div
        ref={contentRef}
        className="epub-content"
        style={
          font === "sans"
            ? { fontFamily: "var(--font-nunito), var(--font-vazirmatn), sans-serif" }
            : { fontFamily: "Georgia, 'Iowan Old Style', var(--font-vazirmatn), serif" }
        }
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  );
});

export function EpubBookView({
  work,
  chapterId,
  fontSize,
  font = "serif",
  theme = "dark",
  jumpTarget = null,
  onMarksFound,
}: {
  work: Work;
  chapterId: string;
  fontSize: number;
  font?: "serif" | "sans";
  theme?: "dark" | "sepia" | "paper";
  /** search hit to scroll to — {query, nonce} so identical queries re-trigger; index selects the active match */
  jumpTarget?: { query: string; nonce: number; index?: number } | null;
  /** reports how many in-chapter matches were just marked (drives the find bar) */
  onMarksFound?: (count: number) => void;
}) {
  const workId = work.id;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const chapter = work.chapters.find((c) => c.id === chapterId);
  const restoredRef = useRef(false);
  const markReadRef = useRef(false);

  /* load the parsed document once */
  useEffect(() => {
    let alive = true;
    setHtml(null);
    setMissing(false);
    import("@/lib/importer")
      .then((m) => m.loadEpub(workId))
      .then((doc) => {
        if (!alive) return;
        const ch = doc?.chapters.find((c) => c.id === chapterId);
        if (ch) setHtml(ch.html);
        else setMissing(true);
      });
    return () => {
      alive = false;
    };
  }, [workId, chapterId]);

  /* restore scroll ratio + reset per-chapter guards */
  useEffect(() => {
    restoredRef.current = false;
    markReadRef.current = false;
  }, [chapterId]);

  useEffect(() => {
    if (html === null || restoredRef.current || !scrollRef.current) return;
    restoredRef.current = true;
    const ratio = typeof chapter?.lastPage === "number" ? chapter.lastPage : 0;
    const el = scrollRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = ratio * (el.scrollHeight - el.clientHeight);
    });
  }, [html, chapter]);

  /* scroll -> progress (throttled with rAF) */
  const rafRef = useRef(0);
  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
      useApp.getState().setChapterProgress(workId, chapterId, ratio);
      if (ratio >= 0.95 && !markReadRef.current) {
        markReadRef.current = true;
        useApp.getState().markChapterRead(workId, chapterId, true);
      }
    });
  };

  /* resolve oni-img: sources (embedded book images) to object URLs */
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (html === null) return;
    const root = contentRef.current;
    if (!root) return;
    let alive = true;
    const made: string[] = [];
    const imgs = [...root.querySelectorAll<HTMLImageElement>("img[src^='oni-img:']")];
    for (const img of imgs) {
      const key = decodeURIComponent((img.getAttribute("src") ?? "").slice("oni-img:".length));
      if (!key) continue;
      void (async () => {
        try {
          const { loadPageUrl } = await import("@/lib/importer");
          const url = await loadPageUrl(key);
          if (!alive) {
            if (url) URL.revokeObjectURL(url);
            return;
          }
          if (url) {
            made.push(url);
            img.src = url;
          } else {
            img.remove();
          }
        } catch {
          if (alive) img.remove();
        }
      })();
    }
    return () => {
      alive = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [html, chapterId]);

  /* in-chapter find (book search): wrap EVERY match in <mark class="oni-find">
     and activate the selected one. Marks are rebuilt on each jump and removed
     when jumpTarget clears. A content re-render (font/size/theme change) wipes
     them — they re-apply on the next jump (same trade-off as the old flash). */
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    // unwrap any previous marks (keeps text intact)
    root.querySelectorAll("mark.oni-find").forEach((m) => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      m.remove();
      parent.normalize();
    });
    if (html === null || !jumpTarget) {
      onMarksFound?.(0);
      return;
    }
    const q = jumpTarget.query.toLowerCase();
    if (!q) {
      onMarksFound?.(0);
      return;
    }
    // collect matches over text nodes, longest-first split (script/style skipped)
    type Seg = { node: Text; start: number; end: number };
    const segs: Seg[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (p && (p.closest("script,style") || p.classList.contains("oni-find")))
          return NodeFilter.FILTER_REJECT;
        return (n.textContent ?? "").length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      segs.push({ node, start: 0, end: node.textContent?.length ?? 0 });
    }
    const marks: HTMLElement[] = [];
    const CAP = 200;
    for (const seg of segs) {
      if (marks.length >= CAP) break;
      const text = seg.node.textContent ?? "";
      const lower = text.toLowerCase();
      let from = 0;
      let ranges: Array<[number, number]> = [];
      for (;;) {
        const at = lower.indexOf(q, from);
        if (at < 0) break;
        ranges.push([at, at + q.length]);
        from = at + q.length;
      }
      if (!ranges.length) continue;
      // replace node content: split around matches and wrap them
      const frag = document.createDocumentFragment();
      let cursor = 0;
      for (const [s, e] of ranges) {
        if (s > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, s)));
        const mark = document.createElement("mark");
        mark.className = "oni-find";
        mark.textContent = text.slice(s, e);
        frag.appendChild(mark);
        marks.push(mark);
        cursor = e;
      }
      if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
      seg.node.parentNode?.replaceChild(frag, seg.node);
    }
    onMarksFound?.(marks.length);
    const idx = Math.max(0, Math.min(marks.length - 1, jumpTarget.index ?? 0));
    const active = marks[idx] ?? null;
    if (active) {
      active.classList.add("oni-find-active");
      requestAnimationFrame(() => active.scrollIntoView({ block: "center" }));
    }
  }, [html, jumpTarget?.nonce]);

  if (missing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-[14px] font-bold text-white/80">{`This book's chapters need re-import.`}</p>
        <p className="text-[12px] text-white/50">{`Reopen the original .epub file to restore the text.`}</p>
      </div>
    );
  }

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-[#f8694c]" />
      </div>
    );
  }

  const themed = theme !== "dark";
  const bg =
    theme === "paper" ? "#faf7f0" : theme === "sepia" ? "#f3e8d5" : undefined;
  const fg = themed ? "#2b241d" : undefined;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-y-auto thin-scrollbar"
      style={{
        background: bg,
        color: fg,
        transition: "background 300ms ease, color 300ms ease",
      }}
    >
      <EpubArticle
        html={html}
        font={font}
        fontSize={fontSize}
        workTitle={work.title}
        chapterTitle={chapter?.title}
        contentRef={contentRef}
      />
    </div>
  );
}
