# oniLibrary — Post-v1.5.0 Acceptance Audit

- **Date:** 2026-10-22 · **Audited state:** `main` @ `fc1c7d2` (= tag `v1.5.0` + APK-tracking commit) · **Release:** v1.5.0 (versionCode 14)
- **Method:** full code inspection with `file:line` evidence (two parallel deep-audit passes, consolidated here), automated checks re-run, live browser verification of golden paths (Chromium via agent-browser against the dev server), release/pipeline verification via GitHub API.
- **Honesty note:** **no real Android device or emulator was available in this environment.** Everything marked *device-pending* below is unverified on-device by definition. APK-level behavior derived from shell source code is labeled *code-level, near-certain* where execution was not possible. No device test is claimed anywhere in this report.
- **Companion evidence:** detailed per-area findings were consolidated into §4 and §6 of this document (raw session reports were environment-local artifacts and are not part of the repo).
- **Baseline PRD:** `docs/PRD.md` (requirement IDs cited as `XXX-NNN`). Prior gate reports: `docs/DISCOVER_PHASE1_AUDIT.md`, `docs/DISCOVER_RELEASE_VALIDATION.md`.

---

## 1. Release & pipeline verification (all ✅)

| Item | Result | Evidence |
| --- | --- | --- |
| Tag `v1.5.0` | points to `ab1223f` (“chore(release): v1.5.0 — Discover complete”), the exact reviewed commit lineage | `git rev-parse v1.5.0^{commit}` |
| GitHub Release | id 418962235, published 2026-10-20, not draft/prerelease, notes match shipped scope | GitHub API |
| Release APK asset | `oniLibrary-v1.5.0.apk` (4,751,653 B) — **sha256 `09f891ff…fd856012` byte-identical** to tracked `download/oniLibrary-v1.5.0.apk` | `sha256sum` local vs release download |
| Version metadata | `AndroidManifest.xml` versionCode **14** / versionName **1.5.0**; `build-apk.sh` derives artifact name from manifest (regression from v1.4.1 fixed) | manifest + script |
| Bundled assets | 84 files, 35 resolved URLs, **0 missing** (`verify-apk-assets.cjs`) | local run on release APK |
| CI workflow | green on `ab1223f` and `fc1c7d2` | GitHub Actions run list |
| Build APK workflow | green on `ab1223f` (the artifact source) | GitHub Actions run list |
| Local APK rebuild | **not performed** — sandbox lacks build-tools (aapt2/d8). CI artifact + checksum + asset verification stand in. | `/home/z/android-sdk` has only `platforms/` |

## 2. Automated checks re-run at audit time (all ✅)

- `bun test tests/` → **138 pass / 0 fail**, 264 assertions, 10 files
- `bun run lint` → clean · `bunx tsc --noEmit` → clean
- `bun test tests/i18n-parity.test.ts` → 7/7 (en↔fa parity, no empty strings, interpolation, fallback)

## 3. Live browser verification (this audit, dev server)

Verified interactively: onboarding (EN) → Home shelves → **Continue Reading opens the reader** (paged mode renders, chrome auto-hides, full-screen reading) → Downloads screen → Settings → Formats → **language switch to فارسی** (full RTL mirror, Vazirmatn shaping, `dir=rtl` present) → language restored. **Console clean** (no errors/warnings) across the whole session.

Live-reproduced defects (see §6): DWN-010 storage card + no-op “Cache cleared” toast; formats screen claims CBR “Planned”; stale “v1.1.1” About badge and dead `oniLibrary_zai_2` link; More footer “v1.0.0”.

## 4. Acceptance matrix

Legend — **SAT** satisfied · **PART** partial · **MISS** not implemented (honest) · **FAIL** implemented but wrong/dishonest. “Manual” column: **live** = verified in browser this audit; **code** = code inspection only; **device-pending** = requires Android device/emulator.

### 4.1 Formats & local files (PRD §4, §9)

| Req | Verdict | Implementation | Automated test | Manual | Gap |
| --- | --- | --- | --- | --- | --- |
| FMT-001 PDF | SAT | `pdf-engine.ts`, `pdf-view.tsx`, import `importer.ts:414-443,1119` | indirect only | live (seeded PDF path compile-verified; render code-inspected) | — |
| FMT-002 EPUB | SAT | `importer.ts:1266-1412`, `epub-view.tsx`, `sample-epub.ts` | — | code | reflow, TTS, highlights, honest fallback |
| FMT-003 CBZ/CBR/ZIP/folders | SAT | `importer.ts` (fflate + salvage walker `:116-190`; WASM unrar `unrar.ts`) | `importer-units.test.ts` (8) | code | salvage/unrar have **no direct tests** |
| FMT-004 images | SAT | `importer.ts:9` `IMG_RE`, per-page error panels `reader-screen.tsx:503-511` | — | code | corrupt image doesn't kill library ✓ |
| FMT-005 status page | **PART→FAIL-ish** | `formats-screen.tsx:19` | — | **live** | **Screen says CBR “Planned” though CBR fully works**; ZIP/7z/GIF/BMP/TXT/HTML rows missing |
| FMT-006 Unicode names | PART | natural sort `importer.ts:11-13`, UTF-8 decode `:164` | `numberHintOf` tests | code | legacy CP437 archives likely mojibake (assumption A1) |
| FMT-007 OCR | MISS (P2, unclaimed) | — | — | — | fine |
| LOC-001 picker/share-in | SAT | `app-shell.tsx:228-281`, `MainActivity.java:318-378` | — | code | no device-wide scan ✓ |
| LOC-002 scan folders | PART | one-shot folder pick w/ review plan `importer.ts:803-1012` | — | code | no persistent scan-folder list |
| LOC-003 file info | SAT | `sourceMetaOf` `importer.ts:214-233` | — | code | nothing fabricated ✓ |
| LOC-004 corrupt errors | SAT | typed reasons → i18n `importer.ts:15-29` | sniff tests | code | no password entry for encrypted RARs (clear refusal only) |
| LOC-005 natural order | PART | `numberHintOf` | yes | code | **no manual page-order correction** |
| LOC-006 delete/rename | SAT | app-private IDB only; confirmed purge `store.ts:446-474` | store tests | code | — |
| LOC-007 series grouping | SAT (P1) | `moveChapters` w/ key re-namespacing `store.ts:476-551` | `store-management.test.ts` | code | — |

### 4.2 Reader & PDF (PRD §8, §5 UX-005)

| Req | Verdict | Implementation | Automated test | Manual | Gap |
| --- | --- | --- | --- | --- | --- |
| RDR-001 modes (paged/continuous/webtoon/double) | SAT | `reader-screen.tsx:2666-2679`, tracks `:1636-1742` | — | **live** (paged) | mode change keeps page ✓ |
| RDR-002 RTL/LTR direction | SAT | per-work direction, direction-aware tap/swipe/keys `:641-643,1215-1220,1414,1456` | — | code | independent of UI language ✓ (BIL-006) |
| RDR-003 fit modes | **PART** | fit classes `:96-101` | — | code | **ORIGINAL = fixed 800×1200 box → distortion** (`:100`); PdfCanvas ignores ORIGINAL `pdf-view.tsx:344-345` |
| RDR-004 zoom/pan | PART | double-tap/button zoom 1→1.5→2, pan `:1386-1404,1605-1622` | — | code | **no pinch-zoom**; reset ✓ |
| RDR-005 jump/list/progress | SAT | slider `:1989-2012`, chapter sheet `:2284-2366`, PDF TOC/search `:2297-2327` | — | code | find bar caps at 1 000 hits (silent) |
| RDR-006 progress persistence | SAT | ratio-based `lastPage` `reader-screen.tsx:765-772`, EPUB debounce+flush `epub-view.tsx:404-437`, dual-format restore | `progress.test.ts` (17) | code | — |
| RDR-007 per-series settings | SAT | `updateWork` mode/direction/fit `:2675,2690,2706` | — | code | — |
| RDR-008 crop/spacing | PART | scale(1.04) crop hack `:1604`, fixed spacing `:1667` | — | code | not real margin detection |
| RDR-009 brightness/keep-awake | **PART** | dim overlay `:1795-1799`, backgrounds `:2713-2734` | — | code | **wake lock only applied on toggle; never re-acquired on mount, never released on exit** (`:637,1476-1496`) — setting default-on but ineffective |
| RDR-010 gestures/volume keys | PART | volume keys via bridge `:1248-1278`, `MainActivity.java:423-460` | — | device-pending | no remapping UI; fixed tap zones |
| RDR-011 auto-next + end card | **PART** | paged end card + autoNext `:1153-1171,2246-2281` | — | code | **CONTINUOUS/WEBTOON clamp inside chapter — no transition, no end card** (`:1153-1187`) |
| RDR-012 wide-split/preload | PART | ±2 preload, PDF lazy pages | — | code | no wide-page splitting; auto-scroll = fixed 3.2 s |
| RDR-013 bookmarks/notes | SAT | `store.ts:780-788`, reader toggle `:1461-1473` | progress tests | code | independent of history ✓ |
| RDR-014 presets | PART | 4 presets `:1499-1532` | — | code | **PDF preset missing** (PRD lists 5) |
| PDF-001 nav/zoom/rotate | SAT | `pdf-view.tsx:327-367`, rotation `:2211-2216` | — | code | — |
| PDF-002 search/select | **PART** | full-text search + exact-rect highlights `pdf-engine.ts:179-298` | — | code | **no text selection/copy** (canvas-only, no textLayer, `pdf-view.tsx:519-528`) |
| PDF-003 highlights/notes | PART | rect highlights + notes + colors `pdf-view.tsx:82-235` | — | code | no excerpt sharing; PDF never modified ✓ |
| PDF-004 position/history | SAT | lastPage restore; history deletable | progress tests | code | — |
| PDF-005 OCR | MISS (P2, unclaimed) | — | — | — | fine |

### 4.3 Library & navigation (PRD §7, §5)

| Req | Verdict | Implementation | Automated test | Manual | Gap |
| --- | --- | --- | --- | --- | --- |
| UX-001 Home shelves | SAT | `home-screen.tsx:117-246` | — | **live** | — |
| UX-002 primary nav | SAT | tabs + More menu; vault gated | — | live | Downloads not in default 4 (reachable via More) |
| UX-003 grid/list + density | SAT | `library-screen.tsx:496-526`, `settings-screen.tsx:319-327` | — | code | state preserved ✓ |
| UX-004 designed states | SAT | discover/search/source/downloader error+offline+retry cards | — | live (offline/error states honest) | — |
| UX-005 reader chrome auto-hide | SAT | `reader-screen.tsx:886-891` | — | **live** | no immersive system-bar hide |
| UX-006 themes | SAT | Light/Dark/System `settings-screen.tsx:133-137`, `use-app.tsx:36-40` | — | live | — |
| UX-007 custom accents | MISS (P1) | — | — | — | honest |
| UX-008 nav customization | PART | on/off per item `settings-screen.tsx:234-247` | — | code | no reordering |
| LIB-001 sections | SAT | home + discover shelves | — | live | — |
| LIB-002 five statuses | SAT | `library-screen.tsx:162,712-726` | progress tests | code | — |
| LIB-003 global search | SAT | library + MangaDex + OPDS OpenSearch, source-labeled, offline-safe | `search-contract.test.ts` (24) | code | — |
| LIB-004 sorting | **PART** | 5 sorts `library-screen.tsx:480-493` | — | code | **file-size sort missing** (dead `lib.size` key) |
| LIB-005 filters | **PART** | type/status/source/downloaded/unread `:157-166` | — | code | **no language filter** |
| LIB-006 categories | SAT | multi-assign, smart rules | store tests | code | — |
| LIB-007 bulk selection | **PART** | category/status/favorite/vault/delete `:612-672` | — | code | **bulk download missing**; delete blocked in APK (defect D1) |
| LIB-008 smart categories | SAT | `matchesRule` | `progress.test.ts` | code | — |
| LIB-009 duplicate detection | PART | `duplicates.ts` union-find | **no tests** | code | title-only matching (honest) |
| LIB-010 custom covers/tags | MISS (P1) | — | — | — | honest |
| LIB-011 saved filters | SAT | snapshot/apply/delete `:110-143` | — | code | — |

### 4.4 Downloads (PRD §11)

| Req | Verdict | Implementation | Automated test | Manual | Gap |
| --- | --- | --- | --- | --- | --- |
| DWN-001 chapter/selected/series | SAT | reader menu, details confirm w/ count, whole-series enqueue | `download-contract.test.ts` (24) | code | add-to-library never downloads ✓ |
| DWN-002 queue pause/resume/cancel | SAT | per-row cancel registry, durable rows, restart recovery B1 | 24 contract tests | code | — |
| DWN-003 progress/size/speed | SAT | real bytes, windowed speed, capped-99 %, no fabricated ETA | telemetry tests | live (Phase-4 evidence) | — |
| DWN-004 retry/incomplete detection | SAT | verify-before-DONE, purge partials, typed `incomplete` | M2/B5 tests | code | — |
| DWN-005 wifi-only/concurrency | **PART** | wifiOnly gate via `isMetered()` bridge; **pump strictly sequential — `maxConcurrent` (1-5) is effectively a cap of 1** | — | code | no parallelism ever |
| DWN-006 background downloads | PART | durable in-app queue survives restart ✓ | B1 tests | device-pending | **no OS foreground service/system notification**; process death stops downloads |
| DWN-007/008/009 | MISS (P1) | — | — | — | speed limit / auto-download / auto-cleanup |
| DWN-010 storage & cache | **FAIL** | `seed.ts:915-921` mockup constants + `downloads-screen.tsx:87-88,216-255` | — | **live** | **fake 57.5/64 GB card, double-counted total, “Clear cache · 284 MB” is a no-op with a success toast** |

### 4.5 Updates & notifications (PRD §12)

| Req | Verdict | Implementation | Manual | Gap |
| --- | --- | --- | --- | --- |
| UPD-001 new-chapter checks | SAT | per-work + library check, dedup, read/unread dots | code | — |
| UPD-002 manual/scheduled checks | PART | manual + auto toggle + last-check shown | code | no schedule/time-window/network control |
| UPD-003 separated statuses | PART | in-app notification types + per-type toggles | code | — |
| UPD-004 schedules | MISS (P1) | — | code | single boolean only |
| UPD-005 repeated-error controls | MISS (P1) | — | code | no consecutive-error logic anywhere |
| NTF-001/002/004 OS notifications | **MISS (P0-adjacent honesty gap)** | none — no POST_NOTIFICATIONS, no NotificationManager | code | **OS-level notifications do not exist**; in-app center only. Release notes must not imply OS notifications |
| NTF-003 sensitive masking | SAT | triple-check + masked rows `notifications-screen.tsx:59-111` | code | — |

### 4.6 Vault (PRD §13)

| Req | Verdict | Implementation | Automated test | Manual | Gap |
| --- | --- | --- | --- | --- | --- |
| VLT-001 hiding | SAT | excluded from library/home/history/recs/notifications | — | code | — |
| VLT-002 PIN + biometric | SAT | PBKDF2-SHA256 120k v2 records + legacy migration; real platform BiometricPrompt; no fake web fallback | `vault-crypto.test.ts` (8) | device-pending (prompt) | 4-digit PIN only; lockout is client-side sessionStorage (documented threat model) |
| VLT-003 auto-lock | PART | `visibilitychange` → lock `engine.ts:39-47`; transient unlock state | — | device-pending | **no inactivity-duration lock** |
| VLT-004 no leaks | SAT | covers/titles excluded; notification masking; orphan purge on delete `store.ts:404-418` | — | code | — |
| VLT-005 honest levels | SAT | “Encryption: not active in this build” disclosure `vault-screen.tsx:384-392` | — | live | — |
| VLT-006/008 encryption | MISS (P1, disclosed honestly) | plaintext IDB blobs | — | — | consistent with claims ✓ |
| VLT-007 cache protection | PART | — | — | — | no preview purge on lock |
| VLT-009 confirmations | PART | delete confirms exist | — | code | APK confirm defect D1 affects these |
| VLT-010 decoy | MISS (P2, fine) | — | — | — | — |

### 4.7 Tracking, backup, servers (PRD §14-§16)

| Req | Verdict | Implementation | Automated test | Manual | Gap |
| --- | --- | --- | --- | --- | --- |
| TRK-001 status/rating | SAT | `store.ts:568-604` | progress tests | code | — |
| TRK-002 history view/clear | SAT | confirm + progress preserved `store.ts:755` | — | code | — |
| TRK-003 notes/bookmarks | SAT | bookmarks + highlights w/ export | — | code | — |
| TRK-004 statistics | **PART** | daily/heatmap/streak `statistics-screen.tsx` | — | code | **sessions capped 60 days** → no yearly; no monthly/annual view |
| TRK-005 streaks optional | PART | goal/streak togglable | — | code | no next-reading queue |
| TRK-006 AniList | SAT (P1) | `tracker.ts` GraphQL, vault excluded from sync | — | code | token paste only (no OAuth in WebView) |
| TRK-007 mapping preview | PART | auto title-match | — | code | **no preview/cancel before push in auto-sync** |
| TRK-008 offline queue/conflicts | MISS (P1) | silent catch on auto-sync failure `store.ts:582-593` | — | — | — |
| BKP-001 backup scope preview | SAT | included+excluded lists shown `backup-screen.tsx:38-47,252-270` | — | code | — |
| BKP-002 restore validation | SAT | strict `importBackup`, per-row validation | `store-restore.test.ts` (8) | code | **restored DONE rows point at never-backed-up blobs → missing pages**; orphaned blobs for removed works |
| BKP-003 last-backup status | PART | `lastBackup` stamp `:186,199` | — | — | anchor-download failures can still mark success |
| BKP-004/005 | MISS (P1) | — | — | — | no scheduled/encrypted backups |
| SRV-001..004 OPDS/Komga | SAT within scope (P1, deferred plan honored) | add/test/browse/enable-disable w/o delete; auth stripped from backups | md-filters tests | code (public catalogs live-verified in Phase 3) | personal Komga instances untested; no offline server downloads |

### 4.8 Sources/Discover (Discover plan — closed epic)

SAT across the board per `docs/DISCOVER_RELEASE_VALIDATION.md` §1 gates: search contract (24 tests), filters (6), durable downloads (24), recommendations (27, local-only, explainable), source enable/disable. Re-verified indirectly this audit (screens render, console clean). No new gaps introduced since v1.5.0.

### 4.9 i18n / RTL (PRD §6)

| Req | Verdict | Evidence | Manual | Gap |
| --- | --- | --- | --- | --- |
| BIL-001 full UI both languages | **PART** | typed dictionary, runtime parity test 7/7 | live (fa) | **11 hardcoded-English aria-labels + native BiometricPrompt strings + 1 unlabeled switch** (list in `audit-2b.md` §3) |
| BIL-002/003 language choice/persist | SAT | onboarding + settings | **live** | — |
| BIL-004 RTL layout | SAT | container `dir` + mirrored layout | **live** (screenshot) | `document.documentElement.dir` never set (latent) |
| BIL-005 mixed text | SAT | `dir="auto"`/`dir="ltr"` patterns | code | home carousel forces LTR (cosmetic) |
| BIL-006 direction independence | SAT | settings never touch `work.direction` | code | — |
| BIL-007 string separation | SAT | typed keys + test | — | a few inline conditionals (`home-screen.tsx:230`) |
| BIL-008 fonts/shaping | SAT | Vazirmatn | **live** | — |
| BIL-009 content vs UI language | SAT | altTitle `dir="auto"` intact | code | — |
| BIL-010 dates/numbers | PART | fa digits + fa-IR dates | code | Solar-Hijri not evaluated (P1 “evaluate”) |
| BIL-011 alternate-title search | PART | altTitle searched | code | no Persian normalization (ی/ي, ک/ك, ZWNJ) |

### 4.10 Accessibility & shell (PRD §17, §18)

| Req | Verdict | Evidence | Gap |
| --- | --- | --- | --- |
| ACC-001 contrast/targets | PART | good on discover/search/vault/nav | **sub-44px remain**: library toggle/smart-clear `library-screen.tsx:462,500,507`, download rows `downloads-screen.tsx:346,353,426,434`, settings steppers `settings-screen.tsx:473,483` |
| ACC-002 TalkBack labels | PART | most labeled | 11 hardcoded/unlabeled (§4.9) |
| ACC-003 system text size | **FAIL in APK** | **`setTextZoom(100)` pins WebView text zoom** (`MainActivity.java:239`) — Android font scale has no effect in the app; browser is fine (rem-based) | deliberate? no comment — must revisit |
| ACC-004 reduced motion | MISS | zero `prefers-reduced-motion` handling; carousel auto-advances 5 s | — |
| ACC-005 tablet/landscape | PART | phone-only; `configChanges` prevents recreation | — |
| ACC-006 E-ink | MISS (P2) | — | fine |
| SEC-001 no account | SAT | — | — |
| SEC-002 minimal permissions | SAT | **only INTERNET + ACCESS_NETWORK_STATE**; SAF import; cleartext banned | — |
| SEC-003 no secrets in logs | SAT in scope | `lastHttpError` = status/message only | plaintext at-rest creds disclosed (localStorage) |
| SEC-004 data deletion | SAT (browser) / **BLOCKED in APK** | clear-history etc. behind `window.confirm` | defect D1 |
| SEC-005 extension transparency | SAT | built-in sources honest; no unsafe runtime | — |
| SEC-006 transport security | SAT | HTTPS-only bridge fetch, no SSL-error override, auth in headers never URLs | — |
| SEC-007 diagnostics export | MISS (P1) | — | — |

### 4.11 Android shell & PWA platform behaviors

| Area | Verdict | Evidence | Gap |
| --- | --- | --- | --- |
| Back navigation (no dialog) | SAT | overlay stack → `setOverlayDepth` → `onBackPressed` Escape dispatch | reader chapter switch replaces top so Back lands on details ✓ |
| Back navigation (**dialog open**) | **FAIL (code-level, near-certain; device-pending)** | bridge dispatches Escape **on `window`** (`MainActivity.java:970`), Radix listens on **`document`**; app-shell declines when a dialog exists (`app-shell.tsx:184-192`) → **hardware Back does nothing with any dialog open; on tab-level dialogs it minimizes the app** | defect D2 |
| Destructive confirms in APK | **FAIL (code-level, near-certain; device-pending)** | `WebChromeClient` overrides only `onShowFileChooser` — **no `onJsConfirm`/`onJsAlert`** → default = silent cancel. 8 call sites dead in APK (library delete ×2, downloads, settings clear-history, history, duplicates ×2, categories) | defect D1 — browser QA cannot catch this |
| Lifecycle | SAT | instance-state restore, `onPause` TTS stop + `webView.onPause()`, renderer-crash rebuild | — |
| Virtual origin / hardening | SAT | host-locked interceptor, traversal rejection, immutable `_next` cache, exact-host external nav | — |
| Signing | **RISK** | committed `android/oni-debug.keystore` (known open P0 REL-02) | release signing still unresolved |
| PWA | SAT | manifest icons 192/512+maskable, network-first nav w/ offline shell, **SW registration skipped inside APK** (`app-shell.tsx:214-223`) | SW update flow silent-by-design (documented) |

### 4.12 Performance & reliability (PRD §19) — largely **device-pending**

- NFR-004 (progress + queue survive force-close) — mechanism present (zustand persist + download-row recovery B1) — **code-level only, unverified on device**.
- NFR-001/002/003 (1 000-entry library, 2 s usable, large-file memory) — **not measured**; no reference-device dataset exists. Recommend a seeded-benchmark harness (Phase C).
- NFR-005 offline behavior — live evidence for local + downloaded content (Phase-4 gate + this audit's offline badges).
- NFR-006 error logging — honest per-request errors; no aggregated log surface (ties to SEC-007 MISS).
- NFR-007 crash-free rate — **unmeasurable** here (no distribution/telemetry; also privacy-constrained).

## 5. Test-coverage gaps (regression risk)

138 tests cover the pure contracts well, but **zero direct tests** exist for: `reader-screen` (modes/tap zones/restore), `epub-view`, `pdf-view`/`pdf-engine` render+search, `salvageZip`, unrar extraction, `duplicates.ts`, `local-files.ts`, `bg-downloads` orchestration (only the pure contract is tested), `tts.ts`, `export-file.ts`, `tracker.ts`, and every Android-shell behavior. The two APK defects (D1, D2) are direct consequences: nothing in CI can see the shell.

## 6. Confirmed defects (reproducible) — prioritized

| # | Sev | Defect | Repro | Evidence |
| --- | --- | --- | --- | --- |
| D1 | **HIGH (APK)** | `window.confirm`/`alert` silently suppressed → **8 destructive flows unreachable in the APK** (bulk/single delete, clear history, duplicate resolve, category delete) | In APK: Library → select → Delete → nothing happens | `MainActivity.java:243-273` (no onJsConfirm/onJsAlert); call sites listed in §4.11 |
| D2 | **HIGH (APK)** | Hardware **Back dead while any dialog/sheet is open** (window-vs-document Escape dispatch); tab-level: Back minimizes app | APK: open bulk picker → press Back → nothing | `MainActivity.java:970` + `app-shell.tsx:184-192` + Radix `use-escape-keydown` (document listener) |
| D3 | **HIGH (privacy)** | **AniList token exported in plaintext `.onibackup`** (backup strips PIN + OPDS auth but not `settings.tracker.token`; import doesn't strip it either) | Settings → Tracker token set → Backup → inspect JSON | `backup-screen.tsx:155-183`, `types.ts:274-276`, `store.ts:950-957` |
| D4 | MED | **DWN-010 storage card is fake**: hardcoded 64/44.9/12.6 GB constants, total double-counts real downloads, “Clear cache · 284 MB” is a no-op with success toast | Downloads screen (live-reproduced this audit) | `seed.ts:915-921`, `downloads-screen.tsx:87-88,216-255` |
| D5 | MED | Formats screen claims **CBR “Planned”** while CBR is fully supported | Formats screen (live) | `formats-screen.tsx:19` vs `unrar.ts`, `importer.ts:267-284` |
| D6 | MED | Stale in-app versions/dead link: About “v1.1.1 (4)”, More “v1.0.0” ×2, GitHub link → `oniLibrary_zai_2` | Settings/More (live) | `settings-screen.tsx:646,650`, `more-screen.tsx:187-188` |
| D7 | MED | Keep-awake never re-acquired on reader mount, never released on exit | enable → leave reader → screen still awake; re-enter → not awake | `reader-screen.tsx:637,1476-1496` |
| D8 | MED | Webtoon/continuous dead-end: no chapter transition at last page, no end card, autoNext ignored | open WEBTOON work → scroll to end | `reader-screen.tsx:1153-1187` |
| D9 | MED | Fit=ORIGINAL renders fixed 800×1200 → distortion for non-2:3 art | square images + Original fit | `reader-screen.tsx:100,1605-1621` |
| D10 | MED | Download pump strictly sequential — `maxConcurrent` (1-5) inert | queue 3 chapters with max=3 → serial | `bg-downloads.ts:188-207` |
| D11 | MED | Restore leaves orphaned IDB blobs + hollow DONE rows (blobs never backed up) | backup → wipe → restore → DONE rows show missing-page panels | `store.ts:957-992`, backup payload excludes files |
| D12 | LOW/MED | a11y/i18n sweep remainder: `setTextZoom(100)` defeats system font scale (ACC-003), 11 hardcoded EN aria-labels, 1 unlabeled switch, sub-44px set, no reduced-motion | — | evidence in §4.9/§4.10 |
| D13 | LOW | Stats silently capped at 60 days (no yearly ever); stale `engine.ts:8` comment; dead `src/app/api/route.ts` scaffold in export | — | `store.ts:710,745`, `engine.ts:8` |

## 7. Assumptions / unverified behavior (NOT confirmed defects)

| # | Assumption | Why plausible | How to confirm |
| --- | --- | --- | --- |
| A1 | Legacy CP437 ZIP/CBR Persian filenames mojibake (UTF-8-only decode) | both decoders assume UTF-8; `importer.ts:164` | import a CP437-encoded fixture |
| A2 | Stale `chapter.pages` > fresh URL count settles a fully-fetched chapter as ERROR/incomplete | `bg-downloads.ts:339` checks against stale count, `mangadex.ts:537-543` against fresh | upstream-metadata mismatch fixture |
| A3 | Web builds: `wifiOnly` never blocks (`navigator.connection.type` undefined) | code path default-unmetered | browser network-throttling test (APK bridge unaffected) |
| A4 | Seeded demo rows show “Downloaded — reading offline” badge over generated placeholder pages | seed rows DONE + placeholder pages | demo-only; decide whether to relabel |
| A5 | EPUB auto-complete at 0.95 clears `lastPage` → completed chapter resumes at 0 | `store.ts:574` + `epub-view.tsx:413-416` | confirm intended behavior with owner |
| A6 | D1/D2 actual on-device behavior | default WebChromeClient semantics; window-vs-document dispatch is spec-level | 30-minute emulator pass (Phase A exit criterion) |
| A7 | TalkBack usability, contrast ratios, ACC-003 visual result at font-scale 1.3+, visibilitychange auto-lock in WebView | — | accessibility device pass |
| A8 | PWA SW update cycle end-to-end | registration/unregister code-reviewed | force-drive update in browser |

## 8. Security & privacy risk register

1. **Committed debug keystore** (`android/oni-debug.keystore`) — release builds signed with a public key (known REL-02; still open). Highest-standing risk.
2. **Tracker token in backups** (D3) — violates the backup screen's own privacy claim; fix is one line + test.
3. **Plaintext at-rest** credentials (OPDS basic auth, AniList token) in localStorage — disclosed, never in URLs, stripped-from-backup for OPDS only. Consistent with “hidden ≠ encrypted” posture but should be in the security checklist's honest-limits section (it partially is).
4. **4-digit PIN + client-side lockout** — offline brute force feasible (~10⁴ PBKDF2 hashes); UI discloses encryption inactivity. Consider ≥6-digit option (PRD OPEN-003 left this open).
5. **No OS notifications** — combined with in-app-only queue status, “download finished while backgrounded” is invisible; honesty gap in any release notes claiming NTF-001.
6. No telemetry anywhere (PRD-consistent, privacy-positive); NFR-007 consequently unverifiable — keep it out of release claims.

## 9. Release-honesty statement (for the next release)

v1.5.0's release notes are accurate on what shipped. For the *next* release, add/keep explicit “not yet” lines for: OS notifications, OS-level background downloads, real storage accounting (pending D4 fix), text-size scaling in the APK (pending D12), and unverified-on-device status of back/confirm behaviors (pending D1/D2 emulator pass).

---

## 10. Recommended next three phases (prioritized, testable)

> **Status (2026-10-22):** Phases A–C shipped to main (`d81b878` → `3271afd`); the
> follow-up repo-audit performance/feature repair shipped via PR #7 (`95fc83f`).
> All of it is included in release **v1.6.0** (versionCode 15). The device-pass
> gate (D1/D2 on hardware) remains owner-gated.

Constraint compliance: these are *fix-first* phases; no new content sources, no architecture replacement, no release during audit. Each phase lists acceptance criteria (AC) and regression tests (RT). Suggested flow: feature branch → PR (or direct-to-main only with owner's explicit per-session authorization, as last session).

### Phase A — Correctness & honesty pass (ship-blockers; no new features)

Scope: D1, D2, D3, D4, D5, D6, D7 + A6 device pass.

1. **D1 — APK JS dialogs**: implement `onJsConfirm`/`onJsAlert` (AlertDialog, i18n-neutral title “oniLibrary”) in `WebChromeClient`, **or** replace all 8 `window.confirm` call sites with an in-app Radix confirm (preferred: also fixes i18n + browser consistency).
   - **AC:** every destructive flow completable in the APK; single source of confirm UI; no silent no-ops.
   - **RT:** `tests/confirm-contract.test.ts` — enumerate guarded actions from a shared registry and assert each renders a dialog (web) and each call site imports the shared helper (grep-based lint rule or test).
2. **D2 — Back vs dialog**: dispatch the synthetic Escape on `document` (one-line Java change) **and** make the app-shell pop the top dialog first, then the overlay (or adopt OnBackPressedDispatcher).
   - **AC (A6):** emulator matrix — Back closes dialog → overlay → tab → minimizes; never minimizes with UI open.
   - **RT:** extend overlay-depth contract test; document the dispatch target in `ARCHITECTURE.md`.
3. **D3 — Backup privacy**: strip `settings.tracker.token` on export **and** import.
   - **RT:** extend `tests/store-restore.test.ts`: backup payload contains no tracker token; import of a hostile backup cannot inject one (or strips it).
4. **D4 — Real storage accounting**: compute downloads bytes from real row/page sizes; drop mockup constants; implement a real cache clear (thumbnail/cover cache bucket) or remove the card + button honestly; show a low-storage warning when free space is genuinely low (DWN-010 completion, web-estimated / bridge-reported on APK).
   - **AC:** card numbers change after real downloads; Clear cache has a real, verifiable effect or doesn't exist.
   - **RT:** pure storage-aggregation unit test (rows+sizes → totals); UI test asserting no `STORAGE` seed constants are imported by screens.
5. **D5+D6 — Truth surfaces**: formats screen CBR row → “Fully supported” (+ ZIP/GIF/BMP rows); version strings derived from the manifest constant (build-time injection), fix repo link.
   - **RT:** formats screen data-driven test (supported map ↔ screen rows); version-badge test asserting `1.5.0`-derived constant (no hardcoded version literals in components — eslint rule `no-restricted-syntax` for `/v\d+\.\d+\.\d+/` literals).
6. **D7 — Wake-lock lifecycle**: acquire on reader mount (if enabled), release on unmount; re-acquire on visibility-return.
   - **RT:** extract `useKeepAwake` hook with injected bridge; unit-test acquire/release pairs.
7. **A6 device pass** (exit criterion): emulator/real-device run of D1-D7 fixes + basic flows; record results in the release validation doc. (If no emulator remains available, ship the phase with the device pass explicitly deferred — but run it before the next release.)

**Phase A regression gate:** 138 → ~150 tests green; lint/tsc clean; existing manual flows (reader open, download, vault, backup round-trip) unaffected.

### Phase B — Reader completion (P0 gaps in the core experience)

1. **D8 — Webtoon/continuous chapter transition**: end-of-chapter card + autoNext + swipe-past-end → next chapter (parity with paged modes).
   - **AC:** webtoon work: scrolling past last page shows end card; autoNext ON advances; OFF stays.
   - **RT:** extract pure `nextChapterDecision(mode, atEnd, autoNext, hasNext)` into `lib/reader-contract.ts` + unit tests; wire both engines to it.
2. **D9 — ORIGINAL fit = natural size** (image aspect preserved; PdfCanvas fit parity).
   - **RT:** fit-class → style mapping unit tests (incl. non-2:3 fixtures).
3. **PDF-002 completion**: textLayer for selectable/copyable text on text-based PDFs; honest absence on image PDFs.
   - **AC:** select+copy a sentence from the sample PDF; clipboard matches.
   - **RT:** pdf-engine text-item → layer mapping unit tests; manual device note.
4. **RDR-014 PDF preset** + preset reset parity (5/5).
   - **RT:** preset table test (each preset applies documented settings; reset restores defaults).
5. **RDR-004 pinch-zoom** on image slides (pointer-events pinch → zoom state machine reused from double-tap path).
   - **RT:** zoom state machine unit tests (scale bounds, anchor, reset).

**Phase B regression gate:** reader contract tests ≥ 20 new; progress-restore suite re-run (no lastPage semantics change); fa/RTL re-sweep of reader chrome.

### Phase C — Library & platform polish (P0/P1 completion, prioritized)

1. **DWN-005 real concurrency**: bounded parallel pump honoring `maxConcurrent` with per-row cancel safety.
   - **RT:** contract tests for N>1 scheduling, cancel-mid-flight, wifi-only gating under parallelism.
2. **D11 restore hardening**: purge IDB blobs for works absent from backup; mark DONE rows whose keys are missing as `ERROR/missing` (honest) instead of hollow DONE; or exclude download rows from backup payload with an on-screen note.
   - **RT:** `store-restore.test.ts` extension with fake IDB adapter (orphan purge, DONE-row validation).
3. **LIB-004/005/007 completion**: file-size sort, language filter, bulk download (enqueue path already exists).
   - **RT:** sort/filter pure-function tests; bulk-download → enqueue dedupe test.
4. **D12 a11y/i18n sweep**: localize 11 aria-labels, label the updates switch, 44px on the remaining set, `prefers-reduced-motion` (carousel + celebration), set `document.documentElement.dir/lang`.
   - **RT:** extend `i18n-parity.test.ts` with an aria-label dictionary sweep (grep-driven: every `aria-label` literal must come from the dictionary); add a CI grep asserting no `h-5 w-5`/`h-7 w-7` icon-buttons outside decorative contexts.
5. **Decision item for owner — OS notifications (NTF-001/002)**: either implement a minimal bridge (POST_NOTIFICATIONS + download-complete notification, notification-type toggles honored) or document in-app-only as a product decision in PRD terms. Estimate provided on request.
6. **NFR-001/002 benchmark harness**: seeded 1 000-work store generator + scripted scroll/search timing in agent-browser; record baseline numbers in the release validation doc (replaces “unmeasured” in §4.12).
7. **Release signing (REL-02)**: remove the committed keystore from history posture (new keystore, local-only, document in BUILDING.md). *Owner decision on key management.*

**Phase C regression gate:** full suite green, storage numbers honest end-to-end, library ops complete per PRD matrix (LIB-004/005/007 → SAT), a11y sweep zero known hardcoded labels.

---

## 11. Audit verdict

- **Release integrity:** v1.5.0 is exactly what main says it is — tag, APK bytes, version metadata, asset manifest, and CI all reconcile. ✅
- **Core reader/library workflows:** the heart of the PRD (formats, modes, progress, offline, vault honesty, backup) is genuinely implemented and largely tested at the contract level; the v1.4.x/1.5.0 download engine is the strongest part of the codebase.
- **The real acceptance risk is the Android shell, not the web app:** two near-certain APK-only defects (suppressed confirms, dialog-swallowed Back) plus defeated text-zoom mean **browser-green ≠ app-green**. Until the Phase A device pass happens, on-device behavior for D1/D2 is assumed, not verified.
- **Honesty debt is small and fixable:** one fake card (D4), one wrong badge (D5), stale version strings (D6), one privacy strip miss (D3). All are one-session fixes with tests.
- No new release should be cut before Phase A + the device pass; this report is the gate deliverable requested.
