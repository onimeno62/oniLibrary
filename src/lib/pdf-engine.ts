"use client";

/* ============================================================
   oniLibrary — PDF engine (FMT-003)
   Lazy-loads pdfjs-dist in the client, caches documents per
   work and renders pages to canvas at device-pixel density.
   The raw .pdf blob lives in IndexedDB (`{workId}::pdf`).
   ============================================================ */

import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
type DocTask = ReturnType<PdfJs["getDocument"]>;

let libPromise: Promise<PdfJs> | null = null;

async function getLib(): Promise<PdfJs> {
  if (!libPromise) {
    libPromise = import("pdfjs-dist").then((mod) => {
      // relative to the document base → works on the dev server (/pdf/…)
      // and inside the APK (assets root → /assets/pdf/…)
      mod.GlobalWorkerOptions.workerSrc = new URL(
        "pdf/pdf.worker.min.mjs",
        document.baseURI
      ).toString();
      return mod;
    });
  }
  return libPromise;
}

/** per-document option bundle (urls resolved against the document base) */
function docOptions() {
  return {
    isEvalSupported: false as const,
    wasmUrl: new URL("pdf-wasm/", document.baseURI).toString(),
  };
}

const docCache = new Map<string, Promise<PDFDocumentProxy>>();
const taskCache = new Map<string, DocTask>();

/** open (and cache) the PDF stored for a work */
export function loadPdfDoc(workId: string): Promise<PDFDocumentProxy> {
  let p = docCache.get(workId);
  if (!p) {
    const task = (async () => {
      const { getFile } = await import("./local-files");
      const blob = await getFile(`${workId}::pdf`);
      if (!blob) throw new Error("pdf-missing");
      const lib = await getLib();
      const data = new Uint8Array(await blob.arrayBuffer());
      return lib.getDocument({ data, ...docOptions() });
    })()
      .then((t) => {
        taskCache.set(workId, t);
        return t.promise;
      })
      .catch((err) => {
        docCache.delete(workId);
        taskCache.delete(workId);
        throw err;
      });
    docCache.set(workId, task);
    p = task;
  }
  return p;
}

export function dropPdfDoc(workId: string): void {
  docCache.delete(workId);
  const t = taskCache.get(workId);
  taskCache.delete(workId);
  void t?.destroy().catch(() => undefined);
}

/** render one page (1-based) onto a canvas sized to cssWidth */
export async function renderPdfPage(opts: {
  canvas: HTMLCanvasElement;
  doc: PDFDocumentProxy;
  page: number; // 1-based
  cssWidth: number;
  rotation?: number; // 0/90/180/270
}): Promise<void> {
  const { canvas, doc, page, cssWidth, rotation = 0 } = opts;
  const p = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
  const unit = p.getViewport({ scale: 1, rotation });
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssScale = cssWidth > 0 ? cssWidth / unit.width : 1;
  const vp = p.getViewport({ scale: cssScale * dpr, rotation });
  canvas.width = Math.max(1, Math.floor(vp.width));
  canvas.height = Math.max(1, Math.floor(vp.height));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("canvas-2d-unavailable");
  await p.render({ canvas, viewport: vp }).promise;
}

export interface PdfMeta {
  pages: number;
  title?: string;
  author?: string;
  coverDataUrl?: string;
}

export interface PdfTocItem {
  title: string;
  page: number; // 1-based
  depth: number; // nesting depth (0 = top level)
}

/** resolve the document outline (TOC) to page numbers — [] when absent */
export async function getPdfToc(workId: string): Promise<PdfTocItem[]> {
  try {
    const doc = await loadPdfDoc(workId);
    const outline = (await doc.getOutline()) ?? [];
    const out: PdfTocItem[] = [];
    const walk = async (
      items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>,
      depth: number
    ): Promise<void> => {
      for (const it of items ?? []) {
        let page: number | null = null;
        try {
          let dest: unknown = it.dest;
          if (typeof dest === "string") dest = await doc.getDestination(dest);
          if (Array.isArray(dest)) {
            const ref = dest[0];
            if (ref && typeof ref === "object" && "num" in (ref as object)) {
              page = (await doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0])) + 1;
            } else if (typeof ref === "number") {
              page = ref + 1;
            }
          }
        } catch {
          /* unresolvable destination → fall back to page 1 */
        }
        if (it.title?.trim()) out.push({ title: it.title.trim(), page: page ?? 1, depth });
        if (it.items?.length && depth < 3) await walk(it.items, depth + 1);
      }
    };
    await walk(outline, 0);
    return out;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* full-text search (RDR-015)                                          */
/* ------------------------------------------------------------------ */

/** per-page plain text cache: workId → string per page (1-based → index-1) */
const textCache = new Map<string, Promise<string[]>>();

/** drop cached page text (call when a work is removed/imported anew) */
export function dropPdfText(workId: string): void {
  textCache.delete(workId);
}

/** extract (and cache) the text of every page via pdf.js getTextContent */
async function getPdfPageTexts(workId: string): Promise<string[]> {
  let p = textCache.get(workId);
  if (!p) {
    p = (async () => {
      const doc = await loadPdfDoc(workId);
      const pages: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        pages.push(
          tc.items
            .map((it) => ("str" in it ? it.str : ""))
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        );
      }
      return pages;
    })().catch((err) => {
      textCache.delete(workId);
      throw err;
    });
    textCache.set(workId, p);
  }
  return p;
}

export interface PdfSearchHit {
  page: number; // 1-based
  snippet: string; // trimmed context around the first match on that page
  count: number; // matches on this page (first 3 counted per page)
}

/** search the whole document — up to 3 snippet hits per page, 80 pages capped */
export async function searchPdfText(workId: string, rawQuery: string): Promise<PdfSearchHit[]> {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  const pages = await getPdfPageTexts(workId);
  const hits: PdfSearchHit[] = [];
  for (let i = 0; i < pages.length; i++) {
    const lower = pages[i].toLowerCase();
    let from = 0;
    let count = 0;
    let snippet = "";
    while (count < 3) {
      const at = lower.indexOf(q, from);
      if (at < 0) break;
      if (count === 0) {
        const start = Math.max(0, at - 42);
        const end = Math.min(pages[i].length, at + q.length + 46);
        snippet = `${start > 0 ? "…" : ""}${pages[i].slice(start, end).replace(/\s+/g, " ")}${
          end < pages[i].length ? "…" : ""
        }`;
      }
      from = at + q.length;
      count++;
    }
    if (count > 0) {
      hits.push({ page: i + 1, snippet, count });
      if (hits.length >= 80) break;
    }
  }
  return hits;
}

/** parse a PDF blob: page count, info metadata and a small cover thumbnail */
export async function readPdfMeta(blob: Blob): Promise<PdfMeta> {
  const lib = await getLib();
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = lib.getDocument({ data, ...docOptions() });
  const doc = await task.promise;
  let title: string | undefined;
  let author: string | undefined;
  try {
    const info = (await doc.getMetadata()).info as {
      Title?: string;
      Author?: string;
    };
    title = info.Title?.trim() || undefined;
    author = info.Author?.trim() || undefined;
  } catch {
    /* metadata optional */
  }
  let coverDataUrl: string | undefined;
  try {
    const p = await doc.getPage(1);
    const base = p.getViewport({ scale: 1 });
    const targetW = 320;
    const vp = p.getViewport({ scale: targetW / base.width });
    const cv = document.createElement("canvas");
    cv.width = Math.ceil(vp.width);
    cv.height = Math.ceil(vp.height);
    const ctx = cv.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      await p.render({ canvas: cv, viewport: vp }).promise;
      coverDataUrl = cv.toDataURL("image/jpeg", 0.82);
    }
  } catch {
    /* cover optional */
  }
  const pages = doc.numPages;
  void task.destroy();
  return { pages, title, author, coverDataUrl };
}
