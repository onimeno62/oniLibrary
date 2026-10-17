"use client";

/**
 * Tracker sync (v1.2.0) — AniList via the public GraphQL API.
 *
 * Auth model: personal access token pasted by the user in Settings
 * (no OAuth redirect plumbing inside the WebView). Progress push:
 * `SaveMediaListEntry(progress: chaptersRead)`; works are matched by
 * title search on first sync and remembered via `work.trackerId`.
 */

import { useApp } from "./store";
import type { Work } from "./types";

const API = "https://graphql.anilist.co";

export interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  chapters: number | null;
  coverImage: { large: string | null } | null;
}

async function gql<T>(query: string, variables: Record<string, unknown>, token: string): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!res.ok || json.errors?.length) throw new Error(json.errors?.[0]?.message ?? `HTTP ${res.status}`);
  return json.data as T;
}

/** validate a token (Viewer query) — returns the account name */
export async function anilistWhoAmI(token: string): Promise<string> {
  const data = await gql<{ Viewer: { name: string } }>(
    "query { Viewer { name } }",
    {},
    token
  );
  return data.Viewer.name;
}

/** search manga by title — best candidates first */
export async function anilistSearch(title: string, token: string): Promise<AniListMedia[]> {
  const data = await gql<{ Page: { media: AniListMedia[] } }>(
    `query ($q: String) {
       Page(perPage: 5) {
         media(search: $q, type: MANGA, sort: SEARCH_MATCH) {
           id
           title { romaji english native }
           chapters
           coverImage { large }
         }
       }
     }`,
    { q: title },
    token
  );
  return data.Page.media;
}

/** push read-chapter progress for one media id */
export async function anilistUpdateProgress(
  mediaId: number,
  progress: number,
  token: string
): Promise<void> {
  await gql(
    `mutation ($mediaId: Int, $progress: Int) {
       SaveMediaListEntry(mediaId: $mediaId, progress: $progress) { id progress }
     }`,
    { mediaId, progress },
    token
  );
}

function readCountOf(work: Work): number {
  return work.chapters.filter((c) => c.isRead).length;
}

function bestMatch(title: string, media: AniListMedia[]): number | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = norm(title);
  if (!t || media.length === 0) return null;
  const exact = media.find((m) => [m.title.english, m.title.romaji, m.title.native].some((x) => norm(x ?? "") === t));
  if (exact) return exact.id;
  const partial = media.find((m) => [m.title.english, m.title.romaji].some((x) => norm(x ?? "").includes(t) || t.includes(norm(x ?? ""))));
  return partial?.id ?? null;
}

export interface SyncReport {
  pushed: number;
  matched: number;
  failed: number;
  errors: string[];
}

/** sync every READING/COMPLETED work with progress>0; auto-matches new works */
export async function syncAllToTracker(): Promise<SyncReport> {
  const st = useApp.getState();
  const { provider, token } = st.settings.tracker;
  if (provider !== "anilist" || !token) throw new Error("not connected");
  const report: SyncReport = { pushed: 0, matched: 0, failed: 0, errors: [] };

  const candidates = st.works.filter(
    (w) => !w.inVault && (w.readingStatus === "READING" || w.readingStatus === "COMPLETED") && readCountOf(w) > 0
  );

  for (const work of candidates) {
    try {
      let mediaId = work.trackerId ?? null;
      if (!mediaId) {
        const media = await anilistSearch(work.title, token);
        mediaId = bestMatch(work.title, media);
        if (mediaId) {
          useApp.getState().updateWork(work.id, { trackerId: mediaId });
          report.matched++;
        }
      }
      if (!mediaId) continue; // no confident match — skip silently
      await anilistUpdateProgress(mediaId, readCountOf(work), token);
      report.pushed++;
    } catch (e) {
      report.failed++;
      if (report.errors.length < 3) report.errors.push((e as Error).message ?? "error");
    }
  }

  useApp.getState().setTracker({ lastSyncAt: new Date().toISOString() });
  return report;
}

/** auto-sync hook: push a single work (used after marking a chapter read) */
export async function syncWorkToTracker(workId: string): Promise<void> {
  const st = useApp.getState();
  const { provider, token } = st.settings.tracker;
  if (provider !== "anilist" || !token) return;
  const work = st.works.find((w) => w.id === workId);
  if (!work || work.inVault) return;
  const read = readCountOf(work);
  if (read === 0) return;
  let mediaId = work.trackerId ?? null;
  if (!mediaId) {
    const media = await anilistSearch(work.title, token);
    mediaId = bestMatch(work.title, media);
    if (mediaId) useApp.getState().updateWork(work.id, { trackerId: mediaId });
  }
  if (mediaId) await anilistUpdateProgress(mediaId, read, token);
}
