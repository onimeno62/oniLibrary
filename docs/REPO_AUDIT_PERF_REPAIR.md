# oniLibrary — Repository Audit, Performance Optimization & Feature Repair

**Branch:** `fix/home-library-reader-performance` (5 stages, one commit per stage)
**Base:** main @ `3271afd` (v1.5.0 + post-audit phases A/B/C) · **Date:** 2026-10-21
**Scope:** the repo-audit task — Priority-0 performance, Home (Continue Reading / bottom card /
Latest Updates), Library (categories, tags, filter preservation), work-detail tag navigation,
reader Notes & Highlights access, full-screen cover viewer, EN/FA + RTL preservation, regression tests.

---

## 1. Stack confirmation (audited before any edit)

Next.js 16 App Router static export · React 19 + TypeScript 5 · zustand v5 (`useApp` persisted,
`useNav` transient tab+overlay-stack — no URL routes) · Tailwind 4 + shadcn/ui (New York) ·
bun test (13→14 files, pure-function contract style, fixtures in `tests/helpers.ts`) ·
Android WebView shell (`android/app/java`, JS bridge) · CI = GitHub Actions; **no `bun run build`
was executed in this sandbox** (environment rule — dev server on :3000 only); CI runs the
production build on push and is the build gate for the PR.

## 2. Performance (Priority 0) — measured, then fixed

### Baseline (BEFORE, desktop Chrome via agent-browser instrumentation)

| Probe (1000-work library, 3.1 MB persisted payload) | Result |
|---|---|
| `JSON.stringify(partializedState)` per store change | **41–93 ms** (6 runs: 56.7, 60.2, 58, 78.8, 93.3, 49.5) |
| `localStorage.setItem` per store change | **24–31 ms** (6 runs: 27.7, 27.3, 31.5, 28.2, 23.9, 30.6) |
| **Total synchronous main-thread cost per change** | **≈ 85–120 ms — on every reader page flip** |
| Library filter+sort pipeline (1000 works) | 0.2 ms (not a bottleneck) |
| Per-card derived values (`workProgress`+`currentChapter`, full 1000-card pass) | 3 ms (≈0.06 ms per visible card — not a bottleneck at visible scale) |
| Home continue-reading scan + latest-updates flatMap (1000 works) | 0.3–0.4 ms (negligible) |
| Persist probe at default seed store (~50 KB) | ~1–3 ms (why the problem hides until libraries grow) |

Method note: the persisted payload is `{state, version}`-wrapped; the first measurement round
accidentally stringified a tiny object and was discarded. No device profiling is available in this
sandbox — all numbers are desktop-Chrome, code-level; low-end Android WebView will be several×
worse, which is what "the app feels slow" reports.

### Fixes

1. **Throttled persist storage** (`src/lib/persist-storage.ts`, wired in `store.ts`):
   object-level trailing-800 ms coalescing using zustand's `PersistStorage` API (the state object
   is kept by reference; `JSON.stringify` + `localStorage.setItem` run once per quiet period, not
   per change). Flush on `pagehide` / `visibilitychange→hidden` / `beforeunload`, plus
   `flushPersistNow()` on reader unmount. Browser-less environments (bun tests) write through
   immediately. The latest value always wins — final state is never lost, only churn is coalesced.
2. **Reader listener churn** (`reader-screen.tsx`): the keydown shortcut effect and the Android
   volume-key effect had **no dependency arrays** — every render (every page flip, every controls
   toggle) removed + re-added the window listener and re-invoked the Java bridge
   (`setVolumeKeyMode`). Now: bound once via a ref-dispatch pattern; volume effect re-binds only
   when the `volumeKeyPaging` setting changes.
3. **Home derived shelves memoized** (`home-screen.tsx`): filter/sort/flatMap chain re-ran on
   every render; now `useMemo`d.
4. **Explicitly NOT done (would be speculative):** grid virtualization (measured pipeline cost is
   0.2–3 ms at 1000 works; DOM-node count is the real scaling limit — remains owner-gated as
   before), Library card `React.memo` plumbing (visible-card derived cost ≈ 0.06 ms/render),
   chaptersAsc re-sort (microseconds).

### AFTER (same instrumentation, 1000-work library)

| Probe | Result |
|---|---|
| 5 progress changes (page-flip equivalent) — writes + stringify **during** burst | **0 writes, 0 stringify, 0 ms** |
| After the 800 ms trailing window | **exactly 1 write** (28 ms) + 1 stringify (one-time ~41 ms at this payload size) |
| 8-change burst total main-thread cost | **≈ 29–70 ms total** vs ≈ 0.8–1 s before (**≈ 93–97 % reduction**) |
| Memory/disk consistency after flush | verified equal via instrumentation |
| Reader exit | `flushPersistNow()` in the unmount cleanup — position survives immediate kill |

## 3. Confirmed bugs and fixes (with root causes)

| # | Bug (symptom) | Root cause (file:line, pre-fix) | Fix |
|---|---|---|---|
| B1 | Home "Continue Reading" resumed at **page 1** and showed a **fake 99 %** for legacy records | `openReader(work.id, chapter.id)` dropped the saved page; rail used raw `lastPage*100%` instead of the dual ratio/absolute normalization (`home-screen.tsx:120,141,150`) | resume passes `continueReading().page`; rail/percent use `chapterProgressFraction()` clamped 1–99 |
| B2 | "Latest Updates" showed the **oldest unread chapter** of each work sorted by stale dates; works with ch1 read vanished even when ch1107 released | `w.chapters[0]` picked index 0, not the newest release (`home-screen.tsx:48-55`) | `latestChapterUpdate()` / `latestUpdatesFeed()` (`src/lib/library-contract.ts`): newest **unread** release per work, newest-first, invalid dates sink, limit 8 |
| B3 | Latest Updates rendered a fake-empty shell ("empty" paragraph) when nothing qualified | section always rendered (`home-screen.tsx:160-192`) | section **hidden entirely** when feed is empty |
| B4 | No empty state when nothing to resume | hero simply absent | "Nothing in progress → Find something to read" card → Discover (EN/FA) |
| B5 | Continue Reading existed **twice** with divergent progress math | Home hero vs Discover shelf (`discover-screen.tsx:96-110,269-296`) | Discover shelf removed; Home is the single resume entry (task §4.4) |
| B6 | Library **manual category cards did nothing useful** (opened the manager instead of filtering) | onClick → `push({kind:"categories"})` (`library-screen.tsx:479-484`); no category filter existed in `filtered` | card click filters the grid through the `workCategories` join; active ring + clearable pill; "See all" still manages |
| B7 | **No tag filtering anywhere** | `Work.tags` rendered only in details | real vocabulary (`collectTags`, counts, cap 24) in the filter sheet; OR semantics (documented product choice, task §5.2 default); active tag pills with per-tag clear + clear-all; composes with query/type/status/source/lang/downloaded/unread/smart-rule |
| B8 | Filters lost context across deep navigation; details tags were **dead `<span>`s** | no parameterized Library entry in `Overlay`/nav; tags not interactive (`details-screen.tsx:276-281`) | `useNav.openLibraryFiltered({tag|category})` — one-shot preset consumed by Library (`useEffect` + `clearLibraryPreset`); details tags are buttons → filtered Library (EN+FA, aria-labelled) |
| B9 | **Saved filter chips silently reset on every restart** | `savedFilters` missing from persist `partialize` (`store.ts:1092-1111`) | added; round-trip test |
| B10 | **No Notes/Highlights access from the reader** | overflow menu had only mark-read/download | `HighlightsSheet` + `NotesSheet` (`reader-sheets.tsx`) reusing the existing highlights slice and `Work.personalNotes` — no second subsystem; same-chapter jump = focus + page flip; cross-chapter jump = `openChapter` + queued focus that waits for the PDF document; inline note editor (save/delete); honest empty state with how-to hint |
| B11 | Covers only viewable as thumbnails | no viewer | `CoverViewer` (`src/components/cover-viewer.tsx`): full-screen, object-contain (never cropped), zoom/fit + double-tap, pan when zoomed, Escape/X/backdrop close, gradient fallback on missing/corrupt, phone-frame-local, `role=dialog` defers app Escape |
| B12 | Progress could be lost on app kill right after reading | write-through persisted immediately but throttled design needed an explicit durability story | flush-on-hide/pagehide + reader-exit flush (see §2) |
| B13 | Deleted works / invalid saved positions | — (verified safe) | `continueReading()` clamps absolute `lastPage` to `pages-1`, treats ≤1 as ratio, skips read chapters, returns null for chapter-less works — now regression-tested |

## 4. Home bottom card (task §4.2) — verdict

The bottom card is the **"Your Reading Stats"** card. It was and is a real `<button>` navigating to
the Statistics overlay (verified live: click → `stack top = statistics`). It contains no dead or
misleading controls; no change required beyond keeping it actionable. Evidence: agent-browser
session `fixqa3`, stack probe after click.

## 5. Tests (bun test — 169 → 193, all passing)

New `tests/library-contract.test.ts` (19): newest-unread chapter selection, stale/read exclusion,
invalid-date sinking, feed ordering/limits/empty→hide, tag vocabulary derivation, OR/ALL tag
semantics + no-op same-reference guarantees, category join filtering, nav preset hand-off,
`savedFilters` partialize round-trip.
Extended `tests/progress.test.ts` (+6): safe resume from stored ratios, legacy absolute clamping,
negative positions, all-read fallback, chapter-less works.
Pre-existing suites untouched and green: i18n en/fa **parity** (auto-covers the 24 new keys),
restore/download/reader contracts, importer, vault crypto.

Gates: `bunx tsc --noEmit` ✅ · `bun run lint` ✅ (0 problems) · `bun test tests/` ✅ 193/193 ·
CI: production build runs on push (this sandbox cannot run `bun run build` — documented).

## 6. Live QA (agent-browser, EN + FA)

- Onboarding → Home: CR hero 68 % real ratio; Latest Updates = newest chapters (One Piece 1107,
  Berserk 366…) newest-first; stats card → statistics overlay.
- Read a page → exit: hero updated **live** 68 % → 72 % without reload; resume reopened the same
  chapter at the stored position; persisted `lastPage` verified in localStorage after flush.
- Library: Horror card → exactly its 3 works + "Horror" pill; clear restores 16; tag sheet
  (Action 8, Fantasy 5, … real counts) → "#Action" pill + filtered grid; sheet clear resets all.
- Details: "Fantasy" tag tap → Library tab, stack dropped, "#Fantasy" pill, 5 results.
- Cover viewer: opens with the complete cover, zoom 200 % + fit toggle, X closes back to details.
- Reader (PDF): highlights sheet lists items with color/text/Ch/page; note edit persisted; "Go to"
  closes sheet and focuses page 3/8; **cross-chapter jump switched ch112 → ch116**; Notes sheet
  autosave persisted (`personalNotes` in localStorage after flush); honest empty state before data.
- FA: `dir=rtl` on `<html>`; filter sheet shows "برچسب‌ها" + Persian hint, chips RTL; category pill
  localized; screenshot `/tmp/qa-fa-filters.png`.
- Empty states: all-read library → CR empty card shown, Latest Updates section absent
  (screenshot `/tmp/qa-empty-home.png`).

## 7. Limitations & honest notes

- **No device/emulator pass** (sandbox has no build-tools or emulator): Android-shell behaviors
  (volume keys, back button) were verified at code level only. The throttled persist's flush
  coverage (`pagehide`/`visibilitychange`) is the standard WebView lifecycle path but deserves a
  device check for kill-without-callback scenarios.
- Desktop Chrome numbers only; no device profiling available.
- Pinch-zoom in the cover viewer is intentionally not implemented (fit/zoom toggle + double-tap +
  pan chosen — consistent with the existing reader zoom levels); the reader's own pinch machine
  (RDR-004) is untouched.
- Grid virtualization and Library card memoization deliberately deferred (measured costs small at
  visible scale; see §2) — remain owner-gated items.
- A background process in this sandbox repeatedly forced `main` checkout; all work was therefore
  committed on the feature branch (verified after every commit) and QA ran from a dedicated
  git worktree to isolate the branch. No main-branch pollution: `main` = `origin/main` @ 3271afd.
- A dev-only QA hook `window.__oniapp` (mirrors the existing `__oninav`) was added for browser
  probing; production builds exclude it (`NODE_ENV` guard).

## 8. Manual verification steps (device, when available)

1. Read to ~70 % of a chapter → Home → hero % matches; tap → resumes the exact page.
2. Kill the app from recents right after flipping → reopen → position preserved (flush coverage).
3. Volume-key paging still flips pages (re-bound listener); toggle the setting mid-session.
4. Android Back with a Radix dialog/sheet open → dialog closes first (existing D2 fix intact);
   with the cover viewer open → viewer closes first.
5. Tag tap on details → Library filtered; clear → full library (both EN + فارسی, RTL layout).
