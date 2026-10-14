"use client";

import { useEffect, useMemo } from "react";
import { useApp, useNav, workProgress, currentChapter } from "@/lib/store";

/**
 * Global client engine:
 *  - ticks the download simulation
 *  - logs reading time while a reader overlay is open
 *  - auto-locks the Vault when the document is hidden
 */
export function useClientEngine(readerOpen: boolean) {
  const tickDownloads = useApp((s) => s.tickDownloads);
  const logReading = useApp((s) => s.logReading);
  const vaultAutoLock = useApp((s) => s.settings.vaultAutoLock);
  const vaultUnlocked = useApp((s) => s.vaultUnlocked);
  const setVaultUnlocked = useApp((s) => s.setVaultUnlocked);
  const stack = useNav((s) => s.stack);

  // download tick
  useEffect(() => {
    const id = setInterval(() => tickDownloads(), 1000);
    return () => clearInterval(id);
  }, [tickDownloads]);

  // reading time tracking (rough: 1 min per 20s of reader being open)
  useEffect(() => {
    if (!readerOpen) return;
    const id = setInterval(() => logReading("current", 1, 0), 20_000);
    return () => clearInterval(id);
  }, [readerOpen, logReading]);

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
