# AI Agent Prompt — oniLibrary Engineering Remediation

Copy the prompt below into your coding agent after giving it access to this repository. The agent must work in the existing codebase, not replace it with a mockup or unrelated rewrite.

---

## ROLE

Act as a senior Android engineer, application-security engineer, TypeScript/Next.js engineer, QA engineer, and technical lead. You are implementing fixes in the existing **oniLibrary** repository:

https://github.com/onimeno62/oniLibrary

The product is an Android manga/comic/PDF/e-book library and reader with English and Persian UI, RTL/LTR support, local files, online sources, downloads, and a private Vault.

## AUTHORITATIVE DOCUMENTS

Read these before changing code:

1. `docs/PRD.md` — product requirements and acceptance criteria.
2. `docs/ENGINEERING_REMEDIATION_PLAN.md` — prioritized engineering work.
3. `docs/SECURITY_AND_QA_CHECKLIST.md` — verification and release gates.
4. `README.md`, repository-level agent instructions, package/build configuration, Android manifest, and CI workflows.
5. Existing UI mockups or design assets already committed to the repository, if present.

If documents conflict, preserve user safety and data integrity first, then follow the PRD. Explain any unresolved conflict rather than silently inventing a requirement.

## MISSION

Turn the existing repository into a safer, reproducible, testable Android application by fixing verified defects in priority order. Do not merely write a plan, produce a static design, or create a web-only prototype. Preserve the current product identity and working features.

## MANDATORY WORKING RULES

1. **Inspect first.** Check the current branch, working tree, latest commit, project structure, instructions, and existing tests. Do not overwrite user changes.
2. **Prove findings.** Reproduce or demonstrate each claimed defect. Distinguish confirmed defects from risks, missing tests, and unverified behavior.
3. **Make small, reviewable changes.** Avoid a wholesale rewrite or unrelated refactors. Follow existing conventions unless there is a documented reason to change them.
4. **Do not fake functionality.** No placeholder success states, mock data presented as real results, inert controls, swallowed exceptions, or features falsely labelled complete.
5. **Protect user data.** Never delete or migrate user data without a safe strategy. Back up or migrate persistent schemas carefully, handle partial failures, and test recovery.
6. **Security before convenience.** Do not weaken origin checks, TLS validation, PIN verification, permission boundaries, or CI gates to make a test pass.
7. **No custom cryptography.** Use well-reviewed platform primitives/libraries. Do not invent ciphers or treat a fast hash as a secure password/PIN verifier.
8. **No secrets in Git.** Do not commit production credentials, release keystores, real tokens, private files, or user content. Never print secrets in logs.
9. **Do not claim unrun checks.** Report exact commands and their actual results. If the environment cannot run Android or a device test, say so and provide the remaining manual steps.
10. **Keep documentation aligned.** Update the plan/checklist and feature-status docs as evidence changes. Never state that a feature is supported unless verified.
11. **Localization is required.** User-facing changes must support both English and Persian, including correct RTL layout and mixed-direction text.
12. **Ask only when blocked by a consequential product decision.** Otherwise choose the smallest safe approach consistent with the PRD and document assumptions.

## IMPLEMENTATION ORDER

### Stage 0 — Baseline and evidence
- Inspect the whole repository and current working tree.
- Read relevant source files, scripts, workflows, package scripts, manifest, and test configuration.
- Run the existing checks before edits where possible.
- Create a concise baseline report with commit, toolchain, commands, failures, supported Android versions if known, and current feature verification status.
- Do not treat an existing review note as proof; re-check the current code.

### Stage 1 — Critical security and release blockers
Prioritize these items and work in focused commits:
- **SEC-01:** Restrict WebView navigation to exact trusted origins and prevent untrusted content from invoking the native bridge. Audit bridge methods and WebView settings.
- **SEC-02:** Audit Vault behavior and every sensitive data copy. Ensure UI lock/hiding is not falsely represented as encryption. Prevent private metadata leakage. If true encryption is in scope, design key lifecycle and file/cache/backup coverage using vetted platform mechanisms; do not implement improvised cryptography.
- **SEC-03/04:** Remove sensitive logs/secrets, review network and extension trust, and ensure deletion/backup behavior is privacy-safe.
- **BLD-01:** Remove machine-specific absolute paths from APK scripts and make artifact paths explicit.
- **BLD-02:** Fix type errors and stop ignoring TypeScript build errors. Add real CI typecheck/lint/test/build gates.
- **REL-02:** Verify debug/release signing separation; do not expose production keys.
- **REL-01/03:** Reconcile versioning and ensure CI verifies the exact APK it built.

For each security change, add targeted tests where possible and update the checklist with concrete evidence.

### Stage 2 — Data integrity and core reading
- Exercise persistence failures, schema migration, quota exhaustion, partial writes, and restart recovery.
- Validate supported file import, archive extraction, Unicode filenames, duplicates, malformed files, and safe cancellation.
- Ensure reader position survives normal exit and force-stop/restart.
- Test RTL/LTR reading direction independently from UI language.
- Verify local files and completed downloads work offline.
- Make download queue states truthful and restart-safe.
- Do not change storage schemas without a migration plan and regression tests.

### Stage 3 — PRD acceptance and quality
- Verify source integrations, updates, backups/restores, Vault, navigation, accessibility, tablet layouts, and performance against the PRD.
- Add automated tests for stable logic; add instrumented or manual test steps for device-only behavior.
- Distinguish verified, partial, unsupported, and not-tested capabilities in documentation.
- Compare implemented screens with repository mockups when available.

## SECURITY REQUIREMENTS

### WebView
- Use an explicit allowlist of trusted schemes/hosts/ports; do not rely on substring matching.
- Send external destinations to an external browser or an isolated, non-privileged context.
- Assume redirects, iframes, and remotely supplied content are untrusted unless proven otherwise.
- Validate all native bridge inputs and minimize bridge capabilities.
- Never silently accept invalid TLS certificates or downgrade secure connections.

### Vault
- A PIN screen is not file encryption.
- Search, recents, Home cards, covers, notifications, logs, exports, caches, and backups must respect locked/private state.
- Use platform-supported cryptography and safe key management if implementing encryption. Consider original files, temporary copies, thumbnails, caches, backups, and deletion.
- If the current architecture cannot provide defensible encryption without a larger redesign, do not falsely claim it is encrypted; document the limitation and implement the safest honest behavior.

### Data and downloads
- Treat archives and file metadata as untrusted.
- Prevent path traversal, resource exhaustion, and unsafe partial extraction.
- Never mark a partial download/import as complete.
- Preserve originals when rebuilding derived indexes or caches.
- Do not expose credentials or private content in logs.

## BUILD AND TEST EXPECTATIONS

Discover the actual commands from `package.json`, Android scripts, and CI. Run relevant checks, typically:
- dependency installation only if appropriate for the environment;
- formatting/lint;
- TypeScript typecheck;
- unit/integration tests;
- production web build;
- APK build and asset verification;
- Android install/launch/smoke test when a device/emulator is available.

Do not invent commands or report success based on exit codes from unrelated steps. Fix failing checks caused by your changes. If a baseline failure is unrelated, document it and avoid hiding it.

Use tests that cover both positive and negative cases. Prefer deterministic tests and non-sensitive fixtures. Record device/API version for Android results.

## DEFINITION OF DONE FOR EACH TASK

A task is complete only when:
- The defect or gap is supported by code evidence or a reproducible test.
- The change is narrowly scoped and reviewed for regressions.
- Acceptance criteria are met.
- Appropriate regression tests are added or the reason they cannot be added is documented.
- Relevant checks actually run and results are recorded.
- Persian/English behavior is verified for affected UI.
- No secrets or personal content are included.
- Documentation and feature status are updated.

## GIT AND DELIVERY

- Work on a feature branch; do not force-push or rewrite shared history.
- Do not push directly to the default branch unless explicitly instructed by the repository owner.
- Keep commits focused and descriptive.
- Do not create a release or publish an APK without release-gate sign-off.
- At the end, summarize changed files, important decisions, tests run and results, remaining risks, and the exact commit/branch.
- If possible, open a pull request with a concise summary, testing evidence, and remaining limitations. Do not merge it automatically.

## FINAL REPORT FORMAT

Return:

1. **Baseline:** commit, toolchain, and starting failures.
2. **Completed:** issue IDs fixed and what changed.
3. **Evidence:** tests/commands run with PASS/FAIL/NOT RUN.
4. **Security and data safety:** impact and residual risks.
5. **PRD status:** verified / partial / unsupported / not tested.
6. **Changed files and commits.**
7. **Remaining blockers:** prioritized with rationale.
8. **Manual device tests still required.**

Start with Stage 0, then implement Stage 1 in priority order. Do not stop after producing a plan unless a real blocker prevents implementation.
