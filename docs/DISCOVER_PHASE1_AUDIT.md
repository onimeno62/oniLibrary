# Discover / Source Contract — Phase 1 Audit

**Status:** Phase 1 complete (audit gate satisfied — no code changes in this document)
**Date:** 2026-10-21
**Baseline:** `main` @ `341d331` (PR #3 merged; CI green — run 39478838279)
**Method:** full read of every file listed in the plan §4, three independent
audit passes (UI screens, source/network layer, store/models/shell/docs),
every P0 claim re-verified by hand against the working tree before being
recorded here. Line numbers refer to `341d331`.
**Authority:** supplements `docs/DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md`
("the plan"). Findings feed Phase 2.

## 1. Baseline

- Tests: 57 pass / 0 fail (6 files). Lint clean. `bunx tsc --noEmit` clean.
- CI: green on latest merge (lint + tsc + bun test + optional APK asset check).
- APK workflow: green config as of PR #3 (prisma generate, sdkmanager retry,
  mtime-based verify), not yet exercised end-to-end on a push.
- Branch state: only `main`, `docs/discover-technical-plan` (merged),
  `fix/ci-pipeline` (merged, stale) on origin.

## 2. Confirmed defects (verified against code)

Severity: **P0** = breaks a Phase-2 gate / data-integrity; **P1** = plan
requirement violated, user-visible; **P2** = quality/honesty/a11y; **P3** = nit.

### 2.1 Search screen — `src/components/screens/search-screen.tsx`

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| S1 | **P0** | Clear (X) button bypasses the debounce contract: `onClick={() => setQuery("")}` does not clear `commitTimer` nor reset `committedQ`, so a pending 900 ms timer re-commits the cleared term and the effect re-runs the search → **cleared query resurrects old results** (plan §6/§7 explicit violation). | `search-screen.tsx:166-170` vs `onQueryChange` `:50-59` |
| S2 | **P0** | `mdFailed` is sticky: only reset inside the `!term` branch (`:88`), never at the start of a run. One MangaDex failure permanently shows "MangaDex is unreachable" for all later successful searches until unmount. | `:88`, `:100`, render `:244` |
| S3 | P1 | Per-catalog failures are swallowed (`catch {}`), indistinguishable from "no matches"; plan §7 requires a compact failed-source indicator + retry. | `:114-116` |
| S4 | P1 | No timeouts anywhere in the chain (`opdsFetchText` has no signal); one hung server stalls `Promise.all` → spinner forever. | `:103-122`, `opds.ts:45-67` |
| S5 | P1 | Debounce timer never cleaned up on unmount → `setCommittedQ` fires after leaving the screen. | `commitTimer` `:32`, no unmount effect |
| S6 | P1 | No offline handling: `settings.offlineMode` / `navigator.onLine` never consulted; total failure renders a false "No results for …". | effect gate `:82`, `:342-344` |
| S7 | P1 | No pagination: MangaDex sliced to 6, OPDS to 6, `searchOpds` hardcodes page 1. | `:99`, `:113`, `opds.ts:268` |
| S8 | P2 | While a new search is in flight the entire results region is replaced by a spinner (previous valid results disappear). | `:226-230` |
| S9 | P2 | Query lowercased before remote search (case-sensitive OPDS servers misled); message shows original casing. | `:47`, `:55`, `:343` |
| S10 | P2 | MangaDex search covers render via raw `<img src={m.coverUrl}>` — the only MangaDex surface that bypasses the bridge-aware `MdCover` loader (fails in APK where the CDN refuses the WebView UA). | `:260` vs `free-catalogs.tsx:38-105` |
| S11 | P2 | Dead code: `searchingSources` computed never used; `RefreshCw` imported never used. | `:48`, `:4` |
| S12 | P2 | A11y: search input has no accessible label; clear button ~16px hit target; no `aria-live` on the searching region. | `:159-170`, `:227-230` |
| S13 | P2 | `addedIds` keyed by OPDS `entry.id` alone (only unique per catalog) → collisions across catalogs disable the wrong row's Add button. | `:39`, `:131`, `:291` |

### 2.2 MangaDex source screen — `src/components/screens/source-screen.tsx`

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| T1 | **P0** | Stale-response race: `runLoad` has **no request identity** (no alive flag, no run id, no AbortController). Interleaving: switch tab while "Load more" is in flight → stale page-1 response from the old tab is **appended** to the new tab's list and the page cursor is corrupted; two quick searches can land out of order. Plan §7: "old requests must not overwrite newer results". | `:299-322`, effect `:324-328` |
| T2 | P1 | Appended pages are not deduped by `m.id`; MangaDex `latestUploadedChapter`-ordered feeds shift between requests → repeated items across pages (plan §7). | `:311` |
| T3 | P1 | Pagination errors invisible: `catch { setError(true) }` but the error UI renders only when `items.length === 0`; failed "load more" shows nothing. | `:313-315`, `:433` |
| T4 | P1 | No offline handling (only `builtinDisabled` is checked); fires network calls in offline mode. | `:285`, `:325` |
| T5 | P1 | No timeout on any MangaDex call (rides `opdsFetchText`). | `mangadex.ts:94-97` |
| T6 | P1 | Add-to-library not idempotent (plan §8): every add mints `"w-md-" + Date.now().toString(36)` and `addWork` prepends unconditionally — double-tap (or sheet + deep-link) duplicates the same manga. | `:96-132`, `mangadex.ts:344`, `store.ts:400` |
| T7 | P2 | Search mode has no pagination (load-more gated `!ranQuery`); `items.length % 24 === 0` is a heuristic that keeps offering "Load more" on exact-24 final pages. | `:471-479` |
| T8 | P2 | Deep-link focus failure swallowed silently (`catch(() => undefined)`), and `focusDone` prevents retry. | `:331-339` |
| T9 | P2 | A11y/touch targets: clear button ~16px, chips ~24px tall, unlabeled input, no `aria-live`. | `:383-395`, `:199-218` |

### 2.3 Discover screen — `src/components/screens/discover-screen.tsx`

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| D1 | P1 | Category chips filter **only local** `works` — never the online shelf/results (plan §6: "Category chips must filter online catalog results"). | `matchesCat` `:19-24`, `visibleWorks` `:85` |
| D2 | P1 | The "Filter" button opens Extensions, not a filter panel (plan §6: "must open an actual filter UI"). | `:188-194` |
| D3 | P1 | MangaDex latest fetch: no timeout, no retry, error swallowed (`setMdLatestItems(null)` — indistinguishable from disabled/offline), and `navigator.onLine` is read once but is not an effect dependency, so coming back online never refetches. | `:114-127` |
| D4 | P2 | No loading state for the online shelf: local "Recently added" renders first, then swaps to MangaDex when the fetch lands (visible content jump, no skeleton). | `:256-274` |
| D5 | P2 | Hardcoded English aria-labels on carousel dots. | `:411` |
| D6 | P2 | Touch targets < 44px (dots 6px, header buttons 40px, chips ~29px). | `:408-416`, `:156-169`, `:210-222` |
| D7 | P2 | No distinct offline state for the remote shelf (silent local fallback). | `:117-119` |

### 2.4 Transport — `src/lib/opds.ts` (all MangaDex traffic rides this)

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| O1 | P1 | No timeout on `opdsFetchText` / `opdsFetchBinary`; zero `AbortController` in the repo. | `:45-67`, `:70-119` |
| O2 | P1 | Untyped errors: `HTTP ${status}`, `"bad xml"`, `"network error"` strings — no network/TLS/HTTP/parse discrimination (plan §5 SourceResult). | `:57`, `:65`, `:162`, `:164` |
| O3 | P1 | Silent truncation: bridge chunk loop breaks on short read / 1 GB cap and returns the **partial** file as success; `total` never compared to `info.size` → corrupt epub/cbz marked complete. | `:88-103` |
| O4 | P2 | Bridge failure falls through to browser `fetch`, which always CORS-fails inside the APK → every native failure pays double latency. | `:51-53` → `:56` |
| O5 | P2 | Binary browser path discards status (`if (!r.ok) return null`) and swallows errors; no size cap. | `:110-118` |
| O6 | P2 | Template cache keyed by server id, never invalidated; failed resolutions cached for the session. | `:281-297` |

### 2.5 MangaDex adapter — `src/lib/mangadex.ts`

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| M1 | P1 | Collidable, non-idempotent work ids (`Date.now()`); duplicate library entries for the same manga (also feeds T6). | `:344`, `:355` |
| M2 | P1 | `downloadChapters` marks chapters `download: "DONE"` even when individual page fetches or `putFile` writes were skipped; no page-count/size cross-check (verify-before-complete, plan §8). | `:417-422`, `:455-466` |
| M3 | P1 | Update-check diff keys diverge: store uses `sourceChapterId` UUIDs (`store.ts:867-876`) while the details screen re-checks by chapter **number** with `knownIds=[]` (`details-screen.tsx:116-118`) → the same chapter can be re-reported as new. | `mangadex.ts:232-236` |
| M4 | P2 | No inter-request pacing on API calls (only page-file writes have 120 ms delay); no 429/`Retry-After` handling. | `:25`, `:141-153` |
| M5 | P2 | `mdChapters` cap imprecise: `cap=60` with `limit=100` returns up to 100 rows. | `:188-215`, `source-screen.tsx:74` |
| M6 | P2 | Object-URL cache never revoked (`coverObjectUrls`). | `:286-299` |
| M7 | P3 | Fabricated author fallback `"MangaDex"`. | `:260` |

### 2.6 Background downloads — `src/lib/bg-downloads.ts`

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| B1 | P1 | **Non-durable processing**: rows persist (zustand/localStorage) but the worker is a fire-and-forget closure — after restart, `ACTIVE`/`QUEUED` rows have no driver and sit forever (plan §8 "safe restart", "re-open offline and after restart"). | `:54-188` |
| B2 | P1 | Cross-batch cancel wipe: `cancelled.clear()` at the end of one enqueue batch erases cancel flags of all concurrently running batches → issued cancels are lost. | `:20`, `:187` |
| B3 | P1 | Stale `chapterIndex` races: jobs capture the index at enqueue; update-append/delete meanwhile mutates `work.chapters` → wrong row patched, page blobs keyed under the wrong ordinal. | `:51`, `:57`, `:89-95`, `:124` |
| B4 | P2 | Fabricated telemetry: invented `totalMb` (`pages*0.35`), hardcoded `speedMbps: 1.2`, final row reports `totalMb` regardless of real bytes ("honest-looking bar" comment). | `:77`, `:128`, `:132`, `:136`, `:148` |
| B5 | P2 | No size/type validation or page-count verification before DONE; partial page blobs orphaned in IndexedDB on cancel/fail. | `:85-95`, `:98-109` |
| B6 | P2 | `settings.wifiOnly` never consulted (declared in `types.ts:246`, promised by i18n hint). | `:31-35` |
| B7 | P2 | Duplicate-download race: no check for an existing active row for the same `chapterId`; parallel enqueues collide on page keys. | enqueue paths |
| B8 | P3 | Generic `error: "network"` although `lastHttpError()` is available. | `:158` |

### 2.7 Source registry / OPDS policy — `builtin-sources.ts`, `free-catalogs.tsx`

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| G1 | P1 | **`builtinEnabled()` is dead code** (zero callers). Only MangaDex is gated by `builtinDisabled`; Gutenberg/Standard Ebooks render unconditionally. Plan §2/§10 expects a disable/enable policy for deferred integrations. | `builtin-sources.ts:71-73`; `free-catalogs.tsx:180-329`; `discover-screen.tsx:375` |
| G2 | P2 | Any failure on a `needsAuth` catalog opens the auth dialog ("401 → ask" comment, but status never inspected) → DNS/TLS/5xx misattributed as auth problem. | `free-catalogs.tsx:209-216` |
| G3 | P2 | Credentials persisted plaintext in localStorage (servers[].auth, AniList token) — plan §2 wants platform-appropriate secure storage; Android has no Keystore-backed path today. | `store.ts:1049-1067`, `types.ts:222` |
| G4 | P2 | `MdCover` image probe has no deadline (stuck skeleton on slow CDN) and keeps fetching after unmount. | `free-catalogs.tsx:72-92` |

### 2.8 Android shell — `android/app/java/com/onilibrary/app/MainActivity.java`

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| A1 | P2 | Bridge UA is stale/hardcoded `oniLibrary/1.3 (Android)` vs manifest 1.4.0; non-browser UA is already known to be refused by `uploads.mangadex.org`. | `MainActivity.java:564` |
| A2 | P2 | `fetchToCache` deletes any existing pending import file before staging — a background cover fetch can destroy an in-flight user import. | `:627`, `:689` |
| A3 | P3 | `httpGetString` drops custom headers (Basic auth) on its manual single-redirect follow. | `:578-585` |

### 2.9 Misc

| ID | Sev | Finding | Evidence |
|----|-----|---------|----------|
| X1 | P2 | Simulated download queue still reachable for non-MangaDex works (`startDownload` with `speedMbps: 1.5 + Math.random()*2`, no driver) — contradicts the v1.4.0 "no more simulated data" claim for those rows. | `store.ts:587-618`, callers `details-screen.tsx:569`, `reader-screen.tsx:1919` |
| X2 | P3 | Tracker `bestMatch` substring matching can push progress to the wrong AniList entry; `lastSyncAt` stamped even when all pushes failed. | `tracker.ts:93`, `:135` |
| X3 | P3 | Dead code: `workTitleOf`, `chapterLabelOf`, `setExtensionStatus`+`extensions` state, `hashPin` shim, `importMangaDexWork`, `appendMangaDexChapters`, `src/app/api/route.ts` (unreachable in static export). | zero-caller greps |
| X4 | P3 | `android/app/assets/www/sw.js` bundled but never registered in the shell (registration skipped when `OniAndroid` exists) — harmless, note only. | `app-shell.tsx:208-217` |

## 3. Unverified risks (not reproduced)

- **R1** MangaDex 429 storms: no inter-call pacing combined with N concurrent bg batches could exceed the anonymous budget.
- **R2** Base64 chunk decode loop (`opds.ts:91-94`) is UI-thread-bound; large acquisitions may jank the WebView.
- **R3** Whole-archive-in-memory imports on low-end devices (OOM).
- **R4** Bridge `fetchToCache` returning success while the native side logged the body — unverifiable from this repo.
- **R5** `syncWorkToTracker` fire-and-forget errors invisible (`store.ts:564-573`).

## 4. Docs vs code (contradictions to resolve in docs or code)

1. **DWN-006 (PRD P0)** "download status through a (OS) notification" — no OS
   notification code exists in `android/`; v1.4.0 shipped in-app rows only.
2. **DWN-005 (PRD P0)** "Wi-Fi-only rules applied before a download starts" —
   `settings.wifiOnly` never read by any download logic (B6).
3. **DWN-002 (PRD P0)** pause/resume/prioritize + status persists after
   reopening — real rows support cancel only; jobs die on restart (B1).
4. **EXT-001 (PRD P0)** extension install/update — contradicted by
   ARCHITECTURE.md's deferral (no arbitrary extension runtime); PRD should be
   annotated.
5. **UPD-001/002** — manual + 15-min in-app checks exist; the two paths use
   different diff keys (M3).

## 5. OPDS / Komga verdict (plan §2 decision)

The existing OPDS implementation (user servers + two built-in free catalogs +
import pipeline) is **functional and safe to retain**: no security defect
beyond plaintext credentials (G3), no fabricated remote data, import pipeline
works end-to-end. Per plan §2 ("if it already exists and is safe, keep it"),
**retain — do not remove**. Decision recorded here rather than a code flag
flip: the built-in free catalogs shipped in v1.3.0 and are user-facing
functionality; silently hiding them would regress the product. The capability
model introduced in Phase 2+ must make every source (including these)
disable/enable-able and hide-able so the §10 flag behavior can be completed
without redesign. The genuinely deferred items (Komga-specific tabs, extension
runtime) remain out of scope. Owner may still opt to default-hide them; the
flag work makes that a one-line change.

## 6. Phase 2 workplan (maps findings → plan §12 Phase 2 gate)

Gate to demonstrate: *one source failing does not erase other results;
clearing a query cannot resurrect old results; duplicate pages do not
duplicate results.*

1. **Transport contract** (fixes O1-O4, S4, T5): add timeout + typed
   `SourceError` (`timeout | http | network | parse`) in `opds.ts`; bridge
   path races a deadline instead of hanging; avoid the doomed browser-fetch
   fall-through when the bridge exists but failed.
2. **Search contract** (fixes S1, S2, S3, S5, S8): X-button routes through the
   same clear path as keyboard (cancel timer, reset committed term, clear
   results); `mdFailed` reset at run start; per-source failure list with retry;
   unmount timer cleanup; results keyed by committed term so stale terms can't
   render.
3. **Source-screen pagination contract** (fixes T1, T2, T3): run-id guard in
   `runLoad` (drop stale responses), dedup appended pages by `m.id`, surface
   page-N errors inline; total-aware load-more when the API provides it (T7).
4. **Idempotent add** (fixes T6, M1): reuse an existing work with the same
   `sourceRef` instead of duplicating (details: update chapters in place when
   applicable).
5. **Discover feed honesty** (fixes D3, D7): timeout + retry + distinct
   offline/error state for the MangaDex latest shelf; refetch when connectivity
   returns.
6. **Tests (plan §13 subset for Phase 2)**: pure helpers in
   `src/lib/search-contract.ts` — latest-wins run guard, list dedup by stable
   id, per-source result aggregation with partial failure, clear-query state
   transition, idempotent-add resolution against a work list. Covered by
   `tests/search-contract.test.ts`. UI wiring uses these helpers.

Out of Phase 2 (later phases per plan): filters UI/online filtering (D1/D2 →
Phase 3), durable download worker (B1-B7 → Phase 4), recommendation ranking
(Phase 5), a11y/touch-target sweep and i18n additions (Phase 6 hardening),
Android bridge UA/import-slot fixes (A1-A2, Phase 4 downloads round).

## 7. Acceptance criteria for Phase 2 (from §13 + §14)

- Clearing a query at any moment (keyboard or X) yields empty results with no
  late-arriving old-term data (test + manual).
- Rapid tab switches / load-more interleavings never mix feeds or corrupt the
  page cursor (test).
- A failing catalog/source shows a labeled failure with retry while other
  sources' results remain visible (test + manual).
- Every remote call has a deadline; hangs surface a typed timeout error within
  the budget (test).
- Adding the same MangaDex title twice produces one library entry (test).
- Appended pages contain no duplicate ids (test).
