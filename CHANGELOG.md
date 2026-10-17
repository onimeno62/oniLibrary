# Changelog

All notable changes to oniLibrary are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is semantic.

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
