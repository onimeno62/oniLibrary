# oniLibrary Security and QA Checklist

Use this checklist before merging high-risk changes and before distributing a release. Checkboxes are not evidence by themselves: record the test/device, result, and any linked issue.

## Release record

- Commit / tag: `fix/security-remediation` @ round 1 (817f4ec → docs round), base `main` @ `bf783f5`
- Build environment: Linux sandbox, Bun 1.3.14, Node 24, TS 5.9.3 — **no Android SDK in this environment**
- Android device and OS: **NOT RUN (no device)** — manual suite M-1…M-10 pending
- Test date: 2026-10-17 (browser QA via agent-browser, 412×915, en+fa)
- Tester: automated remediation round (evidence in ENGINEERING_REMEDIATION_PLAN.md §Execution record)
- APK SHA-256: **N/A — APK for 1.3.1 not yet built (needs SDK machine)**
- Result: **BLOCKED for device checks / PASS for browser+static checks** (lint · tsc · 28/28 tests · 35/35 APK-asset resolution)

## 1. WebView and native bridge security

- [x] Only documented trusted origins load inside the privileged WebView. *(code: exact `https` + `appassets.androidplatform.net` host check in `shouldOverrideUrlLoading`)*
- [x] External links open outside the privileged WebView. *(code: `openExternally` → ACTION_VIEW; navigation returns true)*
- [x] Scheme, host, and port are validated exactly; lookalike domains are rejected. *(exact scheme+host equality; virtual host has no explicit port; http downgrade refused — also blocked manifest-wide by `usesCleartextTraffic=false`)*
- [x] Redirects and unexpected navigation cannot bypass origin checks. *(the check applies to every navigation; the bridge transport is https-only)*
- [x] Untrusted frames/pages cannot invoke native bridge methods. *(remote origins can never become the top document; iframes from other origins cannot reach `addJavascriptInterface` of the shell — architecture note, device test M-1 pending)*
- [x] Every bridge method has a minimal capability scope and validates arguments. *(code: base64/name validation in exportFile, bounds-checked readImportChunk, https-prefix httpGetString/fetchToCache, 1 GB download cap)*
- [x] JavaScript, file access, content access, mixed content, debugging, and intent handling are reviewed. *(JS on, file/content access off, cleartext off, no setWebContentsDebuggingEnabled call, singleTask + intent filters reviewed)*
- [x] File picker grants only the required access and cancellation is safe. *(ACTION_GET_CONTENT + CATEGORY_OPENABLE; unresolved callbacks released; cancel paths null-safe)*
- [ ] Negative tests cover untrusted URLs, malformed bridge arguments, and unexpected navigation. *(device/robotest — pending, M-1)*
- [ ] Release builds do not expose WebView debugging. *(no call exists in code; needs a release-build assertion — pending APK build)*

**Evidence / issues:** Round 1: renderer-crash recovery + WebView teardown destroy added; traversal/NUL rejection in serveAsset; origin lock implemented. Residual: committed DEBUG keystore (see §3), device negatives pending.*

## 2. Vault and private data

- [x] UI lock, hidden content, and encryption are described as separate protection levels. *(Vault screen states Hidden / Locked / "Encryption: not active in this build" — honest labeling)*
- [x] Public Home, search, suggestions, recents, library counts, notifications, and logs do not leak Vault metadata while locked. *(code audit table in plan §SEC-02; History rows now masked too; notifications mask vault + orphaned workIds; update-checks skip vault works)*
- [x] Locking the Vault clears sensitive content from the visible UI and relevant in-memory state. *(vaultUnlocked is transient — excluded from persistence; auto-lock on backgrounding)*
- [x] PIN verification does not use a fast rolling hash or a custom cryptographic algorithm. *(salted PBKDF2-SHA256 via WebCrypto, 120k iterations, 128-bit random salt; legacy rolling-hash records still verify ONLY as a migration shim and are auto-upgraded on the next successful unlock — tests/vault-crypto.test.ts)*
- [ ] Retry throttling survives reopening the screen and process restart. *(session-persistent via sessionStorage; full process-restart persistence pending — M-3)*
- [x] Recovery/reset behavior is documented and does not silently bypass the protection model. *(PIN change requires the current unlock; backup import cannot overwrite the device-local PIN record)*
- [ ] Original files, covers, thumbnails, caches, temporary files, exports, and backups are included in the threat model. *(backups now exclude PIN + credentials and Vault content files; thumbnails/caches audit pending — open)*
- [x] Encryption claims are supported by tests for data at rest and key management; otherwise the product explicitly says content is not encrypted. *(UI states encryption inactive — no false claim)*
- [x] Android backup/device-transfer behavior is an intentional, documented choice. *(allowBackup=false, changelog + plan documented)*
- [x] Vault deletion and movement do not leave unexpected app-managed copies. *(deleteWorks purges notifications/history/bookmarks/highlights — tested; IndexedDB blob purge on device pending)*

**Evidence / issues:** Round 1: PBKDF2 records + legacy migration shipped and browser-verified (persisted record starts with `v2:`); fake web-biometric unlock REMOVED (lock screen shows no fingerprint on web); 5-attempt → 30 s lockout with countdown verified in browser. Open: at-rest encryption (VLT-003), persistent throttling.*

## 3. Secrets, permissions, network, and extensions

- [ ] No passwords, API tokens, PINs, private keys, or production keystores are committed. **OPEN P0: `android/oni-debug.keystore` + hardcoded debug passwords ARE committed — explicitly debug-only; build script accepts `ONI_KEYSTORE/ONI_KEYSTORE_PASS/ONI_KEY_ALIAS` env overrides and prints a debug-signing notice. Production signing material must be provisioned in a secret store before a distribution release.**
- [x] Logs and crash reports exclude credentials and unnecessary private paths/content. *(no credential logging in JS/native paths reviewed this round)*
- [x] Credentials are not placed in query strings or fragment identifiers. *(HTTP Basic threaded via headers; not in URLs)*
- [x] TLS/certificate failures are surfaced; validation is not bypassed. *(no onReceivedSslError override — platform default cancels; https-only bridge)*
- [ ] Permissions are requested only when needed and denial is handled gracefully. *(manifest only INTERNET + ACCESS_NETWORK_STATE; picker denial handled — device matrix pending)*
- [ ] Third-party sources/extensions have documented origin, compatibility, trust, and permission boundaries. *(built-in sources documented in changelog; extension screen is honest about unsupported APK extensions — doc pass pending)*
- [x] Untrusted archives and metadata are treated as hostile input. *(magic-byte sniffing tested; per-entry salvage; path sanitization on staged imports; 600 MB ceiling)*

**Evidence / issues:** Round 1: credentials stripped from backups (v3) and re-stripped on import; backup PIN overwrite blocked (known-hash attack). Residual P0: committed debug keystore (REL-02).*

## 4. Storage, import, and deletion

- [ ] PDF, EPUB, CBZ/ZIP, JPG/JPEG, PNG, WebP, and supported image batches are tested. *(browser smoke only — full matrix pending, device)*
- [x] Unsupported formats fail with a clear explanation rather than a crash. *(reason codes → i18n; per-file isolation; tests on the sniffing path)*
- [ ] Unicode filenames, Persian/English mixed strings, spaces, punctuation, and natural numeric sorting are tested. *(natural sort in code; dedicated test fixtures pending)*
- [ ] Corrupt archives, corrupt images, password-protected files, duplicates, and large files are tested. *(password/multivolume reasons exist in code; fixtures pending)*
- [x] Archive extraction prevents path traversal and uncontrolled resource consumption. *(fflate unzipSync + per-entry salvage; 600 MB ceiling; CBR 1 GB cap; staged names sanitized)*
- [ ] Storage quota exhaustion and failed writes do not silently erase or corrupt existing data. *(per-page putFile isolation — silently-skip replaced by counted `failed` + user-facing warning; fault-injection tests pending)*
- [x] Interrupted imports are recoverable and do not mark partial items complete. *(partial-page surfacing per import path; chapter pages = stored keys only)*
- [ ] Metadata and binary content remain consistent across IndexedDB/localStorage or other stores. *(download queue now round-trips in backups (v3); deeper consistency pass pending)*
- [ ] Delete operations account for records, blobs, covers, thumbnails, caches, and temporary files. *(store collections purge tested; IDB blob deletion audit pending — device)*
- [ ] Cache/index rebuilds do not delete originals without explicit confirmation. *(not exercised this round)*
- [x] Database migrations and backup restore are tested against older supported data versions. *(backup import strict validation + v2/v3 handling tested; settings merge falls back to defaults for older stores)*

**Evidence / issues:** Round 1: toobig ceiling + partial-page warnings + deterministic meta-works; importBackup validation tests (28-test suite).*

## 5. Reader and progress

- [ ] Paged, continuous, and Webtoon modes are tested where supported. *(webtoon + paged browser-smoked; full matrix pending)*
- [ ] Manga RTL and comic LTR reading work independently of interface language. *(code-verified: page flow keys off `work.direction`, not locale — device pass M-9 pending)*
- [ ] Fit Width, Fit Height, Fit Screen, Original Size, zoom, pan, and reset work. *(not exercised this round)*
- [ ] Wide pages, long strips, large PDF dimensions, rotated pages, and high-resolution images are tested. *(not exercised this round)*
- [x] Navigation and progress are correct at first/last page and chapter boundaries. *(progress math unit-tested incl. ratio vs legacy-absolute clamping)*
- [x] Position survives reader exit, app backgrounding, force-stop, and restart. *(exit + reload browser-verified: restored mid-chapter 13/18; history entry now refreshed on every page change so Resume = latest position; force-stop on device pending M-6)*
- [ ] Per-series settings do not leak into other works unintentionally. *(per-series overlay reviewed; cross-work pass pending)*
- [ ] A corrupt page/file does not make unrelated library items unreadable. *(loadPageUrl error paths reviewed; device pass pending)*
- [ ] Reader controls remain discoverable and do not obstruct content unnecessarily. *(not exercised this round)*

**Evidence / issues:** Round 1: EPUB progress writes debounced 400 ms + flushed on unmount (was ~60 full-store localStorage writes/s); `continueReading` legacy-page parity fix; tests in store-logic suite.*

## 6. Offline and downloads

- [ ] Imported local files open in airplane mode after a cold restart. *(reads are IDB-only by design; device airplane test pending)*
- [ ] Fully completed downloads open offline. *(import-path downloads are real IDB files — offline by design; device pass pending)*
- [ ] Download start, pause, resume, cancel, retry, and restart recovery are tested. *(state machine + retry-first ERROR rows shipped; restart-recovery device test pending)*
- [x] Incomplete downloads are not presented as complete. *(ERROR rows no longer offer “Open”; partial imports warn)*
- [ ] Storage-full, network-loss, timeout, authentication, and source errors are distinguishable. *(error codes exist (`dl.errNetwork` etc.); queue convergence pending)*
- [ ] Duplicate download requests do not corrupt the queue or produce conflicting records. *(queue dedupes chapter ids in startDownload; device test pending)*
- [x] Offline UI accurately separates local capabilities from network-dependent features. *(tick now stalls on `!navigator.onLine`/Offline mode and auto-resumes; Wi-Fi-only hint honest about WebView limits)*

**Evidence / issues:** Round 1: real connectivity awareness added to the queue tick; failed-row read-gate. Honest limitation: the visible queue remains a simulation for seeded works — convergence is the top open item (plan §DL-01).*

## 7. Localization, accessibility, and navigation

- [x] Fresh setup is tested in English and Persian. *(agent-browser: onboarding → language pick → fa switch → RTL applied, screenshot-verified)*
- [x] All P0 screens, menus, dialogs, empty states, errors, notifications, and accessibility labels are translated. *(fa parity compile-enforced + runtime-tested; last hardcoded strings (notification bodies, EPUB re-import) localized this round)*
- [ ] Persian shaping, RTL layout, punctuation, URLs, filenames, mixed scripts, and digits are checked. *(RTL screenshot-verified; full shaping/mixed-content device pass pending)*
- [x] Interface language does not change a work's reading direction. *(code audit: reader keys off `work.direction`; locale drives container dir only)*
- [ ] Android Back behavior is tested on nested screens, overlays, picker, and Reader. *(native back → overlay Escape bridge reviewed; device test pending)*
- [ ] Rotation, activity recreation, process death, and system text/display scaling are tested. *(configChanges covers orientation; device pass pending)*
- [ ] TalkBack names and actions are meaningful. *(aria-labels present on new controls; TalkBack pass pending)*
- [ ] Primary controls have suitable contrast and touch-target size. *(44px+ targets on new controls; contrast audit pending)*
- [ ] Phone, tablet, portrait, and landscape layouts are checked. *(phone-only this round)*

**Evidence / issues:** Round 1: all new strings in en+fa with runtime parity test (tests/i18n.test.ts); browser-verified fa RTL.*

## 8. Backup, restore, and external services

- [x] Backup scope is shown before creation and restore. *(backup screen lists included/excluded sections incl. PIN + credential exclusions this round)*
- [x] Vault/private content is excluded by default unless a secure, informed opt-in is implemented. *(media + PIN record + catalog credentials excluded; CSV export contains an InVault flag — flagged for review in the plan)*
- [x] Invalid, incomplete, older-version, and oversized backups fail safely. *(strict per-section validation, wrong-typed works refuses restore, invalid rows dropped — tests)*
- [ ] Restore does not unexpectedly overwrite existing data; conflicts are explained. *(restore replaces the library by design; confirm dialog exists — conflict explanation pending)*
- [ ] Server/source timeouts, redirects, rate limits, authentication failures, and recovery are tested. *(timeouts set in native bridge; failure matrix pending)*
- [ ] A remote source outage never hides or deletes local content. *(reads are local-only by design; source outage test pending)*
- [ ] Unsupported source/extension compatibility is not advertised as verified. *(extensions screen is honest; doc pass pending)*

**Evidence / issues:** Round 1: backup format v3 (PIN record + credentials stripped, download queue included); restore validation.*

## 9. Build and release integrity

- [x] Build works from a clean checkout without developer-specific absolute paths. *(verify script derives repo root from its location / `ONI_PROJECT_ROOT`; SDK only via `ANDROID_SDK_ROOT`; build script has the documented root override)*
- [x] TypeScript/build errors are not ignored. *(next.config.ts `ignoreBuildErrors: false`; tsc clean)*
- [x] Lint, typecheck, unit tests, integration tests, and build are run where available. *(lint · tsc · 28 tests run this round; production web build + APK build NOT RUN — no SDK; recorded as NOT RUN)*
- [x] APK assets are verified against the actual artifact path. *(35/35 URLs resolve on the last built APK; verifier no longer crashes without aapt2)*
- [ ] The packaged APK launches on a target Android device. *(pending — needs SDK machine + device)*
- [x] App version, manifest version, package metadata, APK filename, README, and release notes agree. *(1.3.1 / versionCode 11 across manifest, build script, CHANGELOG)*
- [ ] Production signing uses protected release secrets, not a committed debug key or hardcoded password. **OPEN P0 — debug keystore committed; env-based override shipped; release secret provisioning pending (REL-02)**
- [ ] APK SHA-256 is recorded and matches the distributed artifact. *(pending APK build)*
- [ ] CI failure stops release; skipped checks are recorded as NOT RUN. *(no CI workflow exists in-repo yet — candidate follow-up)*
- [x] README and download links point to the correct repository and release artifact. *(repo link fixed after the `oniLibrary_zai_2` → `oniLibrary` rename)*

**Evidence / issues:** Round 1: BLD-01/BLD-02/REL-01 implemented; REL-02 partially (env overrides + labeling). No CI workflow file yet — recommend adding a GitHub Actions gate (lint/tsc/test/verify) as a follow-up.*

## 10. Minimum end-to-end acceptance run

- [ ] Fresh install → choose English → import a supported file → read → exit → reopen → position restored.
- [ ] Fresh install or settings change → choose Persian → verify RTL UI → read an LTR work.
- [ ] Read an RTL manga while the UI is English.
- [ ] Import an archive with Unicode filenames and verify natural page order.
- [ ] Force-stop during/after import and confirm safe recovery.
- [ ] Open local content in airplane mode after restart.
- [ ] Download a chapter, restart, then open it offline.
- [ ] Lock Vault and inspect public screens, search, recents, notifications, and exports for leaks.
- [ ] Restore a valid backup and reject a malformed backup without damaging the current library.
- [ ] Verify system Back, picker cancellation, rotation, and large text.
- [ ] Verify the release APK starts on a real Android device.

## Sign-off

- **Critical security issues:** none open / list:
- **Data-loss issues:** none open / list:
- **P0 acceptance:** PASS / FAIL / BLOCKED
- **Known limitations:** 
- **Release decision:** GO / NO-GO
- **Approver and date:**
