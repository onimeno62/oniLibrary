"use client";

import { useEffect, useMemo } from "react";
import { useApp, useNav, workProgress, currentChapter } from "@/lib/store";

/**
 * Global client engine:
 *  - ticks the download simulation
 *  - auto-locks the Vault when the document is hidden
 *  (reading time is logged by the reader's own 60s interval, which also
 *   respects the focus-timer pause — a second rough logger here would
 *   double-count minutes and skew the daily goal)
 */
export function useClientEngine(readerOpen: boolean) {
  const tickDownloads = useApp((s) => s.tickDownloads);
  const vaultAutoLock = useApp((s) => s.settings.vaultAutoLock);
  const vaultUnlocked = useApp((s) => s.vaultUnlocked);
  const setVaultUnlocked = useApp((s) => s.setVaultUnlocked);
  const stack = useNav((s) => s.stack);

  // download tick
  useEffect(() => {
    const id = setInterval(() => tickDownloads(), 1000);
    return () => clearInterval(id);
  }, [tickDownloads]);

  // vault auto lock on background
  useEffect(() => {
    const fn = () => {
      if (document.visibilityState === "hidden" && vaultAutoLock && vaultUnlocked) {
        setVaultUnlocked(false);
      }
    };
    document.addEventListener("visibilitychange", fn);
    return () => document.removeEventListener("visibilitychange", fn);
  }, [vaultAutoLock, vaultUnlocked, setVaultUnlocked]);

  // chapter completion tracking when reader closes handled in reader itself
  return { stackDepth: stack.length };
}

/** weekly stats computed for Home */
export function useWeeklyStats() {
  const sessions = useApp((s) => s.sessions);
  const works = useApp((s) => s.works);
  return useMemo(() => {
    const now = Date.now();
    const week = sessions.filter(
      (x) => now - new Date(x.date + "T12:00:00").getTime() <= 7 * 86_400_000
    );
    const minutes = week.reduce((a, b) => a + b.minutes, 0);
    const chapters = week.reduce((a, b) => a + b.chapters, 0);
    const finished = works.filter((w) => w.readingStatus === "COMPLETED" && !w.inVault).length;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { minutes, chapters, finished, label: `${h}h ${m}m` };
  }, [sessions, works]);
}

export { workProgress, currentChapter };
