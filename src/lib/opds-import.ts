"use client";

/**
 * OPDS acquisition → local work (v1.2.0, extracted for reuse in v1.2.2 so
 * the Discover catalog screen and the global search can import entries with
 * the exact same pipeline as the Servers screen).
 *   - cbz/zip/cbr/rar → image work (one chapter)
 *   - pdf → PDF document work · epub → EPUB document work
 * Throws on failure; screens turn errors into toasts.
 */

import type { Work } from "./types";
import type { ServerEntry } from "./types";
import type { OpdsEntry } from "./opds";
import { opdsFetchBinary } from "./opds";
import { extractArchiveImages } from "./importer";
import { importPdf, importEpub } from "./importer";
import { putFile, blobToThumbDataUrl } from "./local-files";

export async function importOpdsEntry(
  srv: ServerEntry,
  entry: OpdsEntry,
  coverDataUrl?: string
): Promise<Work> {
  if (!entry.acquisitionUrl) throw new Error("no acquisition link");

  let work: Work | null = null;
  const lower = entry.acquisitionUrl.toLowerCase();
  const isPdf = /\.pdf(\?|$)/.test(lower) || entry.acquisitionMime === "application/pdf";
  const isEpub = /\.epub(\?|$)/.test(lower) || entry.acquisitionMime === "application/epub+zip";

  if (isPdf || isEpub) {
    const f = await opdsFetchBinary(entry.acquisitionUrl, `${entry.title}.${isPdf ? "pdf" : "epub"}`);
    if (!f) throw new Error("download failed");
    work = isPdf ? await importPdf(f) : await importEpub(f);
    if (work) {
      // document metadata yields to the OPDS entry
      work = {
        ...work,
        title: entry.title.slice(0, 120) || work.title,
        author: entry.author || work.author,
        description: entry.summary || work.description,
        tags: Array.from(new Set([...work.tags, "OPDS", srv.name])),
        sourceUrl: entry.acquisitionUrl,
      };
    }
  } else {
    const f = await opdsFetchBinary(entry.acquisitionUrl, `${entry.title}.cbz`);
    if (!f) throw new Error("download failed");
    const res = await extractArchiveImages(f);
    if (!res.ok) throw new Error(res.reason);
    const id = "w-opds-" + Date.now().toString(36);
    const keys: string[] = [];
    let sizeMb = 0;
    for (let i = 0; i < res.images.length; i++) {
      const key = `${id}::p${i}`;
      try {
        await putFile(key, res.images[i].blob);
      } catch {
        continue;
      }
      sizeMb += res.images[i].blob.size / 1_048_576;
      keys.push(key);
    }
    let firstCover = coverDataUrl ?? "";
    if (!firstCover && entry.coverUrl) {
      const cf = await opdsFetchBinary(entry.coverUrl, "cover");
      if (cf) firstCover = await blobToThumbDataUrl(cf).catch(() => "");
    }
    if (!firstCover && keys.length > 0) {
      firstCover = await blobToThumbDataUrl(res.images[0].blob).catch(() => "");
    }
    work = {
      id,
      title: entry.title.slice(0, 120),
      author: entry.author || srv.name,
      cover: firstCover,
      type: "MANGA",
      description: entry.summary || `${entry.title} — imported from ${srv.name} (OPDS)`,
      workStatus: "COMPLETED",
      readingStatus: "PLANNED",
      isFavorite: false,
      inVault: false,
      tags: ["OPDS", srv.name],
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
          pages: keys.length,
          releaseDate: new Date().toISOString(),
          isRead: false,
          download: "DONE",
          sizeMb: Math.round(sizeMb * 10) / 10,
        },
      ],
      addedAt: new Date().toISOString(),
      language: "—",
      isLocal: true,
      localPages: keys,
      sourceUrl: entry.acquisitionUrl,
    };
  }

  if (!work) throw new Error("parse failed");
  return work;
}
