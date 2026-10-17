"use client";

import { unzipSync, inflateSync } from "fflate";
import { putFile, blobToThumbDataUrl } from "./local-files";
import type { TranslationKey } from "./i18n";
import type { Work } from "./types";

const IMG_RE = /\.(jpe?g|jfif|png|webp|gif|bmp|avif)$/i;

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export interface UnsupportedFile {
  name: string;
  /** stable reason code — screens map it to imp.reason.* i18n keys */
  reason: "cbr" | "7z" | "encrypted" | "noImages" | "corrupt" | "format";
}

export const UNSUPPORTED_REASON_KEYS: Record<UnsupportedFile["reason"], TranslationKey> = {
  cbr: "imp.reason.cbr",
  "7z": "imp.reason.7z",
  encrypted: "imp.reason.encrypted",
  noImages: "imp.reason.noImages",
  corrupt: "imp.reason.corrupt",
  format: "imp.reason.format",
};

export interface ImportResult {
  created: Work[];
  unsupported: string[];
  unsupportedDetails: UnsupportedFile[];
}

/* --------------------------------------------------------------- *
 *  archive sniffing — never trust the extension alone             *
 * --------------------------------------------------------------- */

type ArchiveKind = "zip" | "rar" | "rar5" | "7z" | null;

/** real-world .cbz files are very often renamed RAR archives, and
    content providers sometimes return extension-less names — sniff
    the magic bytes instead of trusting the file name */
function sniffArchive(b: Uint8Array): ArchiveKind {
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b) return "zip"; // "PK.."
  if (
    b.length >= 7 &&
    b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 &&
    b[4] === 0x1a && b[5] === 0x07
  ) {
    return b[6] === 0x01 ? "rar5" : "rar"; // "Rar!\x1a\x07" (+01 = RAR5)
  }
  if (
    b.length >= 6 &&
    b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc &&
    b[3] === 0xaf && b[4] === 0x27 && b[5] === 0x1c
  ) {
    return "7z"; // "7z¼¯'\x1c"
  }
  return null;
}

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}

function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** low 32 bits of a 64-bit little-endian value (entries < 4 GB) */
function u64lo(b: Uint8Array, o: number): number {
  return u32(b, o);
}

/** zip64 extra field: recover real sizes when the fixed record says 0xFFFFFFFF */
function zip64Sizes(
  extra: Uint8Array,
  csizeIn: number,
  usizeIn: number
): [number, number] {
  let csize = csizeIn;
  let usize = usizeIn;
  let q = 0;
  while (q + 4 <= extra.length) {
    const id = u16(extra, q);
    const sz = u16(extra, q + 2);
    if (id === 0x0001) {
      let d = q + 4;
      if (usize === 0xffffffff && d + 8 <= q + 4 + sz) {
        usize = u64lo(extra, d);
        d += 8;
      }
      if (csize === 0xffffffff && d + 8 <= q + 4 + sz) {
        csize = u64lo(extra, d);
      }
      break;
    }
    q += 4 + sz;
  }
  return [csize, usize];
}

/** last-resort ZIP walker: parses the central directory itself and inflates
    each member independently, so one odd/unsupported entry doesn't doom the
    whole archive (fflate's unzipSync is all-or-nothing). Also reports
    password-protected members so the UI can say why nothing was readable. */
function salvageZip(buf: Uint8Array): {
  entries: Map<string, Uint8Array>;
  encrypted: number;
  total: number;
} {
  const out = new Map<string, Uint8Array>();
  let encrypted = 0;
  let total = 0;

  // 1) locate EOCD ("PK\x05\x06") scanning backwards (comment ≤ 65535)
  const minEocd = Math.max(0, buf.length - 65535 - 22);
  let eocd = -1;
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { entries: out, encrypted, total };

  let count = u16(buf, eocd + 10);
  let cdSize = u32(buf, eocd + 12);
  let cdOff = u32(buf, eocd + 16);

  // 2) zip64: locator ("PK\x06\x07") sits immediately before the EOCD
  if (count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && u32(buf, loc) === 0x07064b50) {
      const z64 = u32(buf, loc + 8);
      if (z64 + 56 <= buf.length && u32(buf, z64) === 0x06064b50) {
        count = u64lo(buf, z64 + 32);
        cdSize = u64lo(buf, z64 + 40);
        cdOff = u64lo(buf, z64 + 48);
      }
    }
  }

  // 3) walk the central directory
  const end = Math.min(cdOff + cdSize, buf.length);
  let p = cdOff;
  for (let n = 0; n < count && p + 46 <= end; n++) {
    if (u32(buf, p) !== 0x02014b50) break;
    const flags = u16(buf, p + 8);
    const method = u16(buf, p + 10);
    let csize = u32(buf, p + 20);
    const extraLen = u16(buf, p + 30);
    const cmtLen = u16(buf, p + 32);
    const lhoOff = u32(buf, p + 42);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + u16(buf, p + 28)));
    if (csize === 0xffffffff) {
      const extra = buf.subarray(p + 46 + u16(buf, p + 28), p + 46 + u16(buf, p + 28) + extraLen);
      csize = zip64Sizes(extra, csize, 0)[0];
    }
    p += 46 + u16(buf, p + 28) + extraLen + cmtLen;
    total++;
    if ((flags & 0x1) !== 0) {
      encrypted++; // traditional/AES password-protected member
      continue;
    }
    if (lhoOff + 30 > buf.length || u32(buf, lhoOff) !== 0x04034b50) continue;
    const lNameLen = u16(buf, lhoOff + 26);
    const lExtraLen = u16(buf, lhoOff + 28);
    const start = lhoOff + 30 + lNameLen + lExtraLen;
    const stop = start + csize;
    if (stop > buf.length) continue;
    try {
      if (method === 0) out.set(name, buf.slice(start, stop)); // stored
      else if (method === 8) out.set(name, inflateSync(buf.subarray(start, stop))); // deflated
      else continue; // bzip2/lzma/… — skipped, never fatal
    } catch {
      /* broken member — keep salvaging the rest */
    }
  }
  return { entries: out, encrypted, total };
}

function imageNamesOf(entries: Record<string, Uint8Array>): string[] {
  return Object.keys(entries)
    .filter((n) => IMG_RE.test(n) && !n.startsWith("__MACOSX") && !n.split("/").pop()?.startsWith("."))
    .sort(naturalCompare);
}

/** Import user-picked files into the library (LOC-001..005).
    One unreadable/corrupt file must never abort the whole batch. */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const created: Work[] = [];
  const unsupported: string[] = [];
  const unsupportedDetails: UnsupportedFile[] = [];
  const imageFiles: File[] = [];

  const markUnsupported = (name: string, reason: UnsupportedFile["reason"]) => {
    unsupported.push(name);
    unsupportedDetails.push({ name, reason });
  };

  for (const f of files) {
    const name = f.name;
    const lower = name.toLowerCase();
    try {
      if (IMG_RE.test(name)) {
        imageFiles.push(f);
        continue;
      }
      if (/\.(cbz|zip|cbr|rar|7z|cb7)$/.test(lower)) {
        // extension never decides alone — importArchive sniffs the content:
        // renamed RAR/7z get a clear reason, mislabeled CBZ still import
        const res = await importArchive(f);
        if (res.work) created.push(res.work);
        else markUnsupported(name, res.reason ?? "format");
        continue;
      }
      if (/\.(cbt|tar|djvu)$/i.test(name)) {
        markUnsupported(name, "format");
        continue;
      }
      if (/\.pdf$/i.test(name)) {
        const w = await importPdf(f);
        if (w) created.push(w);
        else created.push(makeMetaWork(f, "PDF"));
        continue;
      }
      if (/\.epub$/i.test(name)) {
        const w = await importEpub(f);
        if (w) created.push(w);
        else created.push(makeMetaWork(f, "EPUB"));
        continue;
      }
      // unknown / extension-less names (some content providers strip them):
      // give ZIP-with-images a chance, otherwise refuse cleanly
      const head = new Uint8Array(await f.slice(0, 8).arrayBuffer());
      if (sniffArchive(head) === "zip") {
        const res = await importArchive(f);
        if (res.work) created.push(res.work);
        else markUnsupported(name, res.reason ?? "format");
      } else {
        markUnsupported(name, "format");
      }
    } catch {
      /* corrupt blob / IDB failure for this one file — keep the batch going */
      markUnsupported(name, "corrupt");
    }
  }

  if (imageFiles.length > 0) {
    try {
      const w = await importImageBatch(imageFiles);
      if (w) created.push(w);
    } catch {
      markUnsupported(imageFiles[0]?.name ?? "images", "corrupt");
    }
  }

  return { created, unsupported, unsupportedDetails };
}

async function importImageBatch(files: File[]): Promise<Work | null> {
  const sorted = [...files].sort((a, b) => naturalCompare(a.name, b.name));
  const id = "w-imp-" + Date.now().toString(36);
  const pages: string[] = [];
  let cover = "";
  let i = 0;
  for (const f of sorted) {
    const key = `${id}::p${i}`;
    await putFile(key, f);
    if (i === 0) {
      try {
        cover = await blobToThumbDataUrl(f);
      } catch {
        cover = "";
      }
    }
    pages.push(key);
    i++;
  }
  if (pages.length === 0) return null;
  return {
    id,
    title: stripExt(sorted[0].name) || "Image collection",
    author: "Local",
    cover,
    type: "MANGA",
    description: `Local image collection · ${pages.length} pages`,
    workStatus: "COMPLETED",
    readingStatus: "PLANNED",
    isFavorite: false,
    inVault: false,
    tags: ["Local"],
    rating: 0,
    ratingCount: 0,
    direction: "RTL",
    readerMode: "PAGED",
    fitMode: "WIDTH",
    chapters: [
      {
        id: `${id}-c1`,
        number: 1,
        title: "Pages",
        pages: pages.length,
        releaseDate: new Date().toISOString(),
        isRead: false,
        download: "DONE",
        sizeMb: Math.round((sorted.reduce((a, f) => a + f.size, 0) / 1_048_576) * 10) / 10,
      },
    ],
    addedAt: new Date().toISOString(),
    language: "—",
    isLocal: true,
    localPages: pages,
  };
}

type ArchiveImport = { work?: Work; reason?: UnsupportedFile["reason"] };

async function importArchive(f: File): Promise<ArchiveImport> {
  let buf: Uint8Array;
  try {
    buf = new Uint8Array(await f.arrayBuffer());
  } catch {
    return { reason: "corrupt" };
  }

  // RAR / 7z containers (incl. "CBZ" files that are actually CBR) — be honest
  const kind = sniffArchive(buf);
  if (kind === "rar" || kind === "rar5") return { reason: "cbr" };
  if (kind === "7z") return { reason: "7z" };

  let entries: Record<string, Uint8Array> | null = null;
  let encCount = 0;
  let totalCount = 0;
  if (kind === "zip") {
    try {
      entries = unzipSync(buf);
    } catch {
      entries = null; // exotic zip — try the salvage walker below
    }
    // all-or-nothing unzip produced nothing usable → per-entry salvage pass
    if (!entries || imageNamesOf(entries).length === 0) {
      const salv = salvageZip(buf);
      const salvImages = imageNamesOf(Object.fromEntries(salv.entries));
      const curImages = entries ? imageNamesOf(entries) : [];
      if (salvImages.length > curImages.length) {
        entries = Object.fromEntries(salv.entries);
        encCount = salv.encrypted;
        totalCount = salv.total;
      }
    }
  }
  if (!entries) return { reason: "corrupt" };

  const names = imageNamesOf(entries);
  if (names.length === 0) {
    if (encCount > 0 && totalCount > 0 && encCount >= totalCount) return { reason: "encrypted" };
    return { reason: "noImages" };
  }
  const id = "w-imp-" + Date.now().toString(36);
  const pages: string[] = [];
  let cover = "";
  let totalMb = 0;
  for (let i = 0; i < names.length; i++) {
    const data = entries[names[i]];
    const blob = new Blob([data as unknown as BlobPart]);
    totalMb += data.length / 1_048_576;
    const key = `${id}::p${i}`;
    try {
      await putFile(key, blob);
    } catch {
      /* storage full / IDB hiccup on this page — keep the rest */
      continue;
    }
    if (i === 0) {
      try {
        cover = await blobToThumbDataUrl(blob);
      } catch {
        cover = "";
      }
    }
    pages.push(key);
  }
  if (pages.length === 0) return { reason: "corrupt" };
  return {
    work: {
      id,
      title: stripExt(f.name),
      author: "Local",
      cover,
      type: "COMIC",
      description: `CBZ/ZIP archive · ${pages.length} pages · fully readable offline`,
      workStatus: "COMPLETED",
      readingStatus: "PLANNED",
      isFavorite: false,
      inVault: false,
      tags: ["Local", "CBZ"],
      rating: 0,
      ratingCount: 0,
      direction: "LTR",
      readerMode: "PAGED",
      fitMode: "WIDTH",
      chapters: [
        {
          id: `${id}-c1`,
          number: 1,
          title: "Pages",
          pages: pages.length,
          releaseDate: new Date().toISOString(),
          isRead: false,
          download: "DONE",
          sizeMb: Math.round(totalMb * 10) / 10,
        },
      ],
      addedAt: new Date().toISOString(),
      language: "—",
      isLocal: true,
      localPages: pages,
    },
  };
}

/** Parse a real .pdf into a single-chapter work with canvas-rendered pages (FMT-003). */
async function importPdf(f: File): Promise<Work | null> {
  try {
    const { readPdfMeta } = await import("./pdf-engine");
    const meta = await readPdfMeta(f);
    if (!meta.pages) return null;
    const id = "w-pdf-" + Date.now().toString(36);
    await putFile(`${id}::pdf`, f);
    return {
      id,
      title: meta.title?.slice(0, 120) || stripExt(f.name),
      author: meta.author?.slice(0, 80) || "Local",
      cover: meta.coverDataUrl ?? "",
      coverColor: meta.coverDataUrl ? undefined : "from-red-500 to-rose-900",
      type: "PDF",
      description: `PDF document · ${meta.pages} pages · fully readable offline`,
      workStatus: "COMPLETED",
      readingStatus: "PLANNED",
      isFavorite: false,
      inVault: false,
      tags: ["Local", "PDF"],
      rating: 0,
      ratingCount: 0,
      direction: "LTR",
      readerMode: "PAGED",
      fitMode: "WIDTH",
      chapters: [
        {
          id: `${id}-c1`,
          number: 1,
          title: meta.title?.slice(0, 60) || "Document",
          pages: meta.pages,
          releaseDate: new Date().toISOString(),
          isRead: false,
          download: "DONE",
          sizeMb: Math.round((f.size / 1_048_576) * 10) / 10,
        },
      ],
      addedAt: new Date().toISOString(),
      language: "—",
      isLocal: true,
      localPages: ["pdf"],
    };
  } catch {
    return null;
  }
}

export interface EpubDoc {
  chapters: { id: string; title: string; html: string }[];
}

/** load a parsed EPUB document (chapters as sanitized HTML) from IDB */
export async function loadEpub(workId: string): Promise<EpubDoc | null> {
  const { getFile } = await import("./local-files");
  const blob = await getFile(`${workId}::epub`);
  if (!blob) return null;
  try {
    return JSON.parse(await blob.text()) as EpubDoc;
  } catch {
    return null;
  }
}

/* ---------- EPUB full-text search (RDR-015 parity for books) ---------- */

export interface EpubSearchHit {
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  snippet: string;
  count: number;
}

/** search every chapter of a parsed EPUB; returns one hit per matching chapter */
export async function searchEpubText(
  workId: string,
  rawQuery: string,
  cap = 40
): Promise<EpubSearchHit[]> {
  const doc = await loadEpub(workId);
  if (!doc) return [];
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits: EpubSearchHit[] = [];
  doc.chapters.forEach((ch, idx) => {
    const dom = new DOMParser().parseFromString(ch.html, "text/html");
    dom.querySelectorAll("script,style").forEach((n) => n.remove());
    const text = (dom.body?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) return;
    const lower = text.toLowerCase();
    let count = 0;
    let first = -1;
    let pos = lower.indexOf(q);
    while (pos !== -1) {
      count++;
      if (first === -1) first = pos;
      pos = lower.indexOf(q, pos + q.length);
    }
    if (count > 0 && first >= 0) {
      const start = Math.max(0, first - 34);
      const end = Math.min(text.length, first + q.length + 46);
      const snippet =
        (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
      hits.push({ chapterId: ch.id, chapterIndex: idx, chapterTitle: ch.title, snippet, count });
    }
  });
  return hits.slice(0, cap);
}

/** strip scripts/styles/images/attributes — keeps a safe reading subset of tags */
function sanitizeEpubHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script,style,link,meta,iframe,object,embed,video,audio,svg")
    .forEach((e) => e.remove());
  doc.body.querySelectorAll("*").forEach((el) => {
    // images are pre-rewritten to `oni-img:` keys by the importer — keep them
    if (el.tagName === "IMG" && el.getAttribute("src")?.startsWith("oni-img:")) return;
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
  });
  return doc.body.innerHTML;
}

function xmlText(buf: Uint8Array): string {
  return new TextDecoder("utf-8").decode(buf);
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i + 1) : "";
}

function resolvePath(baseDir: string, href: string): string {
  const clean = href.replace(/^\.\//, "").split("#")[0];
  const parts = (baseDir + clean).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

/** Parse a real .epub (ZIP of XHTML) into readable chapters (FMT-002). */
async function importEpub(f: File): Promise<Work | null> {
  try {
    const buf = new Uint8Array(await f.arrayBuffer());
    const entries = unzipSync(buf);
    const findKey = (suffix: string): string | undefined =>
      Object.keys(entries).find((k) => k.toLowerCase().endsWith(suffix.toLowerCase()));

    // 1) container.xml -> OPF path
    const containerKey = findKey("META-INF/container.xml");
    let opfPath: string | undefined;
    if (containerKey) {
      const cdoc = new DOMParser().parseFromString(xmlText(entries[containerKey]), "text/xml");
      opfPath = cdoc.querySelector("rootfile")?.getAttribute("full-path") ?? undefined;
    }
    if (!opfPath) opfPath = findKey(".opf");
    if (!opfPath || !entries[opfPath]) return null;

    // 2) OPF -> manifest + spine
    const opfDir = dirname(opfPath);
    const opf = new DOMParser().parseFromString(xmlText(entries[opfPath]), "text/xml");
    const manifest = new Map<string, { href: string; type: string }>();
    opf.querySelectorAll("manifest item").forEach((it) => {
      const id = it.getAttribute("id");
      const href = it.getAttribute("href");
      const type = it.getAttribute("media-type") ?? "";
      if (id && href) manifest.set(id, { href, type });
    });
    const spineIds: string[] = [];
    opf.querySelectorAll("spine itemref").forEach((ir) => {
      const idref = ir.getAttribute("idref");
      if (idref) spineIds.push(idref);
    });
    if (spineIds.length === 0) return null;

    // 3) cover image (OPF cover-item / meta[name=cover] / cover-named image)
    const id = "w-epub-" + Date.now().toString(36);
    let cover = "";
    {
      const coverMeta = opf.querySelector('metadata meta[name="cover"]')?.getAttribute("content");
      let coverHref =
        (coverMeta ? manifest.get(coverMeta)?.href : undefined) ??
        [...manifest.values()].find(
          (m) => /^image\/(jpe?g|png|webp)$/.test(m.type) && /cover/i.test(m.href)
        )?.href ??
        [...manifest.values()].find((m) => m.type.startsWith("image/") && /cover/i.test(m.href))?.href;
      const coverIdFromProps = opf.querySelector('manifest item[properties~="cover-item"]')?.getAttribute("id");
      if (!coverHref && coverIdFromProps) coverHref = manifest.get(coverIdFromProps)?.href;
      if (coverHref) {
        const data = entries[resolvePath(opfDir, coverHref)];
        if (data) {
          try {
            cover = await blobToThumbDataUrl(new Blob([data as unknown as BlobPart]));
          } catch {
            cover = "";
          }
        }
      }
    }

    // 4) extract + sanitize chapters (embedded images are stored in IDB)
    const chapters: { id: string; title: string; html: string }[] = [];
    const meta: { id: string; title: string }[] = [];
    let imgSeq = 0;
    for (let i = 0; i < spineIds.length; i++) {
      const item = manifest.get(spineIds[i]);
      if (!item || !/x?html/.test(item.type)) continue;
      const path = resolvePath(opfDir, item.href);
      const raw = entries[path];
      if (!raw) continue;
      const doc = new DOMParser().parseFromString(xmlText(raw), "text/html");
      doc.querySelectorAll("script,style,link,meta,iframe,object,embed,svg").forEach((e) => e.remove());
      // rewrite <img src> to oni-img:<idb-key> (resolved to object URLs at render time)
      for (const img of [...doc.querySelectorAll("img")]) {
        const src = img.getAttribute("src");
        if (!src || src.startsWith("data:")) {
          if (!src) img.remove();
          continue;
        }
        const imgPath = resolvePath(dirname(path), src);
        const data = entries[imgPath];
        if (!data) {
          img.remove();
          continue;
        }
        const key = `${id}::i${imgSeq++}`;
        await putFile(key, new Blob([data as unknown as BlobPart]));
        for (const a of [...img.attributes]) img.removeAttribute(a.name);
        const alt = imgPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
        img.setAttribute("src", `oni-img:${key}`);
        img.setAttribute("alt", alt);
        img.setAttribute("loading", "lazy");
      }
      const title =
        doc.querySelector("h1,h2,h3")?.textContent?.trim() ||
        doc.querySelector("title")?.textContent?.trim() ||
        `Chapter ${chapters.length + 1}`;
      const html = sanitizeEpubHtml(doc.body.innerHTML);
      const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
      if (words < 8 && chapters.length > 0) continue; // skip near-empty cover/TOC pages
      const cid = `${id}-e${chapters.length}`;
      chapters.push({ id: cid, title: title.slice(0, 120), html });
      meta.push({ id: cid, title: title.slice(0, 120) });
    }
    if (chapters.length === 0) return null;

    // 5) store doc in IDB
    await putFile(`${id}::epub`, new Blob([JSON.stringify({ chapters })], { type: "application/json" }));

    // 6) build work (chapters mirror the spine for list/progress/read state)
    const chapterWords = (html: string) => html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    const wordCount = chapters.reduce((a, c) => a + chapterWords(c.html), 0);
    const DC_NS = "http://purl.org/dc/elements/1.1/";
    const bookTitle =
      opf.getElementsByTagNameNS(DC_NS, "title")[0]?.textContent?.trim() ||
      opf.querySelector("metadata title")?.textContent?.trim() ||
      stripExt(f.name);
    const bookAuthor =
      opf.getElementsByTagNameNS(DC_NS, "creator")[0]?.textContent?.trim() ||
      "Local";
    return {
      id,
      title: bookTitle.slice(0, 120),
      author: bookAuthor.slice(0, 80),
      cover,
      coverColor: cover ? undefined : "from-amber-500 to-orange-900",
      type: "EPUB",
      description: `EPUB book \u00b7 ${chapters.length} chapters \u00b7 ~${Math.round(wordCount / 220)} pages \u00b7 fully readable offline`,
      workStatus: "COMPLETED",
      readingStatus: "PLANNED",
      isFavorite: false,
      inVault: false,
      tags: ["Local", "EPUB"],
      rating: 0,
      ratingCount: 0,
      direction: "LTR",
      readerMode: "CONTINUOUS",
      fitMode: "WIDTH",
      chapters: chapters.map((c, i) => ({
        id: c.id,
        number: i + 1,
        title: c.title,
        pages: Math.max(1, Math.round(chapterWords(c.html) / 220)),
        releaseDate: new Date().toISOString(),
        isRead: false,
        download: "DONE" as const,
        sizeMb: Math.max(0.1, Math.round((c.html.length / 1_048_576) * 100) / 100),
      })),
      addedAt: new Date().toISOString(),
      language: "\u2014",
      isLocal: true,
      localPages: ["epub"],
      epubChapters: meta,
    };
  } catch {
    return null;
  }
}

function makeMetaWork(f: File, type: "PDF" | "EPUB"): Work {
  const id = "w-imp-" + Date.now().toString(36) + type.toLowerCase();
  const pages = 24 + Math.floor(Math.random() * 200);
  return {
    id,
    title: stripExt(f.name),
    author: "Local",
    cover: "",
    coverColor: type === "PDF" ? "from-red-500 to-rose-900" : "from-amber-500 to-orange-900",
    type,
    description: `${f.name} · ${(f.size / 1_048_576).toFixed(1)} MB — imported ${
      type === "PDF" ? "PDF document" : "EPUB book"
    } (demo reader in this build)`,
    workStatus: "COMPLETED",
    readingStatus: "PLANNED",
    isFavorite: false,
    inVault: false,
    tags: ["Local", type],
    rating: 0,
    ratingCount: 0,
    direction: "LTR",
    readerMode: "PAGED",
    fitMode: "WIDTH",
    chapters: [
      {
        id: `${id}-c1`,
        number: 1,
        title: "Document",
        pages,
        releaseDate: new Date().toISOString(),
        isRead: false,
        download: "DONE",
        sizeMb: Math.round((f.size / 1_048_576) * 10) / 10,
      },
    ],
    addedAt: new Date().toISOString(),
    language: "—",
    isLocal: true,
  };
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

/** load a stored page blob as object url (reader uses this) */
export async function loadPageUrl(key: string): Promise<string | null> {
  const { getFile } = await import("./local-files");
  const blob = await getFile(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
