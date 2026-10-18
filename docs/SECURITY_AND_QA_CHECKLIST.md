# oniLibrary Security and QA Checklist

Use this checklist before merging high-risk changes and before distributing a release. Checkboxes are not evidence by themselves: record the test/device, result, and any linked issue.

## Release record

- Commit / tag:
- Build environment:
- Android device and OS:
- Test date:
- Tester:
- APK SHA-256:
- Result: PASS / FAIL / BLOCKED / NOT RUN

## 1. WebView and native bridge security

- [ ] Only documented trusted origins load inside the privileged WebView.
- [ ] External links open outside the privileged WebView.
- [ ] Scheme, host, and port are validated exactly; lookalike domains are rejected.
- [ ] Redirects and unexpected navigation cannot bypass origin checks.
- [ ] Untrusted frames/pages cannot invoke native bridge methods.
- [ ] Every bridge method has a minimal capability scope and validates arguments.
- [ ] JavaScript, file access, content access, mixed content, debugging, and intent handling are reviewed.
- [ ] File picker grants only the required access and cancellation is safe.
- [ ] Negative tests cover untrusted URLs, malformed bridge arguments, and unexpected navigation.
- [ ] Release builds do not expose WebView debugging.

**Evidence / issues:**

## 2. Vault and private data

- [ ] UI lock, hidden content, and encryption are described as separate protection levels.
- [ ] Public Home, search, suggestions, recents, library counts, notifications, and logs do not leak Vault metadata while locked.
- [ ] Locking the Vault clears sensitive content from the visible UI and relevant in-memory state.
- [ ] PIN verification does not use a fast rolling hash or a custom cryptographic algorithm.
- [ ] Retry throttling survives reopening the screen and process restart.
- [ ] Recovery/reset behavior is documented and does not silently bypass the protection model.
- [ ] Original files, covers, thumbnails, caches, temporary files, exports, and backups are included in the threat model.
- [ ] Encryption claims are supported by tests for data at rest and key management; otherwise the product explicitly says content is not encrypted.
- [ ] Android backup/device-transfer behavior is an intentional, documented choice.
- [ ] Vault deletion and movement do not leave unexpected app-managed copies.

**Evidence / issues:**

## 3. Secrets, permissions, network, and extensions

- [ ] No passwords, API tokens, PINs, private keys, or production keystores are committed.
- [ ] Logs and crash reports exclude credentials and unnecessary private paths/content.
- [ ] Credentials are not placed in query strings or fragment identifiers.
- [ ] TLS/certificate failures are surfaced; validation is not bypassed.
- [ ] Permissions are requested only when needed and denial is handled gracefully.
- [ ] Third-party sources/extensions have documented origin, compatibility, trust, and permission boundaries.
- [ ] Untrusted archives and metadata are treated as hostile input.

**Evidence / issues:**

## 4. Storage, import, and deletion

- [ ] PDF, EPUB, CBZ/ZIP, JPG/JPEG, PNG, WebP, and supported image batches are tested.
- [ ] Unsupported formats fail with a clear explanation rather than a crash.
- [ ] Unicode filenames, Persian/English mixed strings, spaces, punctuation, and natural numeric sorting are tested.
- [ ] Corrupt archives, corrupt images, password-protected files, duplicates, and large files are tested.
- [ ] Archive extraction prevents path traversal and uncontrolled resource consumption.
- [ ] Storage quota exhaustion and failed writes do not silently erase or corrupt existing data.
- [ ] Interrupted imports are recoverable and do not mark partial items complete.
- [ ] Metadata and binary content remain consistent across IndexedDB/localStorage or other stores.
- [ ] Delete operations account for records, blobs, covers, thumbnails, caches, and temporary files.
- [ ] Cache/index rebuilds do not delete originals without explicit confirmation.
- [ ] Database migrations and backup restore are tested against older supported data versions.

**Evidence / issues:**

## 5. Reader and progress

- [ ] Paged, continuous, and Webtoon modes are tested where supported.
- [ ] Manga RTL and comic LTR reading work independently of interface language.
- [ ] Fit Width, Fit Height, Fit Screen, Original Size, zoom, pan, and reset work.
- [ ] Wide pages, long strips, large PDF dimensions, rotated pages, and high-resolution images are tested.
- [ ] Navigation and progress are correct at first/last page and chapter boundaries.
- [ ] Position survives reader exit, app backgrounding, force-stop, and restart.
- [ ] Per-series settings do not leak into other works unintentionally.
- [ ] A corrupt page/file does not make unrelated library items unreadable.
- [ ] Reader controls remain discoverable and do not obstruct content unnecessarily.

**Evidence / issues:**

## 6. Offline and downloads

- [ ] Imported local files open in airplane mode after a cold restart.
- [ ] Fully completed downloads open offline.
- [ ] Download start, pause, resume, cancel, retry, and restart recovery are tested.
- [ ] Incomplete downloads are not presented as complete.
- [ ] Storage-full, network-loss, timeout, authentication, and source errors are distinguishable.
- [ ] Duplicate download requests do not corrupt the queue or produce conflicting records.
- [ ] Offline UI accurately separates local capabilities from network-dependent features.

**Evidence / issues:**

## 7. Localization, accessibility, and navigation

- [ ] Fresh setup is tested in English and Persian.
- [ ] All P0 screens, menus, dialogs, empty states, errors, notifications, and accessibility labels are translated.
- [ ] Persian shaping, RTL layout, punctuation, URLs, filenames, mixed scripts, and digits are checked.
- [ ] Interface language does not change a work's reading direction.
- [ ] Android Back behavior is tested on nested screens, overlays, picker, and Reader.
- [ ] Rotation, activity recreation, process death, and system text/display scaling are tested.
- [ ] TalkBack names and actions are meaningful.
- [ ] Primary controls have suitable contrast and touch-target size.
- [ ] Phone, tablet, portrait, and landscape layouts are checked.

**Evidence / issues:**

## 8. Backup, restore, and external services

- [ ] Backup scope is shown before creation and restore.
- [ ] Vault/private content is excluded by default unless a secure, informed opt-in is implemented.
- [ ] Invalid, incomplete, older-version, and oversized backups fail safely.
- [ ] Restore does not unexpectedly overwrite existing data; conflicts are explained.
- [ ] Server/source timeouts, redirects, rate limits, authentication failures, and recovery are tested.
- [ ] A remote source outage never hides or deletes local content.
- [ ] Unsupported source/extension compatibility is not advertised as verified.

**Evidence / issues:**

## 9. Build and release integrity

- [ ] Build works from a clean checkout without developer-specific absolute paths.
- [ ] TypeScript/build errors are not ignored.
- [ ] Lint, typecheck, unit tests, integration tests, and build are run where available.
- [ ] APK assets are verified against the actual artifact path.
- [ ] The packaged APK launches on a target Android device.
- [ ] App version, manifest version, package metadata, APK filename, README, and release notes agree.
- [ ] Production signing uses protected release secrets, not a committed debug key or hardcoded password.
- [ ] APK SHA-256 is recorded and matches the distributed artifact.
- [ ] CI failure stops release; skipped checks are recorded as NOT RUN.
- [ ] README and download links point to the correct repository and release artifact.

**Evidence / issues:**

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
