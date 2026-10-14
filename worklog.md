# oniLibrary — Project Worklog

## Project Goal
Build "oniLibrary" — a manga/comic/webtoon/eBook reader app per `/home/z/my-project/upload/oniLibrary-PRD-v2.md`.
- Visuals MUST strictly follow the 3 reference mockups in `/home/z/my-project/upload/` (cream bg #F6EFE7-ish, coral primary ~#F86A4E, dark detail/reader screens, oni-mask logo, phone-frame presentation).
- Bilingual EN/FA with real RTL (PRD section 6).
- Deliverable also includes an Android APK (WebView wrapper) — internet available, Android SDK will be downloaded.

## Architecture Decisions
- Next.js 16 App Router, single route `/` (sandbox rule). All screens are client-side overlays/tabs managed by a Zustand nav store.
- Data layer: Zustand persist store (localStorage) with rich seed data → makes app fully offline-capable and enables static export for the APK. API routes only supplementary (health).
- i18n: custom dictionary (`src/lib/i18n.ts`), `en` + `fa`, dir=rtl switch, reading direction independent per work.
- Covers: AI-generated PNGs in /public/covers. Reader pages: procedural manga-style SVG panels.
- Fonts: Nunito (latin) + Vazirmatn (arabic/persian) via next/font.

## Task Plan
- Task 1: worklog + cover art generation (lead agent)
- Task 2: foundation (tokens, store, seed, shell, nav, onboarding)
- Task 3: core screens Home/Library/Discover/Downloads/Updates/Details
- Task 2-a (subagent): Reader engine
- Task 2-b (subagent): Vault + Extensions + Statistics + More/Settings + Backup
- Task 6: search overlay, notifications, import, download engine
- Task 7: QA (agent-browser) + visual comparison vs references
- Task 8: APK build (Android SDK cmdline tools + aapt2/d8/apksigner, WebView wrapper)
- Task 9: webDevReview cron + final worklog

---
Task ID: 1
Agent: lead (Z.ai Code)
Task: Initialize worklog, generate cover art assets

Work Log:
- Read PRD (639 lines) fully; extracted requirements (nav, i18n, reader, downloads, vault, sources, extensions, backup, stats)
- Analyzed 3 reference mockups (colors, layout, components)
- Verified internet access (dl.google.com reachable) → APK build feasible
- Initialized this worklog

Stage Summary:
- PRD understood; visual system: cream #F6EFE7 bg, coral #F86A4E primary, dark #151515 detail/reader, oni mask logo, 5-tab bottom nav (Home, Library, Discover, Updates, More — nav customizable to include Downloads per UX-008)

---
Task ID: 2 (foundation, by lead)
Agent: lead (Z.ai Code)
Task: Foundation — design tokens, i18n, store, seed, app shell, nav, onboarding

Work Log:
- globals.css: full token set (cream #f7f1e8 bg, coral #f8694c primary, charcoal dark theme), animations (screen-in, overlay-in, petals), scrollbar helpers, bg-coral-gradient utility
- layout.tsx: Nunito + Vazirmatn fonts, metadata, PWA manifest ref, viewport-fit=cover
- src/lib/i18n.ts: ~250 keys EN + FA dictionaries, translate() with {var} interpolation
- src/lib/types.ts: Work/Chapter/DownloadItem/SourceInfo/Extension/Notification/Category/ReadingSession/Bookmark/ServerEntry/Settings
- src/lib/seed.ts: 14 works (matching mockup numbers: Solo Leveling Ch112 68%, One Piece Ch1102 2h, AoT 34 chapters 8.7 (324.6k), downloads 42%/68%/16%, storage 12.6/64GB 20%), 6 sources, 8 extensions, categories, sessions
- src/lib/store.ts: useNav (tab + overlay stack, transient) + useApp (zustand persist): works/downloads/notifications/sources/extensions/settings + actions (startDownload/tickDownloads engine, runUpdateCheck, vault, categories, backup import, addSampleWorkFromSource). Helpers: workProgress, continueReading, timeAgo, toFa, fmtNum
- src/lib/engine.ts: useClientEngine (1s download tick, reading-time logging, vault autolock on visibility), useWeeklyStats
- src/lib/local-files.ts: IndexedDB blob store + thumb helper (imported CBZ/images)
- src/lib/importer.ts: file import — CBZ/ZIP via fflate, images natural-sorted, PDF/EPUB metadata works
- components: oni-logo.tsx (SVG oni mask), shared.tsx (WorkCover+gradient fallback, ProgressBar, Chip, SectionHeader, SourceIcon, EmptyState, OverlayHeader, StatusBadge), bottom-nav.tsx (5 tabs, badges), onboarding.tsx (lang en/fa detect + theme), app-shell.tsx (desktop branding panel + petals + phone frame + status bar + overlay stack router)

Contracts for next agents:
- Screens live in src/components/screens/<name>-screen.tsx and are registered in app-shell.tsx OverlayRenderer
- All strings via useT().t("key") from @/lib/use-app; keys in src/lib/i18n.ts (BOTH en+fa)
- Theme: light default; dark overlays (details/reader) wrap root in className="dark"
- Coral CTA: bg-coral-gradient; cards: rounded-3xl border-border bg-card p-4; chips: rounded-full px-4 py-1.5 text-[13px] font-bold
- Store: see src/lib/store.ts; nav: useNav().push/pop/openWork/openReader/setTab; replace top of stack: useNav.setState(st => ({stack: [...st.stack.slice(0,-1), newOverlay]}))

Stage Summary:
- App shell + Home/Library/Discover/Downloads/Updates/Details/Source screens written; awaiting Reader (2-a) and Vault/Ext/Stats/Settings cluster (2-b), search+notifications (lead), then integration pass.

---
Task ID: 2-b
Agent: settings-cluster subagent
Task: Build 9 screens — vault (+lock), extensions, statistics, settings, categories, backup, servers, formats, more

Work Log:
- Created exactly 9 new files under src/components/screens/ (no existing file modified); exports match app-shell.tsx imports (incl. VaultScreen + VaultLockScreen pair consumed by VaultGate)
- vault-screen: protection-level rows, privacy note, 3-col inVault cover grid w/ overflow "move out" menu, EmptyState, Lock-now (setVaultUnlocked(false)+pop), Change-PIN dialog reusing keypad flow (enter→confirm, hashPin→setVaultPin, toast vlt.pinChanged), biometric/autoLock switches; VaultLockScreen: dark full-screen PIN gate (OniLogo 56, 4 coral dots, bg-white/5 keypad with scale haptics, framer-motion shake + vlt.wrongPin {n} max 5 attempts, hashPin check → setVaultUnlocked(true)+onSuccess, CANCEL→onCancel, fingerprint 800ms scan when settings.vaultBiometric)
- extensions-screen: installed/available/updatable chip tabs; hashed letter icons, v{v} versions, repo rows, language chips, trust badges (official/community/unknown) + compat badges (verified/unverified), SourceIcon minis for provided sources, enable/disable Switches, coral Update button, AVAILABLE → risk dialog gated by trust-accept checkbox, uninstall menu; ext.empty state
- statistics-screen: 2x2 summary cards (toFa-aware "Xh Ym", chapters, works excl. vault, COMPLETED), Recharts BarChart of last 14 sessions (fill #f8694c, radius [6,6,0,0], 9px day ticks, minimal dark tooltip), streak (consecutive active days ending today/yesterday), by-type coral bars
- settings-screen: theme segmented control (Sun/Moon/Monitor), EN/فارسی buttons + toast, bottom-nav customization (DEFAULT-order preserved, max 4 selectable + always-on "more"), reader defaults (direction/mode/fit chips, bg swatches, brightness Slider), download rules (wifiOnly switch, 1..5 concurrent stepper), 4 notification switches, offline switch, clear-history confirm row, account note
- categories-screen: rows with live non-vault counts, first-3 cover previews, rename dialog, delete confirm, full-width coral "new category" button + dialogs
- backup-screen: included/excluded lists, .onibackup export (Blob download onilibrary-backup-YYYYMMDD.onibackup, setLastBackup, toast), last-backup timeAgo row, restore via hidden input → JSON validation → preview dialog (works/categories/settings counts) → importBackup, encrypted note
- servers-screen: coming-soon banner, add form (name/url/KOMGA-OPDS chips, 1.2s test with OK/fail feedback via setServerStatus, addServer+toast), server list with status dots + test/delete menu, EmptyState
- formats-screen: 6 format rows with emerald/amber/muted status badges per spec
- more-screen: profile card (coral gradient initial avatar), 9-item divide-y menu card with proper navigation (setTab/push), update-check button (runUpdateCheck → upd.found/upd.upToDate toasts), OniLogo footer "oniLibrary v1.0.0"

Stage Summary:
- 9/9 screens done; tsc --noEmit filtered to these files: CLEAN; ESLint: CLEAN. Deviations: lucide lacks Repo/FileBook → GitBranch/BookOpen substitutes; PIN-change button label reuses vlt.setupPin (no dedicated key); language toast uses common.done. Remaining project errors belong to other agents' pending files (reader/search/notifications screens, details/downloads/engine/store). Detailed record: agent-ctx/2-b-settings-cluster.md

---
Task ID: 2-a
Agent: reader-engine subagent
Task: Reader engine — procedural manga pages (manga-page.tsx) + full Reader screen (reader-screen.tsx) per PRD §8 and the dark reader mockup

Work Log:
- Read worklog contracts, PRD §8 (RDR-001..014), store.ts APIs, seed data, details-screen conventions, ui primitives (slider/dialog/switch/popover/dropdown)
- Note: reference mockup PNG not viewable in sub-agent context → implemented from the task's exhaustive textual mockup spec (dark #141414 chrome, top bar with back/center title/gear+bookmark+more, bottom slider w/ coral thumb + page label, 4-item controls row, 5-item bg-white/8 toolbar)
- Built src/lib/manga-page.tsx: FNV-1a hash + mulberry32 LCG (no Math.random), 8 panel-grid templates (3-6 panels), 9 ink scenes (speed lines, radial burst, skyline+windows, mountains, screentone fields, quiet beats, crowds, impact flash, interior), Figure/Bust silhouette primitives, 0-2 speech bubbles (ellipse + jagged tail, wrapped <tspan> uppercase text from 10-line pool), unique-per-page <pattern> screentone ids, clipPaths per panel, 6px stroke-drawn-last borders, gray footer "{chapter} — {p}/{total}", optional vertical workTitle margin text, zero filters
- Built src/components/screens/reader-screen.tsx:
  · Modes: PAGED (translateX track, ±2 preload, 300ms snap), DOUBLE (2-up spreads, falls back to PAGED in portrait via ResizeObserver), CONTINUOUS (gapped vertical scroll, rAF-throttled scroll→page), WEBTOON (no gaps, no tap zones) — direction-aware: RTL track runs right→left, forward tap zone = LEFT
  · Local works: per-page loadPageUrl object URLs (revoke on unmount), spinner per page, rdr.localMissing hint on failure; generated works: <MangaPage seed={hashStr(work.id)}>
  · Progress (RDR-006): setChapterProgress(page/total) every page change, pushHistory on chapter open, logReading(workId,1,0) every 60s, markChapterRead(true) on leave when persisted lastPage ratio ≥ (pages-1)/pages; initial page = round(lastPage × total) (Solo Leveling 0.68 → mid-chapter)
  · Chapter nav: prev/next siblings by number; autoNext honoring (RDR-011); end-of-chapter card (chapterComplete {n} + nextChapterCta + backToDetails→pop); chapter switch replaces nav stack top via useNav.setState
  · Controls: page slider (coral thumb, works in both paged + scroll modes), Previous/Auto(3.2s autoplay)/ChapterList/Next, toolbar Fit(cycle W/H/S/O per-series)/Zoom(1→1.5→2, pan via overflow-auto layout sizing)/Rotate(0-270°)/Brightness(Popover slider 30-100 → setReaderDefaults)/More(→settings sheet)
  · Sheets (bottom-anchored Dialog, dark-wrapped, rounded-t-[2rem]): chapter list (desc, read checks, current highlighted); reader settings — per-series mode/direction/fit chips (updateWork) + app bg swatches/brightness/autoNext/cropBorders(scale 1.04)/keepAwake(wakeLock request+release in try/catch) + 4 documented presets (Manga/Comics/Webtoon/One-handed)
  · UX-005: center tap toggles chrome (4.2s auto-hide, paused while sheets open), side taps flip pages (280ms defer to disambiguate double-tap→zoom), offline pill for download==="DONE", direction-aware ArrowLeft/Right keys (Escape handled by app-shell to avoid double-pop), brightness dim overlay, bg color behind pages (black/gray/white/sepia)
- Fixed lint-rule issues (react-hooks/refs no-ref-writes-in-render → effect; set-state-in-effect → React adjust-state-during-render reset pattern keyed by workId#chapterId; removed twMerge absolute/relative conflict in scroll container)
- Verified: tsc --noEmit CLEAN for both files; eslint CLEAN (0 problems); SSR smoke test: 192 pages across 8 seeds rendered, no NaN/Infinity/undefined (~253 SVG tags/page)

Stage Summary:
- Files created: src/lib/manga-page.tsx (exports MangaPage + hashStr), src/components/screens/reader-screen.tsx (exports ReaderScreen {workId, chapterId})
- Key decisions: refs only touched in effects/handlers (React 19 lint); commanded-scroll state object instead of ref for scrollable page jumps; fit sizing via CSS classes (WIDTH w-full / HEIGHT h-full / SCREEN contain / ORIGINAL 800×1200) + layout-width zoom for real panning; dialogs portal to body so sheets carry their own "dark" class; per-series settings live on Work, app-level on settings.readerDefaults
- Store APIs wished for: none blocking — a "chapters sorted" selector and an atomic setChapterProgress+ratio helper would be nice-to-haves; store.ts/engine.ts currently have pre-existing tsc errors owned by lead (untouched per instructions)

---
Task ID: 3-8 (integration, QA, APK)
Agent: lead (Z.ai Code)
Task: Integration pass, browser QA vs mockups, fixes, static export + APK build

Work Log:
- Wrote search-screen.tsx (global search: library + sources + source matches, debounced source search) and notifications-screen.tsx (typed notifications, mark read/all, sensitive masking)
- Fixed store bugs: continueReading/currentChapter picked highest unread → now lowest unread (was showing Ch185/0%; now Ch112/68% like mockup)
- WorkCover: onError → gradient fallback (initials)
- Seed aligned to mockups: Solo Leveling reading Ch112 @68%; AoT progressInLast 0.6 (Page 12); added Death Note + Fullmetal Alchemist (COMPLETED); Quiet Hours + Mushishi → COMPLETED (5 Finished); sessions → 12h 34m/8 per week
- Fixed details-screen: banner abs-image painted over title → added relative z-10 to meta block
- Library card: removed duplicate % badge (badge only for Completed/OnHold/Planned/Dropped); chapter number = reading position (currentChapter)
- Reader scrim strengthened (from-black/95 via-black/80)
- Lint fixes: useSyncExternalStore for useMedia/useMounted; React-compiler-safe plain computations in home-screen; search debounce via committedQ pattern
- Generated 14 AI cover arts + 2 banners (sequential w/ backoff after 429s)
- QA via agent-browser: onboarding (EN/FA), home, library (grid, categories, sort, selection), discover (sources, source browse, add-to-library toast), downloads (live progress engine, empty states, storage card), updates, details (dark, tags, stats 34/Completed/8.7), reader (Ch138 The Rumbling, procedural manga pages, auto-hide controls, slider 13/20, toolbars), vault (protection levels), more, settings, Persian RTL full flip, statistics (19h32m, chart), extensions (trust/compat badges)
- APK: downloaded Android SDK cmdline-tools + build-tools 34 + platform-34; android/ project (WebView shell, JS bridge for back button, asset intercept via https virtual origin, launcher icons from logo); scripts/build-apk.sh = static export (STATIC_EXPORT=1) → aapt2 → ecj → d8 → zipalign → apksigner
- OUTPUT: /home/z/my-project/download/oniLibrary-v1.0.0.apk (3.2MB, signed, offline-capable, contains full app + covers)
- Recreated src/app/api/route.ts (lost during export shuffling); verified /api responds and dev.log clean

Stage Summary:
- All PRD MVP flows implemented & browser-verified; visuals match the 3 reference mockups closely
- APK delivered at /home/z/my-project/download/oniLibrary-v1.0.0.apk
- Remaining ideas for next iterations: EPUB/PDF real rendering engines, extension repo fetch, OPDS live browsing, cloud sync

---
Task ID: cron-review-1 (round 2)
Agent: webDevReview agent
Task: QA sweep + new features (History / Bookmarks / real EPUB reading) + styling polish + APK rebuild

Work Log:
- QA sweep (agent-browser): reader mode logic confirmed correct (WEBTOON seeds render vertical strip; paged chrome is shared across modes), onboarding/library/discover/downloads re-verified.
- FIXED — dark theme coverage: `dark` class was applied below the phone container so the status-bar strip stayed cream; restructured app-shell (dark class on min-h-dvh wrapper → backdrop, SideBranding, phone, status bar all theme-aware). SideBranding got dark: color variants.
- FIXED — details title readability regression verified OK (banner fix held; "The Quiet Hours" + alt-title render).
- FIXED — EPUB list markers (Tailwind preflight reset) → .epub-content ul/ol/li list-style restored.
- NEW — Reading History screen (TRK-002): overlay `history` (statistics → "Reading history" entry card with count), rows = cover/title/ch/page/time + coral Resume (reopens reader at stored page), vault entries masked, trash = clear-all with confirm. store: Overlay+"history", openReader gains optional page.
- NEW — Bookmarks viewer (RDR-013): details bookmark icon now opens a bottom sheet (count badge) listing that work's bookmarks (Chapter · Page, chapter title), Resume jumps into reader at exact page via reader `startPage` prop (navKey includes it so chapter reset honors it); per-row delete.
- NEW — Real EPUB reading (FMT-002 upgraded from "demo"): importer parses .epub via fflate (container.xml → OPF → manifest+spine), sanitizes XHTML (strips scripts/styles/images/attrs), stores chapters JSON in IDB (`{id}::epub`), creates work with spine-mirrored chapters + epubChapters meta; new EpubBookView (typographic serif reader, justify/lists/blockquote styles, scroll-ratio progress + auto-mark-read ≥95%, position restore, IDB-missing fallback text); reader integrates: content branch, slider = chapter nav (label Ch x/y), Prev/Next = chapter nav, Text-size button (Aa, 14→22px cycle → settings.readerDefaults.epubFontSize), chrome toggle via top strip (doesn't block scroll), generic page-progress effect skipped in epub mode.
- NEW — Built-in sample book (src/lib/sample-epub.ts, 4 original chapters incl. one Persian RTL chapter) attached to seeded "The Quiet Hours" during store hydration (IDB write + localPages:["epub"]) so the book reader is demonstrable without importing a file.
- STYLING — Home stats card: streak Flame badge (consecutive active days, fa/en label); press states: bottom-nav items active:scale-90, library work cards active:scale-[0.96], stats card active:scale-[0.99].
- Verified: tsc --noEmit CLEAN (app files), eslint CLEAN, /api 200, dev.log 200s, browser-verified: EPUB book reading + chapter slider, history resume entry, bookmark add→details badge→sheet→jump, dark mode full-coverage.
- APK rebuilt: download/oniLibrary-v1.0.0.apk (3.24MB, signed) — includes all round-2 features; api route intact after export.

Stage Summary:
- Current status: stable + feature-complete for MVP scope; round-2 adds History/Bookmarks/EPUB engines (PRD TRK-002, RDR-013, FMT-002 acceptance now genuinely met for text EPUBs).
- Risks/notes: (1) EPUB images inside books are stripped (text-only v1); (2) PDF still demo-mode (pdfjs-dist planned); (3) "1 entries" plural string edge case (cosmetic); (4) imported EPUB persistence depends on IDB — clearing site data loses book text (metadata persists in localStorage).
- Next-round priorities: 1) real PDF rendering via pdfjs-dist (canvas pages, reuse reader chrome); 2) EPUB images + cover extraction from OPF cover-item; 3) saved/synced filters (LIB-011) + smart categories (LIB-008); 4) PWA service worker for web install; 5) EPUB font-family choice + per-work reader defaults inheritance audit.
