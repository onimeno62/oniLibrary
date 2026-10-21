"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Loader2, PenLine, Trash2, X } from "lucide-react";
import {
  getPdfPageMatches,
  getPdfTextContent,
  getPdfTextInRect,
  loadPdfDoc,
  loadPdfTextLayer,
} from "@/lib/pdf-engine";
import type { PdfMatchRect } from "@/lib/pdf-engine";
import { useApp } from "@/lib/store";
import type { FitMode, Highlight, HighlightColor } from "@/lib/types";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { HL_COLORS } from "@/components/screens/epub-view";

/* ============================================================
   PdfCanvas — renders one PDF page to a canvas (FMT-003).
   - document cached per work in pdf-engine
   - lazily rendered when scrolled into view (webtoon PDFs)
   - re-renders on container resize / rotation (device-pixel sharp)
   - optional find-in-page highlight overlay (round 9): exact
     textLayer-style marks computed from pdf.js text content and
     converted through the SAME viewport as the canvas, so rotation
     and zoom stay in sync.
   - saved rect highlights + drag-to-select creation (round 11):
     marks render from the store (user-space rects), highlight mode
     turns the page into a lasso surface, tapping a saved mark opens
     the color/note editor — same 4-color language as book highlights.
   - text layer (PDF-002): when the page has extractable text, a pdf.js
     TextLayer renders transparent, selectable text over the canvas
     (PDF-002 selection/copy); image-only pages keep honest canvas-only
     presentation. The layer shares the canvas viewport math (zoom +
     rotation), yields pointer events to the lasso in highlight mode,
     and is re-keyed per (work, page, zoom/rotation) to avoid staleness.
   - fit parity (D9): fit=WIDTH/SCREEN fill the container width (unchanged),
     fit=HEIGHT fills the container height, fit=ORIGINAL renders at natural
     72dpi scale (scale 1) and pans inside the reader's overflow container.
   ============================================================ */

export interface PdfHighlight {
  query: string;
  /** index of the ACTIVE match within this page (0-based) */
  active: number;
}

/* ------------------------------------------------------------------ */
/* shared viewport math                                                */
/* ------------------------------------------------------------------ */

/** convert user-space rects to CSS px through the page's own viewport */
async function userRectsToCss(
  workId: string,
  page: number,
  cssWidth: number,
  rotation: number,
  rects: PdfMatchRect[]
): Promise<PdfMatchRect[]> {
  const doc = await loadPdfDoc(workId);
  const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
  const base = p.getViewport({ scale: 1, rotation });
  const cssScale = cssWidth > 0 ? cssWidth / base.width : 1;
  const vp = p.getViewport({ scale: cssScale, rotation });
  return rects.map((r) => {
    const [ax, ay] = vp.convertToViewportPoint(r.x1, r.y1);
    const [bx, by] = vp.convertToViewportPoint(r.x2, r.y2);
    return {
      x1: Math.min(ax, bx),
      y1: Math.min(ay, by),
      x2: Math.max(ax, bx),
      y2: Math.max(ay, by),
    };
  });
}

/* ------------------------------------------------------------------ */
/* highlight popup (portal — above the reader chrome)                  */
/* ------------------------------------------------------------------ */

type PdfPopupState =
  | {
      mode: "new";
      workId: string;
      chapterId: string;
      page: number;
      rect: PdfMatchRect;
      screen: DOMRect;
      text: string;
    }
  | { mode: "edit"; hlId: string; screen: DOMRect }
  | null;

function PdfHlPopup({
  state,
  onClose,
}: {
  state: NonNullable<PdfPopupState>;
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

  const applyColor = (color: HighlightColor) => {
    if (state.mode === "new") {
      addHighlight({
        workId: state.workId,
        chapterId: state.chapterId,
        color,
        text: state.text,
        note: noteDraft.trim() || undefined,
        anchor: { start: 0, end: 0 },
        page: state.page,
        rect: state.rect,
      });
      toast({ title: t("hl.saved") });
      onClose();
    } else if (editing) {
      updateHighlight(editing.id, { color });
      toast({ title: t("hl.updated") });
      onClose();
    }
  };

  const saveNote = () => {
    if (state.mode !== "edit" || !editing) return;
    const v = noteDraft.trim();
    updateHighlight(editing.id, { note: v || undefined });
    toast({ title: t("hl.updated") });
    onClose();
  };

  const remove = () => {
    if (state.mode !== "edit" || !editing) return;
    removeHighlight(editing.id);
    toast({ title: t("hl.removed") });
    onClose();
  };

  /* clamp to viewport, prefer above the rect */
  const r = state.screen;
  const W = 236;
  const left = Math.max(10, Math.min(window.innerWidth - W - 10, r.left + r.width / 2 - W / 2));
  const above = r.top > 100;
  const top = above ? Math.max(10, r.top - 58) : Math.min(window.innerHeight - 140, r.bottom + 10);

  return createPortal(
    <div
      data-oni-pdfhl-popup=""
      className="fixed z-[70] rounded-2xl border border-white/10 bg-[#1c1a18]/95 p-2.5 text-foreground shadow-[0_18px_44px_-12px_rgba(0,0,0,0.65)] backdrop-blur-md"
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
              editing?.color === c && "ring-2 ring-white/90 ring-offset-2 ring-offset-[#1c1a18]"
            )}
            style={{ background: HL_COLORS[c], boxShadow: `0 4px 10px -3px ${HL_COLORS[c]}99` }}
          />
        ))}
        <span className="mx-0.5 h-5 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          aria-label={t("hl.note")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white",
            noteOpen && (editing?.note || noteDraft) && "bg-primary/20 text-primary"
          )}
        >
          <PenLine className="h-4 w-4" />
        </button>
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
          <button
            type="button"
            onClick={remove}
            aria-label={t("hl.remove")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-white/60 transition-colors hover:bg-red-500/20 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* extracted area text (new) */}
      {state.mode === "new" && state.text && (
        <p dir="auto" className="mt-2 line-clamp-2 rounded-lg bg-white/[0.05] px-2 py-1.5 text-[11px] font-semibold leading-snug text-white/70">
          “{state.text}”
        </p>
      )}

      {/* note editor */}
      {noteOpen && (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={2}
            maxLength={280}
            placeholder={t("hl.notePlaceholder")}
            aria-label={t("hl.note")}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold leading-snug text-foreground outline-none placeholder:text-white/55 focus:border-primary/50"
          />
          {state.mode === "edit" && (
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
          )}
        </div>
      )}
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* PdfTextLayer (PDF-002) — selectable/copyable text over the canvas   */
/* ------------------------------------------------------------------ */

/**
 * Renders a pdf.js TextLayer into an absolutely-positioned div covering the
 * page. Spans are positioned by pdf.js itself (percentages of the unrotated
 * page box + --total-scale-factor sizing + data-main-rotation CSS in
 * globals.css), so the layer stays glued to the canvas viewport (zoom,
 * rotation, device pixels) without hand-computed geometry.
 *
 * Honest absence: pages whose text content has no non-whitespace items
 * (image-only scans) render nothing — the canvas keeps its role="img"
 * semantics and select-none behavior.
 *
 * Pointer contract: the layer only accepts pointer events once built AND
 * while highlight/lasso mode is off; the lasso surface (z-10) and the
 * pointer-events-none find/saved-mark overlays keep their existing behavior.
 */
function PdfTextLayer({
  docKey,
  page,
  rotation,
  cssWidth,
  interactive,
  onHasText,
}: {
  docKey: string;
  page: number; // 1-based
  rotation: number;
  /** live CSS width of the rendered canvas (px) — same viewport math as the marks */
  cssWidth: number;
  /** false while lasso/highlight mode owns the pointer surface */
  interactive: boolean;
  onHasText: (has: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [built, setBuilt] = useState(false);
  /* keep the latest callback in a ref (synced in an effect) so geometry
     changes alone re-run the build, never the callback identity */
  const onHasTextRef = useRef(onHasText);
  useEffect(() => {
    onHasTextRef.current = onHasText;
  }, [onHasText]);

  useEffect(() => {
    let alive = true;
    let layer: { render: () => Promise<void>; cancel: () => void } | null = null;
    (async () => {
      try {
        /* engine lib + page text content, both cached/lazy (PDF-002 perf) */
        const [TextLayer, content] = await Promise.all([
          loadPdfTextLayer(),
          getPdfTextContent(docKey, page),
        ]);
        if (!alive) return;
        const hasText = content.items.some((it) => "str" in it && it.str.trim().length > 0);
        onHasTextRef.current(hasText);
        if (!hasText) return; // image-only page → no layer, canvas stays as-is
        const doc = await loadPdfDoc(docKey);
        const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
        const container = containerRef.current;
        if (!alive || !container) return;
        /* same viewport math as the canvas/marks: CSS px per PDF unit */
        const base = p.getViewport({ scale: 1, rotation });
        const cssScale = cssWidth > 0 ? cssWidth / base.width : 1;
        const vp = p.getViewport({ scale: cssScale, rotation });
        container.style.setProperty("--total-scale-factor", cssScale.toFixed(4));
        container.style.setProperty("--scale-round-x", "1px");
        container.style.setProperty("--scale-round-y", "1px");
        layer = new TextLayer({ textContentSource: content, container, viewport: vp });
        await layer.render();
        if (alive) setBuilt(true);
      } catch {
        /* cancelled re-layout or engine failure → canvas-only presentation */
        if (alive) setBuilt(false);
      }
    })();
    return () => {
      alive = false;
      try {
        layer?.cancel();
      } catch {
        /* already settled */
      }
      containerRef.current?.replaceChildren(); // drop spans → no text-content leak
    };
  }, [docKey, page, rotation, cssWidth]);

  return (
    <div
      ref={containerRef}
      data-oni-pdf-textlayer=""
      className="oni-textlayer"
      style={{ pointerEvents: built && interactive ? "auto" : "none" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* PdfCanvas                                                           */
/* ------------------------------------------------------------------ */

export function PdfCanvas({
  docKey, // storage base for the PDF engine (workId, or workId::chapterId for pdf chapters)
  workId,
  chapterId,
  page, // 1-based
  className,
  rotation = 0,
  fit = "WIDTH",
  highlight,
  highlights = [],
  highlightMode = false,
  focusHighlightId,
}: {
  docKey: string;
  workId: string;
  chapterId: string;
  page: number;
  className?: string;
  rotation?: number;
  /** sizing mode (RDR-003/D9) — WIDTH/SCREEN fit width, HEIGHT fits height, ORIGINAL = natural 72dpi */
  fit?: FitMode;
  highlight?: PdfHighlight | null;
  /** saved rect highlights for THIS page (round 11) */
  highlights?: Highlight[];
  /** drag-to-select highlight mode (round 11) */
  highlightMode?: boolean;
  /** flash + scroll to this saved highlight once (manager jump) */
  focusHighlightId?: string | null;
}) {
  const { t } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  const [visible, setVisible] = useState(true); // paged slides are always mounted visible-ish; IO refines for scroll modes
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error" | "webview">("loading");
  /* text layer presence for THIS page (PDF-002) — flips canvas semantics */
  const [pageHasText, setPageHasText] = useState(false);
  const handleHasText = useCallback((has: boolean) => setPageHasText(has), []);
  const [marks, setMarks] = useState<PdfMatchRect[]>([]);
  /* saved-highlight marks (CSS px, same space as the find marks) */
  const [hlMarks, setHlMarks] = useState<Array<{ rect: PdfMatchRect; color: HighlightColor; id: string; noted: boolean }>>([]);
  /* lasso drag state (CSS px within the wrapper) — mirrors sel in a ref so
     pointerup never reads a stale closure (fast/programmatic drags included) */
  const [sel, setSel] = useState<PdfMatchRect | null>(null);
  const selRef = useRef<PdfMatchRect | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; lx: number; ly: number; active: boolean }>({
    sx: 0,
    sy: 0,
    lx: 0,
    ly: 0,
    active: false,
  });
  const [popup, setPopup] = useState<PdfPopupState>(null);
  const flashRef = useRef<string | null>(null);

  const putSel = useCallback((v: PdfMatchRect | null) => {
    selRef.current = v;
    setSel(v);
  }, []);

  /* observe container width (ResizeObserver guarded — ancient WebViews lack it;
     fall back to a window resize listener so the page still renders) */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      setWidth(Math.floor(el.clientWidth));
      setHeight(Math.floor(el.clientHeight));
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* lazy visibility (continuous/webtoon modes mount many pages) */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setVisible(e.isIntersecting);
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* render — cssScale is fit-aware (D9): WIDTH/SCREEN fill the container
     width (unchanged), HEIGHT fills the container height, ORIGINAL renders
     the natural 72dpi size (scale 1) and pans in the reader's scroller.
     Every overlay below converts through the CANVAS's own CSS width (ground
     truth), so marks/lasso/text layer stay glued to the page in every fit —
     even if the wrapper box ends up wider/narrower than the canvas. */
  useEffect(() => {
    const sized = fit === "ORIGINAL" ? true : fit === "HEIGHT" ? height > 0 : width > 0;
    if (!visible || !sized) return;
    let alive = true;
    setState("loading");
    (async () => {
      try {
        const doc = await loadPdfDoc(docKey);
        const canvas = canvasRef.current;
        if (!alive || !canvas) return;
        const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
        if (!alive) return;
        const base = p.getViewport({ scale: 1, rotation });
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const cssScale =
          fit === "ORIGINAL" ? 1 : fit === "HEIGHT" ? height / base.height : width / base.width;
        const vp = p.getViewport({ scale: cssScale * dpr, rotation });
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
        canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("ctx");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const task = p.render({ canvas, viewport: vp });
        taskRef.current = task;
        await task.promise;
        if (alive) setState("ready");
      } catch (err) {
        if (alive) setState(err instanceof Error && err.message === "pdf-webview-outdated" ? "webview" : "error");
      }
    })();
    return () => {
      alive = false;
      try {
        taskRef.current?.cancel();
      } catch {
        /* already done */
      }
      taskRef.current = null;
    };
  }, [docKey, page, width, height, rotation, fit, visible]);

  /* layout (transform-independent) CSS width of the rendered canvas — ground
     truth for EVERY overlay conversion (find marks, saved marks, lasso, text
     layer). clientWidth, unlike getBoundingClientRect, ignores ancestor CSS
     rotations the reader may apply to the slide, and it re-syncs the overlays
     whenever the canvas is re-laid-out (zoom / fit change / rotation), because
     every render pass ends in a state flip that re-renders with the new size. */
  const canvasRectW = canvasRef.current?.clientWidth ?? 0;
  const layerCssWidth = canvasRectW > 0 ? canvasRectW : width;

  /* find-in-page marks (round 9): recompute when the highlight changes.
     Rects arrive in unrotated scale-1 user space → convert with the same
     viewport parameters as the canvas (cssScale, rotation) → CSS px. */
  const query = highlight?.query ?? "";
  const activeIdx = highlight?.active ?? -1;
  useEffect(() => {
    if (!query || query.trim().length < 2 || !visible || width <= 0) {
      setMarks([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const rects = await getPdfPageMatches(docKey, page, query);
        if (!alive || rects.length === 0) {
          if (alive) setMarks([]);
          return;
        }
        const cssRects = await userRectsToCss(docKey, page, layerCssWidth, rotation, rects);
        if (alive) setMarks(cssRects);
      } catch {
        if (alive) setMarks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [docKey, page, width, layerCssWidth, rotation, visible, query, activeIdx]);

  /* saved-highlight marks (round 11): user-space rects → CSS px, re-run on
     every geometry change so rotation/zoom stay in sync like the find marks */
  const hlKey = highlights.map((h) => `${h.id}:${h.color}:${h.note ? 1 : 0}`).join("|");
  useEffect(() => {
    if (!visible || width <= 0 || highlights.length === 0) {
      setHlMarks([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const css = await userRectsToCss(
          docKey,
          page,
          layerCssWidth,
          rotation,
          highlights.map((h) => h.rect!).filter(Boolean)
        );
        if (!alive) return;
        const out = highlights
          .filter((h) => h.rect)
          .map((h, i) => ({ rect: css[i], color: h.color, id: h.id, noted: !!h.note }))
          .filter((x) => !!x.rect);
        setHlMarks(out);
      } catch {
        if (alive) setHlMarks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [docKey, page, width, layerCssWidth, rotation, visible, hlKey]);

  /* manager jump: flash the focused highlight once it has a rendered mark */
  useEffect(() => {
    if (!focusHighlightId || hlMarks.length === 0) return;
    if (flashRef.current === focusHighlightId) return;
    flashRef.current = focusHighlightId;
    const id = window.setTimeout(() => {
      const el = wrapRef.current?.querySelector(`[data-pdfhl-id="${focusHighlightId}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.classList.add("oni-pdf-hl-flash");
      window.setTimeout(() => el?.classList.remove("oni-pdf-hl-flash"), 1800);
    }, 250);
    return () => window.clearTimeout(id);
  }, [focusHighlightId, hlMarks.length]);

  /* ---------------- lasso drag-to-select (round 11) ---------------- */

  const pointFromEvent = (e: React.PointerEvent): { x: number; y: number } => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onLassoDown = (e: React.PointerEvent) => {
    if (!highlightMode || state !== "ready") return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = pointFromEvent(e);
    dragRef.current = { sx: p.x, sy: p.y, lx: p.x, ly: p.y, active: true };
    putSel({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const onLassoMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const p = pointFromEvent(e);
    dragRef.current.lx = p.x;
    dragRef.current.ly = p.y;
    putSel({ x1: dragRef.current.sx, y1: dragRef.current.sy, x2: p.x, y2: p.y });
  };

  const onLassoUp = useCallback(async () => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;
    const cur = selRef.current;
    putSel(null);
    if (!cur) return;
    const w = Math.abs(cur.x2 - cur.x1);
    const h = Math.abs(cur.y2 - cur.y1);
    if (w < 12 || h < 6) return; // treat tiny drags as accidental taps
    try {
      /* CSS px → unrotated scale-1 user space through the page viewport */
      const doc = await loadPdfDoc(docKey);
      const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
      const base = p.getViewport({ scale: 1, rotation });
      /* canvas ground-truth scale (D9): the lasso surface spans the wrapper,
         but the canvas sits at the wrapper origin, so wrapper-relative pointer
         coords map through the canvas's own scale in every fit mode */
      const cssScale = layerCssWidth / base.width;
      const vp = p.getViewport({ scale: cssScale, rotation });
      const [ax, ay] = vp.convertToPdfPoint(Math.min(cur.x1, cur.x2), Math.min(cur.y1, cur.y2));
      const [bx, by] = vp.convertToPdfPoint(Math.max(cur.x1, cur.x2), Math.max(cur.y1, cur.y2));
      const rect: PdfMatchRect = {
        x1: Math.min(ax, bx),
        y1: Math.min(ay, by),
        x2: Math.max(ax, bx),
        y2: Math.max(ay, by),
      };
      /* best-effort caption text inside the area */
      const text = await getPdfTextInRect(docKey, page, rect);
      const wrapRect = wrapRef.current!.getBoundingClientRect();
      const screen = new DOMRect(
        wrapRect.left + Math.min(cur.x1, cur.x2),
        wrapRect.top + Math.min(cur.y1, cur.y2),
        w,
        h
      );
      setPopup({ mode: "new", rect, screen, text, page, workId, chapterId });
    } catch {
      /* page gone — ignore */
    }
  }, [docKey, page, layerCssWidth, rotation, chapterId, putSel]);

  /* tap a saved mark → edit popup */
  const onSavedMarkTap = (e: React.MouseEvent, hl: Highlight) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopup({ mode: "edit", hlId: hl.id, screen: new DOMRect(r.left, r.top, r.width, r.height) });
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <canvas
        ref={canvasRef}
        /* PDF-002: when the page has selectable text the canvas becomes an
           aria-hidden presentation layer and the text layer carries the
           semantics; image-only pages keep the honest role="img" canvas. */
        role={pageHasText ? undefined : "img"}
        aria-label={pageHasText ? undefined : `PDF page ${page}`}
        aria-hidden={pageHasText || undefined}
        className={cn("block h-auto w-full", !pageHasText && "select-none")}
        style={{
          opacity: state === "ready" ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* PDF-002 text layer — selection/copy on text-based pages; only over a
          rendered canvas, pointer-events yield to the lasso in highlight mode.
          Re-keyed per (work, page, rotation, canvas-scale signature) so a stale
          layer can never survive a re-layout. */}
      {state === "ready" && (
        <PdfTextLayer
          key={`${docKey}|${page}|${rotation}|${layerCssWidth}`}
          docKey={docKey}
          page={page}
          rotation={rotation}
          cssWidth={layerCssWidth}
          interactive={!highlightMode}
          onHasText={handleHasText}
        />
      )}

      {/* saved highlights (round 11) — tappable colored marks. The plate is
          pointer-events-none so it can never eat text selection on the layer
          beneath; only the mark spans themselves stay tappable (PDF-002). */}
      {hlMarks.length > 0 && (
        <div className="pointer-events-none absolute inset-0" aria-hidden={highlightMode}>
          {hlMarks.map((m) => (
            <span
              key={m.id}
              data-pdfhl-id={m.id}
              onClick={(e) => {
                if (!highlightMode) onSavedMarkTap(e, highlights.find((h) => h.id === m.id)!);
              }}
              className={cn(
                "absolute rounded-[3px] oni-pdf-hl",
                !highlightMode && "pointer-events-auto cursor-pointer"
              )}
              style={{
                left: m.rect.x1,
                top: m.rect.y1,
                width: Math.max(3, m.rect.x2 - m.rect.x1),
                height: Math.max(3, m.rect.y2 - m.rect.y1),
                backgroundColor: `${HL_COLORS[m.color]}40`,
                boxShadow: `inset 0 0 0 1.5px ${HL_COLORS[m.color]}88`,
              }}
            >
              {m.noted && (
                <span
                  className="absolute -top-[7px] -end-[7px] flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-black text-white shadow"
                  style={{ background: HL_COLORS[m.color] }}
                  aria-hidden
                >
                  ✎
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* find-in-page overlay marks (pointer-events-none, never blocks taps) */}
      {marks.length > 0 && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {marks.map((m, i) => {
            const active = i === activeIdx;
            return (
              <span
                key={i}
                className={cn(
                  "absolute rounded-[3px] transition-[background-color,box-shadow] duration-200",
                  active
                    ? "oni-pdf-mark-active bg-[#f8694c]/45 shadow-[0_0_0_2px_rgba(248,105,76,0.85),0_0_18px_rgba(248,105,76,0.55)]"
                    : "bg-[#f8694c]/22 shadow-[inset_0_0_0_1px_rgba(248,105,76,0.35)]"
                )}
                style={{
                  left: m.x1,
                  top: m.y1,
                  width: Math.max(2, m.x2 - m.x1),
                  height: Math.max(2, m.y2 - m.y1),
                }}
              />
            );
          })}
        </div>
      )}

      {/* lasso surface (highlight mode only) */}
      {highlightMode && state === "ready" && (
        <div
          role="application"
          aria-label={t("pdfhl.mode")}
          className="absolute inset-0 z-10 cursor-crosshair"
          style={{ touchAction: "none" }}
          onPointerDown={onLassoDown}
          onPointerMove={onLassoMove}
          onPointerUp={() => void onLassoUp()}
          onPointerCancel={() => {
            dragRef.current.active = false;
            putSel(null);
          }}
        >
          {sel && (
            <span
              aria-hidden
              className="absolute rounded-[3px] border-2 border-dashed border-[#f8694c] bg-[#f8694c]/18 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]"
              style={{
                left: Math.min(sel.x1, sel.x2),
                top: Math.min(sel.y1, sel.y2),
                width: Math.abs(sel.x2 - sel.x1),
                height: Math.abs(sel.y2 - sel.y1),
              }}
            />
          )}
        </div>
      )}

      {/* highlight-mode hint chip */}
      {highlightMode && state === "ready" && (
        <span className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-[10px] font-extrabold text-white/90 backdrop-blur">
          {t("pdfhl.hint")}
        </span>
      )}

      {popup && (
        <PdfHlPopup key={popup.mode === "edit" ? popup.hlId : "new"} state={popup} onClose={() => setPopup(null)} />
      )}

      {state !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#151312]">
          {state === "loading" ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-white/55" />
              <p className="text-[11px] font-bold text-white/60">{t("rdr.pdfRendering")}</p>
            </>
          ) : state === "webview" ? (
            <>
              <FileText className="h-8 w-8 text-white/25" />
              <p className="text-[13px] font-bold text-white/70">{t("rdr.pdfWebview")}</p>
              <p className="text-[11px] font-semibold text-white/60">{t("rdr.pdfWebviewHint")}</p>
            </>
          ) : (
            <>
              <FileText className="h-8 w-8 text-white/25" />
              <p className="text-[13px] font-bold text-white/70">{t("rdr.pdfMissing")}</p>
              <p className="text-[11px] font-semibold text-white/60">{t("rdr.localMissingHint")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
