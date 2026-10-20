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

/* ---------------- typed transport errors (plan §5 SourceResult) ---------------- */

export type SourceErrorKind = "timeout" | "http" | "network" | "parse";

/** Typed failure for every remote read — screens can branch on `kind`
 *  (offline vs server error vs timeout) instead of string matching. */
export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly status?: number;
  constructor(kind: SourceErrorKind, message: string, status?: number) {
    super(message);
    this.name = "SourceError";
    this.kind = kind;
    this.status = status;
  }
}

/** Default deadline for every remote read (plan §7: "Apply request timeouts"). */
export const REMOTE_TIMEOUT_MS = 15_000;

/** Race any promise against a deadline; rejects with a SourceError("timeout").
 *  (The browser fetch path aborts the socket for real via AbortSignal; the
 *  native bridge call is synchronous, so there the deadline only releases
 *  the *caller* — see opdsFetchText.) */
export function withDeadline<T>(
  p: PromiseLike<T>,
  ms: number = REMOTE_TIMEOUT_MS,
  label = "request"
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new SourceError("timeout", `${label} timed out after ${ms}ms`)),
      ms
    );
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function classifyFetchError(e: unknown, nativeReason: string | null): Error {
  if (e instanceof SourceError) return e;
  const reason = nativeReason || (e instanceof Error ? e.message : String(e));
  const m = /^HTTP (\d{3})$/.exec(reason || "");
  if (m) return new SourceError("http", reason, Number(m[1]));
  if (/timed out|timeout/i.test(reason || "")) return new SourceError("timeout", reason);
  return new SourceError("network", reason || "network error");
}

/* ---------------- bridge transport ---------------- */

interface OniHttpBridge {
  httpGetString?: (url: string, headersJson: string) => string | null;
  fetchToCache?: (url: string) => string | null;
  /** v1.4.0 — readable reason of the last failed native fetch (null when the
      last fetch succeeded); surfaces real TLS/DNS/HTTP causes in toasts */
  lastHttpError?: () => string | null;
  pendingImportInfo?: () => string | null;
  readImportChunk?: (offset: number, length: number) => string;
  clearPendingImport?: () => void;
  /** Phase 4 (A2) — token-addressed staged downloads: a cover fetch can no
      longer steal the single import slot from an in-flight user import */
  readStagedChunk?: (token: string, offset: number, length: number) => string;
  clearStagedFile?: (token: string) => void;
  /** Phase 4 (B6) — ConnectivityManager verdict for the Wi-Fi-only policy */
  isMetered?: () => boolean;
}

function bridge(): OniHttpBridge | undefined {
  if (typeof window === "undefined") return undefined; // SSR / tests
  return (window as unknown as { OniAndroid?: OniHttpBridge }).OniAndroid;
}

/** HTTP Basic header pair for catalogs that ask for credentials
    (Standard Ebooks free account). UTF-8 safe (RFC 7617 charset). */
export function authHeaders(auth?: { user: string; pass: string } | null): Record<string, string> {
  if (!auth || !auth.user) return {};
  const raw = `${auth.user}:${auth.pass ?? ""}`;
  const bytes = new TextEncoder().encode(raw);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return { Authorization: `Basic ${btoa(bin)}` };
}

export async function opdsFetchText(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs: number = REMOTE_TIMEOUT_MS
): Promise<string> {
  const b = bridge();
  if (b?.httpGetString) {
    // bridge present: it is the authoritative transport inside the APK.
    // A null/throwing return is a REAL failure (TLS/DNS/HTTP) — do NOT
    // fall through to window.fetch here, that call always CORS-fails in
    // the WebView and only doubles the latency (Phase 1 finding O4).
    try {
      const s = b.httpGetString(url, JSON.stringify(headers));
      if (s !== null && s !== undefined) return s;
    } catch {
      /* handled below via lastHttpError */
    }
    const native = b.lastHttpError?.() ?? null;
    throw classifyFetchError(new Error(native || "bridge fetch failed"), native);
  }
  // plain browser (PWA/dev): real deadline via AbortSignal when available
  try {
    const signal =
      typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
    const r = await fetch(url, { headers: { Accept: "application/atom+xml", ...headers }, signal });
    if (!r.ok) throw new SourceError("http", `HTTP ${r.status}`, r.status);
    return await withDeadline(r.text(), timeoutMs, "read");
  } catch (e) {
    if (e instanceof SourceError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new SourceError("timeout", `request timed out after ${timeoutMs}ms`);
    }
    throw classifyFetchError(e, null);
  }
}

/** download a binary (cover / acquisition file) as a File, via cache bridge or fetch */
export async function opdsFetchBinary(
  url: string,
  fallbackName: string,
  headers: Record<string, string> = {}
): Promise<File | null> {
  const b = bridge();
  if (b?.fetchToCache) {
    try {
      // v1.3.0: 2-arg overload carries auth headers (Standard Ebooks); the
      // native side keeps the 1-arg variant for old call sites
      const manifest =
        Object.keys(headers).length > 0
          ? (b.fetchToCache as (u: string, h?: string) => string | null)(url, JSON.stringify(headers))
          : b.fetchToCache(url);
      if (manifest && manifest !== "null") {
        const info = JSON.parse(manifest) as { name: string; mime: string; size: number; token?: string };
        const CHUNK = 96 * 1024;
        const chunks: Uint8Array[] = [];
        let truncated = false;
        // Phase 4 (A2): staged files are addressed by a token — a cover
        // fetch can no longer steal the slot of an in-flight user import.
        // Falls back to the legacy single-slot calls on older bridges.
        const readChunk = (off: number, len: number): string =>
          info.token && typeof b.readStagedChunk === "function"
            ? b.readStagedChunk(info.token, off, len)
            : (b.readImportChunk?.(off, len) ?? "");
        const clearStaged = () => {
          try {
            if (info.token && typeof b.clearStagedFile === "function") b.clearStagedFile(info.token);
            else b.clearPendingImport?.();
          } catch {
            /* best-effort */
          }
        };
        for (let off = 0; off < info.size; off += CHUNK) {
          const b64 = readChunk(off, CHUNK) ?? "";
          if (!b64) {
            truncated = true; // short read — the staged file is incomplete
            break;
          }
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          chunks.push(arr);
          if (chunks.reduce((a, c) => a + c.length, 0) > 1024 * 1024 * 1024) {
            truncated = true; // over the hard cap — refuse, never lie
            break;
          }
        }
        clearStaged();
        const total = chunks.reduce((a, c) => a + c.length, 0);
        // verify-before-complete (plan §8): a short/interrupted transfer
        // must never come back dressed as a valid File (Phase 1 finding O3)
        if (total > 0 && total === info.size && !truncated) {
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
    const r = await fetch(url, { headers });
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

/** several catalogs ship plain-http links (Gutenberg's OpenSearch template
    points at http://m.gutenberg.org) — browsers refuse insecure fetches and
    every one of these hosts serves https, so upgrade transparently */
function upgradeHttps(url: string): string {
  return url.replace(/^http:\/\//i, "https://");
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

  const entries: OpdsEntry[] = [...feed.querySelectorAll("entry")]
    .map((e) => {
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
  })
    // catalogs like Gutenberg answer empty searches with a pseudo-entry
    // ("No records found.") — it renders as a dead Add row, so drop it
    .filter((e) => !/no records|no results|nothing found/i.test(e.title));

  return { title, entries, nextUrl: nextUrl ? absUrl(baseUrl, nextUrl) : null };
}

/** ping a catalog: returns the feed title, or throws */
export async function testOpdsCatalog(entry: ServerEntry): Promise<string> {
  const url = entry.url.trim();
  const xml = await opdsFetchText(url, authHeaders(entry.auth));
  const feed = parseOpdsFeed(xml, url);
  return feed.title;
}

/* ---------------- search (v1.2.2) ---------------- */

/**
 * Resolve a catalog's OpenSearch template (OPDS 1.2: the feed exposes a
 * rel="search" link to an OpenSearch DescriptionDocument whose Url template
 * carries {searchTerms}). Best-effort — null when the catalog offers none
 * (the UI then degrades to plain browsing).
 */
export async function resolveOpdsSearchTemplate(
  feedUrl: string,
  headers: Record<string, string> = {}
): Promise<string | null> {
  try {
    const xml = await opdsFetchText(feedUrl, headers);
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return null;
    const searchLink = [...doc.querySelectorAll("link")].find(
      (l) => l.getAttribute("rel") === "search"
    );
    const href = searchLink?.getAttribute("href");
    if (!href) return null;
    const descUrl = upgradeHttps(absUrl(feedUrl, href));
    const descXml = await opdsFetchText(descUrl, headers);
    const ddoc = new DOMParser().parseFromString(descXml, "text/xml");
    if (ddoc.querySelector("parsererror")) return null;
    if (!ddoc.querySelector("OpenSearchDescription")) return null;
    const urlEl =
      [...ddoc.querySelectorAll("Url")].find((u) =>
        (u.getAttribute("type") ?? "").includes("atom+xml")
      ) ?? ddoc.querySelector("Url");
    const template = urlEl?.getAttribute("template") ?? "";
    return template.includes("{searchTerms}") ? upgradeHttps(template) : null;
  } catch {
    return null;
  }
}

/** run a catalog search through a resolved OpenSearch template */
export async function searchOpds(
  template: string,
  query: string,
  headers: Record<string, string> = {}
): Promise<OpdsFeed> {
  const url = upgradeHttps(
    template
      .replace(/\{searchTerms\}/g, encodeURIComponent(query.trim()))
      .replace(/\{startIndex\}|\{startPage\}/g, "1")
      .replace(/\{count\}/g, "24")
  );
  const xml = await opdsFetchText(url, headers);
  return parseOpdsFeed(xml, url);
}

/** cached template resolver — one network round-trip per catalog (+auth).
    Some catalogs (e.g. Gutenberg) serve their OpenSearchDescription without
    CORS headers, so browser clients can never read it — for those we fall
    back to the de-facto OPDS convention of `{feedUrl}?query={searchTerms}`,
    which Gutenberg itself, Calibre-Web and several others implement. The
    native bridge is CORS-free, so inside the APK the real OSD still wins. */
const templateCache = new Map<string, Promise<string | null>>();

export function opdsSearchTemplate(srv: ServerEntry): Promise<string | null> {
  const key = `${srv.id}::${srv.auth?.user ?? ""}`;
  let p = templateCache.get(key);
  if (!p) {
    p = resolveOpdsSearchTemplate(srv.url, authHeaders(srv.auth)).then((tpl) => {
      if (tpl) return tpl;
      // NB: append literally — searchParams.set would percent-encode the
      // {searchTerms} placeholder and searchOpds could never substitute it
      const base = upgradeHttps(srv.url);
      return base + (base.includes("?") ? "&" : "?") + "query={searchTerms}";
    });
    templateCache.set(key, p);
  }
  return p;
}

/** ping any configured server (OPDS feed or Komga libraries endpoint) */
export async function pingServer(srv: ServerEntry): Promise<boolean> {
  try {
    if (srv.kind === "OPDS") {
      await testOpdsCatalog(srv);
    } else {
      await opdsFetchText(
        srv.url.replace(/\/$/, "").concat("/api/v1/libraries?page=0"),
        authHeaders(srv.auth)
      );
    }
    return true;
  } catch {
    return false;
  }
}
