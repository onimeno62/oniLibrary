# Task 2-b — settings-cluster subagent

## Task
Build 9 screens for "oniLibrary" (Next.js 16, Tailwind 4, shadcn/ui): vault, extensions, statistics, settings, categories, backup, servers, formats, more. No modifications to existing files.

## Files created (exports)
1. `src/components/screens/vault-screen.tsx` — `VaultScreen`, `VaultLockScreen({onSuccess, onCancel})`
2. `src/components/screens/extensions-screen.tsx` — `ExtensionsScreen`
3. `src/components/screens/statistics-screen.tsx` — `StatisticsScreen`
4. `src/components/screens/settings-screen.tsx` — `SettingsScreen`
5. `src/components/screens/categories-screen.tsx` — `CategoriesScreen`
6. `src/components/screens/backup-screen.tsx` — `BackupScreen`
7. `src/components/screens/servers-screen.tsx` — `ServersScreen`
8. `src/components/screens/formats-screen.tsx` — `FormatsScreen`
9. `src/components/screens/more-screen.tsx` — `MoreScreen`

## Work Log
- Read worklog.md contracts, full i18n key set (EN+FA parity enforced by `Record<TranslationKey, string>`), store.ts/types.ts APIs, shared.tsx primitives, app-shell.tsx registration expectations (VaultGate already wires VaultLockScreen), bottom-nav.tsx navItems handling, seed extensions/servers/categories/sessions.
- VaultScreen: coral-soft shield header; protection-level card (hidden ✓ / PIN ✓|✗ / encryption info); privacy note; 3-col vault works grid (WorkCover+ProgressBar+overflow menu → setVaultFlag(false)+toast) with openWork navigation; EmptyState; Lock-now (bg-secondary → setVaultUnlocked(false)+pop) & Change-PIN (coral-soft) buttons; PIN setup dialog reusing shared Keypad/PinDots (enter→confirm, hashPin via setVaultPin, toast vlt.pinChanged); biometric + autoLock Switch card.
- VaultLockScreen: dark full-screen, OniLogo 56, 4 coral dots, keypad (bg-white/5 h-14, active:scale-90), framer-motion shake + vlt.wrongPin {n} with 5-attempt cycle, hashPin comparison → setVaultUnlocked(true)+onSuccess, CANCEL→onCancel, fingerprint button (settings.vaultBiometric) with 800ms simulated scan.
- ExtensionsScreen: chip tabs INSTALLED/AVAILABLE/UPDATE; hashed letter icon squares; version v{v}; repo row (GitBranch, lucide has no `Repo`); language chips; trust badges (OFFICIAL emerald ShieldCheck / COMMUNITY amber Users / UNKNOWN red AlertTriangle); compat badges (VERIFIED BadgeCheck / UNVERIFIED ShieldQuestion); provided sources as SourceIcon minis; INSTALLED→Switch enable/disable (+muted state, common.disabled note, uninstall menu Trash2→setExtensionStatus(id,"AVAILABLE",false)); UPDATE→coral button; AVAILABLE→outline Install → RISK DIALOG (riskTitle/riskBody/origin/Checkbox trustWarningAccepted gating coral Install).
- StatisticsScreen: 2×2 summary (total time "Xh Ym" with toFa, chapters, works-excl-vault, COMPLETED count; Clock3/BookOpen/LibraryBig/CheckCircle2 coral-soft); Recharts BarChart of last-14 sessions (fill #f8694c, radius [6,6,0,0], h-160, XAxis fontSize 9 day numbers, minimal #1e1c1a tooltip); streak card (consecutive days >0 ending today/yesterday, Flame); by-type horizontal coral bars (MANGA+MANHUA / MANHWA / WEBTOON / COMIC / BOOK+NOVEL+EPUB / PDF).
- SettingsScreen: theme segmented (Sun/Moon/Monitor); language EN/فارسی buttons + toast; bottom-nav toggle chips (DEFAULT order preserved, max 4 besides always-on "more", setSettings({navItems:[...sel,"more"]})); reader defaults (dir RTL/LTR, mode paged/continuous/webtoon, fit 4 opts, bg swatches with ring, brightness Slider 30–100 → setReaderDefaults); download rules (wifiOnly switch + hint, maxConcurrent −/+ stepper 1..5); notifications 4 switches; offline switch; privacy clear-history row (window.confirm → clearHistory + toast); account note row (Lock).
- CategoriesScreen: rows with Bookmark square, live count (existing non-vault works), preview grid of first 3 covers (h-14 w-11), rename/delete dropdown (Input dialog / window.confirm lib.deleteCategoryConfirm), coral full-width "+ New category" → createCategory + toast.
- BackupScreen: included/excluded lists (CheckCircle2 emerald / XCircle muted); coral Create → JSON {app:"oniLibrary",version:1,exportedAt,works,categories,workCategories,settings,sessions,bookmarks} → Blob download `onilibrary-backup-YYYYMMDD.onibackup`, setLastBackup + toast; last-backup row (timeAgo / bkp.never); restore via hidden input (.onibackup/.json) → validate app tag else destructive toast → PREVIEW dialog (works/categories/settings-keys counts + restoreConfirm) → importBackup + toast; encrypted note row.
- ServersScreen: coming-soon coral-soft banner; add form (name/url inputs, KOMGA/OPDS chips, Test → 1.2s random OK/fail with emerald/red draft result, Add → addServer + toast and applies draft result via setServerStatus); server rows with status dots + kind badge + menu (Test via setServerStatus+toast, Delete); EmptyState.
- FormatsScreen: 6 rows with icons and badges (PDF demo amber, EPUB demo amber, CBZ full emerald, CBR no muted, images full emerald, folder demo amber) using exact badge classes from spec.
- MoreScreen: tab screen; profile card (coral-gradient initial avatar, userName, ShieldCheck + more.account); single divide-y menu card (9 items, ChevronRight rtl:rotate-180, icons in secondary rounded-xl squares) with correct navigation (setTab("downloads") / push({kind:...})); update-check coral-soft button (runUpdateCheck → upd.found {n} / upd.upToDate, spinner while checking); sticky footer with OniLogo 20 + "oniLibrary v1.0.0".

## Deviations / notes for next agents
- lucide-react 0.525 has no `Repo` or `FileBook` icons → used `GitBranch` (extension repo row) and `BookOpen` (EPUB row). All other spec'd icons verified present via runtime check.
- No dedicated i18n key existed for "PIN change" button label → reused `vlt.setupPin` ("Set a 4-digit PIN") for the Change-PIN entry button; success toast uses `vlt.pinChanged` as specified.
- Language-switch toast uses `common.done` (no dedicated "language changed" key found in i18n.ts).
- Nav customization enforces max 4 selectable chips besides always-on "more" (default ships home/library/discover/updates + more), per task spec; order preserved from DEFAULT order and persisted via setSettings({navItems}).
- tsc --noEmit filtered to my 9 files: CLEAN (remaining project errors are in files owned by other agents: app-shell pending reader/search/notifications screens, details/downloads/engine/store, examples/, skills/).
- ESLint on my 9 files: CLEAN (fixed react-compiler memoization rule by inlining chartData computation in statistics-screen).

## Stage Summary
- Task 2-b complete: 9/9 screens created, all strings via t() (keys only from src/lib/i18n.ts), design system followed (rounded-3xl bg-card p-4 cards, coral gradient CTAs, chip patterns, OverlayHeader for sub-screens, dark theme only in VaultLockScreen), store actions wired (vault, extensions, categories, backup, servers, settings, update check). Screens are registered in app-shell.tsx already and will render as soon as reader-screen/search-screen/notifications-screen land from the other agents.
