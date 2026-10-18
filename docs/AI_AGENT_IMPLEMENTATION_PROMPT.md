# AI Agent Implementation Prompt — oniLibrary

Operating instructions for an AI agent continuing development on this
repository. Follow them in order; they encode the process decisions of the
remediation rounds so results stay reproducible.

## 0. Non-negotiables
1. **Modify the existing app.** Never replace it with a static prototype or an
   unrelated rewrite. The product is a Next.js 16 static-export SPA inside an
   Android WebView shell (`android/app/java/com/onilibrary/app/`).
2. **Never claim a test you did not run.** State the exact command and its
   result. If a check cannot run in your environment (e.g. no Android SDK),
   say so and record it as an open manual test instead of pretending.
3. **Preserve user data.** The persisted store (`onilibrary-store-v1` in
   localStorage) and the IndexedDB blob store (`onilibrary-files`) must
   survive upgrades. Additive settings keys fall back via the persist
   `merge` hook; destructive migrations are forbidden without a migration
   path and a test.
4. **Feature branch only.** Work on a branch like
   `fix/<topic>` or `feat/<topic>`; never push straight to `main`; never
   merge into `main` automatically. Merge is a human decision.
5. **Persian RTL is locale-only.** `dir="rtl"` follows the UI language; the
   manga/comic page-flow direction is `work.direction` and must stay
   independent of the locale.
6. **Honesty over polish.** Simulations (download queue, demo readers) must
   be visibly labeled as such; when a limitation is real, write it down in
   docs rather than hiding it.

## 1. Required reading (in order)
- `docs/PRD.md` — product requirements and the [CODES] (LIB-, RDR-, VLT-…)
  used in changelogs and commits.
- `docs/ARCHITECTURE.md`, `docs/BUILDING.md` — shell/build pipeline.
- `docs/ENGINEERING_REMEDIATION_PLAN.md` — current state, executed rounds,
  open gaps with priorities.
- `docs/SECURITY_AND_QA_CHECKLIST.md` — what is verified and how; the release
  gates at the bottom are mandatory before any release.
- `CHANGELOG.md` — keep-a-changelog format; every user-visible change lands
  here.

## 2. Baseline before any change
```bash
bun install
bun run lint          # must exit clean
bunx tsc --noEmit     # must be clean (skills/ excluded; app code only)
bun run test          # bun test tests/ — all must pass
node scripts/verify-apk-assets.cjs   # against the newest APK (aapt2 optional)
```
Run these first and record the results; fix or justify every red before
starting new work.

## 3. Implementation discipline
- One logical theme per commit; message format:
  `security(scope): …` / `fix(scope): …` / `feat(scope): …` / `test: …` /
  `docs: …` / `build: …`.
- User-visible strings go through `src/lib/i18n.ts` in **both** `en` and `fa`
  (the `fa` dict is `Record<TranslationKey, string>` — missing keys fail the
  build).
- Import paths must use the reason-code mechanism
  (`UnsupportedFile["reason"]` + `UNSUPPORTED_REASON_KEYS`), not ad-hoc text.
- Any new persisted store field: add to `partialize` if it should survive
  reloads; explicitly EXCLUDE transient/secret state (see `vaultUnlocked`).
- Secrets (PIN records, credentials) never enter backups, logs, or
  notifications; masking uses the live store lookup plus the stored
  `sensitive` flag.
- Native (`MainActivity`) changes: no Android SDK exists in the usual dev
  sandbox — review carefully (override signatures: `onRenderProcessGone`
  returns `boolean`), and add/extend the manual test list in the
  remediation plan.

## 4. Verification after changes
1. `bun run lint && bunx tsc --noEmit && bun run test`
2. `bun run dev` (port 3000) + browser QA of the flows you touched — the SPA
   is the product; check light/dark, en/fa, mobile width (412×915).
3. If native code changed: extend `docs/ENGINEERING_REMEDIATION_PLAN.md`
   §Manual tests with a concrete M-step.
4. For releases (human-approved merge): bump `android:versionCode` /
   `versionName`, sync `scripts/build-apk.sh` `APK_OUT`, build on an
   SDK machine, run `verify-apk-assets.cjs` against the new APK, attach to a
   GitHub Release, update `CHANGELOG.md`.

## 5. Handover
Update `docs/ENGINEERING_REMEDIATION_PLAN.md` (executed items + open gaps)
and `docs/SECURITY_AND_QA_CHECKLIST.md` (checked/unchecked states) in the
same branch as your changes. A round that ends without updated docs is not
finished.
