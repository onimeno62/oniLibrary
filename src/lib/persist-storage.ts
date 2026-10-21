import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Trailing-throttle PersistStorage for the zustand persist middleware.
 *
 * Measured baseline (desktop Chrome, 1000-work library ≈ 3.1 MB payload):
 * every store change triggered a synchronous JSON.stringify (~50-95 ms) plus
 * a synchronous localStorage.setItem (~25-30 ms) on the main thread — over
 * 100 ms of jank per reader page flip with a large library. The default
 * seed store hides this (~1-3 ms), which is why it only shows up at scale.
 *
 * This wrapper accepts the already-built state object from zustand (cheap
 * reference copy), defers serialization + disk write to a trailing timer,
 * and flushes on: pagehide / visibilitychange(hidden) / beforeunload, and
 * manually via flushPersistNow() (reader unmount, import/backup paths).
 * The latest value always wins, so the final state is never lost — only
 * intermediate churn is coalesced. Outside the browser (tests/SSR) writes
 * go through immediately, keeping bun tests deterministic.
 */

const FLUSH_DELAY_MS = 800;

let pendingValue: StorageValue<unknown> | null = null;
let pendingKey: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lifecycleBound = false;

export function flushPersistNow(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (pendingKey === null || pendingValue === null) return;
  const key = pendingKey;
  const value = pendingValue;
  pendingKey = null;
  pendingValue = null;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded / private mode — next change retries */
  }
}

function bindLifecycle(): void {
  if (lifecycleBound || typeof window === "undefined") return;
  lifecycleBound = true;
  const onHide = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") flushPersistNow();
  };
  window.addEventListener("pagehide", flushPersistNow);
  window.addEventListener("beforeunload", flushPersistNow);
  document.addEventListener("visibilitychange", onHide);
}

export function createThrottledPersistStorage<S>(): PersistStorage<S> {
  bindLifecycle();
  return {
    getItem: (name) => {
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
      } catch {
        /* corrupted payload or blocked storage — hydrate from defaults */
        return null;
      }
    },
    setItem: (name, value) => {
      // browser-less environment (bun tests / SSR): write through immediately
      if (typeof window === "undefined" || typeof document === "undefined") {
        try {
          localStorage.setItem(name, JSON.stringify(value));
        } catch {
          /* ignore */
        }
        return;
      }
      pendingKey = name;
      pendingValue = value as StorageValue<unknown>;
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          flushPersistNow();
        }, FLUSH_DELAY_MS);
      }
    },
    removeItem: (name) => {
      try {
        localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
