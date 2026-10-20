"use client";

/**
 * MangaDex source adapter (v1.3.0) — the PRD's manga use-case ([USR-002]):
 * search / browse / chapter download / check-for-updates, all against the
 * public MangaDex API (no account needed for public chapters).
 *
 * Transport reuses the OPDS client's bridge-aware fetch (`opdsFetchText` /
 * `opdsFetchBinary`) so it works identically in the APK (no CORS limits via
 * OniAndroid) and in a plain browser (api.mangadex.org sends CORS headers).
 *
 * Chapter pages are stored exactly like folder imports —
 *   `${workId}::c{n}::p{i}` keys + `Chapter.localPages` — so the reader,
 *   downloads screen and progress tracking all work unchanged.
 */

import type { Chapter, Work, WorkStatus, WorkType, ReaderMode, ReadingDirection, MdFeedFilters } from "./types";
import { opdsFetchText, opdsFetchBinary } from "./opds";
import { putFile, blobToThumbDataUrl } from "./local-files";

const API = "https://api.mangadex.org";
const UPLOADS = "https://uploads.mangadex.org";
const RATINGS = ["safe", "suggestive"];
const PAGE_LANGS = ["en"]; // chapter language (kept explicit + honest in UI)
const PAGE_DELAY_MS = 120; // stay polite with the CDN (≤5 req/s anonymous)

/* ---------------- raw API shapes (subset) ---------------- */

type TextMap = Record<string, string>;

interface MdRel {
  id: string;
  type: string;
  attributes?: { fileName?: string; name?: string };
}

interface MdMangaRaw {
  id: string;
  attributes: {
    title: TextMap;
    altTitles: TextMap[];
    description: TextMap;
    tags: { id: string; attributes: { name: TextMap } }[];
    status?: string;
    originalLanguage?: string;
  };
  relationships: MdRel[];
}

interface MdChapterRaw {
  id: string;
  attributes: {
    chapter: string | null;
    title: string | null;
    pages: number;
    publishAt: string;
    externalUrl?: string | null;
  };
}

/* ---------------- mapped shapes ---------------- */

export interface MdManga {
  id: string;
  title: string;
  altTitle?: string;
  author: string;
  description: string;
  coverUrl: string; // .256.jpg grid thumb
  tags: string[];
  status: string; // ongoing | completed | hiatus | cancelled
  /** detected app work type (MANGA / MANHWA / MANHUA / WEBTOON) */
  workType: WorkType;
}

export interface MdChapter {
  id: string;
  number: number;
  title: string;
  pages: number;
  publishedAt: string;
}

export interface MdImportProgress {
  chapterDone: number;
  chapterTotal: number;
  chapterLabel: string;
  pageDone: number;
  pageTotal: number;
}

/* ---------------- plumbing ---------------- */

async function mdGet<T>(path: string): Promise<T> {
  const text = await opdsFetchText(path.startsWith("http") ? path : API + path);
  return JSON.parse(text) as T;
}

function pickText(map?: TextMap | null): string {
  if (!map) return "";
  return (map.en ?? Object.values(map)[0] ?? "").trim();
}

function mapManga(raw: MdMangaRaw): MdManga {
  const a = raw.attributes;
  const coverRel = raw.relationships.find((r) => r.type === "cover_art");
  const author =
    raw.relationships.find((r) => r.type === "author")?.attributes?.name ??
    raw.relationships.find((r) => r.type === "artist")?.attributes?.name ??
    "";
  const tags = a.tags.map((t) => pickText(t.attributes?.name)).filter(Boolean);
  const alt = a.altTitles.find((t) => t.en) ?? a.altTitles[0];
  const orig = (a.originalLanguage ?? "").toLowerCase();
  const isWebtoon = tags.some((t) => /webtoon|long strip/i.test(t));
  const workType: WorkType = isWebtoon
    ? "WEBTOON"
    : orig === "ko"
      ? "MANHWA"
      : orig === "zh"
        ? "MANHUA"
        : "MANGA";
  return {
    id: raw.id,
    title: pickText(a.title) || "Untitled",
    altTitle: pickText(alt) || undefined,
    author,
    description: pickText(a.description),
    coverUrl: coverRel?.attributes?.fileName
      ? `${UPLOADS}/covers/${raw.id}/${coverRel.attributes.fileName}.256.jpg`
      : "",
    tags,
    status: a.status ?? "ongoing",
    workType,
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------------- browse / search ([SRC-002]) ---------------- */

/** sort orders the source honestly supports for browse/search feeds
 *  (plan §5: capabilities are declared, never fabricated) */
export type MdSortOrder = "followedCount" | "latestUploadedChapter" | "createdAt" | "title" | "relevance";

/** Pure query builder — filter → API-param mapping lives here so it is
 *  unit-testable (plan §13: filters have defined source semantics).
 *  MangaDex semantics: status[]/originalLanguage[] are OR-joined server
 *  side; includedTags[] (genres) are AND-joined server side. */
export function buildListQuery(opts: {
  order: MdSortOrder;
  offset: number;
  title?: string;
  filters?: MdFeedFilters;
}): string {
  const p = new URLSearchParams();
  p.set("limit", "24");
  p.set("offset", String(opts.offset * 24));
  for (const r of RATINGS) p.append("contentRating[]", r);
  p.append("includes[]", "cover_art");
  p.append("includes[]", "author");
  p.append("includes[]", "artist");
  p.set("hasAvailableChapters", "true");
  p.set(`order[${opts.order}]`, "desc");
  const f = opts.filters;
  if (f) {
    for (const s of f.status ?? []) p.append("status[]", s);
    for (const l of f.originalLanguage ?? []) p.append("originalLanguage[]", l);
    for (const t of f.includedTags ?? []) p.append("includedTags[]", t);
  }
  if (opts.title) p.set("title", opts.title);
  return `/manga?${p.toString()}`;
}

function listQuery(order: MdSortOrder, offset: number, title?: string): string {
  return buildListQuery({ order, offset, title });
}

async function listMangas(path: string): Promise<MdManga[]> {
  const res = await mdGet<{ data: MdMangaRaw[] }>(path);
  return (res.data ?? []).map(mapManga);
}

/** feed result with the server-side total, so pagers can offer "load more"
 *  honestly instead of guessing from `items.length % 24` (Phase 1 finding T7) */
export interface MdFeed {
  list: MdManga[];
  /** total matches reported by the API (falls back to the page length) */
  total: number;
}

async function listMangasWithTotal(path: string): Promise<MdFeed> {
  const res = await mdGet<{ data?: MdMangaRaw[]; total?: number }>(path);
  const list = (res.data ?? []).map(mapManga);
  return { list, total: typeof res.total === "number" ? res.total : list.length };
}

export function mdPopular(page: number): Promise<MdManga[]> {
  return listMangas(listQuery("followedCount", page));
}

export function mdLatest(page: number): Promise<MdManga[]> {
  return listMangas(listQuery("latestUploadedChapter", page));
}

export function mdSearch(query: string, page: number): Promise<MdManga[]> {
  return listMangas(listQuery("relevance", page, query.trim()));
}

/** total-aware variants used by paged browsers (source screen);
 *  filters are applied server-side when the source supports them (§6) */
export function mdPopularFeed(page: number, filters?: MdFeedFilters): Promise<MdFeed> {
  return listMangasWithTotal(buildListQuery({ order: "followedCount", offset: page, filters }));
}

export function mdLatestFeed(page: number, filters?: MdFeedFilters): Promise<MdFeed> {
  return listMangasWithTotal(buildListQuery({ order: "latestUploadedChapter", offset: page, filters }));
}

export function mdSearchFeed(query: string, page: number, filters?: MdFeedFilters): Promise<MdFeed> {
  return listMangasWithTotal(
    buildListQuery({ order: "relevance", offset: page, title: query.trim(), filters })
  );
}

/* ---------------- genres/tags (filter panel data, §6) ---------------- */

export interface MdTag {
  id: string;
  name: string;
}

let tagCache: MdTag[] | null = null;

/** genre/tag list for the filter panel (GET /manga/tag). Cached per session. */
export async function mdTagList(): Promise<MdTag[]> {
  if (tagCache) return tagCache;
  const res = await mdGet<{ data?: Array<{ id: string; attributes?: { name?: TextMap } }> }>(
    "/manga/tag?limit=100"
  );
  const tags = (res.data ?? [])
    .map((t) => ({ id: t.id, name: pickText(t.attributes?.name) }))
    .filter((t) => t.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  tagCache = tags;
  return tags;
}

export async function mdManga(id: string): Promise<MdManga | null> {
  const res = await mdGet<{ data: MdMangaRaw }>(
    `/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`
  );
  return res.data ? mapManga(res.data) : null;
}

/* ---------------- chapters + pages ---------------- */

export function mdChapterLabel(ch: MdChapter): string {
  const n = Number.isInteger(ch.number) ? String(ch.number) : ch.number.toFixed(1);
  return ch.title ? `Ch. ${n} — ${ch.title}` : `Ch. ${n}`;
}

/** chapter feed, oldest→newest; external (linked-out) chapters are skipped —
    they are not downloadable and pointing users at them would be a lie */
export async function mdChapters(mangaId: string, cap = 300): Promise<MdChapter[]> {
  const out: MdChapter[] = [];
  const LIMIT = 100;
  for (let offset = 0; offset < cap; offset += LIMIT) {
    const p = new URLSearchParams();
    p.set("limit", String(LIMIT));
    p.set("offset", String(offset));
    for (const l of PAGE_LANGS) p.append("translatedLanguage[]", l);
    for (const r of RATINGS) p.append("contentRating[]", r);
    p.set("order[chapter]", "desc");
    p.set("includeExternalUrl", "0");
    const res = await mdGet<{ data: MdChapterRaw[]; total: number }>(
      `/manga/${mangaId}/feed?${p.toString()}`
    );
    for (const raw of res.data ?? []) {
      const a = raw.attributes;
      if (a.externalUrl) continue;
      out.push({
        id: raw.id,
        number: a.chapter !== null ? parseFloat(a.chapter) || 0 : 0,
        title: (a.title ?? "").trim(),
        pages: a.pages ?? 0,
        publishedAt: a.publishAt,
      });
    }
    if ((res.data?.length ?? 0) < LIMIT || out.length >= cap) break;
  }
  return out.reverse(); // API returns desc — flip to reading order
}

/** page image urls for one chapter (at-home server) */
export async function mdPageUrls(chapterId: string): Promise<string[]> {
  const res = await mdGet<{
    baseUrl: string;
    chapter: { hash: string; data: string[] };
  }>(`/at-home/server/${chapterId}`);
  const base = res.baseUrl;
  const hash = res.chapter?.hash;
  const files = res.chapter?.data ?? [];
  if (!base || !hash) return [];
  return files.map((f) => `${base}/data/${hash}/${f}`);
}

/** chapters the library does not have yet (update check [UPD-001]) */
export async function mdNewChapters(mangaId: string, knownIds: string[]): Promise<MdChapter[]> {
  const all = await mdChapters(mangaId, 100);
  const known = new Set(knownIds);
  return all.filter((c) => !known.has(c.id));
}

/* ---------------- import → library ([SRC-003], [DWN-001]) ---------------- */

function mapWorkStatus(s: string): WorkStatus {
  if (s === "completed") return "COMPLETED";
  if (s === "hiatus") return "HIATUS";
  if (s === "cancelled") return "CANCELLED";
  return "ONGOING";
}

function readerFor(type: WorkType): { mode: ReaderMode; dir: ReadingDirection } {
  return type === "WEBTOON"
    ? { mode: "WEBTOON", dir: "VERTICAL" }
    : { mode: "PAGED", dir: "RTL" };
}

/** base Work fields shared by both import paths (download now / add only) */
function baseWork(manga: MdManga, chapters: Chapter[], id: string, cover: string): Work {
  const { mode, dir } = readerFor(manga.workType);
  return {
    id,
    title: manga.title.slice(0, 120),
    altTitle: manga.altTitle,
    author: manga.author || "MangaDex",
    cover,
    type: manga.workType,
    description: manga.description || `${manga.title} — from MangaDex.`,
    workStatus: mapWorkStatus(manga.status),
    readingStatus: "PLANNED",
    isFavorite: false,
    inVault: false,
    tags: [...manga.tags.slice(0, 6), "MangaDex"],
    rating: 0,
    ratingCount: 0,
    direction: dir,
    readerMode: mode,
    fitMode: "WIDTH",
    chapters,
    addedAt: new Date().toISOString(),
    language: "en",
    isLocal: true,
    sourceRef: { sourceId: "mangadex", itemId: manga.id },
    sourceUrl: `https://mangadex.org/title/${manga.id}`,
  };
}

/** fetch the cover through the bridge-aware binary loader and return an
    object URL — the uploads CDN may refuse the WebView's UA, and covers
    fetched this way work identically in the APK and the browser */
const coverObjectUrls = new Map<string, string>();
export async function mdCoverObjectUrl(coverUrl: string): Promise<string | null> {
  if (!coverUrl) return null;
  const hit = coverObjectUrls.get(coverUrl);
  if (hit) return hit;
  try {
    const f = await opdsFetchBinary(coverUrl, "cover");
    if (!f) return null;
    const url = URL.createObjectURL(f);
    coverObjectUrls.set(coverUrl, url);
    return url;
  } catch {
    return null;
  }
}

/** map an upstream chapter to a stored Chapter row. downloaded=false creates
    a STREAMABLE row (no localPages, download:"NONE") that the reader serves
    straight from the source; sourceChapterId keeps the upstream identity for
    update checks and per-chapter downloads. */
export function mdChapterToStored(
  workId: string,
  ch: MdChapter,
  index: number,
  downloaded: boolean,
  localPages?: string[],
  sizeMb?: number
): Chapter {
  return {
    id: `${workId}-c${index + 1}`,
    number: ch.number,
    title: mdChapterLabel(ch),
    pages: ch.pages || 0,
    releaseDate: ch.publishedAt,
    isRead: false,
    download: downloaded ? "DONE" : "NONE",
    sizeMb: sizeMb ?? 0,
    localPages: downloaded ? localPages : undefined,
    sourceChapterId: ch.id,
  };
}

/** fetch + downscale a cover to a persisted data-url thumbnail (best-effort) */
export async function mdCoverThumbDataUrl(coverUrl: string): Promise<string> {
  if (!coverUrl) return "";
  const f = await opdsFetchBinary(coverUrl, "cover").catch(() => null);
  if (!f) return "";
  return blobToThumbDataUrl(f).catch(() => "");
}

/** add a MangaDex work to the library WITHOUT downloading anything —
    every chapter stays streamable (read online) and individually
    downloadable from the details screen. Returns instantly: the cover
    thumbnail is patched in afterwards by the caller (non-blocking). */
export async function addMangaDexToLibrary(
  manga: MdManga,
  chapters: MdChapter[]
): Promise<Work> {
  const id = "w-md-" + Date.now().toString(36);
  const rows = chapters.map((ch, i) => mdChapterToStored(id, ch, i, false));
  return baseWork(manga, rows, id, "");
}

/** download the selected chapters' pages and build a complete Work */
export async function importMangaDexWork(
  manga: MdManga,
  chapters: MdChapter[],
  onProgress?: (p: MdImportProgress) => void
): Promise<Work> {
  const id = "w-md-" + Date.now().toString(36);
  const out = await downloadChapters(id, chapters, onProgress);
  if (out.length === 0) throw new Error("no pages downloaded");

  let cover = "";
  if (manga.coverUrl) {
    const f = await opdsFetchBinary(manga.coverUrl, "cover").catch(() => null);
    if (f) cover = await blobToThumbDataUrl(f).catch(() => "");
  }
  if (!cover && out[0].localPages?.length) {
    const b = await getFileSafe(out[0].localPages[0]);
    if (b) cover = await blobToThumbDataUrl(b).catch(() => "");
  }

  return baseWork(manga, out, id, cover);
}

/** download additional chapters for an existing MangaDex work (update flow).
    startNumber continues the c{n} page-key numbering after existing chapters. */
export async function appendMangaDexChapters(
  work: Work,
  chapters: MdChapter[],
  onProgress?: (p: MdImportProgress) => void
): Promise<Chapter[]> {
  const start = work.chapters.length;
  return downloadChapters(work.id, chapters, onProgress, start);
}

/* ---------------- internals ---------------- */

async function getFileSafe(key: string): Promise<Blob | null> {
  try {
    const { getFile } = await import("./local-files");
    return await getFile(key);
  } catch {
    return null;
  }
}

/** download ONE chapter's pages into IndexedDB under
    `${workId}::c{keyIndex}::p{i}` — shared by the import pipeline and the
    background download manager. Returns null when nothing was usable or the
    job was cancelled. */
export async function mdDownloadOneChapter(
  ch: MdChapter,
  workId: string,
  keyIndex: number,
  onPage?: (done: number, totalPages: number) => void,
  isCancelled?: () => boolean
): Promise<{ localPages: string[]; sizeMb: number } | null> {
  let urls: string[] = [];
  try {
    urls = await mdPageUrls(ch.id);
  } catch {
    return null; // chapter un-fetchable → caller reports honestly
  }
  const keys: string[] = [];
  let sizeMb = 0;
  for (let p = 0; p < urls.length; p++) {
    if (isCancelled?.()) return null;
    onPage?.(p, urls.length);
    const f = await opdsFetchBinary(urls[p], `p${p + 1}.jpg`).catch(() => null);
    if (!f) continue;
    const key = `${workId}::c${keyIndex}::p${p + 1}`;
    try {
      await putFile(key, f);
    } catch {
      continue;
    }
    keys.push(key);
    sizeMb += f.size / 1_048_576;
    await sleep(PAGE_DELAY_MS);
  }
  if (keys.length === 0) return null;
  return { localPages: keys, sizeMb };
}

async function downloadChapters(
  workId: string,
  chapters: MdChapter[],
  onProgress?: (p: MdImportProgress) => void,
  startIndex = 0
): Promise<Chapter[]> {
  const out: Chapter[] = [];
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const label = mdChapterLabel(ch);
    onProgress?.({ chapterDone: i, chapterTotal: chapters.length, chapterLabel: label, pageDone: 0, pageTotal: 0 });

    const res = await mdDownloadOneChapter(ch, workId, startIndex + i + 1, (p, t) => {
      onProgress?.({
        chapterDone: i,
        chapterTotal: chapters.length,
        chapterLabel: label,
        pageDone: p,
        pageTotal: t,
      });
    });
    if (!res) continue; // nothing usable → skip honestly

    out.push({
      id: `${workId}-c${startIndex + i + 1}`,
      number: ch.number,
      title: label,
      pages: res.localPages.length,
      releaseDate: ch.publishedAt,
      isRead: false,
      download: "DONE",
      sizeMb: Math.round(res.sizeMb * 10) / 10,
      localPages: res.localPages,
      sourceChapterId: ch.id, // keep the upstream identity (update checks)
    });
  }
  return out;
}
