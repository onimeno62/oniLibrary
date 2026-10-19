/**
 * DATA — v1.4.0 work/chapter management regression tests:
 * rename semantics, chapter deletion with orphan purge, chapter moves
 * (storage-less environment → metadata-only path), streamable-row
 * append/dedupe, and the real download queue upsert/patch actions.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { useApp } from "../src/lib/store";
import { makeChapter, makeWork } from "./helpers";

const S = () => useApp.getState();

function seed() {
  useApp.setState({
    works: [
      makeWork({
        id: "w-src",
        title: "Source",
        chapters: [
          makeChapter({ id: "w-src-c1", number: 1, title: "Ch. 1", sourceChapterId: "md-uuid-1" as never } as never),
          makeChapter({ id: "w-src-c2", number: 2, title: "Ch. 2", sourceChapterId: "md-uuid-2" as never } as never),
        ],
      }),
      makeWork({
        id: "w-dst",
        title: "Target",
        chapters: [makeChapter({ id: "w-dst-c1", number: 1, title: "Ch. 1" })],
      }),
    ],
    downloads: [],
    notifications: [],
    history: [],
    bookmarks: [],
    highlights: [],
    workCategories: {},
  });
}

beforeEach(seed);

describe("renameWork / renameChapter", () => {
  it("renames a work and trims the title", () => {
    S().renameWork("w-src", "  Renamed Work  ");
    expect(S().works.find((w) => w.id === "w-src")?.title).toBe("Renamed Work");
  });

  it("keeps the old title when the new one is blank", () => {
    S().renameWork("w-src", "   ");
    expect(S().works.find((w) => w.id === "w-src")?.title).toBe("Source");
  });

  it("renames a chapter without touching others", () => {
    S().renameChapter("w-src", "w-src-c2", "Custom title");
    const w = S().works.find((x) => x.id === "w-src")!;
    expect(w.chapters.find((c) => c.id === "w-src-c2")?.title).toBe("Custom title");
    expect(w.chapters.find((c) => c.id === "w-src-c1")?.title).toBe("Ch. 1");
  });
});

describe("deleteChapters", () => {
  it("removes chapter rows and their dependent records", () => {
    useApp.setState({
      downloads: [{ id: "dl-1", workId: "w-src", chapterId: "w-src-c2", status: "DONE", progress: 100, downloadedMb: 1, totalMb: 1, speedMbps: 0, startedAt: "" } as never],
      bookmarks: [{ id: "bm-1", workId: "w-src", chapterId: "w-src-c2", page: 0, createdAt: "" } as never],
      history: [{ id: "h-1", workId: "w-src", chapterId: "w-src-c2", page: 0, at: "" } as never],
    });
    S().deleteChapters("w-src", ["w-src-c2"]);
    const w = S().works.find((x) => x.id === "w-src")!;
    expect(w.chapters.map((c) => c.id)).toEqual(["w-src-c1"]);
    expect(S().downloads).toHaveLength(0);
    expect(S().bookmarks).toHaveLength(0);
    expect(S().history).toHaveLength(0);
  });
});

describe("moveChapters", () => {
  it("moves metadata rows to the target work and regenerates ids", async () => {
    const ok = await S().moveChapters("w-src", ["w-src-c2"], "w-dst");
    expect(ok).toBe(true);
    const src = S().works.find((x) => x.id === "w-src")!;
    const dst = S().works.find((x) => x.id === "w-dst")!;
    expect(src.chapters.map((c) => c.id)).toEqual(["w-src-c1"]);
    // target had 1 chapter → the moved one becomes c2, ordered by number
    expect(dst.chapters.map((c) => c.id)).toEqual(["w-dst-c1", "w-dst-c2"]);
    expect(dst.chapters[1].sourceChapterId).toBe("md-uuid-2");
  });

  it("refuses moving into the same work or unknown works", async () => {
    expect(await S().moveChapters("w-src", ["w-src-c1"], "w-src")).toBe(false);
    expect(await S().moveChapters("w-src", ["w-src-c1"], "w-nope")).toBe(false);
  });

  it("refuses legacy flat-list chapters instead of corrupting keys", async () => {
    useApp.setState({
      works: [
        makeWork({
          id: "w-legacy",
          localPages: ["w-legacy::p0"],
          chapters: [makeChapter({ id: "w-legacy-c1", number: 1 })], // no localPages on chapter
        }),
        makeWork({ id: "w-dst2", title: "T", chapters: [] }),
      ],
    });
    const ok = await S().moveChapters("w-legacy", ["w-legacy-c1"], "w-dst2");
    expect(ok).toBe(false);
    expect(S().works.find((w) => w.id === "w-legacy")?.chapters).toHaveLength(1);
  });
});

describe("appendSourceChapters", () => {
  it("dedupes by sourceChapterId and keeps reading order", () => {
    const added = S().appendSourceChapters("w-src", [
      makeChapter({ id: "w-src-c9", number: 9, sourceChapterId: "md-uuid-9" } as never),
      makeChapter({ id: "w-src-c10", number: 10, sourceChapterId: "md-uuid-10" } as never),
      makeChapter({ id: "w-src-dup", number: 1, sourceChapterId: "md-uuid-1" } as never), // already known
    ]);
    expect(added).toBe(2);
    const w = S().works.find((x) => x.id === "w-src")!;
    expect(w.chapters.map((c) => c.number)).toEqual([1, 2, 9, 10]);
  });
});

describe("real download queue actions", () => {
  it("upsert inserts then patches by id", () => {
    const row = { id: "dlbg-x", workId: "w-src", chapterId: "w-src-c1", status: "ACTIVE" as const, progress: 0, downloadedMb: 0, totalMb: 10, speedMbps: 1, startedAt: "" };
    S().upsertDownload(row as never);
    S().upsertDownload({ ...row, progress: 50 } as never);
    expect(S().downloads).toHaveLength(1);
    expect(S().downloads[0].progress).toBe(50);
    S().patchDownload("dlbg-x", { status: "DONE", progress: 100 });
    expect(S().downloads[0].status).toBe("DONE");
  });
});
