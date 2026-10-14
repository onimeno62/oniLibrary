"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  DEFAULT_SETTINGS,
  SEED_WORKS,
  SEED_SOURCES,
  SEED_EXTENSIONS,
  SEED_CATEGORIES,
  SEED_WORK_CATEGORIES,
  SEED_SERVERS,
} from "./seed";
import type {
  Work,
  Chapter,
  DownloadItem,
  Notification,
  Category,
  ReadingSession,
  HistoryEntry,
  Bookmark,
  ServerEntry,
  Settings,
  ReadingStatus,
  SourceInfo,
  Extension,
} from "./types";

/* ============================================================
   Navigation store (transient — not persisted)
   ============================================================ */

export type Tab = "home" | "library" | "discover" | "updates" | "downloads" | "more";

export type Overlay =
  | { kind: "details"; workId: string }
  | { kind: "reader"; workId: string; chapterId: string }
  | { kind: "search" }
  | { kind: "source"; sourceId: string }
  | { kind: "vault" }
  | { kind: "extensions" }
  | { kind: "statistics" }
  | { kind: "settings" }
  | { kind: "categories" }
  | { kind: "backup" }
  | { kind: "servers" }
  | { kind: "formats" }
  | { kind: "notifications" };

interface NavState {
  tab: Tab;
  stack: Overlay[];
  setTab: (t: Tab) => void;
  push: (o: Overlay) => void;
  pop: () => void;
  popToTab: () => void;
  openWork: (workId: string) => void;
  openReader: (workId: string, chapterId: string) => void;
}

export const useNav = create<NavState>((set) => ({
  tab: "home",
  stack: [],
  setTab: (t) => set({ tab: t, stack: [] }),
  push: (o) => set((s) => ({ stack: [...s.stack, o] })),
  pop: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  popToTab: () => set({ stack: [] }),
  openWork: (workId) => set((s) => ({ stack: [...s.stack, { kind: "details", workId }] })),
  openReader: (workId, chapterId) =>
    set((s) => ({ stack: [...s.stack, { kind: "reader", workId, chapterId }] })),
}));

/* ============================================================
   App store (persisted)
   ============================================================ */

interface AppState {
  hydrated: boolean;
  onboarded: boolean;
  vaultUnlocked: boolean;
  works: Work[];
  categories: Category[];
  workCategories: Record<string, string[]>;
  downloads: DownloadItem[];
  notifications: Notification[];
  sources: SourceInfo[];
  extensions: Extension[];
  sessions: ReadingSession[];
  history: HistoryEntry[];
  bookmarks: Bookmark[];
  servers: ServerEntry[];
  settings: Settings;
  updateCheck: { lastCheck: string | null; checking: boolean };
  lastBackup: string | null;

  setHydrated: () => void;
  finishOnboarding: (partial?: Partial<Settings>) => void;
  setSettings: (p: Partial<Settings>) => void;
  setReaderDefaults: (p: Partial<Settings["readerDefaults"]>) => void;
  setVaultUnlocked: (v: boolean) => void;
  setVaultPin: (hash: string | null) => void;

  updateWork: (id: string, p: Partial<Work>) => void;
  toggleFavorite: (id: string) => void;
  setStatus: (id: string, s: ReadingStatus) => void;
  setVaultFlag: (id: string, v: boolean) => void;
  deleteWorks: (ids: string[]) => void;
  addWork: (w: Work) => void;
  addSampleWorkFromSource: (sourceId: string, title: string) => string;

  markChapterRead: (workId: string, chapterId: string, read: boolean, upTo?: boolean) => void;
  setChapterProgress: (workId: string, chapterId: string, page: number) => void;

  startDownload: (workId: string, chapterId: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  removeDownload: (id: string) => void;
  tickDownloads: () => void;

  pushNotification: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  createCategory: (name: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;
  assignCategories: (workId: string, catIds: string[]) => void;

  logReading: (workId: string, minutes: number, chapters: number) => void;
  pushHistory: (workId: string, chapterId: string, page: number) => void;
  clearHistory: () => void;

  addBookmark: (workId: string, chapterId: string, page: number, note?: string) => void;
  removeBookmark: (id: string) => void;

  addServer: (s: Omit<ServerEntry, "id" | "status">) => void;
  removeServer: (id: string) => void;
  setServerStatus: (id: string, status: ServerEntry["status"]) => void;

  setSourceEnabled: (id: string, v: boolean) => void;
  setSourcePinned: (id: string, v: boolean) => void;
  setExtensionStatus: (id: string, status: Extension["status"], enabled?: boolean) => void;

  runUpdateCheck: () => Promise<number>;
  setLastBackup: (iso: string) => void;
  importBackup: (data: unknown) => boolean;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function hashPin(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = (h * 31 + pin.charCodeAt(i)) | 0;
  }
  return "h" + Math.abs(h).toString(36);
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      onboarded: false,
      vaultUnlocked: false,
      works: SEED_WORKS,
      categories: SEED_CATEGORIES,
      workCategories: SEED_WORK_CATEGORIES,
      downloads: [] as DownloadItem[],
      notifications: [],
      sources: SEED_SOURCES,
      extensions: SEED_EXTENSIONS,
      sessions: [],
      history: [],
      bookmarks: [],
      servers: SEED_SERVERS,
      settings: DEFAULT_SETTINGS,
      updateCheck: { lastCheck: null, checking: false },
      lastBackup: null,

      // on init, populate dynamic seeds once
      setHydrated: () => {
        const s = get();
        if (s.downloads.length === 0 && s.sessions.length === 0 && s.notifications.length === 0) {
          import("./seed").then(({ seedDownloads, seedNotifications, seedSessions }) => {
            set((st) => {
              // re-apply downloads on chapters
              const works = st.works.map((w) => {
                const chapters = w.chapters.map((c) => ({ ...c }));
                return { ...w, chapters };
              });
              for (const d of seedDownloads()) {
                const w = works.find((x) => x.id === d.workId);
                const c = w?.chapters.find((x) => x.id === d.chapterId);
                if (c && d.status === "DONE") c.download = "DONE";
              }
              return {
                hydrated: true,
                downloads: seedDownloads(),
                notifications: seedNotifications(),
                sessions: seedSessions(),
                works,
              };
            });
          });
        } else {
          set({ hydrated: true });
        }
      },

      finishOnboarding: (partial) =>
        set((s) => ({
          onboarded: true,
          settings: { ...s.settings, ...(partial ?? {}) },
        })),

      setSettings: (p) => set((s) => ({ settings: { ...s.settings, ...p } })),
      setReaderDefaults: (p) =>
        set((s) => ({
          settings: { ...s.settings, readerDefaults: { ...s.settings.readerDefaults, ...p } },
        })),
      setVaultUnlocked: (v) => set({ vaultUnlocked: v }),
      setVaultPin: (hash) => set((s) => ({ settings: { ...s.settings, vaultPinHash: hash } })),

      updateWork: (id, p) =>
        set((s) => ({
          works: s.works.map((w) => (w.id === id ? { ...w, ...p } : w)),
        })),
      toggleFavorite: (id) =>
        set((s) => ({
          works: s.works.map((w) => (w.id === id ? { ...w, isFavorite: !w.isFavorite } : w)),
        })),
      setStatus: (id, st) =>
        set((s) => ({
          works: s.works.map((w) => (w.id === id ? { ...w, readingStatus: st } : w)),
        })),
      setVaultFlag: (id, v) =>
        set((s) => ({
          works: s.works.map((w) => (w.id === id ? { ...w, inVault: v } : w)),
        })),
      deleteWorks: (ids) =>
        set((s) => ({
          works: s.works.filter((w) => !ids.includes(w.id)),
          downloads: s.downloads.filter((d) => !ids.includes(d.workId)),
          workCategories: Object.fromEntries(
            Object.entries(s.workCategories).filter(([k]) => !ids.includes(k))
          ),
        })),
      addWork: (w) => set((s) => ({ works: [w, ...s.works] })),
      addSampleWorkFromSource: (sourceId, title) => {
        const id = "w-" + uid();
        const source = get().sources.find((x) => x.id === sourceId);
        const type =
          source?.kinds[0] === "Comics"
            ? "COMIC"
            : source?.kinds[0] === "Light Novels"
              ? "NOVEL"
              : source?.name === "Webtoon"
                ? "WEBTOON"
                : "MANGA";
        const work: Work = {
          id,
          title,
          author: "Unknown",
          cover: "",
          coverColor: "from-orange-500 to-rose-900",
          type,
          source: sourceId,
          description: `Added from ${source?.name ?? "source"} via Discover.`,
          workStatus: "ONGOING",
          readingStatus: "PLANNED",
          isFavorite: false,
          inVault: false,
          tags: ["Discovered"],
          rating: 8,
          ratingCount: 1200 + Math.floor(Math.random() * 40000),
          direction: type === "WEBTOON" ? "VERTICAL" : "RTL",
          readerMode: type === "WEBTOON" ? "WEBTOON" : "PAGED",
          fitMode: "WIDTH",
          chapters: makeDiscoverChapters(id, 24 + Math.floor(Math.random() * 160)),
          addedAt: new Date().toISOString(),
          language: source?.languages[0] ?? "EN",
        };
        get().addWork(work);
        return id;
      },

      markChapterRead: (workId, chapterId, read, upTo) =>
        set((s) => ({
          works: s.works.map((w) => {
            if (w.id !== workId) return w;
            const target = w.chapters.find((c) => c.id === chapterId);
            const chapters = w.chapters.map((c) => {
              if (c.id === chapterId) return { ...c, isRead: read, lastPage: read ? undefined : c.lastPage };
              if (upTo && target && c.number < target.number) return { ...c, isRead: read };
              return c;
            });
            return { ...w, chapters };
          }),
        })),
      setChapterProgress: (workId, chapterId, page) =>
        set((s) => ({
          works: s.works.map((w) => {
            if (w.id !== workId) return w;
            const chapters = w.chapters.map((c) =>
              c.id === chapterId ? { ...c, lastPage: page } : c
            );
            return { ...w, chapters, lastReadAt: new Date().toISOString() };
          }),
        })),

      startDownload: (workId, chapterId) => {
        const s = get();
        const w = s.works.find((x) => x.id === workId);
        const c = w?.chapters.find((x) => x.id === chapterId);
        if (!w || !c) return;
        if (s.downloads.some((d) => d.chapterId === chapterId && d.status !== "ERROR")) return;
        const activeCount = s.downloads.filter((d) => d.status === "ACTIVE").length;
        const item: DownloadItem = {
          id: "dl-" + uid(),
          workId,
          chapterId,
          status: activeCount < s.settings.maxConcurrent ? "ACTIVE" : "QUEUED",
          progress: 0,
          downloadedMb: 0,
          totalMb: c.sizeMb,
          speedMbps: 1.5 + Math.random() * 2,
          startedAt: new Date().toISOString(),
        };
        set((st) => ({
          downloads: [item, ...st.downloads],
          works: st.works.map((x) =>
            x.id === workId
              ? {
                  ...x,
                  chapters: x.chapters.map((ch) =>
                    ch.id === chapterId ? { ...ch, download: "DOWNLOADING" as const } : ch
                  ),
                }
              : x
          ),
        }));
      },
      pauseDownload: (id) =>
        set((s) => ({
          downloads: s.downloads.map((d) => (d.id === id ? { ...d, status: "PAUSED", speedMbps: 0 } : d)),
          works: setChDl(s.works, s.downloads, id, "PAUSED"),
        })),
      resumeDownload: (id) =>
        set((s) => {
          const activeCount = s.downloads.filter((d) => d.status === "ACTIVE").length;
          const st = activeCount < s.settings.maxConcurrent ? "ACTIVE" : "QUEUED";
          return {
            downloads: s.downloads.map((d) =>
              d.id === id
                ? { ...d, status: st, speedMbps: 1.5 + Math.random() * 2, error: undefined }
                : d
            ),
            works: setChDl(s.works, s.downloads, id, "DOWNLOADING"),
          };
        }),
      cancelDownload: (id) =>
        set((s) => ({
          downloads: s.downloads.filter((d) => d.id !== id),
          works: setChDl(s.works, s.downloads, id, "NONE"),
        })),
      retryDownload: (id) =>
        set((s) => ({
          downloads: s.downloads.map((d) =>
            d.id === id
              ? { ...d, status: "ACTIVE", progress: 0, downloadedMb: 0, speedMbps: 2, error: undefined }
              : d
          ),
          works: setChDl(s.works, s.downloads, id, "DOWNLOADING"),
        })),
      removeDownload: (id) =>
        set((s) => ({
          downloads: s.downloads.filter((d) => d.id !== id),
          works: setChDl(s.works, s.downloads, id, "NONE"),
        })),
      tickDownloads: () => {
        const s = get();
        if (s.settings.offlineMode && s.settings.wifiOnly) return; // stalled
        let changed = false;
        const newEvents: { n: Omit<Notification, "id" | "createdAt" | "read">; d: DownloadItem }[] = [];
        let downloads = s.downloads.map((d) => {
          if (d.status !== "ACTIVE") return d;
          changed = true;
          const step = d.speedMbps / 6; // MB per tick (sim)
          let downloadedMb = d.downloadedMb + step;
          let progress = Math.min(100, (downloadedMb / d.totalMb) * 100);
          let status: DownloadItem["status"] = d.status;
          if (progress >= 100) {
            progress = 100;
            downloadedMb = d.totalMb;
            status = "DONE";
          }
          const nd = { ...d, downloadedMb, progress, status };
          if (status === "DONE") {
            newEvents.push({ d: nd, n: {
              type: "DOWNLOAD" as const,
              workId: d.workId,
              chapterLabel: chapterLabelOf(s.works, d),
              title: workTitleOf(s.works, d.workId),
              body: `Download completed · ${d.totalMb.toFixed(1)} MB`,
            } });
          }
          return nd;
        });
        if (!changed) return;

        // promote queued items when capacity frees
        const activeNow = downloads.filter((d) => d.status === "ACTIVE").length;
        if (activeNow < s.settings.maxConcurrent) {
          let slots = s.settings.maxConcurrent - activeNow;
          downloads = downloads.map((d) => {
            if (d.status === "QUEUED" && slots > 0) {
              slots--;
              return { ...d, status: "ACTIVE" as const, speedMbps: 1.5 + Math.random() * 2 };
            }
            return d;
          });
        }

        const works = s.works.map((w) => {
          const dl = downloads.find((d) => d.workId === w.id);
          if (!dl) return w;
          const chapterAffected = downloads.some((d) => d.workId === w.id);
          if (!chapterAffected) return w;
          return {
            ...w,
            chapters: w.chapters.map((c) => {
              const d = downloads.find((x) => x.chapterId === c.id);
              if (!d) return c;
              const mapped =
                d.status === "ACTIVE"
                  ? "DOWNLOADING"
                  : d.status === "PAUSED"
                    ? "PAUSED"
                    : d.status === "DONE"
                      ? "DONE"
                      : d.status === "ERROR"
                        ? "ERROR"
                        : "QUEUED";
              return { ...c, download: mapped as Chapter["download"] };
            }),
          };
        });

        set((st) => {
          const notifications = [...newEvents.map((e) => ({ ...e.n, id: uid(), createdAt: new Date().toISOString(), read: false })), ...st.notifications];
          return { downloads, works, notifications };
        });
      },

      pushNotification: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: uid(), createdAt: new Date().toISOString(), read: false },
            ...s.notifications,
          ],
        })),
      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        })),
      markAllNotificationsRead: () =>
        set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      clearNotifications: () => set({ notifications: [] }),

      createCategory: (name) =>
        set((s) => ({ categories: [...s.categories, { id: "cat-" + uid(), name }] })),
      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        })),
      deleteCategory: (id) =>
        set((s) => ({
          categories: s.categories.filter((c) => c.id !== id),
          workCategories: Object.fromEntries(
            Object.entries(s.workCategories).filter(([, v]) => !v.includes(id))
          ),
        })),
      assignCategories: (workId, catIds) =>
        set((s) => ({ workCategories: { ...s.workCategories, [workId]: catIds } })),

      logReading: (workId, minutes, chapters) =>
        set((s) => {
          const today = new Date().toISOString().slice(0, 10);
          const sessions = [...s.sessions];
          const idx = sessions.findIndex((x) => x.date === today);
          if (idx >= 0) {
            sessions[idx] = {
              ...sessions[idx],
              minutes: sessions[idx].minutes + minutes,
              chapters: sessions[idx].chapters + chapters,
            };
          } else {
            sessions.push({ date: today, minutes, chapters });
          }
          if (sessions.length > 60) sessions.splice(0, sessions.length - 60);
          return { sessions };
        }),
      pushHistory: (workId, chapterId, page) =>
        set((s) => ({
          history: [
            { id: uid(), workId, chapterId, page, at: new Date().toISOString() },
            ...s.history.filter((h) => !(h.workId === workId && h.chapterId === chapterId)),
          ].slice(0, 100),
        })),
      clearHistory: () => set({ history: [] }),

      addBookmark: (workId, chapterId, page, note) =>
        set((s) => ({
          bookmarks: [
            { id: uid(), workId, chapterId, page, note, createdAt: new Date().toISOString() },
            ...s.bookmarks,
          ],
        })),
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

      addServer: (srv) =>
        set((s) => ({ servers: [...s.servers, { ...srv, id: uid(), status: "UNKNOWN" }] })),
      removeServer: (id) => set((s) => ({ servers: s.servers.filter((x) => x.id !== id) })),
      setServerStatus: (id, status) =>
        set((s) => ({ servers: s.servers.map((x) => (x.id === id ? { ...x, status } : x)) })),

      setSourceEnabled: (id, v) =>
        set((s) => ({
          sources: s.sources.map((x) => (x.id === id ? { ...x, enabled: v } : x)),
        })),
      setSourcePinned: (id, v) =>
        set((s) => ({
          sources: s.sources.map((x) => (x.id === id ? { ...x, pinned: v } : x)),
        })),
      setExtensionStatus: (id, status, enabled) =>
        set((s) => ({
          extensions: s.extensions.map((x) =>
            x.id === id ? { ...x, status, enabled: enabled ?? x.enabled } : x
          ),
        })),

      runUpdateCheck: async () => {
        const s = get();
        set({ updateCheck: { ...s.updateCheck, checking: true } });
        await new Promise((r) => setTimeout(r, 1600));
        // find unread latest chapters released within last 12h
        const fresh: Omit<Notification, "id" | "createdAt" | "read">[] = [];
        for (const w of s.works) {
          if (w.inVault) continue;
          const latest = w.chapters[0];
          if (!latest || latest.isRead) continue;
          const hours =
            (Date.now() - new Date(latest.releaseDate).getTime()) / 3_600_000;
          if (hours <= 10) {
            const dup = s.notifications.some(
              (n) => n.type === "CHAPTER" && n.workId === w.id && n.chapterLabel === `Ch. ${latest.number}`
            );
            if (!dup) {
              fresh.push({
                type: "CHAPTER",
                workId: w.id,
                chapterLabel: `Ch. ${latest.number}`,
                title: w.title,
                body: "New chapter available",
              });
            }
          }
        }
        set((st) => ({
          updateCheck: { lastCheck: new Date().toISOString(), checking: false },
          notifications: [
            ...fresh.map((n) => ({ ...n, id: uid(), createdAt: new Date().toISOString(), read: false })),
            ...st.notifications,
          ],
        }));
        return fresh.length;
      },

      setLastBackup: (iso) => set({ lastBackup: iso }),

      importBackup: (data) => {
        try {
          const d = data as Partial<AppState> & { app?: string };
          if (!d || d.app !== "oniLibrary") return false;
          set((s) => ({
            works: (d.works as Work[]) ?? s.works,
            categories: (d.categories as Category[]) ?? s.categories,
            workCategories: d.workCategories ?? s.workCategories,
            settings: { ...s.settings, ...(d.settings as Settings) },
            sessions: (d.sessions as ReadingSession[]) ?? s.sessions,
            bookmarks: (d.bookmarks as Bookmark[]) ?? s.bookmarks,
            lastBackup: s.lastBackup,
          }));
          return true;
        } catch {
          return false;
        }
      },
    }),
    {
      name: "onilibrary-store-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        onboarded: s.onboarded,
        works: s.works,
        categories: s.categories,
        workCategories: s.workCategories,
        downloads: s.downloads,
        notifications: s.notifications,
        sources: s.sources,
        extensions: s.extensions,
        sessions: s.sessions,
        history: s.history,
        bookmarks: s.bookmarks,
        servers: s.servers,
        settings: s.settings,
        updateCheck: { lastCheck: s.updateCheck.lastCheck, checking: false },
        lastBackup: s.lastBackup,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    }
  )
);

/* ---------- helpers ---------- */

function setChDl(
  works: Work[],
  downloads: DownloadItem[],
  downloadId: string,
  state: Chapter["download"]
): Work[] {
  const d = downloads.find((x) => x.id === downloadId);
  if (!d) return works;
  return works.map((w) =>
    w.id === d.workId
      ? {
          ...w,
          chapters: w.chapters.map((c) => (c.id === d.chapterId ? { ...c, download: state } : c)),
        }
      : w
  );
}

function workTitleOf(works: Work[], workId: string): string {
  return works.find((w) => w.id === workId)?.title ?? "Work";
}
function chapterLabelOf(works: Work[], d: DownloadItem): string {
  const w = works.find((x) => x.id === d.workId);
  const c = w?.chapters.find((x) => x.id === d.chapterId);
  return c ? `Ch. ${c.number}` : "";
}

function makeDiscoverChapters(workId: string, count: number): Chapter[] {
  const chapters: Chapter[] = [];
  for (let i = 0; i < 12; i++) {
    const number = count - i;
    chapters.push({
      id: `${workId}-c${number}`,
      number,
      title: `Chapter ${number}`,
      pages: 16,
      releaseDate: new Date(Date.now() - i * 86_400_000 * 3).toISOString(),
      isRead: false,
      download: "NONE",
      sizeMb: 10 + (i % 5),
    });
  }
  return chapters;
}

/* ---------- selectors / utils ---------- */

export function workProgress(w: Work): number {
  if (w.chapters.length === 0) return 0;
  const read = w.chapters.filter((c) => c.isRead).length;
  const current = w.chapters.find((c) => !c.isRead && c.lastPage);
  const frac = current ? (current.lastPage ?? 0) : 0;
  return Math.min(100, Math.round(((read + frac) / w.chapters.length) * 100));
}

export function currentChapter(w: Work): Chapter | undefined {
  const asc = [...w.chapters].sort((a, b) => a.number - b.number);
  return asc.find((c) => !c.isRead) ?? w.chapters[0];
}

export function continueReading(w: Work): { chapter: Chapter; page: number } | null {
  const asc = [...w.chapters].sort((a, b) => a.number - b.number);
  const next = asc.find((c) => !c.isRead);
  if (next && typeof next.lastPage === "number") {
    return { chapter: next, page: Math.round((next.pages ?? 20) * next.lastPage) };
  }
  if (next) return { chapter: next, page: 0 };
  const last = asc[asc.length - 1];
  return last ? { chapter: last, page: 0 } : null;
}

export function timeAgo(dateStr: string, lang: "en" | "fa"): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.max(1, Math.round(diff / 60_000));
  if (lang === "fa") {
    if (m < 1) return "همین حالا";
    if (m < 60) return `${toFa(m)} دقیقه پیش`;
    const h = Math.round(m / 60);
    if (h < 24) return `${toFa(h)} ساعت پیش`;
    const d = Math.round(h / 24);
    return `${toFa(d)} روز پیش`;
  }
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function toFa(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function fmtNum(n: number, lang: "en" | "fa"): string {
  if (lang === "fa") return toFa(n.toLocaleString("en-US"));
  return n.toLocaleString("en-US");
}

export function fmtSize(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}
