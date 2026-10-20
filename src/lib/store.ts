"use client";

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { legacyPinHash } from "./vault-crypto";
import { translate } from "./i18n";
import {
  DEFAULT_SETTINGS,
  SEED_WORKS,
  SEED_SOURCES,
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
  Highlight,
  ServerEntry,
  Settings,
  ReadingStatus,
  SourceInfo,
  Extension,
  SavedFilter,
  LibraryFilterSnapshot,
  SmartRule,
  MdFeedFilters,
} from "./types";

/* ============================================================
   Navigation store (transient — not persisted)
   ============================================================ */

export type Tab = "home" | "library" | "discover" | "updates" | "downloads" | "more";

export type Overlay =
  | { kind: "details"; workId: string }
  | { kind: "reader"; workId: string; chapterId: string; page?: number; highlightId?: string }
  | { kind: "highlights"; workId?: string }
  | { kind: "search" }
  | { kind: "catalog"; serverId: string }
  | { kind: "source"; sourceId: string; focusMangaId?: string; filters?: MdFeedFilters }
  | { kind: "vault" }
  | { kind: "extensions" }
  | { kind: "statistics" }
  | { kind: "history" }
  | { kind: "settings" }
  | { kind: "categories" }
  | { kind: "backup" }
  | { kind: "servers" }
  | { kind: "formats" }
  | { kind: "notifications" }
  | { kind: "duplicates" };

interface NavState {
  tab: Tab;
  stack: Overlay[];
  setTab: (t: Tab) => void;
  push: (o: Overlay) => void;
  pop: () => void;
  popToTab: () => void;
  openWork: (workId: string) => void;
  openReader: (workId: string, chapterId: string, page?: number) => void;
}

export const useNav = create<NavState>((set) => ({
  tab: "home",
  stack: [],
  setTab: (t) => set({ tab: t, stack: [] }),
  push: (o) => set((s) => ({ stack: [...s.stack, o] })),
  pop: () => set((s) => ({ stack: s.stack.slice(0, -1) })),
  popToTab: () => set({ stack: [] }),
  openWork: (workId) => set((s) => ({ stack: [...s.stack, { kind: "details", workId }] })),
  openReader: (workId, chapterId, page) =>
    set((s) => ({ stack: [...s.stack, { kind: "reader", workId, chapterId, page }] })),
}));

/* dev-only QA hook: lets browser probes read the overlay stack */
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __oninav?: unknown }).__oninav = useNav;
}

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
  highlights: Highlight[];
  servers: ServerEntry[];
  savedFilters: SavedFilter[];
  settings: Settings;
  updateCheck: { lastCheck: string | null; checking: boolean };
  lastBackup: string | null;
  /** disabled built-in source ids (v1.3.0) — e.g. "builtin-mangadex" [SRC-004] */
  builtinDisabled: string[];

  setHydrated: () => void;
  finishOnboarding: (partial?: Partial<Settings>) => void;
  setSettings: (p: Partial<Settings>) => void;
  setReaderDefaults: (p: Partial<Settings["readerDefaults"]>) => void;
  setVaultUnlocked: (v: boolean) => void;
  setVaultPin: (hash: string | null) => void;

  updateWork: (id: string, p: Partial<Work>) => void;
  /** imported files appended as chapters to an existing work (v1.2.0) */
  appendChapters: (workId: string, chapters: Chapter[]) => void;
  setTracker: (p: Partial<Settings["tracker"]>) => void;
  toggleFavorite: (id: string) => void;
  setStatus: (id: string, s: ReadingStatus) => void;
  setVaultFlag: (id: string, v: boolean) => void;
  deleteWorks: (ids: string[]) => void;
  addWork: (w: Work) => void;

  /* ---- work / chapter management (v1.4.0) ---- */
  renameWork: (id: string, title: string) => void;
  renameChapter: (workId: string, chapterId: string, title: string) => void;
  /** remove chapters (and their IndexedDB pages, download rows, notes) */
  deleteChapters: (workId: string, chapterIds: string[]) => void;
  /** move chapters to another work — re-keys IndexedDB page blobs, regenerates
      ids/keys in the target; resolves after file moves settle (async) */
  moveChapters: (fromId: string, chapterIds: string[], toId: string) => Promise<boolean>;
  /** append upstream (not-downloaded) chapters, deduped by sourceChapterId */
  appendSourceChapters: (workId: string, chapters: Chapter[]) => number;

  markChapterRead: (workId: string, chapterId: string, read: boolean, upTo?: boolean) => void;
  setChapterProgress: (workId: string, chapterId: string, page: number) => void;

  startDownload: (workId: string, chapterId: string) => void;
  pauseDownload: (id: string) => void;
  resumeDownload: (id: string) => void;
  cancelDownload: (id: string) => void;
  retryDownload: (id: string) => void;
  removeDownload: (id: string) => void;

  /** real background download queue (v1.4.0) — upsert one row per chapter */
  upsertDownload: (item: DownloadItem) => void;
  patchDownload: (id: string, patch: Partial<DownloadItem>) => void;

  pushNotification: (n: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  createCategory: (name: string, rule?: SmartRule) => void;
  renameCategory: (id: string, name: string) => void;
  updateCategoryRule: (id: string, rule: SmartRule | null) => void;
  deleteCategory: (id: string) => void;
  assignCategories: (workId: string, catIds: string[]) => void;
  setUserRating: (workId: string, rating: number) => void;

  logReading: (workId: string, minutes: number, chapters: number) => void;
  /** manually adjust a day's logged minutes (heatmap day editing, round 11) */
  adjustDay: (date: string, delta: number) => void;
  pushHistory: (workId: string, chapterId: string, page: number) => void;
  /** keep the history entry on the page the user actually reached (resume fix) */
  refreshHistoryPage: (workId: string, chapterId: string, page: number) => void;
  clearHistory: () => void;

  addBookmark: (workId: string, chapterId: string, page: number, note?: string) => void;
  removeBookmark: (id: string) => void;

  addHighlight: (h: Omit<Highlight, "id" | "createdAt">) => void;
  updateHighlight: (id: string, p: Partial<Pick<Highlight, "color" | "note">>) => void;
  removeHighlight: (id: string) => void;

  addServer: (s: Omit<ServerEntry, "id" | "status">) => void;
  removeServer: (id: string) => void;
  setServerStatus: (id: string, status: ServerEntry["status"]) => void;
  /** attach/update HTTP Basic credentials on a catalog (Standard Ebooks) */
  setServerAuth: (id: string, auth: { user: string; pass: string } | null) => void;
  /** toggle a built-in source on/off [SRC-004] */
  toggleBuiltin: (id: string) => void;

  saveFilter: (name: string, filter: LibraryFilterSnapshot) => void;
  deleteSavedFilter: (id: string) => void;

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

/**
 * legacy v1 PIN hash — do NOT use for new records.
 * Kept only as a migration shim: verifyPinRecord() still accepts it and the
 * Vault lock screen transparently upgrades to salted PBKDF2 (vault-crypto).
 */
export function hashPin(pin: string): string {
  return legacyPinHash(pin);
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
      extensions: [], // v1.3.0: the fake extension list is gone — see ExtensionsScreen
      sessions: [],
      history: [],
      bookmarks: [],
      highlights: [],
      servers: SEED_SERVERS,
      savedFilters: [],
      settings: DEFAULT_SETTINGS,
      updateCheck: { lastCheck: null, checking: false },
      lastBackup: null,
      builtinDisabled: [] as string[],

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
              // attach the built-in sample book to the seeded EPUB work (FMT-002 demo)
              const sample = works.find((w) => w.id === "w-silentbook");
              if (sample) {
                import("./sample-epub").then(({ SAMPLE_EPUB }) => {
                  void (async () => {
                    try {
                      const { putFile } = await import("./local-files");
                      await putFile(
                        `${sample.id}::epub`,
                        new Blob([JSON.stringify(SAMPLE_EPUB)], { type: "application/json" })
                      );
                      useApp.setState((st2) => ({
                        works: st2.works.map((w) =>
                          w.id === sample.id
                            ? {
                                ...w,
                                localPages: ["epub"],
                                epubChapters: SAMPLE_EPUB.chapters.map((c) => ({
                                  id: c.id,
                                  title: c.title,
                                })),
                                chapters: SAMPLE_EPUB.chapters.map((c, i) => ({
                                  id: c.id,
                                  number: i + 1,
                                  title: c.title,
                                  pages: Math.max(
                                    1,
                                    Math.round(
                                      c.html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length / 220
                                    )
                                  ),
                                  releaseDate: w.chapters[i]?.releaseDate ?? new Date().toISOString(),
                                  isRead: false,
                                  download: "DONE" as const,
                                  sizeMb: 0.2,
                                })),
                              }
                            : w
                        ),
                      }));
                    } catch {
                      /* IDB unavailable — work stays as generated-page demo */
                    }
                  })();
                });
              }

              // attach the built-in sample PDF to the guide work (FMT-003 demo)
              const guide = works.find((w) => w.id === "w-oni-guide");
              if (guide && guide.localPages?.[0] !== "pdf") {
                void (async () => {
                  try {
                    const { putFile } = await import("./local-files");
                    const res = await fetch("samples/oni-library-guide.pdf");
                    if (!res.ok) return;
                    const blob = await res.blob();
                    await putFile(`${guide.id}::pdf`, blob);
                    useApp.setState((st2) => ({
                      works: st2.works.map((w) =>
                        w.id === guide.id && w.localPages?.[0] !== "pdf"
                          ? { ...w, localPages: ["pdf"] }
                          : w
                      ),
                    }));
                  } catch {
                    /* offline / IDB unavailable — guide falls back to generated pages */
                  }
                })();
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
      appendChapters: (workId, chapters) =>
        set((s) => ({
          works: s.works.map((w) => {
            if (w.id !== workId) return w;
            const merged = [
              ...w.chapters.filter((c) => !chapters.some((n) => n.id === c.id)),
              ...chapters,
            ].sort((a, b) => a.number - b.number);
            return { ...w, chapters: merged, readingStatus: w.readingStatus === "PLANNED" ? "READING" : w.readingStatus };
          }),
        })),
      setTracker: (p) =>
        set((s) => ({ settings: { ...s.settings, tracker: { ...s.settings.tracker, ...p } } })),
      toggleFavorite: (id) =>
        set((s) => ({
          works: s.works.map((w) => (w.id === id ? { ...w, isFavorite: !w.isFavorite } : w)),
        })),
      setUserRating: (workId, rating) =>
        set((s) => ({
          works: s.works.map((w) =>
            w.id === workId ? { ...w, userRating: rating > 0 && w.userRating === rating ? 0 : rating } : w
          ),
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
          // privacy + integrity: no orphaned traces of deleted works
          // (an orphaned notification of a deleted VAULT work used to leak
          // its title through the "unknown work" render path)
          notifications: s.notifications.filter((n) => !n.workId || !ids.includes(n.workId)),
          history: s.history.filter((h) => !ids.includes(h.workId)),
          bookmarks: s.bookmarks.filter((b) => !ids.includes(b.workId)),
          highlights: s.highlights.filter((h) => !ids.includes(h.workId)),
        })),
      addWork: (w) => set((s) => ({ works: [w, ...s.works] })),

      /* ---- work / chapter management (v1.4.0) ---- */

      renameWork: (id, title) =>
        set((s) => ({
          works: s.works.map((w) =>
            w.id === id ? { ...w, title: title.trim().slice(0, 160) || w.title } : w
          ),
        })),

      renameChapter: (workId, chapterId, title) =>
        set((s) => ({
          works: s.works.map((w) =>
            w.id !== workId
              ? w
              : {
                  ...w,
                  chapters: w.chapters.map((c) =>
                    c.id === chapterId
                      ? { ...c, title: title.trim().slice(0, 160) || c.title }
                      : c
                  ),
                }
          ),
        })),

      deleteChapters: (workId, chapterIds) => {
        const st = get();
        const work = st.works.find((w) => w.id === workId);
        if (!work) return;
        const ids = new Set(chapterIds);
        const removed = work.chapters.filter((c) => ids.has(c.id));
        // purge stored page blobs (per-chapter keys + self-contained docs) —
        // best-effort: the store update must never depend on storage luck
        void (async () => {
          try {
            const { deleteFile } = await import("./local-files");
            for (const c of removed) {
              for (const k of c.localPages ?? []) await deleteFile(k).catch(() => undefined);
              if (c.localDoc) await deleteFile(`${workId}::${c.id}::${c.localDoc}`).catch(() => undefined);
            }
          } catch {
            /* module unavailable (tests) — nothing to purge */
          }
        })();
        set((s) => ({
          works: s.works.map((w) =>
            w.id !== workId ? w : { ...w, chapters: w.chapters.filter((c) => !ids.has(c.id)) }
          ),
          downloads: s.downloads.filter((d) => !(d.workId === workId && ids.has(d.chapterId))),
          bookmarks: s.bookmarks.filter((b) => !(b.workId === workId && ids.has(b.chapterId))),
          highlights: s.highlights.filter((h) => !(h.workId === workId && ids.has(h.chapterId))),
          history: s.history.filter((h) => !(h.workId === workId && ids.has(h.chapterId))),
        }));
      },

      moveChapters: async (fromId, chapterIds, toId) => {
        const st = get();
        const from = st.works.find((w) => w.id === fromId);
        const to = st.works.find((w) => w.id === toId);
        if (!from || !to || fromId === toId) return false;
        // legacy works keep pages in the work-level flat list — those chapters
        // cannot move (their keys are not per-chapter); say no instead of lying
        if (from.chapters.some((c) => chapterIds.includes(c.id) && !c.localPages?.length && !c.localDoc && !c.sourceChapterId)) {
          return false;
        }
        const moving = from.chapters.filter((c) => chapterIds.includes(c.id));
        if (moving.length === 0) return false;

        // 1) move the stored page blobs under the target namespace, renaming
        //    the per-chapter ordinal so the target never reuses a key
        const moved: Chapter[] = [];
        let n = to.chapters.length;
        const keyRemap: Record<string, string> = {}; // old chapter id → new chapter id
        try {
          const { rekeyFile } = await import("./local-files");
          for (const c of moving) {
            n += 1;
            const newId = `${toId}-c${n}`;
            keyRemap[c.id] = newId;
            const newKeys: string[] = [];
            if (c.localPages?.length) {
              for (const k of c.localPages) {
                const m = k.match(/^([^:]+)::c\d+::(p\d+)$/);
                const newKey = m ? `${toId}::c${n}::${m[2]}` : `${toId}::${newId}::${k.split("::").pop()}`;
                await rekeyFile(k, newKey).catch(() => false);
                newKeys.push(newKey);
              }
            }
            if (c.localDoc) {
              await rekeyFile(`${fromId}::${c.id}::${c.localDoc}`, `${toId}::${newId}::${c.localDoc}`).catch(() => false);
            }
            moved.push({ ...c, id: newId, localPages: c.localPages?.length ? newKeys : undefined });
          }
        } catch {
          // storage layer unavailable (tests / private mode) — still move the
          // metadata rows; page blobs keep their old keys in that case
          for (const c of moving) {
            n += 1;
            keyRemap[c.id] = `${toId}-c${n}`;
            moved.push({ ...c, id: `${toId}-c${n}` });
          }
        }

        set((s) => {
          const works = s.works.map((w) => {
            if (w.id === fromId) {
              return { ...w, chapters: w.chapters.filter((c) => !chapterIds.includes(c.id)) };
            }
            if (w.id === toId) {
              return { ...w, chapters: [...w.chapters, ...moved].sort((a, b) => a.number - b.number) };
            }
            return w;
          });
          const movedOldIds = new Set(chapterIds);
          return {
            works,
            // downloads follow their chapter to the new work/namespace
            downloads: s.downloads.map((d) =>
              d.workId === fromId && movedOldIds.has(d.chapterId)
                ? { ...d, workId: toId, chapterId: keyRemap[d.chapterId] ?? d.chapterId }
                : d
            ),
            // notes/history tied to the old chapter ids cannot follow — purge
            // (same orphan-purge philosophy as deleteWorks)
            bookmarks: s.bookmarks.filter((b) => !(b.workId === fromId && movedOldIds.has(b.chapterId))),
            highlights: s.highlights.filter((h) => !(h.workId === fromId && movedOldIds.has(h.chapterId))),
            history: s.history.filter((h) => !(h.workId === fromId && movedOldIds.has(h.chapterId))),
          };
        });
        return true;
      },

      appendSourceChapters: (workId, chapters) => {
        let added = 0;
        set((s) => ({
          works: s.works.map((w) => {
            if (w.id !== workId) return w;
            const known = new Set(w.chapters.map((c) => c.sourceChapterId ?? c.id));
            const fresh = chapters.filter((c) => !known.has(c.sourceChapterId ?? c.id));
            if (fresh.length === 0) return w;
            added = fresh.length;
            return { ...w, chapters: [...w.chapters, ...fresh].sort((a, b) => a.number - b.number) };
          }),
        }));
        return added;
      },

      markChapterRead: (workId, chapterId, read, upTo) => {
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
        }));
        // tracker auto-sync (TRK v2) — fire and forget, never blocks the UI
        if (read) {
          void (async () => {
            try {
              const st = get();
              if (st.settings.tracker.provider !== "anilist" || !st.settings.tracker.token || !st.settings.tracker.autoSync) return;
              const { syncWorkToTracker } = await import("./tracker");
              await syncWorkToTracker(workId);
            } catch {
              /* offline / token issue — silent, next read or manual sync retries */
            }
          })();
        }
      },
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
      /* real background download queue (v1.4.0) — the MangaDex pipeline
         reports per-chapter rows so the Downloads screen shows truth */
      upsertDownload: (item) =>
        set((s) => {
          const existing = s.downloads.findIndex((d) => d.id === item.id);
          if (existing === -1) return { downloads: [item, ...s.downloads] };
          const downloads = [...s.downloads];
          downloads[existing] = { ...downloads[existing], ...item };
          return { downloads };
        }),
      patchDownload: (id, patch) =>
        set((s) => ({
          downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        })),
      /* tickDownloads (the old simulated queue ticker) was removed in v1.4.0 —
         downloads are real background jobs now; see src/lib/bg-downloads.ts */

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

      createCategory: (name, rule) =>
        set((s) => ({
          categories: [
            ...s.categories,
            { id: "cat-" + uid(), name, ...(rule ? { rule } : {}) },
          ],
        })),
      renameCategory: (id, name) =>
        set((s) => ({
          categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)),
        })),
      updateCategoryRule: (id, rule) =>
        set((s) => ({
          categories: s.categories.map((c) => {
            if (c.id !== id) return c;
            if (rule) return { ...c, rule };
            const { rule: _drop, ...rest } = c;
            return rest;
          }),
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
          const before = idx >= 0 ? sessions[idx].minutes : 0;
          const after = before + minutes;
          if (idx >= 0) {
            sessions[idx] = {
              ...sessions[idx],
              minutes: after,
              chapters: sessions[idx].chapters + chapters,
            };
          } else {
            sessions.push({ date: today, minutes: after, chapters });
          }
          if (sessions.length > 60) sessions.splice(0, sessions.length - 60);

          // daily-goal celebration (TRK-004/005): fire once when the ring completes
          const goal = s.settings.dailyGoalMin;
          if (goal > 0 && before < goal && after >= goal) {
            void (async () => {
              const { translate } = await import("./i18n");
              const lang = useApp.getState().settings.lang;
              const title = translate(lang, "stats.goalReachedTitle");
              const body = translate(lang, "stats.goalReachedBody", { min: after });
              const { toast } = await import("@/hooks/use-toast");
              toast({ title, description: body });
              useApp.getState().pushNotification({
                type: "UPDATE",
                title,
                body,
              });
            })();
          }
          return { sessions };
        }),
      /* heatmap day editing (round 11): clamp at 0 so a day can be corrected
         both ways without going negative; keeps the same 60-day window rule */
      adjustDay: (date, delta) =>
        set((s) => {
          const sessions = [...s.sessions];
          const idx = sessions.findIndex((x) => x.date === date);
          if (idx >= 0) {
            const minutes = Math.max(0, sessions[idx].minutes + delta);
            sessions[idx] = { ...sessions[idx], minutes };
          } else if (delta > 0) {
            sessions.push({ date, minutes: delta, chapters: 0 });
          } else {
            return {}; // nothing to reduce on an empty day
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

      refreshHistoryPage: (workId, chapterId, page) =>
        set((s) => ({
          history: s.history.map((h) =>
            h.workId === workId && h.chapterId === chapterId ? { ...h, page } : h
          ),
        })),

      addBookmark: (workId, chapterId, page, note) =>
        set((s) => ({
          bookmarks: [
            { id: uid(), workId, chapterId, page, note, createdAt: new Date().toISOString() },
            ...s.bookmarks,
          ],
        })),
      removeBookmark: (id) =>
        set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),

      addHighlight: (h) =>
        set((s) => ({
          highlights: [
            { ...h, id: uid(), createdAt: new Date().toISOString() },
            ...s.highlights,
          ],
        })),
      updateHighlight: (id, p) =>
        set((s) => ({
          highlights: s.highlights.map((h) => (h.id === id ? { ...h, ...p } : h)),
        })),
      removeHighlight: (id) =>
        set((s) => ({ highlights: s.highlights.filter((h) => h.id !== id) })),

      addServer: (srv) =>
        set((s) => ({ servers: [...s.servers, { ...srv, id: uid(), status: "UNKNOWN" }] })),
      removeServer: (id) => set((s) => ({ servers: s.servers.filter((x) => x.id !== id) })),
      setServerStatus: (id, status) =>
        set((s) => ({ servers: s.servers.map((x) => (x.id === id ? { ...x, status } : x)) })),
      setServerAuth: (id, auth) =>
        set((s) => ({ servers: s.servers.map((x) => (x.id === id ? { ...x, auth } : x)) })),
      toggleBuiltin: (id) =>
        set((s) => ({
          builtinDisabled: s.builtinDisabled.includes(id)
            ? s.builtinDisabled.filter((x) => x !== id)
            : [...s.builtinDisabled, id],
        })),

      saveFilter: (name, filter) =>
        set((s) => ({
          savedFilters: [
            ...s.savedFilters.filter((f) => f.name !== name),
            { id: uid(), name: name.slice(0, 24) || "Filter", filter },
          ].slice(-12),
        })),
      deleteSavedFilter: (id) =>
        set((s) => ({ savedFilters: s.savedFilters.filter((f) => f.id !== id) })),

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
        // real upstream check for works that remember their source (v1.4.0):
        // MangaDex works get actual new chapters APPENDED as streamable rows
        const fresh: Omit<Notification, "id" | "createdAt" | "read">[] = [];
        let appendedTotal = 0;
        try {
          const { mdNewChapters, mdChapterToStored } = await import("./mangadex");
          const online =
            typeof navigator === "undefined" || navigator.onLine !== false;
          if (online && !s.settings.offlineMode) {
            for (const w of s.works) {
              if (w.inVault) continue;
              if (w.sourceRef?.sourceId !== "mangadex") continue;
              try {
                const knownIds = w.chapters
                  .map((c) => c.sourceChapterId)
                  .filter((x): x is string => typeof x === "string");
                const upstream = await mdNewChapters(w.sourceRef.itemId, knownIds);
                if (upstream.length === 0) continue;
                const startIdx = w.chapters.length;
                const rows = upstream.map((ch, i) =>
                  mdChapterToStored(w.id, ch, startIdx + i, false)
                );
                appendedTotal += get().appendSourceChapters(w.id, rows);
                if (s.settings.ntfChapters) {
                  fresh.push({
                    type: "CHAPTER",
                    workId: w.id,
                    chapterLabel: translate(s.settings.lang, "ntf.newChapterLabel", { n: upstream.length }),
                    title: w.title,
                    body: translate(s.settings.lang, "ntf.newChapterBody"),
                  });
                }
              } catch {
                /* per-work network failure — skip, next check retries */
              }
            }
          }
        } catch {
          /* mangadex module unavailable (tests) — fall through to the local pass */
        }
        // local heuristic for works without an upstream source: unread latest
        // chapter released within the last 10h
        if (s.settings.ntfChapters) {
          for (const w of s.works) {
            if (w.inVault) continue;
            if (w.sourceRef?.sourceId === "mangadex") continue; // handled above
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
                  body: translate(s.settings.lang, "ntf.newChapterBody"),
                });
              }
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
        return fresh.length + appendedTotal;
      },

      setLastBackup: (iso) => set({ lastBackup: iso }),

      importBackup: (data) => {
        try {
          // validate strictly — a malformed backup file must never corrupt the
          // library or crash a tab screen outside an error boundary
          const d = data as Partial<AppState> & { app?: string };
          if (!d || typeof d !== "object" || d.app !== "oniLibrary") return false;
          const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
          // work rows: object with string id/title and a chapters array —
          // invalid rows are dropped instead of breaking the whole restore
          const works =
            isArr(d.works)
              ? (d.works as unknown[]).filter(
                  (w): w is Work =>
                    !!w && typeof w === "object" &&
                    typeof (w as Work).id === "string" &&
                    typeof (w as Work).title === "string" &&
                    isArr((w as Work).chapters)
                )
              : null;
          if (d.works !== undefined && works === null) return false; // wrong type → refuse
          const pickArr = <T,>(v: unknown, fb: T[]): T[] => (isArr(v) ? (v as T[]) : fb);
          const serversIn =
            isArr(d.servers)
              ? (d.servers as ServerEntry[]).map((sv) => {
                  // privacy: never import stored catalog credentials
                  const { auth: _strip, ...rest } = sv ?? ({} as ServerEntry);
                  return rest as ServerEntry;
                })
              : null;
          set((s) => ({
            works: works ?? s.works,
            categories: isArr(d.categories) ? (d.categories as Category[]) : s.categories,
            workCategories:
              d.workCategories && typeof d.workCategories === "object"
                ? (d.workCategories as Record<string, string[]>)
                : s.workCategories,
            settings: {
              ...s.settings,
              ...((d.settings as Settings) ?? {}),
              // privacy/integrity: the PIN stays device-local and cannot be
              // replaced through a backup file (known-hash attack)
              vaultPinHash: s.settings.vaultPinHash,
            },
            sessions: pickArr(d.sessions, s.sessions),
            bookmarks: pickArr(d.bookmarks, s.bookmarks),
            highlights: pickArr(d.highlights, s.highlights),
            // v2 backups: full library context
            history: pickArr(d.history, s.history),
            savedFilters: pickArr(d.savedFilters, s.savedFilters),
            // v3 backups: the download queue restores alongside chapter flags
            downloads: isArr(d.downloads) ? (d.downloads as DownloadItem[]) : s.downloads,
            servers: serversIn ?? s.servers,
            // sources: merge per-id enabled/pinned flags onto current set
            sources: isArr(d.sources)
              ? s.sources.map((cur) => {
                  const saved = (d.sources as { id: string; enabled?: boolean; pinned?: boolean }[]).find(
                    (x) => x.id === cur.id
                  );
                  return saved
                    ? { ...cur, enabled: saved.enabled ?? cur.enabled, pinned: saved.pinned ?? cur.pinned }
                    : cur;
                })
              : s.sources,
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
      storage: createJSONStorage((): StateStorage => ({
        /* guarded storage — a corrupted persisted payload or a privacy
           mode that throws on access must never crash hydration */
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            /* quota exceeded / private mode — run memory-only */
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            /* ignore */
          }
        },
      })),
      // migrate older persisted states: new Settings keys must fall back to
      // defaults instead of undefined (e.g. volumeKeyPaging on v1.0.1 stores)
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return {
          ...current,
          ...p,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(current.settings ?? {}),
            ...(p.settings ?? {}),
            readerDefaults: {
              ...DEFAULT_SETTINGS.readerDefaults,
              ...(current.settings?.readerDefaults ?? {}),
              ...(p.settings?.readerDefaults ?? {}),
            },
          },
        } as AppState;
      },
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
        highlights: s.highlights,
        servers: s.servers,
        settings: s.settings,
        builtinDisabled: s.builtinDisabled,
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

/* ---------- selectors / utils ---------- */

/** LIB-008 — evaluate a smart rule against a work (all set conditions AND-ed) */
export function matchesRule(w: Work, rule: SmartRule): boolean {
  if (rule.status && w.readingStatus !== rule.status) return false;
  if (rule.downloaded && !w.chapters.some((c) => c.download === "DONE")) return false;
  if (rule.unread && !w.chapters.some((c) => !c.isRead)) return false;
  if (rule.favorite && !w.isFavorite) return false;
  if (rule.type) {
    const group: Record<string, string[]> = {
      MANGA: ["MANGA", "MANHWA", "MANHUA", "WEBTOON"],
      COMIC: ["COMIC"],
      BOOK: ["BOOK", "NOVEL", "EPUB"],
      PDF: ["PDF"],
    };
    if (!(group[rule.type] ?? []).includes(w.type)) return false;
  }
  return true;
}

/** chapter-level read fraction 0..1 with the dual lastPage interpretation
    (ratio ≤ 1 = current reader format, absolute page > 1 = legacy records);
    shared by workProgress() and the Discover continue-reading cards */
export function chapterProgressFraction(c: Chapter): number {
  if (typeof c.lastPage !== "number") return 0;
  return c.lastPage > 1
    ? Math.min(1, c.lastPage / Math.max(1, c.pages ?? 20))
    : Math.max(0, c.lastPage);
}

export function workProgress(w: Work): number {
  if (w.chapters.length === 0) return 0;
  const read = w.chapters.filter((c) => c.isRead).length;
  const current = w.chapters.find((c) => !c.isRead && typeof c.lastPage === "number");
  const frac = current ? chapterProgressFraction(current) : 0;
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
    const t = Math.max(1, next.pages ?? 20);
    // dual interpretation, matching the reader restore: lastPage <= 1 is a
    // stored ratio, > 1 a legacy absolute page — clamped to a real page index
    const p = next.lastPage <= 1 ? Math.round(t * next.lastPage) : Math.round(next.lastPage);
    return { chapter: next, page: Math.max(0, Math.min(p, t - 1)) };
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
