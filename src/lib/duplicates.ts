"use client";

/* ============================================================
   oniLibrary — duplicate detection (PRD LIB-009)
   Groups works that share a normalized title (or whose title
   matches another work's alt-title — e.g. imported files with
   localized titles). Pure functions over the works list.
   ============================================================ */

import type { Work } from "./types";

/** normalize a title for comparison: lowercase, strip punctuation/spaces */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // latin diacritics
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

/**
 * Find duplicate groups. A group is every work connected by an
 * identical normalized title or title↔alt-title match. Groups of
 * one are dropped. Order: biggest group first.
 */
export function findDuplicateGroups(works: Work[]): Work[][] {
  const n = works.length;
  if (n < 2) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  // every comparable string per work: title + altTitle
  const keys: string[][] = works.map((w) =>
    [norm(w.title), ...(w.altTitle ? [norm(w.altTitle)] : [])].filter(Boolean)
  );

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (keys[i].some((k) => k && keys[j].includes(k))) union(i, j);
    }
  }

  const groups = new Map<number, Work[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = groups.get(r) ?? [];
    arr.push(works[i]);
    groups.set(r, arr);
  }

  return [...groups.values()]
    .filter((g) => g.length > 1)
    .sort((a, b) => b.length - a.length);
}

/** total number of works that live in a duplicate group (for badges) */
export function duplicateWorkCount(works: Work[]): number {
  return findDuplicateGroups(works).reduce((acc, g) => acc + g.length, 0);
}
