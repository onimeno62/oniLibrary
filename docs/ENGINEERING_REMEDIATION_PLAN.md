# oniLibrary Engineering Remediation Plan

**Status:** Proposed implementation plan  
**Baseline:** Existing repository and `docs/PRD.md`  
**Scope:** Engineering, security, reliability, QA, and release hardening  
**Important:** This is a prioritized plan, not a claim that every listed scenario has been reproduced. Validate each finding against the current branch before changing behavior.

## Goals

1. Protect users and private content before distributing public builds.
2. Make clean builds and CI reproducible.
3. Preserve user files, library metadata, and reading progress through errors and restarts.
4. Test P0 user journeys against the PRD on real Android devices.
5. Clearly distinguish implemented, partial, unsupported, and unverified features.

## Severity and delivery rules

- **P0 / Critical:** Security boundary, privacy exposure, data loss, or build/release blocker. Do not publish a production release while an unresolved P0 is present.
- **P1 / High:** Core journey unreliable or a release gate missing.
- **P2 / Medium:** Important product quality or maintainability improvement.
- **P3 / Low:** Polish or optional future capability.

Each item must be tracked with an owner, evidence, reproduction steps, implementation notes, tests, and acceptance criteria. Do not mark an item complete because code was changed; mark it complete only after its acceptance criteria pass.

## Phase 0 — Establish a verified baseline

### BASE-01 — Inventory the actual implementation (P0)
- Read the PRD, repository instructions, package scripts, Android manifest, WebView shell, storage code, reader engines, source integrations, and release workflow.
- Build a feature matrix: implemented and verified / implemented but unverified / partial / missing / unsupported.
- Record toolchain versions, supported Android API levels, build commands, test commands, and the exact baseline commit.
- Avoid assuming that a visible screen means the underlying workflow is functional.

**Acceptance:** A reproducible baseline report exists; commands and current failures are recorded without hiding failures.

### BASE-02 — Create representative test fixtures (P1)
- Maintain small, redistributable fixtures for PDF, EPUB, CBZ/ZIP, images, Unicode filenames, corrupt files, and large-file cases.
- Never commit copyrighted user content, private files, secrets, keystores, or real service credentials.

**Acceptance:** Tests can run from documented fixtures and do not depend on a user’s personal library.

## Phase 1 — Security and privacy (do first)

### SEC-01 — Restrict WebView navigation and bridge exposure (P0 / Critical)
**Areas to inspect:** `android/app/java/com/onilibrary/app/MainActivity.java`, WebView configuration, navigation handling, and every method exposed through `addJavascriptInterface`.

- Define the exact trusted origin(s) used by the packaged application.
- Reject or open externally any navigation that is not explicitly trusted. Validate scheme, host, and port; do not use loose substring matching.
- Ensure untrusted pages, redirects, popups, and frames cannot call privileged native bridge methods.
- Expose the smallest possible bridge API; validate every argument and reject malformed input.
- Review JavaScript settings, file access, content access, mixed content, debugging, intent handling, and file-picker behavior.
- Add tests for untrusted URLs, HTTP downgrade, lookalike domains, redirects, malformed arguments, and expected trusted navigation.

**Acceptance:** Untrusted origins cannot access native capabilities; legitimate app flows continue to work; the security decision and supported origins are documented.

### SEC-02 — Make Vault claims match actual protection (P0 / Critical)
**Areas to inspect:** `src/lib/store.ts`, `src/lib/local-files.ts`, Vault screens, search, recent items, logs, exports, cache and backup paths.

- Treat a UI lock or hidden route as access control, not encryption.
- Remove sensitive Vault titles, covers, metadata, and progress from public Home, search, suggestions, recent items, notifications, and ordinary exports while locked.
- Review whether localStorage or IndexedDB contains sensitive material and whether it is accessible to other scripts in the WebView origin.
- Define a threat model and use vetted Android cryptographic primitives and Android Keystore-backed key management for any promised encryption. Do not invent a custom cipher or use a fast rolling hash as a PIN verifier.
- Apply persistent retry throttling and a clear recovery policy. Reopening a screen or process must not reset a security control.
- Include thumbnails, temporary copies, cache entries, exports, and backups in the data-lifecycle review.
- Review Android backup/device-transfer policy, including `android:allowBackup`, and make an explicit decision for private data.
- If complete encryption cannot safely be implemented in the current architecture, accurately label the Vault as UI-protected and do not claim encryption.

**Acceptance:** A written threat model exists; no sensitive content leaks through normal views or exports; encryption claims are supported by tested at-rest protection and key lifecycle handling, or the product explicitly states that it is not encrypted.

### SEC-03 — Audit logs, secrets, extensions, and network traffic (P0)
- Ensure tokens, passwords, PINs, private filenames, and sensitive paths are not logged.
- Keep credentials out of URLs and source control.
- Validate TLS behavior and report certificate/authentication failures; never silently bypass certificate validation.
- Treat extension packages and source metadata as untrusted input. Document provenance, permissions, compatibility, and license considerations.

**Acceptance:** Static searches and tests find no known embedded credentials or sensitive log output; network and extension failure behavior is documented.

### SEC-04 — Data deletion and backup privacy (P0)
- Trace deletion across database records, binary blobs, covers, thumbnails, caches, and download temporary files.
- Make export/backup scope explicit; exclude Vault content by default unless a secure, informed opt-in flow is implemented.
- Validate imported backups before mutation and recover cleanly from malformed or partial archives.

**Acceptance:** Deleting an item leaves no app-managed orphaned copies in the documented scope; backup contents are previewed and tested.

## Phase 2 — Build and release reliability

### BLD-01 — Remove machine-specific paths from build scripts (P0)
**Areas to inspect:** `scripts/build-apk.sh`, `scripts/verify-apk-assets.cjs`, `.github/workflows/apk.yml`.

- Derive repository root from the script location or a documented environment override.
- Pass explicit artifact paths into verification rather than assuming one download directory.
- Fail immediately when required commands or artifacts are missing.
- Test from a clean checkout in the same environment used by CI.

**Acceptance:** A clean GitHub Actions run builds and verifies the expected APK without relying on a developer-specific absolute path.

### BLD-02 — Restore type safety (P0)
**Area:** `next.config.ts` and CI checks.

- Remove `typescript.ignoreBuildErrors: true` after fixing reported errors.
- Add explicit typecheck, lint, unit test, and production-build commands where supported by the project.
- Do not mask failures with `|| true`, swallowed exceptions, or non-failing scripts.

**Acceptance:** CI fails on a deliberate type error and passes only when checks genuinely pass.

### REL-01 — Establish a single version source (P1)
- Reconcile the version in README, Android manifest, package metadata, APK naming, release notes, and download links.
- Prefer one canonical version value with validated propagation where the current toolchain allows it.
- Verify links refer to this repository and to an actual artifact.

**Acceptance:** The app version and published artifact name agree; documentation contains no stale repository or release link.

### REL-02 — Separate development and production signing (P0 before public release)
- Never use a committed debug keystore or hardcoded passwords as production signing credentials.
- Store production signing material in an appropriately restricted secret store; document recovery and rotation.
- Keep local debug builds easy to reproduce without exposing release keys.

**Acceptance:** Production release signing uses protected secrets; repository history and current files are checked for accidental secrets.

### REL-03 — Make CI a meaningful release gate (P1)
- Run typecheck, lint, tests, production build, APK asset verification, and applicable Android smoke tests.
- Preserve test logs and artifacts when useful; fail the job if a required step fails.
- Add a release checklist and document what is not yet automated.

**Acceptance:** A release cannot be considered green if a required validation step failed or was skipped.

## Phase 3 — Core workflows and data integrity

### DATA-01 — Persistence resilience (P0)
- Test missing, malformed, and outdated local state; IndexedDB open/migration failures; quota exhaustion; interrupted writes; and process death.
- Keep related metadata and binary-file operations consistent, or implement a reconciliation/recovery path.
- Never overwrite a valid library with an empty/default state because one read failed.
- Make storage errors actionable and avoid deleting original files during cache/index recovery.

**Acceptance:** Fault-injection tests demonstrate safe failure and recovery without silent library or progress loss.

### IMP-01 — File import and archive validation (P0)
- Verify PDF, EPUB, CBZ/ZIP, image files, and image batches as advertised by the PRD.
- Handle Unicode and mixed Persian/English filenames, natural numeric ordering, duplicate imports, malformed archives, unsupported formats, and password-protected documents.
- Enforce sensible limits and safe extraction paths; prevent path traversal and decompression/resource exhaustion.
- Make cancellation and partial failure recoverable.

**Acceptance:** Each supported format has positive and negative tests; one corrupt file does not crash the library or corrupt other items.

### READ-01 — Reader progress and navigation (P0)
- Verify page/chapter ordering, independent per-series settings, RTL/LTR behavior, zoom/pan, fit modes, long Webtoon images, and large PDF page dimensions.
- Persist position at appropriate checkpoints and restore it after reader exit, force-stop, and restart.
- Ensure changing reader mode does not unexpectedly reset progress.

**Acceptance:** Reader test matrix passes for representative formats and both reading directions; progress survives forced termination.

### OFF-01 — Offline contract (P0)
- Verify imported local files and completed downloads open with networking disabled.
- Distinguish local functionality from network-dependent sections in UI and errors.
- Ensure cached metadata is not presented as a successful fresh online result.

**Acceptance:** Core local reading and saved downloads work in airplane mode after a cold restart.

### DL-01 — Download queue correctness (P0)
- Test start, pause, resume, cancel, retry, process death, storage-full errors, partial files, duplicate requests, and completion state.
- Persist enough state to recover safely; never show a partial file as completed.
- Report source errors separately from file-write and storage errors.

**Acceptance:** Queue state recovers after restart and every operation has a deterministic, tested outcome.

### I18N-01 — Persian/English and RTL/LTR quality (P0)
- Test all critical flows in both languages, including empty/loading/error/success states, dialogs, accessibility labels, notifications, and system back behavior.
- Test mixed Persian/English titles, URLs, punctuation, digits, and file names.
- Keep UI direction independent of the content reading direction.

**Acceptance:** No untranslated critical strings, clipped controls, broken Persian shaping, or incorrect directional navigation remain in P0 flows.

## Phase 4 — Integrations and product acceptance

### SRV-01 — Online sources and personal servers (P1)
- Test authentication, redirects, timeouts, rate limits, malformed responses, unavailable servers, and recovery after connectivity returns.
- Make supported source/extension compatibility explicit; do not claim universal Mihon compatibility without verification.
- Ensure a source outage never hides or deletes the local library.

**Acceptance:** Each claimed integration has documented supported behavior and failure-mode tests.

### BKP-01 — Backup/restore and migration (P1)
- Preview what will be included, excluded, merged, or overwritten.
- Validate schema/version, checksums where appropriate, and file size limits before applying changes.
- Test partial restore failure and recovery.

**Acceptance:** A backup round-trip preserves all documented fields; invalid backups fail safely without damaging existing data.

### UX-01 — Navigation, accessibility, and adaptive layouts (P1)
- Test Android Back, overlays, reader exit, picker cancellation, activity recreation, screen rotation, and system text scaling.
- Verify TalkBack labels, contrast, touch targets, keyboard interaction where relevant, and phone/tablet layouts.

**Acceptance:** Critical flows remain operable without accidental exit, inaccessible controls, or major clipping.

### PERF-01 — Measure large-library and reader performance (P1)
- Profile with a documented fixture of at least 1,000 library entries and representative large files on a named reference device.
- Measure startup-to-usable, scrolling, search, memory, image decode, and storage operations.
- Optimize only after collecting repeatable measurements.

**Acceptance:** Measurements and regressions are recorded; no performance guarantee is claimed without evidence.

## Phase 5 — UI and product polish

- Compare implemented screens with the supplied oniLibrary mockups.
- Standardize spacing, typography, icons, controls, loading states, dialogs, and empty states.
- Verify Light, Dark, and Follow System themes.
- Validate responsive behavior on phones, tablets, and landscape orientation.

**Acceptance:** Differences from the mockups are documented; critical readability, navigation, and accessibility issues are resolved.

## Required engineering workflow

For each task:

1. Read the current implementation and relevant PRD requirements before editing.
2. Reproduce the issue or record why it cannot yet be reproduced.
3. Write or update a failing test where practical.
4. Implement the smallest safe change consistent with the existing architecture.
5. Run the relevant tests plus all available required checks.
6. Review the diff for security, data-loss, localization, and accessibility regressions.
7. Update this plan and the test report with evidence and status.
8. Report exact commands and results. Never claim tests passed if they were not run.

## Definition of done

- The change maps to a PRD requirement or a documented engineering issue.
- Acceptance criteria and regression tests are present.
- No secrets, personal content, or private test fixtures are added.
- Typecheck, lint, tests, and build pass where available; unrun checks are explicitly listed.
- User-facing behavior is localized in Persian and English where applicable.
- Data migration and rollback/recovery behavior are considered.
- Documentation accurately distinguishes verified behavior from planned or unsupported behavior.

## Related documents

- [Product Requirements Document](PRD.md)
- [Security and QA Checklist](SECURITY_AND_QA_CHECKLIST.md)
- [AI Agent Implementation Prompt](AI_AGENT_IMPLEMENTATION_PROMPT.md)
