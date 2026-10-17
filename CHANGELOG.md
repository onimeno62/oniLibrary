# Changelog

All notable changes to oniLibrary are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0); versioning is semantic.

## [1.2.0] — 2026-10-17

### Added
- **CBR/RAR support** — real CBR archives now import and read via the
  official unrar compiled to WebAssembly (`node-unrar-js`, 207 KB wasm
  fetched once from `/wasm/unrar.wasm`). RAR4 + RAR5 verified against real
  archives; password-protected CBRs report a precise "encrypted" reason and
  multi-volume sets explain they need extraction. The old "convert to CBZ"
  refusal is gone.
- **Folder import** — the library FAB gains "Import folder": pick a folder
  and oniLibrary builds one work from it — images in subfolders become
  chapters (title = folder name), "Vol 03"/"Chapter 12.5"-style names are
  parsed into chapter numbers, archives inside folders become their own
  chapters, and the suggested work title (the folder's name) is editable in
  a preview dialog that lists every detected chapter before anything is
  stored.
- **Add to existing work** — FAB "Add to work…" opens a searchable work
  picker; picked files are appended as new chapters (CBZ/ZIP/CBR → one
  chapter each, loose images → one combined chapter) with numbering that
  continues from the work's last chapter. PDF/EPUB still land as separate
  works by design. On Android the native picker bridge participates through
  a staged-import route, so the same flow works without the WebView chooser.
- **OPDS catalogs** — Personal Servers is now real: add an OPDS URL,
  "Test connection" fetches the feed, and "Browse" opens the catalog with
  cover thumbnails, authors, summaries and pagination ("Load more"). "Add"
  downloads the acquisition file and imports it straight into the library
  with entry metadata. On Android both feeds and downloads run through two
  new native bridge methods (`httpGetString`, `fetchToCache`) — no CORS
  limits; in browsers it uses plain fetch.
- **Tracker sync (AniList)** — Settings → Tracker sync: paste a personal
  AniList token (validated live against the GraphQL API), then progress
  syncs automatically after each finished chapter and on demand ("Sync
  now"). Works are matched by title search and remembered; a summary toast
  reports pushed/matched/failed. Vaulted works are never synced.
- **Editable profile name** — onboarding asks "What should we call you?"
  and Settings gains a Profile card; the name drives the Home greeting and
  the More-screen identity card. Localized EN + FA.

### Fixed
- **Fake status bar removed** — the mockup's decorative "9:41" notification
  bar is gone; the app now starts directly with screen content.
- **100%-read works** — fully read works no longer render a progress bar or
  percentage in the library grid/list; the green "Completed" badge alone
  marks them (also applies in list view).

## [1.1.3] — 2026-10-17

### Added
- **Discover promo carousel** — the "Discover More" banner is now a real
  3-slide carousel matching the mockup's page dots: swipeable, auto-advancing
  every 5 s (pauses on touch), with clickable dots. Two new AI-illustrated
  slides: "Read Anywhere" (→ Downloads) and "Your Secret Vault" (→ Vault),
  localized in English and Persian.

### Fixed (mockup-parity audit)
- **Library** — the card ⋯ menu is now always visible (was hover-only, hence
  invisible on touch devices); the header shows the mockup's search icon
  (focuses the search field; multi-select stays available via long-press);
  status badges use the mockup's minimal style — green dot "Completed",
  percent + pause for On hold, sky dot "Planned", red dot "Dropped".
- **Downloads** — "See all" links added to the Active and Completed section
  headers (jump to the matching filter); the Storage Usage card now matches
  the mockup: "57.6 GB / 64 GB" + percent + linear coral bar, keeping the
  per-segment legend, Wi-Fi-only switch and Clear cache action.
- **Details** — read chapters get the mockup's filled orange check circle
  (previously a translucent outline); the chapters header reads
  "Sort by: Latest ⌄" with a chevron affordance; rating counts show one
  decimal ("412.3k" instead of "412k").
- **Reader** — the chapter-list control label is now "Chapter List" as in the
  mockup.

## [1.1.2] — 2026-10-17

### Fixed
- **Reader crash on open (Android)** — device report: "Error invoking
  setVolumeKeyMode: Java bridge method can't be invoked…" error screen the
  moment the reading screen opened. Some Android System WebView builds reject
  Java-bridge invocations outright (argument unmarshaling quirks on the
  `boolean` parameter), throwing straight into the screen's error boundary.
  Every native bridge call is now defensive:
  - the volume-key toggle coerces its argument to a strict primitive and
    swallows any bridge exception (`Boolean(active)` + try/catch), so a
    WebView quirk degrades to "volume keys off" instead of a dead screen;
  - the same hardening applied to every other bridge call site — TTS
    availability/speak/stop, overlay depth, biometric vault prompt, native
    file picker (falls back to the WebView chooser), and staged-import
    polling — a rejected bridge call can no longer crash any screen.
- **CBZ archives reported "Unsupported"** — real-world `.cbz` files failed
  import even though plain `.zip` worked, because the importer trusted the
  extension and fflate's all-or-nothing `unzipSync`. The archive pipeline is
  rebuilt:
  - **magic-byte sniffing** — `.cbz` files that are actually RAR (`Rar!…`) or
    7z containers now show a precise, actionable reason ("convert it to
    CBZ/ZIP") instead of a generic unsupported toast; conversely, mislabeled
    archives import fine regardless of their name;
  - **per-entry salvage walker** — when `unzipSync` throws (exotic/zip64/
    partially corrupt archives), a raw central-directory parser inflates each
    member independently, so one unsupported or broken entry no longer
    dooms the whole comic (verified: a bzip2-member archive now imports its
    readable pages);
  - **encrypted detection** — password-protected members are reported as
    "password-protected archive";
  - extension-less names from some Android content providers are sniffed and
    imported if they contain readable images;
  - AVIF/JFIF images inside archives (and loose) are now accepted;
  - unsupported toasts carry a per-file reason line (EN/FA) and the library
    import hint now states CBR/RAR isn't supported yet.

### Verification
- 33/33 APK asset URLs resolve; APK `versionCode=5 versionName=1.1.2`;
- browser QA: valid CBZ imports (3/3 pages), RAR-renamed CBZ → clear reason,
  no-image zip → reason, extension-less zip → imported, bzip2-member zip →
  salvaged (2 pages); reader opens with a deliberately throwing bridge and
  volume-key events turn pages (1/3 → 2/3) with zero console errors.

## [1.1.1] — 2026-10-17

### Fixed
- **Android: local file import did nothing** — the shell never attached a
  `WebChromeClient`, so `<input type="file">` silently no-op'd in the WebView.
  Two complementary paths now exist:
  1. `onShowFileChooser` is implemented (standard fix — also restores chapter
     re-import on the details screen and backup restore), and
  2. a deterministic **native picker bridge** (`OniAndroid.pickImportFile`) that
     the library import button prefers on Android — the picked file flows
     through the same chunked channel as Share/Open-With, so it works
     regardless of WebView file-chooser quirks.
- **Reader crash hardening** (device-reported "Application error" after opening
  the reading screen):
  - a global error screen replaces the dead-end stock page — reload, clear
    app state, and copyable error details for bug reports;
  - an overlay error boundary keeps any screen crash recoverable (back to
    library / try again) instead of killing the whole app;
  - the PDF engine capability-gates `structuredClone` before loading
    pdfjs-dist v6 and shows an actionable "update Android System WebView"
    card (en/fa) on old WebViews instead of failing opaquely;
  - `ResizeObserver` usages degrade gracefully on ancient WebViews;
  - the persisted store now reads/writes through guarded storage so a
    corrupted payload or private-mode exception cannot crash hydration;
  - `importFiles` isolates per-file failures — one corrupt file no longer
    aborts a whole batch (new `imp.failed` toast on total failure, en/fa).

### Changed
- Version → 1.1.1 (versionCode 4). Same signing key as 1.0.1/1.1.0 — installs
  over the top and keeps all data.

## [1.1.0] — 2026-10-17

### Added
- **Android: volume-key page turning** (RDR-010) — native key interception with a
  per-reader opt-in bridge; Vol↓ = next, Vol↑ = previous; toggle in Settings › Reader.
- **Android: Share / Open-With import** (LOC-001) — ACTION_VIEW/SEND intent filters;
  received files stream into the library through a chunked native bridge (large PDFs safe).
- **Android: real platform BiometricPrompt Vault unlock** (VLT-002, API 28+) with the
  web-simulation fallback kept for browsers.
- Discover: per-source menu to pin / unpin / enable / disable (SRC-004) with visual states.
- Bulk selection: real category picker, full 5-status picker, bulk favorite (LIB-007).
- Library grid density control — Compact / Cozy / Large (UX-003), persisted.
- Settings: About section (version + GitHub), reader behaviour toggles (auto-advance,
  border crop, keep-awake, volume keys), double-page added to reader defaults.
- Auto update-check every 15 minutes while the app is open, honoring the toggle (UPD-002/004).
- Backup v2 (BKP-001): reading history, saved filters, source enable/pin flags and
  personal servers now included in `.onibackup`.

### Fixed
- Downloads: cancel is now reachable from active/queued rows (DWN-002) and failed
  downloads actually occur (simulated network error) so the ERROR → retry path works (DWN-004).
- Notification emission now respects per-type preferences (NTF-002).
- Backup wording no longer claims encryption; the file scope is stated honestly.
- Existing installs migrate cleanly: new Settings keys fall back to defaults via a
  persist-merge step (volume-key paging, grid density).
- Bottom navigation labels and statistics heatmap months are fully localized (BIL-007/010).

## [1.0.1] — 2026-10-15

### Fixed
- **Android: white screen on launch** (v1.0.0 regression). The WebView asset
  interceptor only served URLs under the `/assets/` prefix, while the bundled
  app references its JavaScript/CSS at root-absolute paths (`/_next/static/…`).
  Every script and stylesheet failed to load, leaving the unstyled HTML shell —
  a white page with only the orange oni logo. The shell now serves **every**
  request on its virtual host, with directory/page fallbacks, correct MIME
  types (incl. EPUB/CBZ/WASM), immutable caching for build chunks, and binary-safe
  encoding.
- Gitignore `local-*` rule was un-anchored and silently excluded
  `src/lib/local-files.ts` from version control; rule is now root-anchored and
  the module is committed.

### Added
- `scripts/verify-apk-assets.cjs` — build-gate that simulates the native asset
  interceptor against the packaged APK and asserts every referenced URL resolves.
- GitHub Actions workflow to build the APK on demand (`.github/workflows/apk.yml`).

## [1.0.0] — 2026-10-15

### Added
- **Reader** — manga (RTL paged), comics (LTR paged, white), webtoon (vertical,
  gapless), PDF (pdf.js, WASM), EPUB (parsed chapters, sanitized HTML).
- Fit modes (width / height / screen / original), zoom to 2× with pan, rotation,
  brightness, per-series reading presets, one-handed auto-advance, direction-aware
  side taps.
- **Library** — works grid & list, status/type filters, text search, categories,
  smart categories with live rule builder (status / type group / downloaded /
  unread / favorite), saved filters, multi-select batch actions, vault (hidden
  works), duplicates assistant.
- **Import** — CBZ/ZIP, image batches (natural-sorted), PDF, EPUB; covers auto-
  extracted; storage estimate; per-chapter downloads for catalogue works.
- **Statistics** — reading time, chapters finished, streaks, daily goal ring,
  14-day activity heatmap; CSV export.
- **Read-aloud (TTS)** — paragraph queue, web voices or native Android TTS bridge.
- **Discover & Updates** — curated rails, latest chapter feed, notification badges.
- **Bilingual** — English + Persian (fa) with full RTL layout; Light / Dark /
  System themes; onboarding.
- **Data** — export/import `.onibackup`, CSV export, native "Save to Downloads"
  bridge on Android.
- **Android shell** — offline WebView app (minSdk 24 / target 34), virtual-host
  asset serving with secure context, TTS + export bridges, back-button overlay
  stack handling, system share sheet fallback.
- PWA service worker (web only), sample content (guide PDF + demo EPUB book).
