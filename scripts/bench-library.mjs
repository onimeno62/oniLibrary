#!/usr/bin/env node
/**
 * NFR-001/002 benchmark fixture generator (Phase C-5).
 *
 * Emits a complete `onilibrary-store-v1` localStorage payload containing N
 * synthetic works (deterministic, no blobs) so the real app can be timed
 * against a 1 000+ entry library in a browser:
 *
 *   node scripts/bench-library.mjs 1000 > /tmp/bench-store.json
 *   # in the browser (agent-browser):
 *   #   localStorage.setItem('onilibrary-store-v1', <contents>)
 *   #   location.reload()
 *
 * Works are spread across types/statuses/languages with staggered dates so
 * sorting and filtering do real work. Covers are tiny gradients (no images)
 * — this measures list/filter/sort throughput, not image decode.
 */
const n = Number(process.argv[2] ?? 1000);
if (!Number.isFinite(n) || n < 1) {
  console.error("usage: node scripts/bench-library.mjs <count>");
  process.exit(1);
}

const TYPES = ["MANGA", "MANHWA", "COMIC", "BOOK", "PDF", "WEBTOON", "NOVEL", "EPUB"];
const STATUSES = ["READING", "PLANNED", "COMPLETED", "ON_HOLD", "DROPPED"];
const LANGS = ["en", "ja", "ko", "fa"];
const TAGS = ["Action", "Comedy", "Drama", "Fantasy", "Romance", "Horror", "Slice of Life"];

const pad = (s, w) => String(s).padStart(w, "0");
const iso = (daysAgo) => new Date(Date.parse("2026-01-01T00:00:00.000Z") - daysAgo * 86400000).toISOString();

const works = Array.from({ length: n }, (_, i) => {
  const chapters = Array.from({ length: 10 + (i % 18) }, (_, c) => ({
    id: `w-b${pad(i, 5)}-c${c}`,
    number: c + 1,
    title: `Ch. ${c + 1}`,
    pages: 14 + (c % 10),
    releaseDate: iso(i % 300),
    isRead: c < i % 25,
    lastPage: c < i % 25 ? undefined : c === (i % 25) ? 0.4 : undefined,
    download: c < i % 7 ? "DONE" : "NONE",
    sizeMb: c < i % 7 ? 5 + (c % 9) : 0,
  }));
  return {
    id: `w-b${pad(i, 5)}`,
    title: `Bench Title ${i} ${i % 3 === 0 ? "漢字" : i % 3 === 1 ? "فارسی" : "Latin"}`,
    altTitle: i % 5 === 0 ? `Alternate ${i}` : undefined,
    author: `Author ${i % 250}`,
    cover: "",
    coverColor: ["#f8694c", "#a0917f", "#2b241d", "#f4ead3"][i % 4],
    type: TYPES[i % TYPES.length],
    description: `Synthetic benchmark work ${i}.`,
    workStatus: i % 7 === 0 ? "COMPLETED" : "ONGOING",
    readingStatus: STATUSES[i % STATUSES.length],
    isFavorite: i % 9 === 0,
    inVault: i % 97 === 0,
    tags: [TAGS[i % TAGS.length], TAGS[(i + 3) % TAGS.length]],
    rating: 50 + (i % 50),
    ratingCount: i % 1000,
    direction: "LTR",
    readerMode: "PAGED",
    fitMode: "WIDTH",
    chapters,
    addedAt: iso(i % 365),
    lastReadAt: i % 2 === 0 ? iso(i % 30) : undefined,
    isLocal: i % 4 === 0,
    language: LANGS[i % LANGS.length],
    userRating: i % 6 === 0 ? i % 6 : undefined,
    sourceMeta: i % 4 === 0 ? { sizeBytes: 1024 * 1024 * (8 + (i % 60)), pathLabel: `Folder ${i}`, fileCount: 3, formats: ["CBZ"] } : undefined,
    sourceRef: i % 3 === 0 ? { sourceId: "mangadex", itemId: `uuid-${i}` } : undefined,
  };
});

const state = {
  works,
  categories: [
    { id: "cat-1", name: "Reading", createdAt: iso(90) },
    { id: "cat-2", name: "Long series", createdAt: iso(80), rule: { downloadedOnly: true, unreadOnly: true } },
  ],
  workCategories: Object.fromEntries(works.filter((_, i) => i % 3 === 0).map((w) => [w.id, ["cat-1"]])),
  settings: {
    lang: "en", theme: "system", userName: "Bench", onboarded: true,
    autoCheckUpdates: true, lastUpdateCheck: iso(1),
    offlineMode: false, wifiOnly: false, maxConcurrent: 3,
    ntfChapters: true, ntfDownloads: true, ntfErrors: true, hideSensitiveNtf: false,
    navItems: ["home", "library", "discover", "more"],
    libraryDensity: "cozy",
  },
  sessions: Array.from({ length: 120 }, (_, i) => ({ date: `2026-${pad((i % 12) + 1, 2)}-${pad((i % 28) + 1, 2)}`, minutes: i % 45, chapters: i % 5 })),
  bookmarks: [],
  highlights: [],
  history: works.slice(0, 40).map((w, i) => ({ id: `h-${i}`, workId: w.id, chapterId: w.chapters[0].id, page: 0.5, at: iso(i) })),
  savedFilters: [],
  sources: [],
  servers: [],
  downloads: [],
  notifications: [],
  dismissedRecs: [],
};

const payload = { state, version: 0 };
process.stdout.write(JSON.stringify(payload));
