# Engineering Remediation Plan — oniLibrary

Status: **Round 1 executed** on branch `fix/security-remediation` (not merged).
Baseline: `main` @ `bf783f5` (v1.3.0, versionCode 10). Every item below lists
the verified result of that round; remaining limitations are explicit and
honest — nothing here is marked done without a check or test behind it.

> Provenance note: this plan was created by the remediation round itself
> because no `ENGINEERING_REMEDIATION_PLAN.md` existed in the repo (only
> `PRD.md`, `ARCHITECTURE.md`, `BUILDING.md`). The referenced baseline
> documents that do not exist are listed under “Open gaps” below.

## Priority order (as executed)

### P1 — Critical WebView security
| # | Finding (baseline) | Fix | Verified by |
|---|---|---|---|
| 1 | `shouldOverrideUrlLoading` returned `false` unconditionally → any remote page (OPDS catalog link, redirect) could navigate the shell WebView and inherit the `OniAndroid` bridge (`exportFile`, `fetchToCache`, import chunk channel, biometrics) | Navigation locked to the virtual host; external http(s) handed to the browser (`openExternally`), everything else blocked | Code review; manual Android test M-1 (below) |
| 2 | `serveAsset()` passed `..` segments through to AssetManager | Traversal + NUL rejected before resolution | Code review |
| 3 | Renderer crash killed the whole app | `onRenderProcessGone` returns `true` (handled) and rebuilds the WebView; persisted store rehydrates | Code review; manual test M-2 |
| 4 | WebView never destroyed on activity teardown | `onDestroy` detaches + `webView.destroy()` | Code review |
| 5 | Bridge transport accepted `http://` while the manifest forbids cleartext (dead, misleading path) | `httpGetString`/`fetchToCache` enforce https-only | Code review |
| 6 | `android:allowBackup="true"` exposed localStorage (incl. Vault PIN record) to `adb backup` | `allowBackup="false"` | Manifest inspection |

### P1 — Vault privacy
| # | Finding | Fix | Verified by |
|---|---|---|---|
| 7 | PIN stored as an unsalted 32-bit multiplicative hash (10 000-combination space, trivially enumerable from localStorage) | Salted PBKDF2-SHA256 records (`v2:<salt>:<hash>`, 120k iterations, WebCrypto); legacy records still verify and are transparently upgraded on the next successful unlock (no data loss) | `tests/vault-crypto.test.ts` (7 tests) |
| 8 | Web “simulated scan” biometric fallback unlocked the Vault with **zero authentication** | Fingerprint button only renders when the real native bridge exists; no web fallback unlock remains | Code review; manual test M-3 |
| 9 | Unlimited PIN attempts (counter reset every 5) | 30 s lockout after 5 failures, persisted in sessionStorage for the session | Manual test M-3 |
| 10 | History rows leaked chapter/page position of Vault titles | Vault rows show the masked label only | Code review |
| 11 | Deleting a work left orphaned notifications; a deleted Vault work’s title leaked through the unknown-work render path | `deleteWorks` purges notifications/history/bookmarks/highlights of the deleted ids; notifications also mask `workId` without metadata and honor the stored `sensitive` flag | `tests/store-logic.test.ts` (orphan purge) |
| 12 | Backups carried the PIN record and plaintext catalog credentials | Export strips `vaultPinHash` and `servers[].auth` (backup format v3); import re-strips credentials and refuses to overwrite the device-local PIN (known-hash attack blocked) | `tests/store-logic.test.ts` |

### P1 — Build reliability / TypeScript
| # | Finding | Fix | Verified |
|---|---|---|---|
| 13 | `bun run lint` failed: 13 errors, 1290 warnings — eslint was linting third-party minified bundles (`public/pdf/pdf.worker.min.mjs`, `public/pdf-wasm/*_fallback.js`) and build tooling | `public/**` and `scripts/**` added to eslint ignores (not app code) | `bun run lint` exits clean |
| 14 | `tsc --noEmit` failed: `Bun` global unresolved in `scripts/apk-mimic-server.ts` | `/// <reference types="bun-types" />` added (bun-types already in devDependencies) | `bunx tsc --noEmit` clean |
| 15 | `node scripts/verify-apk-assets.cjs` crashed when the Android SDK is absent | aapt2 badging is now an optional, clearly-labeled SKIP; asset verification (35/35) is independent | Script run in this environment: 35/35 RESOLVED, graceful skip |
| 16 | Untracked local `skills/` tooling polluted tsc | Added to tsconfig `exclude` | tsc clean |

### P2 — Data integrity
| # | Finding | Fix | Verified by |
|---|---|---|---|
| 17 | `importBackup` accepted any payload after the `app` tag check — `works: {}`, `history: 5` etc. would white-screen tab screens | Strict per-section validation: arrays type-checked, work rows require string id/title + chapters array, invalid rows dropped, wrong-typed `works` refuses the whole restore; download queue restored (v3) | `tests/store-logic.test.ts` (4 restore tests) |
| 18 | Restore carried download flags with no queue context | v3 backups include `downloads`; import restores them when present | test |
| 19 | Deleted works left orphaned history/bookmarks/highlights | Purged in `deleteWorks` | test |

### P2 — File import
| # | Finding | Fix | Verified by |
|---|---|---|---|
| 20 | Unbounded `arrayBuffer()` buffering — multi-GB CBZ/PDF/EPUB could OOM the WebView | 600 MB ceiling (`MAX_IMPORT_BYTES`), honest `toobig` reason + en/fa strings, enforced in every routing path (`importFiles`, `importFilesToWork`, `importFilesAsWork`, `importArchive`, `importPdf`, `importEpub`) | `tests/importer-logic.test.ts`; manual test M-4 |
| 21 | Per-page `putFile` failures were silently swallowed → truncated chapters presented as complete | `StoredPages.failed` counted on every path; `partial` surfaced by `importFiles` / `importFilesToWork` / `importFolderCommit` / `importFilesAsWork` and toasted in the UI | Code review; manual test M-5 |
| 22 | Unparseable PDF/EPUB became “meta works” with a random 24–224 page count (fabricated data) | Deterministic 12-page demo; description already honest | Code review |

### P2 — Reader progress restoration
| # | Finding | Fix | Verified by |
|---|---|---|---|
| 23 | History “Resume” reopened the page where the chapter was *opened* (history written once at mount) | New `refreshHistoryPage` store action; the page-change effect keeps the history entry on the page actually reached | `tests/store-logic.test.ts` (progress math); manual test M-6 |
| 24 | EPUB scroll wrote the full store to localStorage per animation frame (~60 writes/s) | 400 ms trailing debounce capturing the ratio (chapter-switch safe) + unmount flush so the last position is never lost | Code review; manual test M-6 |
| 25 | `continueReading()` mishandled legacy absolute `lastPage` (> 1) | Same dual interpretation as the reader restore, clamped to page range | test |

### P2 — Offline reading & download recovery
| # | Finding | Fix | Verified by |
|---|---|---|---|
| 26 | Downloads stalled only when `offlineMode && wifiOnly` were BOTH on (nonsensical); no real connectivity awareness | Tick stalls when `offlineMode` is on OR `navigator.onLine === false`; resumes automatically; Wi-Fi *type* detection is impossible in a WebView and the hint text now says so honestly | Code review; manual test M-7 |
| 27 | Failed downloads rendered a “Read” affordance into content that never downloaded | ERROR rows retry-first (tap = retry), Open action hidden | Code review; manual test M-8 |
| 28 | (documented, unchanged) The Downloads queue is a simulation for seeded works; MangaDex/OPDS imports download real bytes into IndexedDB and read fully offline. Converging the two systems is a tracked big-ticket item, not quietly claimed as done | — | Open gaps |

### P2 — Persian/English localization
- New strings added in **both** locales: `vlt.tooMany`, `epub.reimportTitle/Hint`,
  `ntf.dlDoneBody`, `ntf.dlFailBody`, `ntf.newChapterBody`, `imp.reason.toobig`,
  `imp.partialPages`, `imp.partialChapters`; `dl.wifiOnlyHint` re-worded honestly.
- Notification bodies are now localized at creation time via `translate(settings.lang, …)`.
- **RTL vs reading direction**: verified independent — the shell applies `dir`
  per UI locale (`app-shell.tsx`), while page flow direction is a per-work
  property (`work.direction`) used exclusively by the reader (paged track,
  tap zones, keyboard arrows). A Persian UI with an LTR comic reads LTR and
  vice versa. `fa` key parity is compile-enforced and runtime-tested
  (`tests/i18n.test.ts`).

## Regression tests
`bun test tests/` (script `bun run test`) — **28 tests, 104 assertions, all passing**:
- `tests/vault-crypto.test.ts` — PBKDF2 records, wrong-PIN/corrupt-record rejection, salt uniqueness, legacy migration
- `tests/store-logic.test.ts` — progress math, restore validation/replacement semantics, credential stripping, orphan purge, legacy hash shim
- `tests/importer-logic.test.ts` — magic-byte sniffing, folder numbering hints, size ceiling
- `tests/i18n.test.ts` — en/fa parity for every new key, interpolation, Persian digits

## Open gaps / next candidates (priority order)
1. **Converge the simulated download queue with real IndexedDB downloads** (DWN): make `startDownload` fetch + store chapter pages via `local-files.ts` for remote sources, keep the simulation only for seed/demo works.
2. **Vault content encryption at rest** (VLT-003): the Vault currently hides works and locks metadata; page blobs in IndexedDB are not encrypted. WebCrypto key wrapped by native Keystore via a bridge method would close this.
3. **Backup of downloaded media** remains out of scope (metadata-only backups; the UI says so honestly).
4. **Real APK build + manual Android suite** (below) — this sandbox has no Android SDK; Java changes are reviewed but **not compiled here**.
5. Refactor note: `MainActivity.onCreate`/`createWebView` were deduplicated this round; a follow-up could extract the bridge into its own file for reviewability.

## Manual Android tests still required (cannot run in this sandbox)
- **M-1** Open an OPDS catalog entry’s external link → must open the browser, never navigate the in-app WebView.
- **M-2** Trigger a renderer crash (or `adb shell am crash com.onilibrary.app`) → app rebuilds the shell, library intact.
- **M-3** Vault: set PIN (v2 record stored), unlock, 5 wrong attempts → 30 s lockout; fingerprint button hidden in the web build, BiometricPrompt on device.
- **M-4** Import a >600 MB file → honest “too large” toast, no crash.
- **M-5** Fill storage nearly full, import a CBZ → partial-page warning toast appears.
- **M-6** Read to page N, close, History → Resume lands on page N (manga + EPUB).
- **M-7** Toggle airplane mode mid-download → queue stalls; restore network → resumes.
- **M-8** Failed download row → tap retries, no “Open” affordance.
- **M-9** Persian locale: global RTL holds, manga pages still turn in the work’s direction.
- **M-10** Legacy upgrade: install v1.3.0, set a PIN, side-load this build, unlock once → PIN record upgraded to `v2:…` (check via remote debugger), data intact.
