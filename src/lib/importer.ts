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

/** Import user-picked files into the library (LOC-001..005). */
export async function importFiles(files: File[]): Promise<ImportResult> {
  const created: Work[] = [];
  const unsupported: string[] = [];
  const imageFiles: File[] = [];

  for (const f of files) {
    const name = f.name;
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
      created.push(makeMetaWork(f, "PDF"));
      continue;
    }
    if (/\.epub$/i.test(name)) {
      created.push(makeMetaWork(f, "EPUB"));
      continue;
    }
    unsupported.push(name);
  }

  if (imageFiles.length > 0) {
    const w = await importImageBatch(imageFiles);
    if (w) created.push(w);
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
