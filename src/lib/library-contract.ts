import type { Work, Chapter } from "./types";

/**
 * Pure contracts for the Home "Latest Updates" feed, the Library tag filter
 * and the Library category filter. Unit-tested without a DOM — the screens
 * compose these; the store never mutates through them.
 */

export interface WorkUpdate {
  work: Work;
  chapter: Chapter;
}

/**
 * The work's newest UNREAD chapter — what "Latest Updates" means in this
 * app: a release the user has not caught up to yet. Deterministic order:
 * later releaseDate wins, ties broken by higher chapter number. Chapters
 * with invalid/missing releaseDate sort as epoch 0. Returns null when every
 * chapter is read (or the work has no chapters) → the work is not an update.
 */
export function latestChapterUpdate(w: Work): Chapter | null {
  let best: Chapter | null = null;
  let bestTime = 0;
  let bestNumber = -Infinity;
  for (const c of w.chapters) {
    if (c.isRead) continue;
    const parsed = Date.parse(c.releaseDate);
    const time = Number.isFinite(parsed) ? parsed : 0;
    if (best === null || time > bestTime || (time === bestTime && c.number > bestNumber)) {
      best = c;
      bestTime = time;
      bestNumber = c.number;
    }
  }
  return best;
}

/**
 * Latest-updates feed across the library: one entry per work that still has
 * an unread release, newest release first. Empty array = the Home section is
 * hidden entirely (never rendered as a fake-empty shell). All-read works are
 * excluded — read chapters are history, not updates.
 */
export function latestUpdatesFeed(works: Work[], limit = 8): WorkUpdate[] {
  const out: WorkUpdate[] = [];
  for (const w of works) {
    const chapter = latestChapterUpdate(w);
    if (chapter) out.push({ work: w, chapter });
  }
  return out
    .sort((a, b) => {
      const ta = Date.parse(a.chapter.releaseDate);
      const tb = Date.parse(b.chapter.releaseDate);
      // invalid dates sink to the end but stay visible (honest, not hidden)
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    })
    .slice(0, Math.max(0, limit));
}

export interface TagStat {
  tag: string;
  count: number;
}

/** Real tag vocabulary derived from the given works, most-used first. */
export function collectTags(works: Work[]): TagStat[] {
  const counts = new Map<string, number>();
  for (const w of works) {
    for (const raw of w.tags ?? []) {
      const tag = raw.trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Tag filtering. OR semantics by default ("any"): a work matches when it
 * carries at least one selected tag — the documented product choice for
 * oniLibrary, consistent with how multiple category chips behaved. mode
 * "all" requires every selected tag. An empty selection is a no-op (and
 * returns the SAME array reference so callers' memo deps stay honest).
 */
export function filterByTags(works: Work[], selected: string[], mode: "any" | "all" = "any"): Work[] {
  if (selected.length === 0) return works;
  const want = new Set(selected.map((t) => t.trim()).filter(Boolean));
  if (want.size === 0) return works;
  return works.filter((w) => {
    const have = new Set((w.tags ?? []).map((t) => t.trim()).filter(Boolean));
    if (mode === "all") {
      for (const t of want) if (!have.has(t)) return false;
      return true;
    }
    for (const t of want) if (have.has(t)) return true;
    return false;
  });
}

/** Manual-category filtering through the workCategories join. Null = no-op. */
export function filterByCategory(
  works: Work[],
  workCategories: Record<string, string[]>,
  categoryId: string | null
): Work[] {
  if (!categoryId) return works;
  return works.filter((w) => (workCategories[w.id] ?? []).includes(categoryId));
}
