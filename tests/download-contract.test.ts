/**
 * DOWNLOAD QUEUE CONTRACT — Phase 4 of DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md
 * (§12 Phase 4 gate: "selected content survives restart and can be read
 * offline; adding to library alone never downloads" + §13 test subset).
 *
 * Proves the queue primitives are honest and race-safe:
 *  - B2: cancelling one row can never erase another row's cancel flag
 *  - B7: duplicate enqueues collapse; live rows are never re-queued
 *  - B1: stale ACTIVE rows recover at startup (re-queue or park, never fake)
 *  - B3: page-key ordinals come from chapter ids, not live array indexes
 *  - M2/B5: a task is DONE only when the page count verifies
 *  - B4: telemetry is page-based progress + real bytes + windowed speed
 *  - queue policy: FIFO, concurrency-capped
 *  - M1/T6: the deterministic local work id makes repeated adds converge
 */
import { describe, it, expect } from "bun:test";
import {
  CancelRegistry,
  chapterKeyIndex,
  dedupeEnqueueJobs,
  honestTelemetry,
  pickNextDownload,
  resumeStaleRows,
  verifyChapterDownload,
  windowedSpeed,
} from "../src/lib/download-contract";
import { addMangaDexToLibrary } from "../src/lib/mangadex";
import type { DownloadItem } from "../src/lib/types";
import type { MdChapter, MdManga } from "../src/lib/mangadex";

function row(p: Partial<DownloadItem> & { id: string }): DownloadItem {
  return {
    workId: "w-x",
    chapterId: "w-x-c1",
    status: "QUEUED",
    progress: 0,
    downloadedMb: 0,
    totalMb: 1,
    speedMbps: 0,
    startedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

describe("CancelRegistry: per-row cancel flags (B2)", () => {
  it("cancelling row A does not touch row B", () => {
    const r = new CancelRegistry();
    r.cancel("A");
    expect(r.isCancelled("A")).toBe(true);
    expect(r.isCancelled("B")).toBe(false);
  });

  it("consume() is the only way a flag disappears — and it never wipes others", () => {
    const r = new CancelRegistry();
    r.cancel("A");
    r.cancel("B");
    expect(r.consume("A")).toBe(true);
    expect(r.consume("A")).toBe(false); // exactly-once
    expect(r.isCancelled("B")).toBe(true); // B survived A's consumption
  });

  it("a consumed row can be cancelled again (re-enqueue after cancel)", () => {
    const r = new CancelRegistry();
    r.cancel("row");
    r.consume("row");
    r.cancel("row");
    expect(r.isCancelled("row")).toBe(true);
  });
});

describe("dedupeEnqueueJobs: duplicate-download guard (B7)", () => {
  const jobs = [
    { chapterIndex: 0, md: { id: "md-1", number: 1, title: "", pages: 20, publishedAt: "" } },
    { chapterIndex: 1, md: { id: "md-2", number: 2, title: "", pages: 20, publishedAt: "" } },
    { chapterIndex: 2, md: { id: "md-3", number: 3, title: "", pages: 20, publishedAt: "" } },
  ];
  const localId = (j: (typeof jobs)[number]) => `w-x-c${j.chapterIndex + 1}`;

  it("drops jobs that already have a live row", () => {
    const live = new Set(["w-x-c2"]);
    const fresh = dedupeEnqueueJobs(jobs, live, localId);
    expect(fresh.map((j) => j.chapterIndex)).toEqual([0, 2]);
  });

  it("collapses duplicates inside one batch", () => {
    const dupes = [...jobs, { chapterIndex: 0, md: { id: "md-1", number: 1, title: "", pages: 20, publishedAt: "" } }];
    const fresh = dedupeEnqueueJobs(dupes, new Set(), localId);
    expect(fresh).toHaveLength(3);
  });

  it("drops unidentifiable jobs instead of queueing blind", () => {
    const fresh = dedupeEnqueueJobs(jobs, new Set(), () => undefined);
    expect(fresh).toHaveLength(0);
  });
});

describe("resumeStaleRows: restart recovery (B1)", () => {
  it("re-queues stale ACTIVE rows that a fresh pump can drive", () => {
    const out = resumeStaleRows([row({ id: "r1", status: "ACTIVE" })], () => true);
    expect(out[0].status).toBe("QUEUED");
    expect(out[0].speedMbps).toBe(0);
  });

  it("parks non-resumable ACTIVE rows as PAUSED instead of faking progress", () => {
    const out = resumeStaleRows([row({ id: "demo", status: "ACTIVE", progress: 42 })], () => false);
    expect(out[0].status).toBe("PAUSED");
    expect(out[0].progress).toBe(42); // state kept, lie removed
  });

  it("leaves DONE / ERROR / PAUSED / QUEUED rows untouched", () => {
    const rows = [
      row({ id: "d", status: "DONE" }),
      row({ id: "e", status: "ERROR", error: "network" }),
      row({ id: "p", status: "PAUSED" }),
      row({ id: "q", status: "QUEUED" }),
    ];
    const out = resumeStaleRows(rows, () => true);
    expect(out.map((r) => r.status)).toEqual(["DONE", "ERROR", "PAUSED", "QUEUED"]);
  });
});

describe("chapterKeyIndex: stable page-key ordinals (B3)", () => {
  it("derives the ordinal from the chapter id, not the live array index", () => {
    // chapter inserted ahead of c7 while the job waited in the queue:
    // the array index is now 7, but the page keys must stay at c7
    expect(chapterKeyIndex("w-md-abc-c7", 7)).toBe(7);
    expect(chapterKeyIndex("w-md-abc-c7", 8)).toBe(7);
  });

  it("falls back to the positional index for legacy ids", () => {
    expect(chapterKeyIndex("legacy-id", 3)).toBe(4);
  });
});

describe("verifyChapterDownload: verify-before-complete (M2/B5)", () => {
  it("accepts a chapter whose fetched pages match the upstream count", () => {
    expect(verifyChapterDownload(20, 20)).toBe("ok");
  });

  it("refuses to mark DONE when pages were skipped", () => {
    expect(verifyChapterDownload(18, 20)).toBe("incomplete");
  });

  it("refuses empty artifacts even without a known count", () => {
    expect(verifyChapterDownload(0, 0)).toBe("incomplete");
  });

  it("accepts fetched>0 when the upstream count is unknown (0)", () => {
    expect(verifyChapterDownload(14, 0)).toBe("ok");
  });
});

describe("honestTelemetry: real bytes, no invented numbers (B4)", () => {
  it("progress is page-based and capped below 100 until DONE", () => {
    expect(honestTelemetry(0, 20, 0, 7).progress).toBe(5);
    expect(honestTelemetry(19, 20, 10_000_000, 7).progress).toBe(99);
  });

  it("downloadedMb is the REAL byte count, not an estimate", () => {
    const s = honestTelemetry(3, 20, 3 * 524_288, 7); // 3 × 0.5 MiB pages
    expect(s.downloadedMb).toBe(1.5);
  });

  it("totalMb converges to the projected real size, never below real bytes", () => {
    // pageDone is 0-based: 3 means 4 pages landed (4 × 0.5 MiB) → project 10 MB
    const s = honestTelemetry(3, 20, 4 * 524_288, 7);
    expect(s.totalMb).toBeCloseTo(10, 1);
    const late = honestTelemetry(19, 20, 19 * 524_288, 10);
    expect(late.totalMb).toBeGreaterThanOrEqual(late.downloadedMb);
  });

  it("windowedSpeed reports real MB/s and 0 for too-short windows", () => {
    expect(windowedSpeed(0, 5000)).toBe(0);
    expect(windowedSpeed(1_048_576, 300)).toBe(0); // window too short
    expect(windowedSpeed(2 * 1_048_576, 2000)).toBeCloseTo(1, 1); // 2 MB / 2 s
  });
});

describe("pickNextDownload: FIFO queue policy", () => {
  it("returns the oldest QUEUED row", () => {
    const rows = [
      row({ id: "new", startedAt: "2026-01-02T00:00:00.000Z" }),
      row({ id: "old", startedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    expect(pickNextDownload(rows, 2)?.id).toBe("old");
  });

  it("returns null when the concurrency cap is reached", () => {
    const rows = [
      row({ id: "a", status: "ACTIVE" }),
      row({ id: "b", status: "ACTIVE" }),
      row({ id: "c", status: "QUEUED" }),
    ];
    expect(pickNextDownload(rows, 2)).toBeNull();
    expect(pickNextDownload(rows, 3)?.id).toBe("c");
  });

  it("returns null when nothing is queued", () => {
    expect(pickNextDownload([row({ id: "d", status: "DONE" })], 2)).toBeNull();
  });
});

describe("addMangaDexToLibrary: deterministic local id (M1/T6)", () => {
  const manga: MdManga = {
    id: "32d76d19-8a05-4db0-9fc2-e0b1884a5b96",
    title: "Sample Manga",
    author: "",
    description: "",
    coverUrl: "",
    tags: [],
    status: "ongoing",
    workType: "MANGA",
  };
  const chapter: MdChapter = {
    id: "ch-uuid-1",
    number: 1,
    title: "Ch. 1",
    pages: 20,
    publishedAt: "2026-01-01T00:00:00.000Z",
  };

  it("mints the same work id on every add — no Date.now() collisions", async () => {
    const a = await addMangaDexToLibrary(manga, [chapter]);
    const b = await addMangaDexToLibrary(manga, [chapter]);
    expect(a.id).toBe(b.id);
    expect(a.id).toBe("w-md-32d76d19-8a05-4db0-9fc2-e0b1884a5b96");
    // chapter + page keys inherit the stable ordinal scheme
    expect(a.chapters[0].id).toBe(`${a.id}-c1`);
  });

  it("never marks anything downloaded by itself (library add ≠ download)", async () => {
    const w = await addMangaDexToLibrary(manga, [chapter, { ...chapter, id: "ch-uuid-2", number: 2 }]);
    expect(w.chapters.every((c) => c.download === "NONE")).toBe(true);
    expect(w.chapters.every((c) => c.localPages === undefined)).toBe(true);
  });
});
