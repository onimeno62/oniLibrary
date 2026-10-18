# Security & QA Checklist — oniLibrary

Checked items were **verified in this round** on branch `fix/security-remediation`
(method noted per item). Unchecked items are open and prioritized in
`ENGINEERING_REMEDIATION_PLAN.md`. Nothing on this list is assumed — each
claim links to the check that proves it.

## A. WebView / bridge security
- [x] Navigation from the shell WebView is locked to the app origin; external
  http(s) opens the system browser; non-http schemes are dropped.
  *(code review — MainActivity `shouldOverrideUrlLoading`, `openExternally`)*
- [x] The `OniAndroid` bridge can only ever be reached by the bundled app
  origin (consequence of the navigation lock; the interface remains attached
  by design for the shell itself).
- [x] Asset serving rejects `..` and NUL before touching AssetManager.
- [x] Renderer crash does not kill the app: `onRenderProcessGone` handled,
  returns `true`, rebuilds the shell.
- [x] `allowFileAccess=false`, `allowContentAccess=false`; no
  `setAllowUniversalAccessFromFileURLs` anywhere.
- [x] `usesCleartextTraffic=false` AND the bridge GET helpers reject non-https
  (defense in depth — platform + call-site).
- [x] WebView destroyed on activity teardown; no leaked bridge after exit.
- [x] `ShareProvider` (content provider) remains strictly flat with a
  canonical-path containment check; `exported=false`.
- [ ] **Open**: fuzz the asset interceptor with encoded paths (`%2e%2e`,
  double-encoding) against a real device.
- [ ] **Open**: consider CSP meta tag for the bundled app (defense in depth
  for the SPA itself).

## B. Vault privacy
- [x] PIN records: salted PBKDF2-SHA256 (120k iterations, 128-bit random
  salt, WebCrypto); no plaintext, no weak hash for new records.
  *(tests/vault-crypto.test.ts)*
- [x] Legacy hash records migrate transparently on the next successful
  unlock; verification still accepts them meanwhile (no lockouts on upgrade).
  *(tests + manual test M-10)*
- [x] No unauthenticated unlock path: the web “simulated scan” fallback is
  removed; biometrics require the native bridge. *(code review)*
- [x] Brute force: 5 attempts → 30 s lockout (session-persistent).
- [x] Vault metadata masking on Library / Home / Discover / Search / Stats /
  Updates / More / Notifications / History (audit table in the plan).
- [x] Deleting a Vault work purges its notifications/history/bookmarks so the
  title cannot leak from orphaned entries. *(tests)*
- [x] Backup export strips the PIN record and catalog credentials; import
  never overwrites the device-local PIN. *(tests)*
- [x] `allowBackup=false` (cloud/adb backup of app data disabled).
- [ ] **Open**: encrypt Vault page blobs at rest (Keystore-wrapped key via
  native bridge) — VLT-003.
- [ ] **Open**: server-side HTTP Basic credentials are still plaintext at
  rest in localStorage (masked from backups now). Move to
  sessionStorage or native Keystore later.

## C. Data integrity
- [x] Backup import validates every section; wrong types refuse the restore;
  invalid work rows are dropped; the download queue restores with v3.
  *(tests/store-logic.test.ts)*
- [x] Works deletion cleans all satellite collections. *(tests)*
- [x] Persisted store reads/writes through guarded storage (corrupt payload
  or private-mode exceptions degrade, never crash hydration).
- [x] Version-bump chain intact: manifest 1.3.0→**1.3.1 (versionCode 11)** on
  this branch; `verify-apk-assets.cjs` validates the built APK assets (35/35
  on the last available build) and degrades gracefully without the SDK.
- [ ] **Open**: a dedicated store `version`/migrate step for future schema
  changes (the `merge` fallback covers new settings keys today).

## D. File import
- [x] Extension never trusted alone — magic-byte sniffing for
  ZIP/RAR4/RAR5/7z. *(tests/importer-logic.test.ts)*
- [x] 600 MB ceiling with an honest `toobig` reason in every import path.
- [x] Partial-page storage failures counted and surfaced per path (import
  files, add-to-work, folder commit, files-as-work) with an en/fa toast.
- [x] Per-file error isolation (one corrupt file never aborts a batch).
- [x] “Meta work” fallback is deterministic (12 pages) and honestly labeled.
- [ ] **Open**: stream large archives instead of full buffering (would raise
  the ceiling safely) — engineering-heavy; keep the cap meanwhile.
- [ ] **Open**: automatic duplicate detection at import time (manual
  duplicates screen exists).

## E. Reader progress & offline
- [x] History “Resume” restores the latest page (entry refreshed on page
  change). *(tests + manual M-6)*
- [x] EPUB progress writes debounced (400 ms) + flushed on unmount; no
  per-frame full-store serialization.
- [x] `continueReading` handles ratio and legacy absolute lastPage identically
  to the reader restore, clamped to range. *(tests)*
- [x] Downloads stall on real disconnection or Offline mode and resume
  automatically; hint text honest about Wi-Fi *type* detection limits.
- [x] Failed downloads offer retry, not a phantom “Open”.
- [ ] **Open**: wire the demo download queue to real byte downloads for
  remote sources (DWN convergence — plan §P2-28).
- [ ] **Open**: surface an explicit offline banner when reading remote-source
  works with no cached copy.

## F. Localization / RTL
- [x] en/fa key parity compile-enforced (`Record<TranslationKey, string>`) and
  runtime-tested; all new strings exist in both locales. *(tests/i18n.test.ts)*
- [x] No hardcoded user-facing English strings left in the touched screens
  (notification bodies and EPUB re-import card were the last ones).
- [x] RTL layout is locale-driven; manga/comic reading direction is
  work-driven and never flips with the locale (reader paged track, tap
  zones, keyboard arrows all read `work.direction`). *(code review + M-9)*

## G. Release gates (per release)
- [x] `bun run lint` clean. *(this branch)*
- [x] `bunx tsc --noEmit` clean. *(this branch)*
- [x] `bun run test` — 28/28. *(this branch)*
- [x] `node scripts/verify-apk-assets.cjs` — 35/35 asset URLs resolve;
  aapt2 badging optional when the SDK is absent.
- [ ] **Open (this branch)**: `bash scripts/build-apk.sh --fresh` must be run
  on an Android-SDK machine; APK output name updated to v1.3.1.
- [ ] **Open (this branch)**: manual suite M-1…M-10 in the remediation plan.
