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
  /** imported image chapters: IndexedDB page keys for THIS chapter
      (`${workId}::c{n}::p{i}`); legacy single-chapter imports keep the
      work-level `localPages` flat list instead */
  localPages?: string[];
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
  userRating?: number; // personal rating 0..5 stars (TRK-001)
  customCover?: string; // user-chosen cover data url (LIB-010)
  personalNotes?: string; // free-form private notes (LIB-010)
  trackerId?: number; // external tracker (AniList) media id once matched
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
  /** LIB-008 smart rule — when present the category is auto-computed from the library */
  rule?: SmartRule;
}

/** savable smart-category conditions (LIB-008). All set fields must match (AND). */
export interface SmartRule {
  status?: ReadingStatus | null; // reading status must equal
  downloaded?: boolean; // has downloaded chapters
  unread?: boolean; // has unread chapters
  favorite?: boolean; // is favorite
  type?: "MANGA" | "COMIC" | "BOOK" | "PDF" | null; // coarse type group
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

/** highlight annotation colors (books) */
export type HighlightColor = "coral" | "mint" | "amber" | "violet";

/** saved text-highlight annotation on an EPUB chapter (round 10) /
 *  rect highlight on a PDF page (round 11) — one interface, two anchor kinds */
export interface Highlight {
  id: string;
  workId: string;
  chapterId: string;
  color: HighlightColor;
  text: string; // the selected text (also the re-anchor fallback)
  note?: string; // optional annotation note
  createdAt: string;
  /** stable anchor: global char offsets inside the chapter's concatenated text (EPUB) */
  anchor: { start: number; end: number };
  /** PDF highlights only: 1-based page the rect belongs to */
  page?: number;
  /** PDF highlights only: axis-aligned rect in UNROTATED scale-1 user space
      (y grows up) — converted through the page viewport at render time, so
      rotation/zoom stay in sync (same scheme as the find-in-page marks) */
  rect?: { x1: number; y1: number; x2: number; y2: number };
}

export interface ServerEntry {
  id: string;
  name: string;
  url: string;
  kind: "KOMGA" | "OPDS";
  status: "UNKNOWN" | "OK" | "FAIL";
}

/** saved library filter (LIB-011) — a named snapshot of filter chips + sort */
export interface LibraryFilterSnapshot {
  type: "ALL" | "MANGA" | "COMIC" | "BOOK" | "PDF";
  status: ReadingStatus | null;
  source: string | null;
  downloadedOnly: boolean;
  unreadOnly: boolean;
  sort: "lastRead" | "title" | "added" | "progress" | "latest";
}

export interface SavedFilter {
  id: string;
  name: string;
  filter: LibraryFilterSnapshot;
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
  dailyGoalMin: number; // reading goal per day, minutes (0 = off)
  vaultPinHash: string | null;
  vaultBiometric: boolean;
  vaultAutoLock: boolean;
  /** RDR-010: volume keys turn pages while the reader is open (Android) */
  volumeKeyPaging: boolean;
  /** tracker sync (TRK v2): AniList personal token + auto behavior */
  tracker: {
    provider: "none" | "anilist";
    token: string;
    autoSync: boolean; // push progress after each chapter read
    lastSyncAt: string | null;
  };
  /** UX-003: library grid density — compact(4) / cozy(3) / large(2) columns */
  libraryDensity: "compact" | "cozy" | "large";
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
    epubFont?: "serif" | "sans"; // book typeface
    epubTheme?: "dark" | "sepia" | "paper"; // book page theme
    ttsRate?: number; // read-aloud speed 0.6..1.8 (books)
    ttsAutoAdvance?: boolean; // PDF read-aloud: keep reading across pages
  };
}

export interface UpdateCheckState {
  lastCheck: string | null;
  checking: boolean;
}
