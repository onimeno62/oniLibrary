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

import type { Chapter, Work, WorkStatus, WorkType, ReaderMode, ReadingDirection } from "./types";
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

function listQuery(order: string, offset: number, title?: string): string {
  const p = new URLSearchParams();
  p.set("limit", "24");
  p.set("offset", String(offset * 24));
  for (const r of RATINGS) p.append("contentRating[]", r);
  p.append("includes[]", "cover_art");
  p.append("includes[]", "author");
  p.append("includes[]", "artist");
  p.set("hasAvailableChapters", "true");
  p.set(`order[${order}]`, "desc");
  if (title) p.set("title", title);
  return `/manga?${p.toString()}`;
}

async function listMangas(path: string): Promise<MdManga[]> {
  const res = await mdGet<{ data: MdMangaRaw[] }>(path);
  return (res.data ?? []).map(mapManga);
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

  const { mode, dir } = readerFor(manga.workType);
  return {
    id,
    title: manga.title.slice(0, 120),
    altTitle: manga.altTitle,
    author: manga.author || "MangaDex",
    cover,
    type: manga.workType,
    description: manga.description || `${manga.title} — downloaded from MangaDex.`,
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
    chapters: out,
    addedAt: new Date().toISOString(),
    language: "en",
    isLocal: true,
    sourceRef: { sourceId: "mangadex", itemId: manga.id },
    sourceUrl: `https://mangadex.org/title/${manga.id}`,
  };
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

    let urls: string[] = [];
    try {
      urls = await mdPageUrls(ch.id);
    } catch {
      continue; // chapter un-fetchable → skip honestly
    }

    const keys: string[] = [];
    let sizeMb = 0;
    for (let p = 0; p < urls.length; p++) {
      onProgress?.({
        chapterDone: i,
        chapterTotal: chapters.length,
        chapterLabel: label,
        pageDone: p,
        pageTotal: urls.length,
      });
      const f = await opdsFetchBinary(urls[p], `p${p + 1}.jpg`).catch(() => null);
      if (!f) continue;
      const key = `${workId}::c${startIndex + i + 1}::p${p + 1}`;
      try {
        await putFile(key, f);
      } catch {
        continue;
      }
      keys.push(key);
      sizeMb += f.size / 1_048_576;
      await sleep(PAGE_DELAY_MS);
    }

    if (keys.length === 0) continue; // nothing usable → skip
    out.push({
      id: `${workId}-c${startIndex + i + 1}`,
      number: ch.number,
      title: label,
      pages: keys.length,
      releaseDate: ch.publishedAt,
      isRead: false,
      download: "DONE",
      sizeMb: Math.round(sizeMb * 10) / 10,
      localPages: keys,
    });
  }
  return out;
}
