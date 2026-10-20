"use client";

/**
 * Durable background download manager — Phase 4 of the Discover plan
 * (docs/DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md §8/§12).
 *
 * v1.4.0 moved downloads outside dialogs but ran them as fire-and-forget
 * closures: rows persisted, the *driver* did not (Phase 1 finding B1 —
 * after a restart every ACTIVE/QUEUED row sat forever). This version is
 * a real queue:
 *
 *  - enqueue only persists QUEUED rows; a single sequential pump drives
 *    them (concurrency capped by settings.maxConcurrent);
 *  - `initBgDownloads()` runs at app start: stale ACTIVE rows are
 *    re-queued (or honestly parked) and the pump resumes them —
 *    selected content survives restart (the Phase 4 gate);
 *  - rows are resolved FRESH at execution time by workId + chapterId
 *    (finding B3 — no captured positional indexes);
 *  - offline / Offline-mode / Wi-Fi-only-with-metered-connection stall
 *    the pump honestly (finding B6 — wifiOnly was never consulted);
 *  - cancel flags live in a per-row registry and are consumed, never
 *    wiped globally (finding B2);
 *  - a task is DONE only after a page-count verification (findings
 *    M2/B5); partial blobs are cleaned up, never dressed as success;
 *  - progress reports real bytes and windowed speed (finding B4 —
 *    no invented totals, no hardcoded MB/s);
 *  - duplicate enqueues are rejected by chapterId (finding B7);
 *  - adding to library alone NEVER enqueues anything (plan §8).
 */

import type { Chapter, DownloadItem, Work } from "./types";
import { mdDownloadOneChapter, mdChapterLabel } from "./mangadex";
import { useApp } from "./store";
import { translate } from "./i18n";
import {
  CancelRegistry,
  chapterKeyIndex,
  dedupeEnqueueJobs,
  honestTelemetry,
  pickNextDownload,
  resumeStaleRows,
  verifyChapterDownload,
  windowedSpeed,
  type DownloadErrorKind,
} from "./download-contract";

const cancelled = new CancelRegistry();

export function isBgCancelled(id: string): boolean {
  return cancelled.isCancelled(id);
}

/** signal a running/queued row to stop; consumed by the pump itself */
export function cancelBgDownload(id: string): void {
  cancelled.cancel(id);
}

/* ---------------- connectivity policy ---------------- */

interface OniMeteredBridge {
  isMetered?: () => boolean;
}

/** B6: honor "Wi-Fi only". Bridge verdict first (ConnectivityManager),
    then the Network Information API, else unmetered (documented gap:
    unknown connections never silently block user-requested downloads). */
function isConnectionMetered(): boolean {
  if (typeof window !== "undefined") {
    const b = (window as unknown as { OniAndroid?: OniMeteredBridge }).OniAndroid;
    if (typeof b?.isMetered === "function") {
      try {
        return b.isMetered() === true;
      } catch {
        /* fall through to the web API */
      }
    }
  }
  const conn =
    typeof navigator !== "undefined"
      ? (navigator as unknown as { connection?: { type?: string } }).connection
      : undefined;
  const type = conn?.type;
  if (typeof type === "string" && type !== "") {
    return !(type === "wifi" || type === "ethernet");
  }
  return false;
}

function isOffline(): boolean {
  const st = useApp.getState();
  return (
    st.settings.offlineMode ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

/** true when the pump must not start/continue network work */
function downloadsBlocked(): boolean {
  const st = useApp.getState();
  if (isOffline()) return true;
  if (st.settings.wifiOnly && isConnectionMetered()) return true;
  return false;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------------- enqueue ---------------- */

/** chapter jobs accepted by the queue (source identity + display facts) */
export interface MdChapterJob {
  chapterIndex: number;
  md: { id: string; number: number; title: string; pages: number; publishedAt: string };
}

/**
 * Queue the selected chapters of an EXISTING library work. Nothing is
 * fetched here — rows are persisted QUEUED and the pump picks them up,
 * so "Add to library" style flows can call this only when the user
 * explicitly asked for downloads.
 * Returns the number of rows actually queued (duplicates rejected, B7).
 */
export function enqueueMangaDexChapterDownloads(work: Work, jobs: MdChapterJob[]): number {
  if (jobs.length === 0) return 0;
  const st0 = useApp.getState();

  // B7 — one live row per chapter, across every enqueue path
  const live = new Set(
    st0.downloads
      .filter((d) => d.status === "ACTIVE" || d.status === "QUEUED" || d.status === "PAUSED")
      .map((d) => d.chapterId)
  );
  const fresh = dedupeEnqueueJobs(
    jobs,
    live,
    (j) => work.chapters[j.chapterIndex]?.id
  );
  if (fresh.length === 0) return 0;

  // mark the chapters DOWNLOADING (by chapter id — B3) so the details
  // rows show honest spinners; already-DONE chapters are never touched
  const affected = new Set(
    fresh.map((j) => work.chapters[j.chapterIndex]?.id).filter((x): x is string => !!x)
  );
  st0.updateWork(work.id, {
    chapters: work.chapters.map((c) =>
      affected.has(c.id) && c.download !== "DONE" ? { ...c, download: "DOWNLOADING" as const } : c
    ),
  });

  const now = new Date().toISOString();
  fresh.forEach((job, i) => {
    const ch = work.chapters[job.chapterIndex];
    const chapterId = ch?.id ?? `${work.id}-c${job.chapterIndex + 1}`;
    const rowId = `dlbg-${work.id}-${chapterId}`;
    cancelled.consume(rowId); // a re-queue after a cancel must not inherit the flag
    const item: DownloadItem = {
      id: rowId,
      workId: work.id,
      chapterId,
      status: "QUEUED",
      progress: 0,
      downloadedMb: 0,
      // placeholder estimate shown until the first page lands (B4: from
      // then on the row reports real bytes and a converging total)
      totalMb: Math.max(0.1, Math.round((job.md.pages || 20) * 0.35 * 10) / 10),
      speedMbps: 0,
      startedAt: now,
      error: undefined,
    };
    st0.upsertDownload(item);
    void i;
  });

  pumpBgDownloads();
  return fresh.length;
}

/* ---------------- the pump ---------------- */

let pumping = false;
let inited = false;

/**
 * Drive QUEUED rows sequentially. Idempotent: while a pump loop is
 * alive, extra calls are no-ops — the loop re-reads the store after
 * every row, so newly enqueued work is always picked up.
 */
export function pumpBgDownloads(): void {
  if (pumping) return;
  pumping = true;
  void (async () => {
    try {
      for (;;) {
        if (downloadsBlocked()) {
          await wait(1500); // connectivity/Wi-Fi policy may change any moment
          continue;
        }
        const st = useApp.getState();
        const row = pickNextDownload(st.downloads, st.settings.maxConcurrent);
        if (!row) break;
        await runRow(row);
      }
    } finally {
      pumping = false;
    }
  })();
}

/** resolve a chapter + its ordinal FRESH from the store (B3) */
function resolveChapter(
  row: DownloadItem
): { work: Work; chapter: Chapter; index: number } | null {
  const st = useApp.getState();
  const work = st.works.find((x) => x.id === row.workId);
  if (!work) return null;
  const index = work.chapters.findIndex((c) => c.id === row.chapterId);
  if (index < 0) return null;
  return { work, chapter: work.chapters[index], index };
}

function setChapterDownload(workId: string, chapterId: string, state: Chapter["download"]): void {
  const st = useApp.getState();
  const w = st.works.find((x) => x.id === workId);
  if (!w) return;
  st.updateWork(workId, {
    chapters: w.chapters.map((c) => (c.id === chapterId ? { ...c, download: state } : c)),
  });
}

/** one row, start to terminal state; resolves the store fresh at every step */
async function runRow(row: DownloadItem): Promise<void> {
  const found = resolveChapter(row);
  const live = useApp.getState().downloads.find((d) => d.id === row.id);

  // gone (cancelled/removed) or parked while we waited → nothing to do
  if (!live || (live.status !== "QUEUED" && live.status !== "ACTIVE")) {
    cancelled.consume(row.id);
    return;
  }

  // unresolvable rows fail honestly instead of spinning forever
  if (!found || found.work.sourceRef?.sourceId !== "mangadex" || !found.chapter.sourceChapterId) {
    useApp.getState().patchDownload(row.id, {
      status: "ERROR",
      speedMbps: 0,
      error: found ? ("unsupported" satisfies DownloadErrorKind) : ("missing" satisfies DownloadErrorKind),
    });
    if (found) setChapterDownload(row.workId, row.chapterId, "NONE");
    cancelled.consume(row.id);
    return;
  }
  const { work, chapter } = found;
  const upstreamId: string = found.chapter.sourceChapterId; // narrowed by the guard above

  // wait for a usable connection (offline mode, no network, Wi-Fi only
  // on a metered connection) — the row stays QUEUED and honest
  for (;;) {
    if (cancelled.isCancelled(row.id)) {
      cancelled.consume(row.id);
      return; // cancelDownload/pauseDownload already settled the row
    }
    const cur = useApp.getState().downloads.find((d) => d.id === row.id);
    if (!cur || cur.status === "PAUSED") {
      cancelled.consume(row.id);
      setChapterDownload(row.workId, row.chapterId, "NONE");
      return;
    }
    if (!downloadsBlocked()) break;
    useApp.getState().patchDownload(row.id, { status: "QUEUED", speedMbps: 0 });
    await wait(1500);
  }

  useApp.getState().patchDownload(row.id, { status: "ACTIVE", speedMbps: 0, error: undefined });
  setChapterDownload(row.workId, row.chapterId, "DOWNLOADING");

  // B3 — page keys from the chapter id, not the live array index
  const keyIndex = chapterKeyIndex(chapter.id, found.index);
  const md = {
    id: upstreamId,
    number: chapter.number,
    title: chapter.title,
    pages: chapter.pages,
    publishedAt: chapter.releaseDate,
  };
  const label = mdChapterLabel(md);

  // B4 — real bytes + windowed speed
  let winStart = Date.now();
  let winBytes = 0;
  const onPage = (p: number, t: number, bytesSoFar: number) => {
    const sample = honestTelemetry(p, t, bytesSoFar, row.totalMb);
    const now = Date.now();
    const speed = windowedSpeed(bytesSoFar - winBytes, now - winStart);
    if (speed > 0) {
      winStart = now;
      winBytes = bytesSoFar;
    }
    useApp.getState().patchDownload(row.id, {
      progress: sample.progress,
      downloadedMb: sample.downloadedMb,
      totalMb: sample.totalMb,
      ...(speed > 0 ? { speedMbps: speed } : {}),
    });
  };

  const res = await mdDownloadOneChapter(md, row.workId, keyIndex, onPage, () =>
    cancelled.isCancelled(row.id)
  );

  // B2 — the ONLY place a flag disappears is the row that owns it
  const wasCancelled = cancelled.consume(row.id);
  if (wasCancelled) {
    // cancel/pause already settled the row UI-side; the pipeline cleaned
    // its partial blobs — just drop the spinner state. A user cancel is
    // not a failure: no notification.
    setChapterDownload(row.workId, row.chapterId, "NONE");
    return;
  }

  if (!res.ok) {
    if (res.reason === "cancelled") {
      setChapterDownload(row.workId, row.chapterId, "NONE");
      return;
    }
    // B5 — failed rows leave no orphaned partial blobs behind
    setChapterDownload(row.workId, row.chapterId, "NONE");
    useApp.getState().patchDownload(row.id, {
      status: "ERROR",
      speedMbps: 0,
      error: res.reason satisfies DownloadErrorKind,
    });
    noteOutcome(row.workId, 0, 1);
    notifyIfDrained(row.workId);
    return;
  }

  // M2/B5 — verify before DONE (belt and braces: mdDownloadOneChapter
  // already refuses to return partial results)
  if (verifyChapterDownload(res.localPages.length, chapter.pages) !== "ok") {
    void deleteKeys(res.localPages);
    setChapterDownload(row.workId, row.chapterId, "NONE");
    useApp.getState().patchDownload(row.id, {
      status: "ERROR",
      speedMbps: 0,
      error: "incomplete" satisfies DownloadErrorKind,
    });
    noteOutcome(row.workId, 0, 1);
    notifyIfDrained(row.workId);
    return;
  }

  // durably stored + verified → settle the chapter row with the real size
  const st = useApp.getState();
  const w = st.works.find((x) => x.id === row.workId);
  if (w) {
    st.updateWork(row.workId, {
      chapters: w.chapters.map((c) =>
        c.id === row.chapterId
          ? {
              ...c,
              download: "DONE" as const,
              localPages: res.localPages,
              sizeMb: Math.round(res.sizeMb * 10) / 10,
              pages: res.localPages.length,
            }
          : c
      ),
    });
  }
  useApp.getState().patchDownload(row.id, {
    status: "DONE",
    progress: 100,
    downloadedMb: Math.round(res.sizeMb * 10) / 10,
    totalMb: Math.round(res.sizeMb * 10) / 10,
    speedMbps: 0,
    error: undefined,
  });
  noteOutcome(row.workId, 1, 0, label);
  notifyIfDrained(row.workId);
}

async function deleteKeys(keys: readonly string[]): Promise<void> {
  try {
    const { deleteFile } = await import("./local-files");
    for (const k of keys) await deleteFile(k).catch(() => undefined);
  } catch {
    /* module unavailable (tests) — nothing to purge */
  }
}

/** accumulates this drain-cycle's outcomes per work (accurate counts in
    the "queue drained" notification — never invented numbers) */
const drainCounters = new Map<string, { done: number; failed: number; lastLabel: string }>();

function noteOutcome(workId: string, done: number, failed: number, chapterLabel = ""): void {
  const c = drainCounters.get(workId) ?? { done: 0, failed: 0, lastLabel: "" };
  c.done += done;
  c.failed += failed;
  if (chapterLabel) c.lastLabel = chapterLabel;
  drainCounters.set(workId, c);
}

/** one notification when a work's queue drains (not per chapter) */
function notifyIfDrained(workId: string): void {
  const st = useApp.getState();
  const pending = st.downloads.some(
    (d) => d.workId === workId && (d.status === "ACTIVE" || d.status === "QUEUED")
  );
  if (pending) return;
  const c = drainCounters.get(workId) ?? { done: 0, failed: 0, lastLabel: "" };
  drainCounters.delete(workId);
  if (c.done > 0 && st.settings.ntfDownloads) {
    st.pushNotification({
      type: "DOWNLOAD",
      workId,
      chapterLabel: c.lastLabel,
      title: st.works.find((w) => w.id === workId)?.title ?? "",
      body: translate(st.settings.lang, "ntf.bgDoneBody", { n: c.done }),
    });
  } else if (c.done === 0 && c.failed > 0 && st.settings.ntfErrors) {
    st.pushNotification({
      type: "ERROR",
      workId,
      chapterLabel: "",
      title: st.works.find((w) => w.id === workId)?.title ?? "",
      body: translate(st.settings.lang, "ntf.bgFailedBody"),
    });
  }
}

/* ---------------- startup recovery (B1) ---------------- */

/**
 * Called once when the app shell mounts. Rows that claim to be ACTIVE
 * belong to a worker that died with the previous page load: real source
 * chapters are re-queued for the fresh pump (selected content survives
 * restart and finishes offline-usable), anything else is parked as
 * PAUSED instead of faking progress. QUEUED rows simply resume.
 */
export function resumeBgDownloads(): void {
  const st = useApp.getState();
  const hasStale = st.downloads.some((d) => d.status === "ACTIVE");
  if (hasStale) {
    const isResumable = (row: DownloadItem) => {
      const w = st.works.find((x) => x.id === row.workId);
      return (
        w?.sourceRef?.sourceId === "mangadex" &&
        w.chapters.some((c) => c.id === row.chapterId && !!c.sourceChapterId)
      );
    };
    useApp.setState({ downloads: resumeStaleRows(st.downloads, isResumable) });
  }
  pumpBgDownloads();
}

/**
 * Full init: startup recovery + wake-ups. The pump re-checks the store
 * after every row, but it can be asleep when connectivity/policy changes
 * (online again, Wi-Fi-only toggled, offline mode lifted) — subscribe to
 * those and give it a kick.
 */
export function initBgDownloads(): void {
  if (inited || typeof window === "undefined") return;
  inited = true;
  resumeBgDownloads();
  window.addEventListener("online", () => pumpBgDownloads());
  useApp.subscribe((s, prev) => {
    if (
      s.settings.offlineMode !== prev.settings.offlineMode ||
      s.settings.wifiOnly !== prev.settings.wifiOnly ||
      s.settings.maxConcurrent !== prev.settings.maxConcurrent
    ) {
      pumpBgDownloads();
    }
  });
}
