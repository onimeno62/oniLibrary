/**
 * DATA/READER — progress-restore math regression tests.
 * Proves: workProgress rounding, the dual lastPage interpretation
 * (ratio ≤ 1 vs legacy absolute page > 1) with clamping, History resume
 * page refresh, and smart-rule group matching.
 */
import { describe, it, expect } from "bun:test";
import { useApp, workProgress, continueReading, matchesRule, chapterProgressFraction } from "../src/lib/store";
import { makeChapter, makeWork } from "./helpers";

describe("chapterProgressFraction: dual lastPage interpretation", () => {
  it("ratio lastPage (current reader format) is used directly", () => {
    expect(chapterProgressFraction(makeChapter({ id: "c", number: 1, lastPage: 0.667, pages: 18 }))).toBeCloseTo(0.667, 3);
  });

  it("legacy absolute lastPage is divided by pages", () => {
    expect(chapterProgressFraction(makeChapter({ id: "c", number: 1, lastPage: 10, pages: 20 }))).toBe(0.5);
  });

  it("clamps to 0..1 and treats missing progress as 0", () => {
    expect(chapterProgressFraction(makeChapter({ id: "c", number: 1, lastPage: 999, pages: 20 }))).toBe(1);
    expect(chapterProgressFraction(makeChapter({ id: "c", number: 1, lastPage: 0, pages: 20 }))).toBe(0);
    expect(chapterProgressFraction(makeChapter({ id: "c", number: 1, pages: 20 }))).toBe(0);
  });
});

describe("workProgress", () => {
  it("0 chapters → 0%", () => {
    expect(workProgress(makeWork({ id: "w0", chapters: [] }))).toBe(0);
  });

  it("all read → 100%", () => {
    const w = makeWork({
      id: "w1",
      chapters: [
        makeChapter({ id: "c1", number: 1, isRead: true }),
        makeChapter({ id: "c2", number: 2, isRead: true }),
      ],
    });
    expect(workProgress(w)).toBe(100);
  });

  it("counts the in-progress chapter as a fraction (legacy absolute lastPage)", () => {
    // 1 read of 4, current chapter at absolute page 10/20 → (1 + 0.5) / 4 = 38
    const w = makeWork({
      id: "w2",
      chapters: [
        makeChapter({ id: "c1", number: 1, isRead: true }),
        makeChapter({ id: "c2", number: 2, isRead: false, lastPage: 10, pages: 20 }),
        makeChapter({ id: "c3", number: 3, isRead: false }),
        makeChapter({ id: "c4", number: 4, isRead: false }),
      ],
    });
    expect(workProgress(w)).toBe(38);
  });

  it("accepts ratio lastPage (current reader format) identically", () => {
    const w = makeWork({
      id: "w2r",
      chapters: [
        makeChapter({ id: "c1", number: 1, isRead: true }),
        makeChapter({ id: "c2", number: 2, isRead: false, lastPage: 0.5, pages: 20 }),
        makeChapter({ id: "c3", number: 3, isRead: false }),
        makeChapter({ id: "c4", number: 4, isRead: false }),
      ],
    });
    expect(workProgress(w)).toBe(38);
  });

  it("never exceeds 100 even with stale lastPage", () => {
    const w = makeWork({
      id: "w3",
      chapters: [makeChapter({ id: "c1", number: 1, isRead: true, lastPage: 999, pages: 20 })],
    });
    expect(workProgress(w)).toBe(100);
  });
});

describe("continueReading: dual lastPage interpretation", () => {
  it("legacy absolute page (> 1) is used as-is and clamped to the last page index", () => {
    const w = makeWork({
      id: "w4",
      chapters: [makeChapter({ id: "c1", number: 1, pages: 20, lastPage: 37 })],
    });
    // 37 clamps to t-1 = 19
    expect(continueReading(w)?.page).toBe(19);
  });

  it("ratio lastPage (≤ 1) converts to a real page", () => {
    const w = makeWork({
      id: "w5",
      chapters: [makeChapter({ id: "c1", number: 1, pages: 20, lastPage: 0.5 })],
    });
    expect(continueReading(w)?.page).toBe(10);
  });

  it("ratio 0 → page 0, ratio 1 → last page index", () => {
    const mk = (lp: number) =>
      makeWork({ id: `w-${lp}`, chapters: [makeChapter({ id: "c1", number: 1, pages: 20, lastPage: lp })] });
    expect(continueReading(mk(0))?.page).toBe(0);
    expect(continueReading(mk(1))?.page).toBe(19);
  });

  it("no progress → first unread chapter at page 0", () => {
    const w = makeWork({
      id: "w6",
      chapters: [
        makeChapter({ id: "c1", number: 1, isRead: true }),
        makeChapter({ id: "c2", number: 2 }),
      ],
    });
    const r = continueReading(w);
    expect(r?.chapter.id).toBe("c2");
    expect(r?.page).toBe(0);
  });

  it("everything read → resume offer lands on the last chapter", () => {
    const w = makeWork({
      id: "w7",
      chapters: [
        makeChapter({ id: "c1", number: 1, isRead: true }),
        makeChapter({ id: "c2", number: 2, isRead: true }),
      ],
    });
    expect(continueReading(w)?.chapter.id).toBe("c2");
  });
});

describe("history resume (refreshHistoryPage)", () => {
  it("keeps the history entry on the page the reader actually reached", () => {
    useApp.setState({
      history: [
        { id: "h-r1", workId: "w-r", chapterId: "c-r", page: 0, at: "2025-01-01T00:00:00.000Z" } as never,
      ],
    });
    useApp.getState().refreshHistoryPage("w-r", "c-r", 17);
    expect(useApp.getState().history[0].page).toBe(17);
    // other entries untouched
    useApp.getState().refreshHistoryPage("w-other", "c-other", 5);
    expect(useApp.getState().history[0].page).toBe(17);
  });
});

describe("matchesRule: type groups", () => {
  it("MANGA group includes manhwa/manhua/webtoon", () => {
    for (const type of ["MANGA", "MANHWA", "MANHUA", "WEBTOON"] as const) {
      expect(matchesRule(makeWork({ id: "wm", type }), { type: "MANGA" })).toBe(true);
    }
    expect(matchesRule(makeWork({ id: "wc", type: "COMIC" }), { type: "MANGA" })).toBe(false);
  });

  it("BOOK group includes EPUB/NOVEL", () => {
    expect(matchesRule(makeWork({ id: "wb", type: "EPUB" }), { type: "BOOK" })).toBe(true);
    expect(matchesRule(makeWork({ id: "wb2", type: "NOVEL" }), { type: "BOOK" })).toBe(true);
  });

  it("AND-ed conditions: downloaded + favorite must both hold", () => {
    const w = makeWork({
      id: "wf",
      isFavorite: false,
      chapters: [makeChapter({ id: "c1", number: 1, download: "NONE" })],
    });
    expect(matchesRule(w, { downloaded: true, favorite: true })).toBe(false);
  });
});
