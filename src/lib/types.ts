/* ============================================================
   oniLibrary — core types
   ============================================================ */

export type WorkType =
  | "MANGA"
  | "MANHWA"
  | "MANHUA"
  | "COMIC"
  | "WEBTOON"
  | "BOOK"
  | "NOVEL"
  | "PDF"
  | "EPUB";

export type ReadingStatus = "PLANNED" | "READING" | "COMPLETED" | "ON_HOLD" | "DROPPED";
export type WorkStatus = "ONGOING" | "COMPLETED" | "HIATUS" | "CANCELLED";
export type ReadingDirection = "LTR" | "RTL" | "VERTICAL";
export type ReaderMode = "PAGED" | "DOUBLE" | "CONTINUOUS" | "WEBTOON";
export type FitMode = "WIDTH" | "HEIGHT" | "SCREEN" | "ORIGINAL";
export type DownloadState = "NONE" | "QUEUED" | "DOWNLOADING" | "PAUSED" | "DONE" | "ERROR";
export type ThemeMode = "light" | "dark" | "system";

export interface Chapter {
  id: string;
  number: number;
  title: string;
  pages: number;
  releaseDate: string; // ISO
  scanlator?: string;
  isRead: boolean;
  lastPage?: number; // progress inside chapter
  download: DownloadState;
  sizeMb: number;
}

export interface Work {
  id: string;
  title: string;
  altTitle?: string;
  author: string;
  cover: string; // url or ""
  coverColor?: string; // fallback gradient when no cover
  banner?: string;
  type: WorkType;
  source?: string; // source id
  sourceUrl?: string;
  description: string;
  workStatus: WorkStatus;
  readingStatus: ReadingStatus;
  isFavorite: boolean;
  inVault: boolean;
  tags: string[];
  rating: number;
  ratingCount: number;
  direction: ReadingDirection;
  readerMode: ReaderMode;
  fitMode: FitMode;
  chapters: Chapter[];
  addedAt: string;
  lastReadAt?: string;
  isLocal?: boolean;
  language: string; // content language
  localPages?: string[]; // imported image data urls
  epubChapters?: { id: string; title: string }[]; // parsed EPUB spine metadata
}

export interface DownloadItem {
  id: string;
  workId: string;
  chapterId: string;
  status: "ACTIVE" | "PAUSED" | "DONE" | "ERROR" | "QUEUED";
  progress: number; // 0..100
  downloadedMb: number;
  totalMb: number;
  speedMbps: number;
  error?: string;
  startedAt: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  iconBg: string; // css color
  iconText: string; // letter/emoji on icon
  iconImg?: string; // optional url
  kinds: string[]; // "Manga" | "Anime" | "Comics" ...
  itemCount: string;
  languages: string[];
  status: "ONLINE" | "OFFLINE" | "ERROR";
  enabled: boolean;
  pinned: boolean;
  lastCheck?: string;
  extensionId?: string;
}

export interface Extension {
  id: string;
  name: string;
  version: string;
  repo: string;
  languages: string[];
  status: "INSTALLED" | "AVAILABLE" | "UPDATE";
  compatibility: "VERIFIED" | "UNVERIFIED";
  trust: "OFFICIAL" | "COMMUNITY" | "UNKNOWN";
  provides: string[]; // source ids
  enabled: boolean;
}

export interface Notification {
  id: string;
  type: "CHAPTER" | "DOWNLOAD" | "ERROR" | "UPDATE";
  workId?: string;
  chapterLabel?: string;
  title: string;
  body?: string;
  createdAt: string;
  read: boolean;
  sensitive?: boolean;
}

export interface Category {
  id: string;
  name: string;
}

export interface ReadingSession {
  date: string; // YYYY-MM-DD
  minutes: number;
  chapters: number;
}

export interface HistoryEntry {
  id: string;
  workId: string;
  chapterId: string;
  page: number;
  at: string;
}

export interface Bookmark {
  id: string;
  workId: string;
  chapterId: string;
  page: number;
  note?: string;
  createdAt: string;
}

export interface ServerEntry {
  id: string;
  name: string;
  url: string;
  kind: "KOMGA" | "OPDS";
  status: "UNKNOWN" | "OK" | "FAIL";
}

export interface Settings {
  lang: "en" | "fa";
  theme: ThemeMode;
  userName: string;
  navItems: string[]; // subset: home library discover updates downloads
  wifiOnly: boolean;
  maxConcurrent: number;
  autoUpdateCheck: boolean;
  ntfChapters: boolean;
  ntfDownloads: boolean;
  ntfErrors: boolean;
  hideSensitiveNtf: boolean;
  offlineMode: boolean;
  vaultPinHash: string | null;
  vaultBiometric: boolean;
  vaultAutoLock: boolean;
  readerDefaults: {
    mode: ReaderMode;
    direction: ReadingDirection;
    fit: FitMode;
    bg: "black" | "gray" | "white" | "sepia";
    brightness: number; // 30..100
    autoNext: boolean;
    cropBorders: boolean;
    keepAwake: boolean;
    epubFontSize?: number; // 14..22 for book reading
  };
}

export interface UpdateCheckState {
  lastCheck: string | null;
  checking: boolean;
}
