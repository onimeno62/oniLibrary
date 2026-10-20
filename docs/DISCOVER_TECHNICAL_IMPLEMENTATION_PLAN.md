# oniLibrary Discover — Technical Implementation Plan

**Status:** Approved planning baseline; implementation not yet performed  
**Date:** 2026-10-20  
**Scope:** Discover, online catalog search, source abstraction, title details, library handoff, selected-chapter downloads, and recommendations  
**Target:** Android first; preserve PWA compatibility where practical  
**Product language:** English and Persian, including correct RTL behavior  
**Authority:** This document defines the implementation sequence and acceptance criteria for the Discover work. It supplements, and does not replace, `docs/PRD.md`, `docs/ARCHITECTURE.md`, and `docs/ENGINEERING_REMEDIATION_PLAN.md`.

## 1. Product decisions

These decisions are approved and should not be re-opened unless repository evidence reveals a material technical or security blocker.

1. **Source management:** curated built-in sources first; design a stable adapter contract for a future extension system. Do not build an arbitrary executable extension runtime in this milestone.
2. **Content coverage:** manga, manhwa, manhua, webtoons, and Western comics. Coverage is determined by connected, authorized sources and their actual catalogs; do not claim a source covers a type without evidence.
3. **Recommendations:** local/on-device interests and reading activity plus legitimate provider popularity feeds where available. No account or remote history upload is required.
4. **Downloads:** user-selected chapters/books only in the initial implementation. Automatic downloads are a later, explicit opt-in feature and are out of scope for the first milestone.
5. **Platform:** Android first. Preserve PWA compatibility for portable UI/domain/networking behavior, but do not promise identical background execution, storage, or download capabilities.
6. **Source policy:** official/authorized APIs and user-configured servers only. Do not add unreviewed scraping sources or repositories.

## 2. OPDS and Komga scope decision

OPDS catalogs and Komga are **deferred, optional integrations**, not required for the initial Discover milestone.

- Do not spend the first milestone implementing or expanding OPDS or Komga.
- Do not delete existing OPDS/Komga code blindly. During the repository audit, determine whether each integration is referenced, tested, stable, and safe to retain.
- If an integration already exists and is safe, keep it behind a disabled-by-default feature/configuration flag and do not show its tab or entry points until enabled.
- If it is incomplete, broken, or creates material maintenance/security risk, isolate it or remove it only with tests and a documented rationale. Do not break local reading, local library data, or unrelated source integrations.
- When enabled in a later release, each integration may appear as a separate Discover tab/section (for example, **OPDS** or **Komga**) and in source management. It must not be mixed into global feeds by default unless the user enables it.
- The future settings UI must make enablement explicit and explain any server URL/authentication requirements. Store credentials using platform-appropriate secure storage; never log secrets.
- OPDS and Komga are not public global indexes by default. They represent a catalog/server the user configures or is authorized to access.

This means the first release should focus on the currently supported, authorized catalog path(s), with MangaDex as the initial first-class online adapter if the existing implementation and current API behavior pass audit. Keep the source abstraction extensible so OPDS/Komga can be re-enabled or added later without redesigning Discover.

## 3. Product goals and non-goals

### Goals

- Make Discover a real online discovery hub, not a view that substitutes local library items when remote requests fail.
- Provide cross-source search over enabled and searchable sources, with source attribution and partial-success behavior.
- Support source-capability-aware Popular, Latest, Recently Updated, genre browsing, and filters.
- Let users inspect a title, add it to their library without downloading, and select chapters/books to download where permitted.
- Keep recommendations useful for new users and private by default.
- Maintain English/Persian parity, RTL correctness, and graceful offline behavior.

### Non-goals for the first implementation milestone

- Arbitrary third-party extension execution or extension-store UI.
- Automatic chapter downloads or scheduled source polling.
- Remote personalization based on uploaded reading history.
- Forcing OPDS/Komga implementation or visibility.
- Guaranteeing every filter or feed for every source.
- Replacing the existing app architecture wholesale.

## 4. Required repository audit before code changes

Before modifying code, inspect the current branch and repository state, then produce a short audit mapped to actual paths and symbols.

Inspect at minimum:

- `src/components/screens/discover-screen.tsx`
- `src/components/screens/search-screen.tsx`
- `src/components/screens/extensions-screen.tsx`
- `src/components/screens/source-screen.tsx`
- `src/lib/store.ts`
- `src/lib/builtin-sources.ts`
- `src/components/sources/free-catalogs.tsx`
- `src/lib/mangadex.ts`
- all source/download/library/detail models and related tests
- `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ENGINEERING_REMEDIATION_PLAN.md`
- package scripts, CI workflows, Android shell/download bridge, and PWA storage/service-worker behavior

Record for every finding: severity, evidence/path, expected behavior, proposed fix, dependencies, tests, and acceptance criteria. Separate confirmed defects from risks that have not yet been reproduced. Verify the actual active branch, PR state, and CI status; do not assume an earlier snapshot is current.

## 5. Target architecture

Follow the current repository architecture where practical. Add boundaries incrementally; do not create layers solely for theoretical purity.

### Layers

1. **Discover UI/state:** search, feed tabs, filters, title cards, loading/error/empty states, title details, source settings entry points.
2. **Use cases:** search catalogs, browse feed, fetch title detail, list chapters/books, add/remove library reference, queue selected downloads, generate recommendations.
3. **Domain/source contract:** normalized models, stable IDs, capabilities, pagination, source status/error types, conservative deduplication.
4. **Adapters:** provider-specific API mapping and source configuration.
5. **Persistence/platform adapters:** existing library/progress storage, durable download state/artifacts, secure credential storage, Android background work, and PWA-compatible alternatives.

### Core model concepts

Adapt existing models where possible; avoid maintaining duplicate parallel models.

- **SourceDescriptor:** stable source ID, name, enabled/configured state, trust/authorization classification, supported capabilities, configuration requirements.
- **SourceTitleRef:** `sourceId + remoteTitleId`; a remote ID is not globally unique.
- **CatalogTitle:** normalized title/alternative titles, synopsis, cover, creator metadata, genres/tags, content type, language, publication status, timestamps, and one or more source references when known.
- **ChapterRef:** `sourceId + remoteChapterId`, with source metadata needed to retrieve it.
- **SearchQuery:** query text, selected enabled sources, supported filters, sort, page/cursor.
- **SourceResult<T>:** data, pagination, source status, and typed errors/partial failures.
- **LibraryEntry:** local user-owned entry linked to one or more source references, without requiring a download.
- **DownloadTask:** chapter/book reference, queued/downloading/completed/failed/canceled state, progress, retry metadata, local artifact reference, and actionable error.
- **Recommendation:** candidate, reason/explanation, ranking signals/provenance, and optional dismissal state.

Do not rename/rewrite working models without a demonstrated need. Migration must preserve existing local works, reading progress, settings, and files.

### Source capabilities

Each source must declare or reliably detect support for:

- search and pagination
- latest, popular, and recently updated feeds
- genres/categories and filter dimensions
- title details and chapter/book listings
- page/image/file retrieval and downloads
- authentication and connection testing

Represent a capability as supported, unsupported, or unknown. Hide or disable unsupported actions. Never fabricate Popular data, timestamps, genres, or download support. Apply a filter remotely when supported; apply it locally only when the source result set makes that filter semantically honest. Explain partial coverage when some sources cannot honor a filter.

### Identity and deduplication

- Always preserve source identity: `sourceId + remoteId`.
- Do not deduplicate unrelated records by title text alone.
- Cross-source matching may use normalized title/alternative titles, creator, year, language, and other metadata as a suggestion, not an irreversible merge.
- Let the user link/unlink alternate source records when ambiguity remains.
- Never lose access to the original source record when linking titles.

## 6. Discover UX requirements

### Primary navigation and content

Provide the following entry points when backed by real data:

- **Search** — cross-source search across enabled searchable sources.
- **Popular** — provider popularity feed(s); indicate source/coverage and avoid fabricated global rankings.
- **Latest** — latest uploads/publications as defined by the source.
- **Recently Updated** — based on genuine source timestamps where available.
- **Genres / Explore** — browse genres and content types supported by connected sources.
- **Recommended for You** — local-first ranking with available provider feeds.
- **Sources** — source status and settings, not a substitute for filters.

The visual treatment can use a search bar, compact category/type chips, horizontal shelves, and a filter panel. Final placement must follow the existing design system and mockups rather than introducing a separate visual language.

### Filters

Implement the filters that can be supported honestly by the enabled sources:

- content type: manga, manhwa, manhua, webtoon, Western comic (allow multiple)
- genre/tag
- source
- language
- publication status
- sort order, such as relevance, title, latest update, or source popularity where defined

The filter button must open an actual filter UI. Category chips must filter online catalog results, not only local library items. Keep local **Continue Reading** and recent-library sections clearly separate from online results.

### States and interactions

Every remote operation must have intentional loading, empty, offline, error, retry, and partial-source-failure states. Clearing the search query must clear or reset results as specified and cancel pending debounce work. Old requests must not overwrite newer results. Never silently substitute local items for failed online results.

## 7. Search and source networking requirements

- Fix debounce cleanup and clear-query races.
- Prevent stale results/errors from carrying into a new query.
- Use cancellation or request identity guards to prevent out-of-order responses from winning.
- Apply request timeouts and source-specific error handling.
- Continue rendering valid results when one source fails; expose a compact, accessible indication of failed sources and a retry action.
- Support pagination/infinite loading without duplicate pages or repeated items.
- Deduplicate using stable source-aware keys.
- Respect provider API terms, rate limits, attribution, authentication, and caching rules.
- Do not log tokens, credentials, private server URLs with embedded secrets, or reading history.
- Keep the local library and offline reader usable when all remote sources are unavailable.

## 8. Title detail, library, and downloads

### Title detail

Show available metadata and source attribution, then offer only actions supported by that source. Clearly distinguish the normalized work from the individual source edition/record.

### Add to Library

- Adding a title is a metadata/reference operation; it does not start a download.
- Repeated adds should be idempotent.
- Preserve source references so a user can refresh metadata or choose another provider.
- Do not replace local imported files or existing reading progress when an online title looks similar.

### Selected-chapter downloads

Initial scope is explicit user-selected chapters/books only.

- Display which source provides each selected item.
- Queue tasks with persistent status and progress.
- Support cancel, retry, recoverable failure, and safe restart behavior.
- Validate response size/type and handle missing pages, expired URLs, network interruption, and insufficient storage.
- Mark a task complete only after the artifact is durably stored and verified.
- Re-open completed downloads offline and after application restart.
- Do not download automatically just because a title was added to the library.
- Automatic downloads are a separate future feature with explicit per-title/global opt-in, Wi-Fi/storage controls, and tests.

## 9. On-device recommendations

Use a deterministic, explainable baseline first. Inputs may include user-selected interests, genres/content types, meaningful reading activity, explicit exclusions/dismissals, and legitimate provider popularity/recency feeds.

- Do not upload reading history for recommendations.
- Avoid treating a single accidental open as a strong preference.
- Explain recommendations with concise reasons.
- Provide controls to refine interests, dismiss candidates, clear history/signals, and disable personalization.
- For a new user with no history, use onboarding interests and available provider feeds.
- Keep ranking logic independent of UI and test it with deterministic fixtures.
- Do not describe a provider feed as global popularity unless its semantics genuinely justify that label.

## 10. OPDS/Komga future feature-flag behavior

If existing or future adapters are retained:

- Default them to disabled and hidden in Discover.
- When explicitly enabled/configured, show a dedicated source tab/section only if that integration can actually supply its promised operations.
- Let users disable an integration without deleting library entries or downloaded files.
- Preserve user configuration safely and provide a connection-test action.
- Do not show a nonfunctional tab for an unconfigured server.
- Test both disabled and enabled states, including migration from any existing settings.
- Keep these adapters outside the initial release-critical path.

Do not introduce feature flags as a substitute for removing dead or unsafe code. The audit should decide whether each existing implementation is retained behind a flag, repaired later, or removed safely.

## 11. Android-first / PWA compatibility

Keep domain types, source contracts, query normalization, filter semantics, and recommendation ranking portable wherever the existing stack supports it.

Use platform abstractions for:
- secure credential storage
- durable file storage
- background/retry scheduling
- notifications
- file access and sharing

Android may provide durable background downloads and platform-secure credentials. The PWA must degrade gracefully when browser storage quotas, CORS, service-worker rules, or background execution prevent the same behavior. Do not promise parity for platform-dependent capabilities.

## 12. Implementation phases and gates

### Phase 1 — Audit and baseline (P0)

Inventory actual code, branches/PRs/CI, models, tests, current source capabilities, OPDS/Komga state, and Android/PWA behavior. Produce a path-by-path audit and reproducible test/build baseline.

**Gate:** findings distinguish verified bugs from unverified risks; no code changes until this audit is understood.

### Phase 2 — Stabilize source/search contract (P0)

Fix request races, debounce/clear behavior, stale errors, pagination, source-aware IDs, timeouts, partial failure, and retries. Add unit/integration tests.

**Gate:** one source failing does not erase other results; clearing a query cannot resurrect old results; duplicate pages do not duplicate results.

### Phase 3 — Real Explore feeds and filters (P1)

Implement the supported online feeds, category/type filtering, filter panel, pagination, attribution, and remote-state UI. Keep local library shelves separate.

**Gate:** each feed/filter has defined source semantics; no fabricated data or silent local fallback.

### Phase 4 — Detail, library linking, selected downloads (P1)

Complete detail/chapters, idempotent add-to-library, source linking, selected-download queue, persistent progress, retry/cancel, and offline reopening.

**Gate:** selected content survives restart and can be read offline; adding to library alone never downloads.

### Phase 5 — Recommendations and source settings (P2)

Implement local-first explainable ranking and basic source enable/configuration management. Preserve the future extension contract without executing arbitrary extensions. OPDS/Komga remain optional and disabled by default.

**Gate:** useful new-user recommendations, privacy controls, and no dependence on remote user-history upload.

### Phase 6 — Hardening and release validation (P2)

Verify English/Persian and RTL, accessibility, Android device/emulator behavior, PWA degradation, storage, error cases, automated tests, build artifact, and installation.

**Gate:** all release checks are run against the exact reviewed commit; unverified features are explicitly reported.

## 13. Required tests

At minimum, add or extend tests for:

- debounce, clear query, rapid typing, cancellation/request identity, stale result and stale error races
- one source failing while another succeeds; all sources failing; offline retry
- source-aware deduplication and ambiguous cross-source matching
- pagination and duplicate page prevention
- unsupported filter/capability behavior
- local library results never masquerading as online results
- idempotent Add to Library and preservation of local files/progress
- download queue transitions, cancellation, retry, interrupted restart, corrupt/oversized response, low storage, and offline reopen
- recommendation ranking determinism, no-history behavior, exclusions/dismissal, and privacy controls
- OPDS/Komga disabled by default, no tabs when disabled/unconfigured, and isolated behavior if enabled
- English/Persian labels, RTL layout, long text, accessibility, Android shell, and PWA smoke tests

Use mocked API responses and deterministic fixtures for most tests. Add limited integration checks against supported APIs without making CI depend on external service availability.

## 14. Definition of done

Discover is not complete because it renders or one API returns data. It is complete only when:

- online feeds/search and filters have honest, source-backed semantics
- loading, empty, offline, retry, and partial-failure states are covered
- source identities and cross-source links are safe and stable
- library additions are separate from downloads and preserve user data
- selected downloads are durable, recoverable, and reopen offline
- recommendations are explainable, local-first, and controllable
- OPDS/Komga are out of the initial critical path and hidden unless explicitly enabled
- English/Persian RTL and Android/PWA capability differences are tested
- automated checks/build/install validation are reported with evidence
- documentation states what is implemented, partial, unsupported, and unverified

## 15. Agent execution instructions

1. Read this document and the linked PRD, architecture, and engineering remediation plan before changing code.
2. Verify the current branch, open PRs, CI, and working baseline. Do not assume historical branch/PR state is current.
3. Produce the Phase 1 audit with file paths, evidence, priorities, and tests.
4. Implement only the earliest phase whose dependencies and gate are satisfied; keep changes incremental and reviewable.
5. Preserve existing user data and unrelated working functionality. Do not perform broad deletion/refactors without an evidence-backed need.
6. Do not implement OPDS/Komga as required features; retain only if safe, hidden and disabled by default. Do not add arbitrary executable extensions.
7. Run available tests, lint, typecheck, asset verification, Android build, and relevant PWA checks. Report commands and actual outcomes; never suppress failures or claim unrun checks passed.
8. Use a dedicated feature branch and a pull request. Do not push directly to `main`, merge, or change release credentials without explicit authorization.
9. At the end of each phase, report changed paths, rationale, tests, failures/limitations, and the gate decision before moving to the next phase.
10. Do not mark any feature complete unless its acceptance criteria have been verified.
