"use client";

/**
 * Built-in free sources (v1.3.0) — the PRD's "other ways" route for online
 * content ([SRC-001]/[EXT-007]). Mihon .apk extensions cannot execute inside
 * oniLibrary's web runtime (honest statement lives on the Extensions screen),
 * so the app ships REAL first-party sources instead:
 *
 *   - MangaDex          JSON API · manga / manhwa / webtoon · chapter downloads
 *   - Project Gutenberg OPDS      · 70k+ public-domain books (no account)
 *   - Standard Ebooks   OPDS      · curated, beautiful epubs (free account)
 *
 * OPDS-based entries are added to `servers` with one tap and then flow
 * through the exact same browse/search/import pipeline as personal
 * Calibre-Web/Komga/Kavita catalogs. MangaDex gets a native adapter
 * (src/lib/mangadex.ts) because it is not OPDS.
 */

import type { ServerEntry } from "./types";

export const MANGADEX_ID = "builtin-mangadex";
export const GUTENBERG_ID = "builtin-gutenberg";
export const STANDARDEBOOKS_ID = "builtin-standard-ebooks";

export interface BuiltinCatalog {
  id: string;
  name: string;
  url: string;
  kind: ServerEntry["kind"];
  /** i18n key for the one-line blurb */
  blurbKey: string;
  langLabel: string;
  needsAuth: boolean;
}

export const FREE_CATALOGS: BuiltinCatalog[] = [
  {
    id: GUTENBERG_ID,
    name: "Project Gutenberg",
    url: "https://www.gutenberg.org/ebooks/search.opds/",
    kind: "OPDS",
    blurbKey: "src.gutBlurb",
    langLabel: "EN + 50",
    needsAuth: false,
  },
  {
    id: STANDARDEBOOKS_ID,
    name: "Standard Ebooks",
    url: "https://standardebooks.org/feeds/opds/all",
    kind: "OPDS",
    blurbKey: "src.seBlurb",
    langLabel: "EN",
    needsAuth: true,
  },
];

/** the catalog is already in the user's server list (matched by URL) */
export function findAddedServer(
  servers: ServerEntry[],
  cat: BuiltinCatalog
): ServerEntry | undefined {
  return servers.find((s) => s.url.replace(/\/$/, "") === cat.url.replace(/\/$/, ""));
}

/** synthesize a ServerEntry from a built-in catalog (browse/test before add) */
export function builtinAsServerEntry(cat: BuiltinCatalog, auth?: { user: string; pass: string } | null): ServerEntry {
  return { id: cat.id, name: cat.name, url: cat.url, kind: cat.kind, status: "UNKNOWN", auth: auth ?? null };
}

/** is a built-in source switched on? ([SRC-004] enable/disable) */
export function builtinEnabled(builtinDisabled: string[], id: string): boolean {
  return !builtinDisabled.includes(id);
}
