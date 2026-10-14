"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { loadPdfDoc, renderPdfPage } from "@/lib/pdf-engine";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";

/* ============================================================
   PdfCanvas — renders one PDF page to a canvas (FMT-003).
   - document cached per work in pdf-engine
   - lazily rendered when scrolled into view (webtoon PDFs)
   - re-renders on container resize / rotation (device-pixel sharp)
   ============================================================ */

export function PdfCanvas({
  workId,
  page, // 1-based
  className,
  rotation = 0,
}: {
  workId: string;
  page: number;
  className?: string;
  rotation?: number;
}) {
  const { t } = useT();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  const [visible, setVisible] = useState(true); // paged slides are always mounted visible-ish; IO refines for scroll modes
  const [width, setWidth] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

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
