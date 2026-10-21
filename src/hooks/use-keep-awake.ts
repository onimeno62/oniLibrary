"use client";

import { useEffect, useRef } from "react";

/* ============================================================
   useKeepAwake — Screen Wake Lock lifecycle for the reader.

   Audit D7: the old code only requested the lock inside the
   settings toggle, so (a) a reader opened with keep-awake already
   enabled held no lock, and (b) the acquired lock was never
   released on reader exit, keeping the screen awake on other
   screens. This hook owns the whole lifecycle:

   - requests when `enabled` becomes true (incl. on mount)
   - releases when `enabled` becomes false or on unmount
   - re-acquires after the OS auto-releases on tab-hide
     (visibilitychange → visible)
   - swallows unsupported/failed requests silently (feature is
     best-effort by spec)
   ============================================================ */

type WakeSentinel = { release: () => Promise<void>; addEventListener?: (t: string, cb: () => void) => void };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: string) => Promise<WakeSentinel> };
};

export function useKeepAwake(enabled: boolean) {
  const sentinelRef = useRef<WakeSentinel | null>(null);

  useEffect(() => {
    const nav = navigator as NavigatorWithWakeLock;
    if (!nav.wakeLock) return;
    let cancelled = false;

    const release = () => {
      void sentinelRef.current?.release().catch(() => undefined);
      sentinelRef.current = null;
    };
    const acquire = () => {
      if (cancelled || !enabled || sentinelRef.current) return;
      nav
        .wakeLock!.request("screen")
        .then((s) => {
          if (cancelled) {
            void s.release().catch(() => undefined);
            return;
          }
          sentinelRef.current = s;
          // Chromium auto-releases on tab hide — surface it so the
          // ref matches reality (re-acquired via visibilitychange)
          s.addEventListener?.("release", () => {
            if (sentinelRef.current === s) sentinelRef.current = null;
          });
        })
        .catch(() => undefined);
    };

    if (enabled) acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
      else release();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [enabled]);
}
