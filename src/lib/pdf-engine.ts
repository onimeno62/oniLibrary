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

/* ------------------------------------------------------------------ */
/* exact-position match rects (round 9 — textLayer-style overlay)      */
/* ------------------------------------------------------------------ */

export interface PdfMatchRect {
  /** axis-aligned rect in UNROTATED, scale-1 PDF user space (y grows up) */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** per-(work,page,query) rect cache — workId → page → query → rects */
const rectCache = new Map<string, Map<number, Map<string, Promise<PdfMatchRect[]>>>>();

/** drop cached rects for a work (call when the work is removed/re-imported) */
export function dropPdfRects(workId: string): void {
  rectCache.delete(workId);
}

/**
 * Compute highlight rectangles for every occurrence of `query` on one page.
 * Lightweight textLayer equivalent: proportional char slicing per text item.
 * Rects are in unrotated scale-1 user space — the caller converts them with
 * the SAME viewport used for canvas rendering (convertToViewportRectangle),
 * so rotation/zoom stay in sync for free.
 */
export function getPdfPageMatches(
  workId: string,
  page: number, // 1-based
  rawQuery: string
): Promise<PdfMatchRect[]> {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return Promise.resolve([]);

  let pageMap = rectCache.get(workId);
  if (!pageMap) {
    pageMap = new Map();
    rectCache.set(workId, pageMap);
  }
  const cached = pageMap.get(page)?.get(q);
  if (cached) return cached;

  const p = (async () => {
    try {
      const doc = await loadPdfDoc(workId);
      const pdfPage = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
      const tc = await pdfPage.getTextContent();
      const rects: PdfMatchRect[] = [];
      let budget = 200;
      for (const item of tc.items) {
        if (!("str" in item) || budget <= 0) continue;
        const str = item.str;
        if (!str || str.length === 0) continue;
        const lower = str.toLowerCase();
        // pdf.js text items: width/height already in user space,
        // transform[4..5] = (x, y) of the baseline origin
        const w = item.width;
        const h = item.height;
        const e = item.transform[4];
        const f = item.transform[5];
        const charW = str.length > 0 ? w / str.length : 0;
        let from = 0;
        for (;;) {
          const at = lower.indexOf(q, from);
          if (at < 0) break;
          const x1 = e + at * charW;
          const x2 = e + (at + q.length) * charW;
          rects.push({
            x1,
            x2,
            // baseline at y=f → cover ascent + descender band
            y1: f - h * 0.22,
            y2: f + h * 0.92,
          });
          budget--;
          from = at + q.length;
          if (budget <= 0) break;
        }
      }
      return rects;
    } catch {
      return [];
    }
  })();

  if (!pageMap.get(page)) pageMap.set(page, new Map());
  pageMap.get(page)!.set(q, p);
  p.catch(() => {
    pageMap?.get(page)?.delete(q);
  });
  return p;
}

export interface PdfSearchHit {
  page: number; // 1-based
  snippet: string; // trimmed context around the first match on that page
  count: number; // ALL matches on this page (drives find-bar prev/next)
}

/**
 * Best-effort plain text of the area covered by a user-space rect
 * (round 11 — PDF highlights): collects every text item whose baseline
 * origin + horizontal span intersects the rect, top-to-bottom. Used to
 * caption saved rectangle highlights in the highlights manager.
 */
export async function getPdfTextInRect(
  workId: string,
  page: number, // 1-based
  rect: { x1: number; y1: number; x2: number; y2: number }
): Promise<string> {
  try {
    const doc = await loadPdfDoc(workId);
    const pdfPage = await doc.getPage(Math.max(1, Math.min(doc.numPages, page)));
    const tc = await pdfPage.getTextContent();
    const lo = Math.min(rect.y1, rect.y2);
    const hi = Math.max(rect.y1, rect.y2);
    const l = Math.min(rect.x1, rect.x2);
    const r = Math.max(rect.x1, rect.x2);
    const hits: { y: number; str: string; x: number }[] = [];
    for (const item of tc.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      const w = item.width;
      if (y + item.height * 0.8 < lo || y - item.height * 0.3 > hi) continue;
      if (x + w < l || x > r) continue;
      hits.push({ y, x, str: item.str });
    }
    hits.sort((a, b) => b.y - a.y || a.x - b.x);
    return hits
      .map((h) => h.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
  } catch {
    return "";
  }
}

/** page text for read-aloud (1-based page) — cached with the search index */
export async function getPdfPageText(workId: string, page: number): Promise<string> {
  const pages = await getPdfPageTexts(workId);
  return pages[page - 1] ?? "";
}

export async function searchPdfText(workId: string, rawQuery: string): Promise<PdfSearchHit[]> {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  const pages = await getPdfPageTexts(workId);
  const hits: PdfSearchHit[] = [];
  let budget = 2000; // global match-counting cap (perf guard)
  for (let i = 0; i < pages.length; i++) {
    const lower = pages[i].toLowerCase();
    let from = 0;
    let count = 0;
    let snippet = "";
    for (;;) {
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
      if (--budget <= 0) break;
    }
    if (count > 0) {
      hits.push({ page: i + 1, snippet, count });
      if (hits.length >= 80) break;
    }
    if (budget <= 0) break;
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
