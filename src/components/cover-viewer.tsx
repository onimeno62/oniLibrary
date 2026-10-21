"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { WorkCover } from "@/components/shared";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";

/**
 * Full-screen cover viewer (repo-audit §8).
 * Reusable overlay for tapping a work's cover: shows the complete image
 * (object-contain — never cropped), supports zoom in/out + double-tap toggle
 * with pan while zoomed, Escape/X/backdrop close, and a graceful gradient
 * fallback when the cover is missing or fails to load. Rendered INSIDE the
 * app's phone-frame overlay layer (role="dialog" so the app shell's Escape
 * handler defers to it) — it never portals outside the frame.
 */
export function CoverViewer({
  open,
  src,
  title,
  color,
  onClose,
}: {
  open: boolean;
  src?: string;
  title: string;
  color?: string;
  onClose: () => void;
}) {
  /* keyed body → zoom/failure state resets on every open (no effect-setState) */
  if (!open) return null;
  return <CoverViewerBody key={`${title}#${src ?? ""}`} src={src} title={title} color={color} onClose={onClose} />;
}

function CoverViewerBody({
  src,
  title,
  color,
  onClose,
}: {
  src?: string;
  title: string;
  color?: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Escape closes; capture phase + role=dialog make the app shell defer */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", fn, true);
    return () => window.removeEventListener("keydown", fn, true);
  }, [onClose]);

  const toggleZoom = useCallback(() => {
    setZoom((z) => {
      const next = z > 1 ? 1 : 2;
      if (next === 1 && scrollRef.current) scrollRef.current.scrollTo({ left: 0, top: 0 });
      return next;
    });
  }, []);

  const hasImage = !!src && !failed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="absolute inset-0 z-50 flex flex-col bg-black/95 animate-overlay-in"
      onClick={onClose}
    >
      {/* top bar — title + controls (clicks must not close the viewer) */}
      <div
        className="flex items-center gap-1 px-3 pt-3 pb-2"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-white">{title}</p>
        {hasImage && (
          <>
            <button
              onClick={toggleZoom}
              aria-label={zoom > 1 ? t("cov.fit") : t("cov.zoomIn")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
            >
              {zoom > 1 ? <Maximize className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(1, Math.round((z - 0.5) * 2) / 2))}
              disabled={zoom <= 1}
              aria-label={t("cov.zoomOut")}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15 disabled:opacity-30"
            >
              <ZoomOut className="h-5 w-5" />
            </button>
          </>
        )}
        <button
          onClick={onClose}
          aria-label={t("cov.close")}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* image area — object-contain at fit, pannable when zoomed */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {hasImage ? (
          <div
            className="flex min-h-full min-w-full items-center justify-center p-4"
            onDoubleClick={toggleZoom}
          >
            {src?.startsWith("data:") ? (
              // custom covers are data URLs — next/image rejects them
              <img
                src={src}
                alt={title}
                draggable={false}
                onError={() => setFailed(true)}
                className={cn("origin-center transition-transform duration-200", zoom > 1 ? "cursor-grab active:cursor-grabbing" : "")}
                style={{ maxWidth: zoom > 1 ? "200%" : "100%", width: zoom > 1 ? "200%" : "auto" }}
              />
            ) : (
              <div
                className={cn("relative origin-center transition-transform duration-200", zoom > 1 ? "cursor-grab active:cursor-grabbing" : "")}
                style={{ width: zoom > 1 ? "200%" : "100%", maxWidth: zoom > 1 ? undefined : "560px" }}
              >
                <Image
                  src={src!}
                  alt={title}
                  fill
                  sizes="412px"
                  className="object-contain"
                  draggable={false}
                  onError={() => setFailed(true)}
                />
                {/* next/image fill needs an intrinsic box — 3:4 standard covers */}
                <span className="invisible block" style={{ paddingTop: "133%" }} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-10">
            <WorkCover title={title} color={color} className="aspect-[3/4] w-full max-w-[320px] rounded-3xl shadow-2xl" />
          </div>
        )}
      </div>

      {hasImage && (
        <p className="pb-3 pt-2 text-center text-[11px] font-semibold text-white/60">
          {zoom > 1 ? "200%" : t("cov.fit")}
        </p>
      )}
    </div>
  );
}
