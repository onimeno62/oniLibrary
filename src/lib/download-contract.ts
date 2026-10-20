/* ============================================================
   oniLibrary — download queue contract ([DL] plan §8/§12 Phase 4)

   Pure, DOM-free primitives behind the Phase 4 gate of
   docs/DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md:

     • selected content survives restart (stale ACTIVE rows are
       re-queued or honestly parked — never left "running" a lie)
     • queue transitions are explicit: QUEUED → ACTIVE → DONE/ERROR
     • a task is DONE only after the artifact is verified
       (page-count cross-check, Phase 1 findings M2/B5)
     • duplicate downloads cannot collide (B7)
     • cancelling one row can never erase another row's cancel
       flag (B2 — the old global `cancelled.clear()`)
     • telemetry is honest: real bytes, page-based progress,
       windowed speed (B4 — no invented totals or hardcoded MB/s)

   Everything here is deterministic and unit-tested in
   tests/download-contract.test.ts.
   ============================================================ */

import type { DownloadItem } from "./types";

/* ---------------- B2: per-row cancel registry ---------------- */

/**
 * The v1.4.0 pipeline kept a module-level Set and called
 * `cancelled.clear()` after every enqueue batch, erasing cancel flags
 * of concurrently running batches. The registry now owns the flags and
 * the ONLY way a flag disappears is `consume()` by the row it belongs to.
 */
export class CancelRegistry {
  private set = new Set<string>();

  cancel(id: string): void {
    this.set.add(id);
  }

  isCancelled(id: string): boolean {
    return this.set.has(id);
  }

  /** consume the flag for `id`; returns true when a cancel was pending */
  consume(id: string): boolean {
    const had = this.set.has(id);
    this.set.delete(id);
    return had;
  }
}

/* ---------------- B7: duplicate-download guard ---------------- */

/**
 * Filter an enqueue batch down to jobs that do not already have a live
 * download row (ACTIVE/QUEUED/PAUSED) and are not duplicated within the
 * batch itself. Unidentifiable jobs (no local chapter id) are dropped —
 * never queued blind.
 */
export function dedupeEnqueueJobs<J>(
  jobs: readonly J[],
  liveChapterIds: ReadonlySet<string>,
  localChapterIdOf: (job: J) => string | undefined
): J[] {
  const seen = new Set<string>();
  return jobs.filter((j) => {
    const id = localChapterIdOf(j);
    if (!id) return false;
    if (liveChapterIds.has(id)) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/* ---------------- B1: restart recovery ---------------- */

/**
 * Rows found ACTIVE at startup have no driver — the worker that owned
 * them died with the page. Resumable rows (real source chapters) go
 * back to QUEUED for the fresh pump; anything else (demo/legacy rows
 * without a source adapter) is parked as PAUSED instead of pretending
 * to run. QUEUED rows are kept (the pump picks them up); DONE/ERROR/
 * PAUSED rows are untouched.
 */
export function resumeStaleRows(
  rows: readonly DownloadItem[],
  isResumable: (row: DownloadItem) => boolean
): DownloadItem[] {
  return rows.map((d) => {
    if (d.status !== "ACTIVE") return d;
    return isResumable(d)
      ? { ...d, status: "QUEUED" as const, speedMbps: 0, error: undefined }
      : { ...d, status: "PAUSED" as const, speedMbps: 0 };
  });
}

/* ---------------- B3: stable chapter ordinal ---------------- */

/**
 * Page keys are `${workId}::c{n}::p{i}` and chapter ids are
 * `${workId}-c{n}`. The ARRAY index can shift while a job waits in the
 * queue (chapters appended by an update check, bulk deletes), so the
 * ordinal must always come from the id — the fallback index is only
 * used for ids that predate the scheme.
 */
export function chapterKeyIndex(chapterId: string, fallbackIndex: number): number {
  const m = /-c(\d+)$/.exec(chapterId);
  return m ? Number(m[1]) : fallbackIndex + 1;
}

/* ---------------- M2/B5: verify-before-complete ---------------- */

export type VerifyVerdict = "ok" | "incomplete";

/**
 * Plan §8: "Mark a task complete only after the artifact is durably
 * stored and verified." A chapter with a known upstream page count must
 * not be marked DONE when pages were skipped (CDN hiccups, storage
 * failures); a chapter with no known count still needs at least one
 * page to count as downloaded.
 */
export function verifyChapterDownload(fetchedPages: number, expectedPages: number): VerifyVerdict {
  if (fetchedPages <= 0) return "incomplete";
  if (expectedPages > 0 && fetchedPages < expectedPages) return "incomplete";
  return "ok";
}

/* ---------------- B4: honest telemetry ---------------- */

export interface TelemetrySample {
  /** 0..100, derived from real pages completed */
  progress: number;
  /** real bytes written so far, in MB */
  downloadedMb: number;
  /** converging size estimate in MB (never smaller than real bytes) */
  totalMb: number;
}

/**
 * Progress is page-based (the only count that is actually true), the
 * downloaded size is the real byte count, and the total converges to
 * the truth as pages land — the initial `pages * 0.35` guess is only
 * visible before the first page and is replaced, never faked afterwards.
 */
export function honestTelemetry(
  pageDone: number,
  pageTotal: number,
  bytesSoFar: number,
  fallbackTotalMb: number
): TelemetrySample {
  const total = Math.max(1, pageTotal);
  const done = Math.min(total, pageDone + 1);
  const progress = Math.min(99, Math.round((done / total) * 100));
  const mb = bytesSoFar / 1_048_576;
  const projected = done > 0 ? (bytesSoFar / done) * total : 0;
  const estimateMb = Math.max(mb, projected / 1_048_576);
  const totalMb = Math.max(0.1, Math.round(Math.max(estimateMb, 0) * 10) / 10);
  void fallbackTotalMb; // kept for signature stability; estimate comes from real bytes
  return { progress, downloadedMb: Math.round(mb * 100) / 100, totalMb };
}

/** windowed transfer speed in MB/s over a real byte delta (0 when the
    window is too short to be meaningful — never a hardcoded number) */
export function windowedSpeed(bytesDelta: number, msDelta: number): number {
  if (msDelta < 400 || bytesDelta <= 0) return 0;
  return Math.round((bytesDelta / 1_048_576 / (msDelta / 1000)) * 10) / 10;
}

/* ---------------- queue policy ---------------- */

/**
 * FIFO by startedAt (stable tie-break by id). Returns null when the
 * concurrency cap is reached or nothing is QUEUED.
 */
export function pickNextDownload(
  rows: readonly DownloadItem[],
  maxConcurrent: number
): DownloadItem | null {
  const cap = Math.max(1, maxConcurrent);
  const active = rows.filter((d) => d.status === "ACTIVE").length;
  if (active >= cap) return null;
  return (
    rows
      .filter((d) => d.status === "QUEUED")
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))[0] ??
    null
  );
}

/** typed row errors surfaced by the pump (mapped to i18n in the UI) */
export type DownloadErrorKind = "network" | "incomplete" | "unsupported" | "missing";
