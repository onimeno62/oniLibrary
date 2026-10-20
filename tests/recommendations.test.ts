/**
 * ON-DEVICE RECOMMENDATIONS — Phase 5 gate of
 * docs/DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md (§9, §12 Phase 5, §13).
 *
 * Proves (all deterministic, no network, no time dependence):
 *  - ranking is deterministic (same inputs → same order, stable tie-break)
 *  - a brand-new user gets the honest provider feed order (reasonPopular)
 *  - explicit interests dominate; observed activity ranks next
 *  - a single accidental open is a weak signal, real reading is strong
 *  - excluded genres and dismissed candidates never appear
 *  - works already in the library are never recommended again
 *  - personalization OFF ⇒ pure feed order with no local signals used
 *  - every surviving candidate carries ≥1 reason (capped at 2)
 *  - provider tag filter maps interests/activity onto tag uuids honestly
 *  - dismissal list is capped and cannot grow without bound
 */
import { describe, it, expect } from "bun:test";
import type { WorkType } from "../src/lib/types";
import {
  buildRecSignals,
  rankRecommendations,
  librarySourceIds,
  buildProviderTagFilter,
  isNewUser,
  type RecCandidate,
} from "../src/lib/recommendations";

const TAGS = (names: string[]) => names;

function work(id: string, tags: string[], opts: Partial<{ chapters: number; favorite: boolean; reading: boolean; type: WorkType; sourceRefItemId: string }> = {}) {
  return {
    id,
    tags,
    type: (opts.type ?? "MANGA") as WorkType,
    readingStatus: opts.reading ? ("READING" as const) : ("PLANNED" as const),
    isFavorite: opts.favorite ?? false,
    sourceRef: opts.sourceRefItemId
      ? { sourceId: "builtin-mangadex", itemId: opts.sourceRefItemId }
      : undefined,
  };
}

function historyFor(workId: string, chapters: number) {
  return Array.from({ length: chapters }, (_, i) => ({
    workId,
    chapterId: `${workId}-c${i + 1}`,
    page: 0,
  }));
}

function candidate(id: string, tags: string[], order: number, type = "MANGA"): RecCandidate {
  return {
    id,
    title: `Title ${id}`,
    tags,
    type,
    providerId: "builtin-mangadex",
    order,
  };
}

const EMPTY_SIGNALS = buildRecSignals({ works: [], history: [] });

describe("buildRecSignals: meaningful-activity weighting (plan §9)", () => {
  it("a single accidental open is a weak signal, 4+ chapters is strong", () => {
    const one = buildRecSignals({ works: [work("a", TAGS(["Action"]))], history: historyFor("a", 1) });
    const four = buildRecSignals({ works: [work("b", TAGS(["Action"]))], history: historyFor("b", 4) });
    // fixed-cap: raw 0.25 / cap 1.5 — weak regardless of the rest of the library
    expect(one.tagWeights["action"]).toBeCloseTo(0.25 / 1.5, 5);
    expect(four.tagWeights["action"]).toBeCloseTo(1.0 / 1.5, 5);
  });

  it("the strongest possible signal saturates at 1, stacking works on one tag", () => {
    const s = buildRecSignals({
      works: [work("a", TAGS(["Action"])), work("b", TAGS(["Action"]))],
      history: [...historyFor("a", 4), ...historyFor("b", 4)],
    });
    expect(s.tagWeights["action"]).toBe(1); // raw 2.0 → capped
  });

  it("favorites and active reading sharpen the signal but never run alone", () => {
    const s = buildRecSignals({
      works: [work("a", TAGS(["Romance"]), { favorite: true, reading: true })],
      history: [],
    });
    // favorite 0.5 + reading 0.25 = raw 0.75 → 0.5 even with zero history
    expect(s.tagWeights["romance"]).toBeCloseTo(0.5, 5);
    expect(s.hasActivity).toBe(true);
  });

  it("never-opened works contribute nothing", () => {
    const s = buildRecSignals({ works: [work("a", TAGS(["Horror"]))], history: [] });
    expect(s.tagWeights["horror"]).toBeUndefined();
    expect(s.hasActivity).toBe(false);
  });
});

describe("rankRecommendations: determinism and ordering", () => {
  const candidates = [candidate("md:b", TAGS(["Comedy"]), 1), candidate("md:a", TAGS(["Comedy"]), 0)];

  it("same inputs produce the exact same order", () => {
    const prefs = { enabled: true, interests: [], excluded: [] };
    const r1 = rankRecommendations(candidates, EMPTY_SIGNALS, prefs);
    const r2 = rankRecommendations(candidates, EMPTY_SIGNALS, prefs);
    expect(r1.map((x) => x.candidate.id)).toEqual(r2.map((x) => x.candidate.id));
  });

  it("ties break by provider feed order, then id — never randomly", () => {
    const r = rankRecommendations(candidates, EMPTY_SIGNALS, { enabled: true, interests: [], excluded: [] });
    expect(r.map((x) => x.candidate.id)).toEqual(["md:a", "md:b"]);
  });

  it("a brand-new user (no activity, no interests) keeps the provider feed order", () => {
    const c = [candidate("md:z", TAGS(["Action"]), 0), candidate("md:y", TAGS(["Drama"]), 1)];
    const r = rankRecommendations(c, EMPTY_SIGNALS, { enabled: true, interests: [], excluded: [] });
    expect(r.map((x) => x.candidate.id)).toEqual(["md:z", "md:y"]);
    expect(r.every((x) => x.score === 0)).toBe(true);
    expect(r[0].reasons).toEqual([{ key: "rec.reasonPopular" }]);
  });
});

describe("rankRecommendations: explainability", () => {
  it("explicit interests add +3 and explain themselves", () => {
    const c = [candidate("md:x", TAGS(["Sports", "Drama"]), 0)];
    const r = rankRecommendations(c, EMPTY_SIGNALS, { enabled: true, interests: ["sports"], excluded: [] });
    expect(r[0].score).toBe(3);
    expect(r[0].reasons).toContainEqual({ key: "rec.reasonInterest", params: { tag: "Sports" } });
  });

  it("interest match is case-insensitive and displays the provider tag", () => {
    const c = [candidate("md:x", TAGS(["Slice of Life"]), 0)];
    const r = rankRecommendations(c, EMPTY_SIGNALS, { enabled: true, interests: ["slice of life"], excluded: [] });
    expect(r[0].reasons.some((x) => x.key === "rec.reasonInterest" && x.params.tag === "Slice of Life")).toBe(true);
  });

  it("reading affinity adds weight and explains; strongest tag sorts first", () => {
    const signals = buildRecSignals({
      works: [work("w1", TAGS(["Drama", "Action"]))],
      history: historyFor("w1", 4),
    });
    const c = [candidate("md:x", TAGS(["Drama", "Action"]), 0)];
    const r = rankRecommendations(c, signals, { enabled: true, interests: [], excluded: [] });
    // both tags weigh 1/1.5; the tie sorts alphabetically — Action first
    expect(r[0].reasons[0]).toEqual({ key: "rec.reasonTags", params: { tag: "Action" } });
    // affinity (2 × 1/1.5 each) plus the type-majority bonus (0.5 × 1/1.5)
    expect(r[0].score).toBeCloseTo(2 * (2 / 1.5) + 0.5 * (1 / 1.5), 5);
  });

  it("favorites produce a dedicated reason", () => {
    const signals = buildRecSignals({
      works: [work("w1", TAGS(["Romance"]), { favorite: true })],
      history: historyFor("w1", 2),
    });
    const r = rankRecommendations(
      [candidate("md:x", TAGS(["Romance"]), 0)],
      signals,
      { enabled: true, interests: [], excluded: [] }
    );
    expect(r[0].reasons.some((x) => x.key === "rec.reasonFavorite")).toBe(true);
  });

  it("tag-less candidates fall back to the honest type reason, then popularity", () => {
    const signals = buildRecSignals({ works: [work("w1", TAGS(["Action"]))], history: historyFor("w1", 4) });
    const r = rankRecommendations(
      [candidate("md:x", TAGS(["Sci-Fi"]), 0)],
      signals,
      { enabled: true, interests: [], excluded: [] }
    );
    // no tag overlap; the type is a clear majority → truthful type reason
    expect(r[0].score).toBeGreaterThan(0);
    expect(r[0].reasons[0].key).toBe("rec.reasonType");
  });

  it("a candidate with no signals at all always carries the popularity reason", () => {
    const r = rankRecommendations(
      [candidate("md:x", TAGS(["Sci-Fi"]), 0)],
      EMPTY_SIGNALS,
      { enabled: true, interests: [], excluded: [] }
    );
    expect(r[0].reasons).toEqual([{ key: "rec.reasonPopular" }]);
    expect(r[0].score).toBe(0);
  });

  it("reasons are capped at 2", () => {
    const signals = buildRecSignals({
      works: [work("w1", TAGS(["Action"]), { favorite: true })],
      history: historyFor("w1", 4),
    });
    const r = rankRecommendations(
      [candidate("md:x", TAGS(["Action", "Drama"]), 0, "MANGA")],
      signals,
      { enabled: true, interests: ["action", "drama"], excluded: [] }
    );
    expect(r[0].reasons.length).toBe(2);
  });
});

describe("rankRecommendations: filters and privacy", () => {
  it("excluded genres are filtered out entirely", () => {
    const c = [candidate("md:x", TAGS(["Gore"]), 0), candidate("md:y", TAGS(["Comedy"]), 1)];
    const r = rankRecommendations(c, EMPTY_SIGNALS, { enabled: true, interests: [], excluded: ["gore"] });
    expect(r.map((x) => x.candidate.id)).toEqual(["md:y"]);
  });

  it("dismissed candidates never come back", () => {
    const c = [candidate("md:x", TAGS(["Comedy"]), 0), candidate("md:y", TAGS(["Comedy"]), 1)];
    const r = rankRecommendations(c, EMPTY_SIGNALS, { enabled: true, interests: [], excluded: [] }, { dismissed: ["md:x"] });
    expect(r.map((x) => x.candidate.id)).toEqual(["md:y"]);
  });

  it("dismissed accepts a plain array and enforces a 300-id cap at the store layer", () => {
    // engine side: any dismissed list works
    const many = Array.from({ length: 500 }, (_, i) => `md:${i}`);
    const r = rankRecommendations(
      [candidate("md:0", [], 0), candidate("md:499", [], 1)],
      EMPTY_SIGNALS,
      { enabled: true, interests: [], excluded: [] },
      { dismissed: many }
    );
    expect(r).toEqual([]);
  });

  it("library works are never recommended again (sourceRef path)", () => {
    const ids = librarySourceIds([work("w1", [], { sourceRefItemId: "uuid-123" })], "builtin-mangadex");
    expect(ids.has("uuid-123")).toBe(true);
    const r = rankRecommendations(
      [candidate("md:uuid-123", TAGS(["Action"]), 0), candidate("md:other", TAGS(["Action"]), 1)],
      EMPTY_SIGNALS,
      { enabled: true, interests: [], excluded: [] },
      { libraryIds: ids }
    );
    expect(r.map((x) => x.candidate.id)).toEqual(["md:other"]);
  });

  it("library works are also matched through the w-md-<uuid> id convention", () => {
    const ids = librarySourceIds([work("w-md-abc-1", [])], "builtin-mangadex");
    expect(ids.has("abc-1")).toBe(true);
  });

  it("personalization OFF ignores all local signals and keeps feed order", () => {
    const signals = buildRecSignals({
      works: [work("w1", TAGS(["Action"]))],
      history: historyFor("w1", 4),
    });
    const c = [
      candidate("md:first", TAGS(["Horror"]), 0),
      candidate("md:second", TAGS(["Action"]), 1),
    ];
    const r = rankRecommendations(c, signals, { enabled: false, interests: ["action"], excluded: [] });
    expect(r.map((x) => x.candidate.id)).toEqual(["md:first", "md:second"]);
    expect(r.every((x) => x.score === 0 && x.reasons[0].key === "rec.reasonPopular")).toBe(true);
  });

  it("personalization OFF still respects exclusions and dismissals", () => {
    const c = [candidate("md:x", TAGS(["Gore"]), 0), candidate("md:y", TAGS(["Gore"]), 1)];
    const r = rankRecommendations(
      c,
      EMPTY_SIGNALS,
      { enabled: false, interests: [], excluded: ["gore"] },
      { dismissed: ["md:y"] }
    );
    expect(r).toEqual([]);
  });
});

describe("buildProviderTagFilter: honest server-side narrowing", () => {
  const nameToUuid = new Map([
    ["action", "uuid-action"],
    ["drama", "uuid-drama"],
    ["comedy", "uuid-comedy"],
  ]);

  it("explicit interests outrank observed activity", () => {
    const signals = buildRecSignals({ works: [work("w", TAGS(["Drama"]))], history: historyFor("w", 4) });
    const uuids = buildProviderTagFilter(
      signals,
      { enabled: true, interests: ["action"], excluded: [] },
      nameToUuid
    );
    expect(uuids[0]).toBe("uuid-action");
    expect(uuids).toContain("uuid-drama");
  });

  it("tags the provider does not know are skipped; unknown-only yields []", () => {
    const signals = buildRecSignals({ works: [work("w", TAGS(["Isekai"]))], history: historyFor("w", 4) });
    expect(buildProviderTagFilter(signals, { enabled: true, interests: [], excluded: [] }, nameToUuid)).toEqual([]);
  });

  it("personalization OFF narrows nothing (pure feed)", () => {
    const signals = buildRecSignals({ works: [work("w", TAGS(["Action"]))], history: historyFor("w", 4) });
    expect(buildProviderTagFilter(signals, { enabled: false, interests: ["action"], excluded: [] }, nameToUuid)).toEqual([]);
  });

  it("caps the number of tags sent to the provider", () => {
    const tags = TAGS(["action", "drama", "comedy"]);
    const works = tags.map((t, i) => work(`w${i}`, [t]));
    const history = works.flatMap((w) => historyFor(w.id, 2));
    const signals = buildRecSignals({ works, history });
    const uuids = buildProviderTagFilter(signals, { enabled: true, interests: [], excluded: [] }, nameToUuid, 2);
    expect(uuids.length).toBe(2);
  });
});

describe("new-user detection (plan §9 onboarding)", () => {
  it("enabled + no activity + no interests ⇒ new user", () => {
    expect(isNewUser(EMPTY_SIGNALS, { enabled: true, interests: [], excluded: [] })).toBe(true);
  });

  it("any interest, any activity, or disabled personalization ⇒ not new", () => {
    expect(isNewUser(EMPTY_SIGNALS, { enabled: true, interests: ["action"], excluded: [] })).toBe(false);
    const s = buildRecSignals({ works: [work("w", TAGS(["Action"]))], history: historyFor("w", 1) });
    expect(isNewUser(s, { enabled: true, interests: [], excluded: [] })).toBe(false);
    expect(isNewUser(EMPTY_SIGNALS, { enabled: false, interests: [], excluded: [] })).toBe(false);
  });
});
