"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, FileText, Loader2, PenLine, Trash2, X } from "lucide-react";
import { getPdfPageMatches, getPdfTextInRect, loadPdfDoc } from "@/lib/pdf-engine";
import type { PdfMatchRect } from "@/lib/pdf-engine";
import { useApp } from "@/lib/store";
import type { Highlight, HighlightColor } from "@/lib/types";
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
/* PdfCanvas                                                           */
/* ------------------------------------------------------------------ */

export function PdfCanvas({
  docKey, // storage base for the PDF engine (workId, or workId::chapterId for pdf chapters)
  workId,
  chapterId,
  page, // 1-based
  className,
  rotation = 0,
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
  const [state, setState] = useState<"loading" | "ready" | "error" | "webview">("loading");
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
    const update = () => setWidth(Math.floor(el.clientWidth));
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

  /* render */
  useEffect(() => {
    if (!visible || width <= 0) return;
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
        const cssScale = width / base.width;
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
  }, [docKey, page, width, rotation, visible]);

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
        const cssRects = await userRectsToCss(docKey, page, width, rotation, rects);
        if (alive) setMarks(cssRects);
      } catch {
        if (alive) setMarks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [docKey, page, width, rotation, visible, query, activeIdx]);

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
          width,
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
     
  }, [docKey, page, width, rotation, visible, hlKey]);

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
      const cssScale = width / base.width;
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
  }, [docKey, page, width, rotation, chapterId, putSel]);

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
        role="img"
        aria-label={`PDF page ${page}`}
        className="block h-auto w-full select-none"
        style={{
          opacity: state === "ready" ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* saved highlights (round 11) — tappable colored marks */}
      {hlMarks.length > 0 && (
        <div className={cn("absolute inset-0", highlightMode ? "pointer-events-none" : "")} aria-hidden={highlightMode}>
          {hlMarks.map((m) => (
            <span
              key={m.id}
              data-pdfhl-id={m.id}
              onClick={(e) => {
                if (!highlightMode) onSavedMarkTap(e, highlights.find((h) => h.id === m.id)!);
              }}
              className={cn(
                "absolute rounded-[3px] oni-pdf-hl",
                !highlightMode && "cursor-pointer"
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
