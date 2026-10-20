/* ============================================================
   oniLibrary — source/search contract helpers ([SRC] plan §5/§7)

   Pure, DOM-free primitives behind the Phase 2 gate of
   docs/DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md:

     • one source failing must not erase other results
     • clearing a query cannot resurrect old results
       (stale responses are dropped by the run guard)
     • duplicate pages do not duplicate results
     • repeated add-to-library is idempotent

   Everything here is deterministic and unit-tested in
   tests/search-contract.test.ts.
   ============================================================ */

/* ---------------- latest-wins run guard ---------------- */

/**
 * Monotonic run identities for async UI loaders.
 *
 * `start()` begins a new run and invalidates every previous one;
 * `isCurrent(id)` tells a pending callback whether it may still
 * commit state. Screens combine this with their own `alive`
 * (unmount) flag — the guard covers *stale requests*, alive covers
 * *unmounted components*.
 */
export interface RunGuard {
  start(): number;
  isCurrent(id: number): boolean;
  current(): number;
}

export function makeRunGuard(): RunGuard {
  let last = 0;
  return {
    start() {
      return ++last;
    },
    isCurrent(id: number) {
      return id === last;
    },
    current() {
      return last;
    },
  };
}

/* ---------------- pagination dedup ---------------- */

/**
 * Keep the first occurrence of every `key(item)` — order-preserving.
 * For "load more" pagination, pass the *combined* list
 * (`[...previous, ...newPage]`); items already shown on earlier pages
 * are dropped, so shifting provider feeds cannot produce repeats.
 */
export function dedupeBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (k === "") continue; // never keep unidentifiable rows
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/* ---------------- per-source result aggregation ---------------- */

/**
 * Normalized per-source outcome so a failing source becomes visible
 * instead of looking like "no matches" (plan §7: compact, accessible
 * indication of failed sources + retry).
 */
export type SourceOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "failed"; error: string }
  | { status: "unsupported" };

export interface SourceReport<T> {
  /** stable source identity (plan §5: sourceId + remoteId scoping) */
  id: string;
  label: string;
  outcome: SourceOutcome<T>;
}

export interface AggregatedSources<T> {
  /** successful sources in report order — failures never erase these */
  hits: Array<{ id: string; label: string; data: T }>;
  /** sources that ran but failed, with their typed/human reason */
  failed: Array<{ id: string; label: string; error: string }>;
  /** sources present but not supporting the operation (e.g. no search) */
  unsupported: Array<{ id: string; label: string }>;
}

export function aggregateSources<T>(reports: ReadonlyArray<SourceReport<T[]>>): AggregatedSources<T[]> {
  const hits: AggregatedSources<T[]>["hits"] = [];
  const failed: AggregatedSources<T[]>["failed"] = [];
  const unsupported: AggregatedSources<T[]>["unsupported"] = [];
  for (const r of reports) {
    if (r.outcome.status === "ok") {
      if (r.outcome.data.length > 0) hits.push({ id: r.id, label: r.label, data: r.outcome.data });
    } else if (r.outcome.status === "failed") {
      failed.push({ id: r.id, label: r.label, error: r.outcome.error });
    } else {
      unsupported.push({ id: r.id, label: r.label });
    }
  }
  return { hits, failed, unsupported };
}

/* ---------------- idempotent add-to-library ---------------- */

/**
 * Plan §8: "Repeated adds should be idempotent." Returns the existing
 * local work for a source reference, if any, so callers can reuse it
 * instead of minting a duplicate.
 */
export function resolveAddTarget<W extends { sourceRef?: { sourceId: string; itemId: string } | null }>(
  works: readonly W[],
  ref: { sourceId: string; itemId: string }
): W | null {
  return works.find((w) => w.sourceRef?.sourceId === ref.sourceId && w.sourceRef?.itemId === ref.itemId) ?? null;
}
