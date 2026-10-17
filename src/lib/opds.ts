"use client";

/**
 * OPDS catalog client (v1.2.0) — browse & import from self-hosted servers
 * (Calibre-Web, Komga, Kavita, Ubooquity…).
 *
 * Transport strategy:
 *  - inside the Android shell, `OniAndroid.httpGetString` (no CORS limits)
 *    fetches feeds; binaries go through `OniAndroid.fetchToCache` which stages
 *    the download and reuses the app's chunked import bridge;
 *  - in a plain browser we fall back to fetch() (works when the server sends
 *    CORS headers, and in dev sandboxes that route through the gateway).
 */

import type { ServerEntry } from "./types";

/* ---------------- bridge transport ---------------- */

interface OniHttpBridge {
  httpGetString?: (url: string, headersJson: string) => string | null;
  fetchToCache?: (url: string) => string | null;
  pendingImportInfo?: () => string | null;
  readImportChunk?: (offset: number, length: number) => string;
  clearPendingImport?: () => void;
}

function bridge(): OniHttpBridge | undefined {
  return (window as unknown as { OniAndroid?: OniHttpBridge }).OniAndroid;
}

export async function opdsFetchText(url: string): Promise<string> {
  const b = bridge();
  if (b?.httpGetString) {
    try {
      const s = b.httpGetString(url, "{}");
      if (s !== null && s !== undefined) return s;
    } catch {
      /* fall through to fetch */
    }
  }
  const r = await fetch(url, { headers: { Accept: "application/atom+xml" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

/** download a binary (cover / acquisition file) as a File, via cache bridge or fetch */
export async function opdsFetchBinary(
  url: string,
  fallbackName: string
): Promise<File | null> {
  const b = bridge();
  if (b?.fetchToCache) {
    try {
      const manifest = b.fetchToCache(url);
      if (manifest && manifest !== "null") {
        const info = JSON.parse(manifest) as { name: string; mime: string; size: number };
        const CHUNK = 96 * 1024;
        const chunks: Uint8Array[] = [];
        for (let off = 0; off < info.size; off += CHUNK) {
          const b64 = b.readImportChunk?.(off, CHUNK) ?? "";
          if (!b64) break;
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          chunks.push(arr);
          if (chunks.reduce((a, c) => a + c.length, 0) > 1024 * 1024 * 1024) break;
        }
        b.clearPendingImport?.();
        const total = chunks.reduce((a, c) => a + c.length, 0);
        if (total > 0) {
          return new File(chunks as unknown as BlobPart[], info.name || fallbackName, {
            type: info.mime || "application/octet-stream",
          });
        }
        return null;
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    const name = url.split("/").pop()?.split("?")[0] || fallbackName;
    return new File([blob], name, { type: blob.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

/* ---------------- feed parsing ---------------- */

export interface OpdsLink {
  rel: string;
  href: string;
  type: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  author: string;
  summary: string;
  coverUrl: string; // thumbnail href (absolute)
  acquisitionUrl: string; // preferred downloadable file (absolute)
  acquisitionMime: string;
}

export interface OpdsFeed {
  title: string;
  entries: OpdsEntry[];
  nextUrl: string | null;
}

function absUrl(base: string, href: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

export function parseOpdsFeed(xml: string, baseUrl: string): OpdsFeed {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("bad xml");
  const feed = doc.querySelector("feed");
  if (!feed) throw new Error("not a feed");

  const title =
    feed.getElementsByTagName("title")[0]?.textContent?.trim() || "Catalog";

  const nextUrl =
    [...feed.querySelectorAll("link")].find((l) => l.getAttribute("rel") === "next")?.getAttribute("href") ?? null;

  const entries: OpdsEntry[] = [...feed.querySelectorAll("entry")].map((e) => {
    const id = e.getElementsByTagName("id")[0]?.textContent?.trim() ?? "";
    const title = e.getElementsByTagName("title")[0]?.textContent?.trim() ?? "Untitled";
    const author = e.getElementsByTagName("author")[0]?.getElementsByTagName("name")[0]?.textContent?.trim() ?? "";
    const summary =
      e.getElementsByTagName("summary")[0]?.textContent?.trim() ||
      e.getElementsByTagName("content")[0]?.textContent?.trim() ||
      "";
    const links: OpdsLink[] = [...e.querySelectorAll("link")].map((l) => ({
      rel: l.getAttribute("rel") ?? "",
      href: l.getAttribute("href") ?? "",
      type: l.getAttribute("type") ?? "",
    }));
    const thumb =
      links.find((l) => l.rel === "http://opds-spec.org/image/thumbnail") ??
      links.find((l) => l.rel === "http://opds-spec.org/image");
    const acq =
      links.find(
        (l) =>
          l.rel === "http://opds-spec.org/acquisition" &&
          /\.(cbz|zip|cbr|rar|pdf|epub)/i.test(l.href)
      ) ??
      links.find((l) => l.rel === "http://opds-spec.org/acquisition" && /vnd\.comicbook|zip|rar|pdf|epub/i.test(l.type)) ??
      links.find((l) => l.rel === "http://opds-spec.org/acquisition");
    return {
      id,
      title,
      author,
      summary,
      coverUrl: thumb ? absUrl(baseUrl, thumb.href) : "",
      acquisitionUrl: acq ? absUrl(baseUrl, acq.href) : "",
      acquisitionMime: acq?.type ?? "",
    };
  });

  return { title, entries, nextUrl: nextUrl ? absUrl(baseUrl, nextUrl) : null };
}

/** ping a catalog: returns the feed title, or throws */
export async function testOpdsCatalog(entry: ServerEntry): Promise<string> {
  const url = entry.url.trim();
  const xml = await opdsFetchText(url);
  const feed = parseOpdsFeed(xml, url);
  return feed.title;
}
