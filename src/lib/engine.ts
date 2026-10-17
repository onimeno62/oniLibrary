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
  const autoUpdateCheck = useApp((s) => s.settings.autoUpdateCheck);
  const updateChecking = useApp((s) => s.updateCheck.checking);

  // download tick
  useEffect(() => {
    const id = setInterval(() => tickDownloads(), 1000);
    return () => clearInterval(id);
  }, [tickDownloads]);

  // auto library update check (UPD-002/004) — every 15 min while app is open
  useEffect(() => {
    if (!autoUpdateCheck || updateChecking) return;
    const id = window.setInterval(() => {
      const st = useApp.getState();
      if (!st.settings.autoUpdateCheck || st.updateCheck.checking) return;
      const last = st.updateCheck.lastCheck ? new Date(st.updateCheck.lastCheck).getTime() : 0;
      if (Date.now() - last >= 15 * 60_000) void st.runUpdateCheck();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [autoUpdateCheck, updateChecking]);

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
