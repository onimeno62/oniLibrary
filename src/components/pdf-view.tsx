"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { getPdfPageMatches, loadPdfDoc } from "@/lib/pdf-engine";
import type { PdfMatchRect } from "@/lib/pdf-engine";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";

/* ============================================================
   PdfCanvas — renders one PDF page to a canvas (FMT-003).
   - document cached per work in pdf-engine
   - lazily rendered when scrolled into view (webtoon PDFs)
   - re-renders on container resize / rotation (device-pixel sharp)
   - optional find-in-page highlight overlay (round 9): exact
     textLayer-style marks computed from pdf.js text content and
     converted through the SAME viewport as the canvas, so rotation
     and zoom stay in sync.
   ============================================================ */

export interface PdfHighlight {
  query: string;
  /** index of the ACTIVE match within this page (0-based) */
  active: number;
}

export function PdfCanvas({
  workId,
  page, // 1-based
  className,
  rotation = 0,
  highlight,
}: {
  workId: string;
  page: number;
  className?: string;
  rotation?: number;
  highlight?: PdfHighlight | null;
}) {
  const { t } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  const [visible, setVisible] = useState(true); // paged slides are always mounted visible-ish; IO refines for scroll modes
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [marks, setMarks] = useState<PdfMatchRect[]>([]);

  /* observe container width */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.floor(el.clientWidth));
    update();
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
        const doc = await loadPdfDoc(workId);
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
      } catch {
        if (alive) setState("error");
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
  }, [workId, page, width, rotation, visible]);

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
        const [doc, rects] = await Promise.all([
          loadPdfDoc(workId),
          getPdfPageMatches(workId, page, query),
        ]);
        if (!alive || rects.length === 0) {
          if (alive) setMarks([]);
          return;
        }
        const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
        if (!alive) return;
        const base = p.getViewport({ scale: 1, rotation });
        const cssScale = width / base.width;
        const vp = p.getViewport({ scale: cssScale, rotation });
        const cssRects = rects.map((r) => {
          // convert both corners through the shared viewport (handles
          // rotation + scale exactly like the canvas render)
          const [ax, ay] = vp.convertToViewportPoint(r.x1, r.y1);
          const [bx, by] = vp.convertToViewportPoint(r.x2, r.y2);
          return {
            x1: Math.min(ax, bx),
            y1: Math.min(ay, by),
            x2: Math.max(ax, bx),
            y2: Math.max(ay, by),
          };
        });
        if (alive) setMarks(cssRects);
      } catch {
        if (alive) setMarks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workId, page, width, rotation, visible, query, activeIdx]);

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
      {state !== "ready" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#151312]">
          {state === "loading" ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-white/35" />
              <p className="text-[11px] font-bold text-white/40">{t("rdr.pdfRendering")}</p>
            </>
          ) : (
            <>
              <FileText className="h-8 w-8 text-white/25" />
              <p className="text-[13px] font-bold text-white/70">{t("rdr.pdfMissing")}</p>
              <p className="text-[11px] font-semibold text-white/40">{t("rdr.localMissingHint")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
