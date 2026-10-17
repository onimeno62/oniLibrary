"use client";

import { unzipSync } from "fflate";
import { putFile, blobToThumbDataUrl } from "./local-files";
import type { Work } from "./types";

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp)$/i;

function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export interface ImportResult {
  created: Work[];
  unsupported: string[];
}

/** Import user-picked files into the library (LOC-001..005).
    One unreadable/corrupt file must never abort the whole batch. */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const created: Work[] = [];
  const unsupported: string[] = [];
  const imageFiles: File[] = [];

  for (const f of files) {
    const name = f.name;
    try {
      if (IMG_RE.test(name)) {
        imageFiles.push(f);
        continue;
      }
      if (/\.cbz$|\.zip$/i.test(name)) {
        const w = await importArchive(f);
        if (w) created.push(w);
        else unsupported.push(name);
        continue;
      }
      if (/\.(cbr|rar|7z|cb7|cbt|tar|djvu)$/i.test(name)) {
        unsupported.push(name);
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
      unsupported.push(name);
    } catch {
      /* corrupt blob / IDB failure for this one file — keep the batch going */
      unsupported.push(name);
    }
  }

  if (imageFiles.length > 0) {
    try {
      const w = await importImageBatch(imageFiles);
      if (w) created.push(w);
    } catch {
      unsupported.push(imageFiles[0]?.name ?? "images");
    }
  }

  return { created, unsupported };
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

async function importArchive(f: File): Promise<Work | null> {
  try {
    const buf = new Uint8Array(await f.arrayBuffer());
    const entries = unzipSync(buf);
    const names = Object.keys(entries)
      .filter((n) => IMG_RE.test(n) && !n.startsWith("__MACOSX"))
      .sort(naturalCompare);
    if (names.length === 0) return null;
    const id = "w-imp-" + Date.now().toString(36);
    const pages: string[] = [];
    let cover = "";
    let totalMb = 0;
    for (let i = 0; i < names.length; i++) {
      const data = entries[names[i]];
      const blob = new Blob([data as unknown as BlobPart]);
      totalMb += data.length / 1_048_576;
      const key = `${id}::p${i}`;
      await putFile(key, blob);
      if (i === 0) {
        try {
          cover = await blobToThumbDataUrl(blob);
        } catch {
          cover = "";
        }
      }
      pages.push(key);
    }
    return {
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
    };
  } catch {
    return null;
  }
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
