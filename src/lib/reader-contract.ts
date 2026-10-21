/**
 * Reader contract (Phase B) — pure decision helpers for the reader screen.
 * Extracted from reader-screen.tsx so the end-of-chapter behavior (audit D8)
 * and the pinch-zoom state machine (RDR-004) are unit-testable without a DOM.
 */

/* ------------------------------------------------------------------ */
/* D8 — end-of-chapter decision, shared by paged and scroll modes      */
/* ------------------------------------------------------------------ */

export type ChapterEndAction = "advance" | "endcard";

/**
 * What should happen when the reader reaches the end of a chapter.
 * `forced` = the user explicitly pressed next/skip (always advances or
 * shows the end card); otherwise `autoNext` governs (RDR-011).
 */
export function chapterEndAction(opts: {
  hasNextChapter: boolean;
  autoNext: boolean;
  forced?: boolean;
}): ChapterEndAction {
  if (opts.hasNextChapter && (opts.forced || opts.autoNext)) return "advance";
  return "endcard";
}

/**
 * Whether the vertical scroll position counts as "reached the end" —
 * within `threshold` px of the bottom of the scroll container.
 */
export function isScrolledToEnd(scrollTop: number, clientHeight: number, scrollHeight: number, threshold = 48): boolean {
  if (scrollHeight <= 0 || clientHeight <= 0) return false;
  return scrollTop + clientHeight >= scrollHeight - threshold;
}

/* ------------------------------------------------------------------ */
/* RDR-004 — pinch-zoom state machine (paged modes)                    */
/* ------------------------------------------------------------------ */

export const PINCH_MIN = 1;
export const PINCH_MAX = 4;
/** zoom values below this snap back to 1 when the gesture ends */
export const PINCH_SNAP = 1.08;

export interface PinchGesture {
  startDist: number;
  startZoom: number;
}

/** Begin a pinch gesture (two touches). Returns null when inputs are invalid. */
export function startPinch(startDist: number, startZoom: number): PinchGesture | null {
  if (!Number.isFinite(startDist) || startDist <= 0) return null;
  if (!Number.isFinite(startZoom) || startZoom < PINCH_MIN) return null;
  return { startDist, startZoom };
}

/**
 * Zoom for the current pinch distance: multiplicative from the gesture's
 * start zoom, clamped to [PINCH_MIN, PINCH_MAX], rounded to 2 decimals.
 */
export function zoomForPinch(g: PinchGesture, dist: number): number {
  if (!Number.isFinite(dist) || dist <= 0) return clampZoom(g.startZoom);
  const ratio = dist / g.startDist;
  return clampZoom(Math.round(g.startZoom * ratio * 100) / 100);
}

/** End the gesture: snap near-1 zooms back to exactly 1. */
export function commitPinch(zoom: number): number {
  return zoom < PINCH_SNAP ? 1 : Math.min(PINCH_MAX, Math.max(PINCH_MIN, zoom));
}

export function clampZoom(z: number): number {
  return Math.min(PINCH_MAX, Math.max(PINCH_MIN, Math.round(z * 100) / 100));
}
