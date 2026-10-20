/**
 * MANGADEX FILTERS — Phase 3 of DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md
 * (§12 Phase 3 gate: "each feed/filter has defined source semantics").
 *
 * Proves the filter→API mapping is server-side, honest, and stable:
 *  - content type → originalLanguage[] (Manhua includes zh-hk)
 *  - status → status[]
 *  - genres → includedTags[] (real tag UUIDs)
 *  - empty filters produce no filter params at all
 *  - the base browse query keeps its rating/includes/hasAvailableChapters
 *    semantics, and offset paging stays page*24
 */
import { describe, it, expect } from "bun:test";
import { buildListQuery } from "../src/lib/mangadex";
import type { MdFeedFilters } from "../src/lib/types";

function params(q: string): URLSearchParams {
  return new URLSearchParams(q.replace(/^\//, "").split("?")[1] ?? "");
}

describe("buildListQuery: filter → MangaDex API semantics", () => {
  it("maps content type to originalLanguage[] (Manhua → zh + zh-hk)", () => {
    const p = params(buildListQuery({ order: "followedCount", offset: 0, filters: { originalLanguage: ["zh", "zh-hk"] } }));
    expect(p.getAll("originalLanguage[]")).toEqual(["zh", "zh-hk"]);
  });

  it("maps status multi-select to status[] (OR semantics server-side)", () => {
    const p = params(buildListQuery({ order: "latestUploadedChapter", offset: 0, filters: { status: ["ongoing", "completed"] } }));
    expect(p.getAll("status[]")).toEqual(["ongoing", "completed"]);
  });

  it("maps genre/tag UUIDs to includedTags[] (AND semantics server-side)", () => {
    const p = params(
      buildListQuery({ order: "followedCount", offset: 0, filters: { includedTags: ["uuid-romance", "uuid-action"] } })
    );
    expect(p.getAll("includedTags[]")).toEqual(["uuid-romance", "uuid-action"]);
  });

  it("applies every dimension at once", () => {
    const f: MdFeedFilters = { status: ["ongoing"], originalLanguage: ["ja"], includedTags: ["uuid-x"] };
    const p = params(buildListQuery({ order: "relevance", offset: 0, title: "solo", filters: f }));
    expect(p.getAll("status[]")).toEqual(["ongoing"]);
    expect(p.getAll("originalLanguage[]")).toEqual(["ja"]);
    expect(p.getAll("includedTags[]")).toEqual(["uuid-x"]);
    expect(p.get("title")).toBe("solo");
    expect(p.get("order[relevance]")).toBe("desc");
  });

  it("no filters → no filter params (never sends fabricated constraints)", () => {
    const p = params(buildListQuery({ order: "followedCount", offset: 0 }));
    expect(p.getAll("status[]")).toEqual([]);
    expect(p.getAll("originalLanguage[]")).toEqual([]);
    expect(p.getAll("includedTags[]")).toEqual([]);
  });

  it("keeps the honest base semantics: safe+suggestive ratings, English chapter policy inputs, paging", () => {
    const p = params(buildListQuery({ order: "followedCount", offset: 3 }));
    expect(p.getAll("contentRating[]")).toEqual(["safe", "suggestive"]);
    expect(p.get("hasAvailableChapters")).toBe("true");
    expect(p.get("limit")).toBe("24");
    expect(p.get("offset")).toBe("72"); // page 3 × 24
    expect(p.get("order[followedCount]")).toBe("desc");
  });
});
