/**
 * LIBRARY/HOME — feed + filter contracts (repo-audit remediation):
 * Latest Updates shows only genuine unread releases (and the section hides
 * when the feed is empty), tag filtering with documented OR semantics,
 * manual-category filtering through the workCategories join, and the nav
 * preset hand-off used by work-detail tag taps. Also guards the saved-filter
 * persistence fix (savedFilters were silently dropped from partialize).
 */
import { describe, it, expect, beforeEach } from "bun:test";
import {
  latestChapterUpdate,
  latestUpdatesFeed,
  collectTags,
  filterByTags,
  filterByCategory,
} from "../src/lib/library-contract";
import { useApp, useNav } from "../src/lib/store";
import { makeChapter, makeWork } from "./helpers";

const ch = (id: string, number: number, releaseDate: string, isRead = false) =>
  makeChapter({ id, number, releaseDate, isRead });

describe("latestChapterUpdate", () => {
  it("returns the newest unread chapter, not chapters[0]", () => {
    const w = makeWork({
      id: "w1",
      chapters: [ch("c1", 1, "2025-01-01T00:00:00.000Z", true), ch("c12", 12, "2026-02-10T00:00:00.000Z")],
    });
    expect(latestChapterUpdate(w)?.id).toBe("c12");
  });

  it("returns null when every chapter is read (no fake updates)", () => {
    const w = makeWork({
      id: "w2",
      chapters: [ch("c1", 1, "2025-01-01T00:00:00.000Z", true), ch("c2", 2, "2026-01-01T00:00:00.000Z", true)],
    });
    expect(latestChapterUpdate(w)).toBeNull();
  });

  it("returns null for works without chapters", () => {
    expect(latestChapterUpdate(makeWork({ id: "w3", chapters: [] }))).toBeNull();
  });

  it("breaks releaseDate ties by higher chapter number", () => {
    const w = makeWork({
      id: "w4",
      chapters: [ch("c1", 1, "2026-03-01T00:00:00.000Z"), ch("c2", 2, "2026-03-01T00:00:00.000Z")],
    });
    expect(latestChapterUpdate(w)?.id).toBe("c2");
  });

  it("sinks invalid releaseDates instead of throwing", () => {
    const w = makeWork({
      id: "w5",
      chapters: [ch("c-bad", 1, "not-a-date"), ch("c-good", 2, "2026-01-05T00:00:00.000Z")],
    });
    expect(latestChapterUpdate(w)?.id).toBe("c-good");
  });
});

describe("latestUpdatesFeed", () => {
  const works = [
    makeWork({
      id: "wa",
      title: "All read",
      chapters: [ch("a1", 1, "2026-03-01T00:00:00.000Z", true)],
    }),
    makeWork({
      id: "wb",
      title: "Fresh",
      chapters: [ch("b1", 1, "2026-01-01T00:00:00.000Z", true), ch("b2", 2, "2026-03-05T00:00:00.000Z")],
    }),
    makeWork({
      id: "wc",
      title: "Stale",
      chapters: [ch("c1", 1, "2024-06-01T00:00:00.000Z")],
    }),
    makeWork({ id: "wd", title: "Empty", chapters: [] }),
  ];

  it("includes only works with unread releases, newest first", () => {
    const feed = latestUpdatesFeed(works);
    expect(feed.map((u) => u.work.id)).toEqual(["wb", "wc"]);
  });

  it("empty library or all-read library → empty feed (Home hides the section)", () => {
    expect(latestUpdatesFeed([])).toEqual([]);
    expect(latestUpdatesFeed([works[0]])).toEqual([]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeWork({ id: `m${i}`, chapters: [ch(`m${i}-c1`, 1, `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000Z`)] })
    );
    expect(latestUpdatesFeed(many, 8)).toHaveLength(8);
    expect(latestUpdatesFeed(many, 0)).toEqual([]);
  });
});

describe("collectTags", () => {
  it("derives the real vocabulary with counts, most-used first", () => {
    const tags = collectTags([
      makeWork({ id: "t1", tags: ["Action", "Drama"] }),
      makeWork({ id: "t2", tags: ["Action"] }),
      makeWork({ id: "t3", tags: ["action", "  "] }),
    ]);
    expect(tags[0]).toEqual({ tag: "Action", count: 2 });
    expect(tags.map((t) => t.tag)).toContain("Drama");
    // blank tags are dropped; case is preserved as authored (no silent mutation)
    expect(tags.find((t) => t.tag === "action")).toBeDefined();
    expect(tags.find((t) => t.tag === "")).toBeUndefined();
  });
});

describe("filterByTags (OR semantics — documented product choice)", () => {
  const works = [
    makeWork({ id: "f1", tags: ["Action", "Fantasy"] }),
    makeWork({ id: "f2", tags: ["Romance"] }),
    makeWork({ id: "f3", tags: ["Action", "Horror"] }),
  ];

  it("empty selection returns the same array (no-op, memo-safe)", () => {
    expect(filterByTags(works, [])).toBe(works);
  });

  it("any selected tag matches (OR)", () => {
    const out = filterByTags(works, ["Fantasy", "Horror"]);
    expect(out.map((w) => w.id)).toEqual(["f1", "f3"]);
  });

  it("mode all requires every selected tag", () => {
    const out = filterByTags(works, ["Action", "Horror"], "all");
    expect(out.map((w) => w.id)).toEqual(["f3"]);
  });

  it("unknown tag yields no fabricated results", () => {
    expect(filterByTags(works, ["Nonexistent"])).toEqual([]);
  });
});

describe("filterByCategory", () => {
  const works = [makeWork({ id: "g1" }), makeWork({ id: "g2" }), makeWork({ id: "g3" })];
  const join = { g1: ["cat-a"], g3: ["cat-a", "cat-b"] };

  it("null category is a no-op returning the same array", () => {
    expect(filterByCategory(works, join, null)).toBe(works);
  });

  it("manual category filters through the join", () => {
    expect(filterByCategory(works, join, "cat-a").map((w) => w.id)).toEqual(["g1", "g3"]);
  });

  it("categories with no works yield an empty result (honest)", () => {
    expect(filterByCategory(works, join, "cat-empty")).toEqual([]);
  });
});

describe("nav library preset hand-off (work-detail tag → Library)", () => {
  beforeEach(() => {
    useNav.setState({ tab: "home", stack: [{ kind: "details", workId: "x" }], libraryPreset: null });
  });

  it("openLibraryFiltered switches to Library, drops overlays, carries the filter", () => {
    useNav.getState().openLibraryFiltered({ tag: "Action" });
    const s = useNav.getState();
    expect(s.tab).toBe("library");
    expect(s.stack).toEqual([]);
    expect(s.libraryPreset).toEqual({ tag: "Action" });
  });

  it("clearLibraryPreset resets the pending filter", () => {
    useNav.getState().openLibraryFiltered({ category: "cat-a" });
    useNav.getState().clearLibraryPreset();
    expect(useNav.getState().libraryPreset).toBeNull();
  });
});

describe("savedFilters persistence (audit fix — was missing from partialize)", () => {
  beforeEach(() => {
    useApp.setState({ savedFilters: [] });
  });

  it("partialize round-trips saved filter chips", () => {
    const filter = {
      id: "sf1",
      name: "Reading manga",
      filter: { type: "MANGA", status: "READING", source: null, downloadedOnly: false, unreadOnly: false, sort: "recent" },
    };
    useApp.setState({ savedFilters: [filter] });
    const options = useApp.persist.getOptions();
    const partial = options.partialize?.(useApp.getState()) as Record<string, unknown>;
    expect(partial.savedFilters).toEqual([filter]);
  });
});
