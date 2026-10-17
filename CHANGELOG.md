# Changelog

All notable changes to oniLibrary are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is semantic.

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
