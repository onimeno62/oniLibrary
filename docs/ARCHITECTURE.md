# Architecture

oniLibrary is **one reader UI, two shells**:

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│        Android APK          │      │         Web / PWA            │
│  MainActivity (WebView)     │      │  any browser, installable    │
│  ├─ virtual https origin    │      │  service worker offline      │
│  ├─ asset interceptor ──────┼──┐   │                              │
│  └─ OniAndroid JS bridge    │  │   │                              │
└─────────────────────────────┘  │   └──────────────────────────────┘
                                 ▼
                 ┌───────────────────────────────┐
                 │   Next.js static export (SPA) │
                 │   src/app · components · lib  │
                 └───────────────────────────────┘
```

## Web app (src/)

| Layer | Files | Responsibility |
|---|---|---|
| State | `lib/store.ts` | zustand store (`onilibrary-store-v1`), persisted to localStorage: works, chapters, categories (+ smart rules), settings, stats, reading progress. Navigation store is transient. |
| Persistence | `lib/local-files.ts` | IndexedDB blob store (`onilibrary-files`) for multi-MB content: pages (`<id>::pN`), PDFs (`::pdf`), parsed EPUBs (`::epub`). Keyed per work. |
| Import | `lib/importer.ts` | CBZ/ZIP (fflate), natural-sorted image batches, PDF, EPUB parsing (OPF/manifest → sanitized chapter HTML), cover extraction. |
| Engines | `lib/pdf-engine.ts` (pdf.js + WASM), EPUB reader, image pipeline | format-specific renderers behind one reader screen. |
| Reader | `components/screens/reader-screen.tsx` | paged / vertical modes, fit & zoom, tap zones, presets, TTS queue. |
| i18n | `lib/i18n.ts` | en/fa dictionaries; RTL handled at layout level. |
| Shell | `components/app-shell.tsx` | theme (`dark` class on wrapper), phone-frame layout, PWA SW registration (skipped inside APK via `OniAndroid` guard). |

**Data stays on-device**: localStorage (state) + IndexedDB (blobs). The optional
search/source features that need network degrade gracefully offline.

## Online discovery and source integrations

The Discover screen's approved target behavior and implementation sequence are specified in
[Discover Technical Implementation Plan](DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md).
That plan is authoritative for Discover-specific scope, acceptance criteria, and rollout.

Key constraints:

- Keep online catalog results distinct from the local library and Continue Reading shelves.
- Put provider-specific behavior behind a capability-aware source adapter contract.
- Use source-scoped remote identities (`sourceId + remoteId`) and conservative cross-source linking.
- Handle partial source failures without discarding successful results.
- Android is the first-class target for durable selected-chapter downloads; preserve PWA compatibility where practical and document platform limitations.
- Recommendations are local-first and explainable; do not upload reading history for personalization.
- OPDS and Komga are deferred optional integrations. Existing code must be audited before removal; retain them only if safe, disabled and hidden by default. They may later appear as separate Discover tabs/sections when explicitly enabled and configured.
- Do not add arbitrary executable third-party extensions in the initial implementation. Design for a future adapter/extension contract without implementing an unsafe runtime.

## Android shell (android/app/)

`MainActivity.java` — no Gradle, no Cordova:

- **Virtual origin**: serves `assets/www` at `https://appassets.androidplatform.net`
  via `shouldInterceptRequest`, giving a *secure context* so localStorage /
  IndexedDB / service-worker APIs behave like a real site. Every host path is
  mapped onto `assets/www/…` with directory + `.html` fallbacks and a `404.html`
  bail-out for unknown pages.
- **MIME table** covers js/css/fonts/images/wasm/epub/cbz; `_next/**` is served
  `Cache-Control: immutable`.
- **JS bridge** (`window.OniAndroid`):
  - `exportFile(base64, name, mime)` → MediaStore Downloads (API 29+) with
    share-sheet fallback via `ShareProvider` (FileProvider).
  - `ttsSpeak / ttsStop / ttsAvailable` → native `TextToSpeech`, chunk-completion
    reported back through `window.OniNativeTts.done()`.
  - `setOverlayDepth(n)` → hardware back pops the SPA overlay stack before
    leaving the app.
- Back navigation, lifecycle (pause TTS), instance-state restore (`saveState`).

## Build & release pipeline

```
STATIC_EXPORT=1 next build ──► out/ ──► android/app/assets/www
        aapt2 (res+assets) ─► base.apk ─► ecj (java) ─► d8 (dex)
        zipalign ─► apksigner (oni-debug.keystore) ─► download/oniLibrary-vX.Y.Z.apk
        verify-apk-assets.cjs (gate: every bundled URL resolves)
```

See [BUILDING.md](BUILDING.md). The APK version lives in
`android/app/AndroidManifest.xml`; the release filename in `scripts/build-apk.sh`.

## Design sources

Original product mockups used as the visual reference live in
[`docs/design/`](design/) and the product spec in [PRD.md](PRD.md).
