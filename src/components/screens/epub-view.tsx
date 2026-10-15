"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, PenLine, Trash2, X } from "lucide-react";
import type { Work, Highlight, HighlightColor } from "@/lib/types";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/* ============================================================
   EpubBookView — typographic continuous reader for parsed EPUBs
   (FMT-002). Progress is stored as chapter.lastPage ratio (0..1).
   Round 10: saved text-selection highlight annotations with notes
   and 4 colors, anchored by global char offsets so they survive
   font/size/theme changes.
   ============================================================ */

export const HL_COLORS: Record<HighlightColor, string> = {
  coral: "#f8694c",
  mint: "#2dd4a7",
  amber: "#f5b13d",
  violet: "#a78bfa",
};

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
    <article dir="auto" className="mx-auto max-w-[560px] px-6 pb-24 pt-24" style={{ fontSize }}>
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

/* ------------------------------------------------------------------ */
/* text-index helpers — global char offsets over the chapter content   */
/* ------------------------------------------------------------------ */

interface Seg {
  node: Text;
  /** char range inside node */
  start: number;
  end: number;
  /** offset in the chapter-wide concatenated text */
  globalStart: number;
}

interface TextIndex {
  segs: Seg[];
  length: number;
}

/** walk visible text nodes (skips script/style and any wrap marks) */
function buildTextIndex(root: HTMLElement): TextIndex {
  const segs: Seg[] = [];
  let global = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = n.parentElement;
      if (p && (p.closest("script,style") || p.closest("mark.oni-find, mark.oni-hl")))
        return NodeFilter.FILTER_REJECT;
      return (n.textContent ?? "").length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.textContent?.length ?? 0;
    segs.push({ node, start: 0, end: len, globalStart: global });
    global += len;
  }
  return { segs, length: global };
}

/** map a global [start,end) onto text nodes and wrap every slice in a mark */
function wrapGlobalRange(
  idx: TextIndex,
  start: number,
  end: number,
  make: () => HTMLElement
): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (end <= start) return out;
  for (const seg of idx.segs) {
    if (seg.globalStart + seg.end <= start) continue;
    if (seg.globalStart >= end) break;
    const s = Math.max(0, start - seg.globalStart);
    const e = Math.min(seg.end, end - seg.globalStart);
    if (e <= s) continue;
    const text = seg.node.textContent ?? "";
    const frag = document.createDocumentFragment();
    if (s > 0) frag.appendChild(document.createTextNode(text.slice(0, s)));
    const mark = make();
    mark.textContent = text.slice(s, e);
    frag.appendChild(mark);
    if (e < text.length) frag.appendChild(document.createTextNode(text.slice(e)));
    seg.node.parentNode?.replaceChild(frag, seg.node);
    out.push(mark);
  }
  return out;
}

/** unwrap every mark of the given classes, restoring raw text */
function unwrapMarks(root: HTMLElement, selector: string) {
  root.querySelectorAll(selector).forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    m.remove();
    parent.normalize();
  });
}

/* ------------------------------------------------------------------ */
/* selection popup (portal — fixed positioning, above the chrome)      */
/* ------------------------------------------------------------------ */

type PopupState =
  | { mode: "new"; start: number; end: number; text: string; rect: DOMRect }
  | { mode: "edit"; hlId: string; rect: DOMRect }
  | null;

function SelectionPopup({
  state,
  workId,
  chapterId,
  onClose,
}: {
  state: NonNullable<PopupState>;
  workId: string;
  chapterId: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const addHighlight = useApp((s) => s.addHighlight);
  const updateHighlight = useApp((s) => s.updateHighlight);
  const removeHighlight = useApp((s) => s.removeHighlight);
  const highlights = useApp((s) => s.highlights);
  const editing = state.mode === "edit" ? highlights.find((h) => h.id === state.hlId) : undefined;
  const [noteOpen, setNoteOpen] = useState(state.mode === "edit" && !!editing?.note);
  const [noteDraft, setNoteDraft] = useState(editing?.note ?? "");

  /* the chapter being read (new highlights attach here) */
  const hl = editing;

  /* clear the DOM selection so the ghost browser highlight disappears */
  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges();
  }, []);

  const applyColor = (color: HighlightColor) => {
    if (state.mode === "new") {
      const { start, end, text } = state;
      addHighlight({
        workId,
        chapterId,
        color,
        text,
        anchor: { start, end },
      });
      toast({ title: t("hl.saved") });
      clearSelection();
      onClose();
    } else if (hl) {
      updateHighlight(hl.id, { color });
      toast({ title: t("hl.updated") });
      onClose();
    }
  };

  const saveNote = () => {
    if (state.mode !== "edit" || !hl) return;
    const v = noteDraft.trim();
    updateHighlight(hl.id, { note: v || undefined });
    toast({ title: t("hl.updated") });
    onClose();
  };

  const remove = () => {
    if (state.mode !== "edit" || !hl) return;
    removeHighlight(hl.id);
    toast({ title: t("hl.removed") });
    onClose();
  };

  /* clamp the bar to the viewport, prefer above the selection */
  const r = state.rect;
  const W = 236;
  const left = Math.max(10, Math.min(window.innerWidth - W - 10, r.left + r.width / 2 - W / 2));
  const above = r.top > 92;
  const top = above ? Math.max(10, r.top - 54) : Math.min(window.innerHeight - 120, r.bottom + 10);

  return createPortal(
    <div
      data-oni-hl-popup=""
      className="oni-hl-popup dark fixed z-[70] rounded-2xl border border-white/10 bg-[#1c1a18]/95 p-2.5 text-foreground shadow-[0_18px_44px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
      style={{ left, top, width: W }}
      role="toolbar"
      aria-label={t("hl.title")}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* color row */}
      <div className="flex items-center gap-2">
        {(Object.keys(HL_COLORS) as HighlightColor[]).map((c) => (
          <button
            key={c}
            type="button"
            aria-label={t("hl.color", { c })}
            onClick={() => applyColor(c)}
            className={cn(
              "h-7 w-7 rounded-full transition-transform hover:scale-110 active:scale-95",
              hl?.color === c && "ring-2 ring-white/90 ring-offset-2 ring-offset-[#1c1a18]"
            )}
            style={{ background: HL_COLORS[c], boxShadow: `0 4px 10px -3px ${HL_COLORS[c]}99` }}
          />
        ))}
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        {state.mode === "new" ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              aria-label={t("hl.note")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white",
                noteOpen && hl?.note && "bg-primary/20 text-primary"
              )}
            >
              <PenLine className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={remove}
              aria-label={t("hl.remove")}
              className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-red-500/20 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* note editor */}
      {noteOpen && state.mode === "edit" && (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder={t("hl.notePlaceholder")}
            aria-label={t("hl.note")}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold leading-snug text-foreground outline-none placeholder:text-white/35 focus:border-primary/50"
          />
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={saveNote}
              className="flex h-7 items-center gap-1 rounded-full bg-coral-gradient px-3 text-[11px] font-extrabold text-white shadow-[0_6px_14px_-6px_rgba(248,105,76,0.8)] transition-transform active:scale-95"
            >
              <Check className="h-3.5 w-3.5" />
              {t("common.save")}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* main view                                                           */
/* ------------------------------------------------------------------ */

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
  const [popup, setPopup] = useState<PopupState>(null);
  const popupRef = useRef<PopupState>(null);
  popupRef.current = popup;

  /* highlights for this chapter (store-driven; [0] is the newest) */
  const highlights = useApp((s) => s.highlights);
  const chapterHighlights = highlights.filter((h) => h.workId === workId && h.chapterId === chapterId);

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

  /* -------- unified marks engine --------
     Rebuilds BOTH mark systems in one pass so their relative order is
     deterministic: (1) unwrap everything, (2) apply saved highlights from
     the store (offset-anchored), (3) apply live search matches and report
     the count. Re-runs on html / highlight / jumpTarget changes. */
  const hlKey = chapterHighlights.map((h) => `${h.id}:${h.color}:${h.note ? 1 : 0}`).join("|");
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    // 1) unwrap any previous marks (keeps text intact)
    unwrapMarks(root, "mark.oni-find, mark.oni-hl");
    if (html === null) {
      onMarksFound?.(0);
      return;
    }

    // 2) saved highlights (offset-anchored)
    const idx = buildTextIndex(root);
    const newestId = chapterHighlights[0]?.id;
    const newestAt = chapterHighlights[0]?.createdAt ? new Date(chapterHighlights[0].createdAt).getTime() : 0;
    const fresh = newestId && Date.now() - newestAt < 3000;
    for (const h of chapterHighlights) {
      const color = h.color;
      const make = () => {
        const m = document.createElement("mark");
        m.className = `oni-hl oni-hl-${color}${h.note ? " oni-hl-noted" : ""}${fresh && h.id === newestId ? " oni-hl-fresh" : ""}`;
        m.dataset.hlId = h.id;
        return m;
      };
      const marks = wrapGlobalRange(idx, h.anchor.start, h.anchor.end, make);
      if (!marks.length && h.text) {
        // fallback: re-anchor by text search (import restored a different build)
        const q = h.text.toLowerCase();
        const full = idx.segs.reduce((acc, seg) => acc + (seg.node.textContent ?? ""), "").toLowerCase();
        const at = full.indexOf(q);
        if (at >= 0) wrapGlobalRange(idx, at, at + q.length, make);
      }
    }

    // 3) live search matches
    if (!jumpTarget || !jumpTarget.query) {
      onMarksFound?.(0);
      return;
    }
    const q = jumpTarget.query.toLowerCase();
    // collect matches over text nodes (longest-first split; skips wrap marks)
    type Seg2 = { node: Text; start: number; end: number };
    const segs: Seg2[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (p && (p.closest("script,style") || p.classList.contains("oni-find") || p.classList.contains("oni-hl")))
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
    const idxSel = Math.max(0, Math.min(marks.length - 1, jumpTarget.index ?? 0));
    const active = marks[idxSel] ?? null;
    if (active) {
      active.classList.add("oni-find-active");
      requestAnimationFrame(() => active.scrollIntoView({ block: "center" }));
    }
  }, [html, hlKey, jumpTarget?.nonce]);

  /* -------- selection → highlight popup -------- */

  /* compute global offsets of the current selection within the content */
  const selectionAnchor = useCallback((): {
    start: number;
    end: number;
    text: string;
    rect: DOMRect;
  } | null => {
    const root = contentRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text || text.length < 2) return null;
    const idx = buildTextIndex(root);
    // locate the global offsets of range endpoints
    const locate = (node: Node | null, offset: number): number | null => {
      if (!node) return null;
      if (node.nodeType === Node.TEXT_NODE) {
        const seg = idx.segs.find((s) => s.node === node);
        if (!seg) return null;
        return seg.globalStart + Math.min(offset, seg.end);
      }
      // element node: first text node at/after the child position
      const child = node.childNodes[offset] ?? node.lastChild;
      const target = child ? (child.nodeType === Node.TEXT_NODE ? child : null) : null;
      if (target) {
        const seg = idx.segs.find((s) => s.node === target);
        if (seg) return seg.globalStart;
      }
      // fallback: scan for first seg whose node is contained in `node`
      for (const seg of idx.segs) {
        if (node.contains(seg.node)) return seg.globalStart;
      }
      return null;
    };
    let start = locate(range.startContainer, range.startOffset);
    let end = locate(range.endContainer, range.endOffset);
    if (start === null || end === null) return null;
    if (end < start) [start, end] = [end, start];
    if (end - start < 2) return null;
    return { start, end, text, rect: range.getBoundingClientRect() };
  }, []);

  useEffect(() => {
    if (html === null) return;
    const onSelectionChange = () => {
      // ignore while a popup action is in flight (mode edit keeps popup open)
      const cur = popupRef.current;
      if (cur?.mode === "edit") return;
      const anchor = selectionAnchor();
      if (anchor) setPopup({ mode: "new", ...anchor });
      else if (cur) setPopup(null);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [html, selectionAnchor]);

  /* close the popup when the content scrolls (marks moved) */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const close = () => {
      if (popupRef.current) setPopup(null);
    };
    el.addEventListener("scroll", close, { passive: true });
    return () => el.removeEventListener("scroll", close);
  }, [html]);

  /* tap an existing highlight → edit popup */
  useEffect(() => {
    if (html === null) return;
    const root = contentRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest?.("mark.oni-hl") as HTMLElement | null;
      if (!mark?.dataset.hlId) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = mark.getBoundingClientRect();
      setPopup({ mode: "edit", hlId: mark.dataset.hlId, rect });
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [html]);

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
      className={cn("h-full overflow-y-auto thin-scrollbar", theme !== "dark" && "epub-hl-light")}
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
      {popup && (
        <SelectionPopup
          key={popup.mode === "edit" ? popup.hlId : "new"}
          state={popup}
          workId={workId}
          chapterId={chapterId}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
