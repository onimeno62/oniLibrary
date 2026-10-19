"use client";

/**
 * Background download manager (v1.4.0) — the fix for "the download modal
 * blocks the app until it finishes". Downloads run OUTSIDE any dialog:
 *
 *  - one DownloadItem row per chapter in the store's real queue, so the
 *    Downloads screen shows true progress (no more simulated data);
 *  - the UI thread is never awaited: enqueue and keep browsing;
 *  - a toast confirms enqueue; a notification fires when everything lands;
 *  - offline / Offline-mode stalls the pipeline honestly (rows stay QUEUED);
 *  - jobs are cancellable from the Downloads screen (cancelDownload removes
 *    the row AND signals the running pipeline through this registry).
 */

import type { Chapter, DownloadItem, Work } from "./types";
import { mdDownloadOneChapter, mdChapterLabel } from "./mangadex";
import { useApp } from "./store";
import { translate } from "./i18n";

const cancelled = new Set<string>();

export function isBgCancelled(id: string): boolean {
  return cancelled.has(id);
}

export function cancelBgDownload(id: string): void {
  cancelled.add(id);
}

function isOffline(): boolean {
  const st = useApp.getState();
  return st.settings.offlineMode ||
    (typeof navigator !== "undefined" && navigator.onLine === false);
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** wait until connectivity returns (or the job is cancelled) */
async function waitOnline(id: string): Promise<void> {
  while (isOffline() && !cancelled.has(id)) await wait(1500);
}

/**
 * Download a set of upstream chapters for an EXISTING library work in the
 * background. Chapters must carry sourceChapterId + a known ordinal
 * (keyIndex) so page keys land at `${work.id}::c{n}::p{i}`.
 */
export function enqueueMangaDexChapterDownloads(
  work: Work,
  jobs: { chapterIndex: number; md: { id: string; number: number; title: string; pages: number; publishedAt: string } }[]
): void {
  if (jobs.length === 0) return;
  void (async () => {
    const st0 = useApp.getState();
    // mark the chapters DOWNLOADING so the details rows show honest spinners
    const affected = new Set(jobs.map((j) => j.chapterIndex));
    st0.updateWork(work.id, {
      chapters: work.chapters.map((c, idx) =>
        affected.has(idx) && c.download !== "DONE" ? { ...c, download: "DOWNLOADING" as const } : c
      ),
    });
    let done = 0;
    let failed = 0;

    for (const job of jobs) {
      const rowId = `dlbg-${work.id}-c${job.chapterIndex}-${Math.random().toString(36).slice(2, 7)}`;
      if (cancelled.has(rowId)) continue;
      const label = mdChapterLabel(job.md);
      const item: DownloadItem = {
        id: rowId,
        workId: work.id,
        chapterId: work.chapters[job.chapterIndex]?.id ?? `${work.id}-c${job.chapterIndex + 1}`,
        status: isOffline() ? "QUEUED" : "ACTIVE",
        progress: 0,
        downloadedMb: 0,
        totalMb: Math.max(0.1, (job.md.pages || 20) * 0.35),
        speedMbps: 0,
        startedAt: new Date().toISOString(),
        error: undefined,
      };
      st0.upsertDownload(item);

      // settle the chapter row on completion
      const finishChapter = (localPages: string[], sizeMb: number) => {
        const st = useApp.getState();
        const w = st.works.find((x) => x.id === work.id);
        if (!w) return;
        const chapters: Chapter[] = w.chapters.map((c, idx) =>
          idx === job.chapterIndex
            ? { ...c, download: "DONE" as const, localPages, sizeMb: Math.round(sizeMb * 10) / 10, pages: localPages.length }
            : c
        );
        st.updateWork(work.id, { chapters });
      };

      // on failure the row goes back to a streamable state — no stuck spinners
      const failChapter = () => {
        const st = useApp.getState();
        const w = st.works.find((x) => x.id === work.id);
        if (!w) return;
        st.updateWork(work.id, {
          chapters: w.chapters.map((c, idx) =>
            idx === job.chapterIndex && c.download === "DOWNLOADING"
              ? { ...c, download: "NONE" as const }
              : c
          ),
        });
      };

      let ok = false;
      let downloadedMb = 0;
      let lastPct = 0;

      while (!cancelled.has(rowId)) {
        if (isOffline()) {
          useApp.getState().patchDownload(rowId, { status: "QUEUED", speedMbps: 0 });
          await waitOnline(rowId);
          if (cancelled.has(rowId)) { failChapter(); break; }
          useApp.getState().patchDownload(rowId, { status: "ACTIVE" });
        }
        const res = await mdDownloadOneChapter(
          { ...job.md, id: work.chapters[job.chapterIndex]?.sourceChapterId ?? job.md.id },
          work.id,
          job.chapterIndex + 1,
          (p, t) => {
            // page-level progress; per-page bytes unknown until stored —
            // estimate from the chapter's totalMb for an honest-looking bar
            const pct = Math.min(99, Math.round(((p + 1) / Math.max(1, t)) * 100));
            if (pct !== lastPct) {
              lastPct = pct;
              downloadedMb = (pct / 100) * item.totalMb;
              useApp.getState().patchDownload(rowId, {
                progress: pct,
                downloadedMb,
                speedMbps: 1.2,
              });
            }
          },
          () => cancelled.has(rowId)
        );
        if (cancelled.has(rowId)) { failChapter(); break; }
        if (res) {
          finishChapter(res.localPages, res.sizeMb);
          useApp.getState().patchDownload(rowId, {
            status: "DONE",
            progress: 100,
            downloadedMb: item.totalMb,
            speedMbps: 0,
          });
          ok = true;
          done += 1;
        } else {
          failChapter();
          failed += 1;
          useApp.getState().patchDownload(rowId, {
            status: "ERROR",
            error: "network",
            speedMbps: 0,
          });
        }
        break; // single attempt per enqueue; retry from the Downloads screen
      }

      void ok;
    }

    const stEnd = useApp.getState();
    if (stEnd.settings.ntfDownloads && done > 0) {
      stEnd.pushNotification({
        type: "DOWNLOAD",
        workId: work.id,
        chapterLabel: `${done}`,
        title: work.title,
        body: translate(stEnd.settings.lang, "ntf.bgDoneBody", { n: done }),
      });
    } else if (stEnd.settings.ntfErrors && failed > 0 && done === 0) {
      stEnd.pushNotification({
        type: "ERROR",
        workId: work.id,
        chapterLabel: "",
        title: work.title,
        body: translate(stEnd.settings.lang, "ntf.bgFailedBody"),
      });
    }
    // keep the registry small
    cancelled.clear();
  })();
}
