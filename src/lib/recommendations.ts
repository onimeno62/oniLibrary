"use client";

/**
 * On-device recommendation ranking (plan §9, Phase 5).
 *
 * Deterministic, explainable, LOCAL-ONLY ranking:
 *   - inputs are user-selected interests, meaningful reading activity
 *     (weighted so a single accidental open is a weak signal), explicit
 *     exclusions, and dismissals — everything stays on this device;
 *   - candidates come from a provider popularity feed (MangaDex) that is
 *     labeled honestly as source popularity, never "global";
 *   - every kept candidate carries at least one concise reason;
 *   - the ranking is pure: same inputs → same order (stable tie-breaks),
 *     independent of UI, and unit-tested with deterministic fixtures.
 *
 * No reading history ever leaves the device and nothing here uploads it.
 */

import type { HistoryEntry, Work } from "./types";

/* ---------------- signals ---------------- */

export interface RecSignalsInput {
  /** the user's library (vaulted works excluded by the caller) */
  works: Pick<Work, "id" | "tags" | "type" | "readingStatus" | "isFavorite">[];
  /** reading history — chapter opens, newest activity last */
  history: Pick<HistoryEntry, "workId" | "chapterId" | "page">[];
}

export interface RecSignals {
  /** tag name → normalized weight 0..1 (1 = strongest signal) */
  tagWeights: Record<string, number>;
  /** tags from favorited works → weight 0..1 */
  favoriteTags: Record<string, number>;
  /** work type → weight 0..1 */
  typeWeights: Record<string, number>;
  /** true when there is enough activity to personalize at all */
  hasActivity: boolean;
}

/**
 * Build activity signals. Meaningfulness rule (plan §9): a single accidental
 * open contributes only 0.25, a second chapter read brings it to 0.5, each
 * further chapter (up to 4) adds 0.25 — so skim-and-forget can never dominate
 * a tag the user actually reads. Favorites +0.5 and actively-READING +0.25
 * sharpen genuinely liked titles. Weights are then normalized to 0..1.
 */
export function buildRecSignals(input: RecSignalsInput): RecSignals {
  const chaptersByWork = new Map<string, number>();
  for (const h of input.history) {
    chaptersByWork.set(h.workId, (chaptersByWork.get(h.workId) ?? 0) + 1);
  }

  const tagRaw: Record<string, number> = {};
  const favRaw: Record<string, number> = {};
  const typeRaw: Record<string, number> = {};

  for (const w of input.works) {
    const chapters = Math.min(chaptersByWork.get(w.id) ?? 0, 4);
    let strength = 0.25 * Math.min(chapters, 4); // 0 chapters → 0 (never opened)
    if (w.isFavorite) strength += 0.5;
    if (w.readingStatus === "READING") strength += 0.25;
    if (strength <= 0) continue;

    for (const tag of w.tags) {
      const key = tag.trim().toLowerCase(); // signals are case-insensitive
      if (!key) continue;
      tagRaw[key] = (tagRaw[key] ?? 0) + strength;
      if (w.isFavorite) favRaw[key] = (favRaw[key] ?? 0) + 0.5;
    }
    typeRaw[w.type] = (typeRaw[w.type] ?? 0) + strength;
  }

  return {
    tagWeights: clamp(tagRaw),
    favoriteTags: clamp(favRaw),
    typeWeights: clamp(typeRaw),
    hasActivity: Object.keys(tagRaw).length > 0,
  };
}

/*
 * Fixed-cap weight (not max-normalization): raw strength 1.5 counts as the
 * strongest possible signal, so a single accidental open (0.25) lands at
 * 0.17 — weak no matter what the rest of the library looks like — while a
 * genuinely read favorite (≥1.5) saturates at 1. Deterministic and bounded.
 */
function clamp(raw: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Math.min(1, v / 1.5);
  return out;
}

/* ---------------- candidates ---------------- */

export interface RecCandidate {
  /** stable id, e.g. "md:<uuid>" — dismissal keys on this */
  id: string;
  title: string;
  author?: string;
  coverUrl?: string;
  /** tag names, lowercased by the adapter for stable comparisons */
  tags: string[];
  /** work type, e.g. "MANGA" / "NOVEL" */
  type: string;
  /** provider that supplied the candidate */
  providerId: string;
  /** 0-based position in the provider feed — preserves honest feed order */
  order: number;
  /** nav payload for the details screen */
  focusMangaId?: string;
}

export interface RecPrefs {
  /** personalization master switch — off ⇒ pure provider-feed order */
  enabled: boolean;
  /** user-selected interests (tag names) */
  interests: string[];
  /** user-excluded genres (tag names) — candidates matching these never rank */
  excluded: string[];
}

export type RecReason =
  | { key: "rec.reasonInterest"; params: { tag: string } }
  | { key: "rec.reasonTags"; params: { tag: string } }
  | { key: "rec.reasonFavorite"; params: { tag: string } }
  | { key: "rec.reasonType"; params: { type: string } }
  | { key: "rec.reasonPopular" };

export interface ScoredCandidate {
  candidate: RecCandidate;
  score: number;
  reasons: RecReason[];
}

/** ids of works the library already holds for a given provider */
export function librarySourceIds(works: Pick<Work, "id" | "sourceRef">[], providerPrefix: string): Set<string> {
  const ids = new Set<string>();
  for (const w of works) {
    if (w.sourceRef && w.sourceRef.sourceId === providerPrefix) ids.add(w.sourceRef.itemId);
    // MangaDex library ids are minted as `w-md-<uuid>` (M1, Phase 4)
    else if (w.id.startsWith(`w-md-`)) ids.add(w.id.slice(5));
  }
  return ids;
}

/* ---------------- ranking ---------------- */

export interface RankOptions {
  /** ids already in the library — excluded (the Continue shelf covers those) */
  libraryIds?: Set<string>;
  /** previously dismissed candidate ids */
  dismissed?: string[];
  /** how many results to return */
  limit?: number;
}

/**
 * Rank candidates. Deterministic: score desc → original feed order asc →
 * id asc. Personalization off (or zero score) keeps honest provider order.
 * Every surviving candidate carries ≥1 reason, capped at the 2 strongest.
 */
export function rankRecommendations(
  candidates: RecCandidate[],
  signals: RecSignals,
  prefs: RecPrefs,
  opts: RankOptions = {}
): ScoredCandidate[] {
  const libraryIds = opts.libraryIds ?? new Set<string>();
  const dismissed = new Set(opts.dismissed ?? []);
  const limit = opts.limit ?? 12;

  const interestSet = new Set(prefs.interests.map(normTag));
  const excludedSet = new Set(prefs.excluded.map(normTag));

  const scored: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    // already ours — candidate ids are "<provider>:<uuid>", library ids raw
    if (libraryIds.has(candidate.id) || libraryIds.has(candidate.id.split(":").pop() ?? "")) continue;
    if (dismissed.has(candidate.id)) continue; // user said no
    if (candidate.tags.some((t) => excludedSet.has(normTag(t)))) continue; // hidden genre

    const reasons: RecReason[] = [];
    let score = 0;

    if (prefs.enabled) {
      // 1 — explicit interests dominate (+3 each)
      for (const tag of candidate.tags) {
        if (interestSet.has(normTag(tag))) {
          score += 3;
          reasons.push({ key: "rec.reasonInterest", params: { tag } });
        }
      }

      // 2 — observed reading affinity (+2 × weight), strongest tag first
      const affined = candidate.tags
        .filter((t) => (signals.tagWeights[normTag(t)] ?? 0) > 0)
        .sort(
          (a, b) =>
            (signals.tagWeights[normTag(b)] ?? 0) - (signals.tagWeights[normTag(a)] ?? 0) ||
            a.localeCompare(b)
        );
      for (const tag of affined.slice(0, 2)) {
        const w = signals.tagWeights[normTag(tag)] ?? 0;
        score += 2 * w;
        reasons.push({ key: "rec.reasonTags", params: { tag } });
      }

      // 3 — favorite overlap (+1.5)
      for (const tag of candidate.tags) {
        if ((signals.favoriteTags[normTag(tag)] ?? 0) > 0) {
          score += 1.5;
          reasons.push({ key: "rec.reasonFavorite", params: { tag } });
          break;
        }
      }

      // 4 — type affinity (+0.5 when the type is a clear majority);
      //     only surfaced as a reason when no tag explained the pick
      const tw = signals.typeWeights[candidate.type] ?? 0;
      if (tw >= 0.5) score += 0.5 * tw;
      if (reasons.length === 0 && tw >= 0.5) {
        reasons.push({ key: "rec.reasonType", params: { type: candidate.type } });
      }
    }

    if (reasons.length === 0) reasons.push({ key: "rec.reasonPopular" });
    scored.push({ candidate, score, reasons: reasons.slice(0, 2) });
  }

  scored.sort((a, b) => {
    if (prefs.enabled && a.score !== b.score) return b.score - a.score;
    if (a.candidate.order !== b.candidate.order) return a.candidate.order - b.candidate.order;
    return a.candidate.id.localeCompare(b.candidate.id);
  });

  return scored.slice(0, limit);
}

function normTag(t: string): string {
  return t.trim().toLowerCase();
}

/* ---------------- provider feed mapping ---------------- */

/**
 * Map the strongest signal tags (names) onto provider tag uuids for a
 * server-side filtered popularity query. Tags the provider does not know
 * are skipped; when nothing maps, the caller should use the plain feed.
 */
export function buildProviderTagFilter(
  signals: RecSignals,
  prefs: RecPrefs,
  nameToUuid: Map<string, string>,
  maxTags = 4
): string[] {
  if (!prefs.enabled) return [];
  const merged = new Map<string, number>();
  for (const tag of prefs.interests.map(normTag)) merged.set(tag, 10); // explicit interests outrank observed
  for (const [tag, w] of Object.entries(signals.tagWeights)) {
    const cur = merged.get(tag) ?? 0;
    if (w > cur) merged.set(tag, w);
  }
  return [...merged.entries()]
    .filter(([tag, w]) => w > 0 && nameToUuid.has(tag))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTags)
    .map(([tag]) => nameToUuid.get(tag) as string);
}

/** true when the user has nothing to personalize from yet (plan §9 new-user) */
export function isNewUser(signals: RecSignals, prefs: RecPrefs): boolean {
  return prefs.enabled && !signals.hasActivity && prefs.interests.length === 0;
}
