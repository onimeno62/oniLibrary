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

---
Task ID: cron-review-2 (round 3)
Agent: webDevReview agent
Task: Status assessment + browser QA + new features (real PDF engine, EPUB images/cover, saved filters, PWA, daily goal) + styling polish + APK rebuild

Work Log:
- STATUS ASSESSMENT: dev.log clean (all 200s), eslint CLEAN, tsc CLEAN for app files (only pre-existing errors in examples/ + skills/). agent-browser QA sweep: onboarding → home/library/discover/downloads/updates/more → details → reader (paged + chrome) → EPUB book — ALL PASS, 0 broken images, no console errors. No blocking bugs found; proceeded to features.
- FIXED (round-2 leftovers): none blocking found this round.
- NEW — Real PDF rendering (FMT-003 upgraded from demo): added pdfjs-dist@6.4.299; worker at public/pdf/pdf.worker.min.mjs + JPX/JBIG2/QCMS decoders at public/pdf-wasm/ (URLs resolved against document.baseURI so both dev server and APK /assets/ origin work); new src/lib/pdf-engine.ts (per-work doc cache, renderPdfPage @devicePixelRatio≤2.5, readPdfMeta → page count + Title/Author + 320px cover thumbnail); new src/components/pdf-view.tsx (PdfCanvas: ResizeObserver-resize re-render, IntersectionObserver lazy render for vertical modes, task cancel on unmount, loading/error states i18n'd); importer now really parses .pdf (stores blob in IDB `{id}::pdf`, real page count, metadata title/author, canvas cover) with graceful fallback to old meta-only work; reader integrates via isPdf marker (localPages ["pdf"]) — paged slides + vertical scroll variant, slider/progress/bookmarks/offline badge all work, zoom re-renders crisp at 1.5×/2×; MainActivity MIME map += pdf/wasm.
- NEW — Built-in sample PDF: scripts/make-sample-pdf.ts (pdf-lib) → public/samples/oni-library-guide.pdf (8-page branded "oniLibrary Field Guide" incl. coral cover, 6 content pages, dark back cover); seeded work w-oni-guide (PLANNED, resume 25%) attached at hydration by fetching the file into IDB (self-disables offline).
- NEW — EPUB cover + embedded images (FMT-002 hardening): importer extracts OPF cover (meta[name=cover] / properties~=cover-item / cover-named image) → dataURL thumbnail; `<img>` in spine XHTML now kept, rewritten to `oni-img:{idbKey}` (attributes stripped except src/alt), blobs stored in IDB; EpubBookView resolves oni-img: srcs to object URLs per render with revoke-on-cleanup; globals.css adds .epub-content img/figcaption typography; dc:title + dc:creator extracted via getElementsByTagNameNS (imported books now show real book title/author).
- NEW — Saved filters (LIB-011): types SavedFilter/LibraryFilterSnapshot; store savedFilters + saveFilter(name, snapshot) (dedupe by name, cap 12) + deleteSavedFilter; Library: snapshot/apply helpers, "Save current filters" card inside filter sheet (disabled + hint when nothing active), name dialog, "MY FILTERS" chip row above categories (active chip highlighted by live state comparison, × to delete), badge counts unaffected.
- NEW — Daily reading goal: settings.dailyGoalMin (default 30, persisted w/ ?? fallbacks for old stores); Statistics: goal card with SVG progress ring (green when reached), today/total line, ±5 stepper (fresh-state reads so rapid taps accumulate, toast when turned off); Home stats card: compact GoalRing beside the 3 stat cells.
- NEW — PWA: public/sw.js (versioned shell cache, network-first navigations with offline fallback, cache-first immutable assets); registered in app-shell only when NODE_ENV=production && !window.OniAndroid (never in APK WebView) && SW supported.
- STYLING — Downloads storage card upgraded: segmented donut (downloads coral / other apps taupe / free track) + GB legend rows; Wi-Fi-only row restacked (title + hint left, switch right, no more overlap); formats screen PDF+EPUB badges now "Fully supported".
- QA loop issues found & fixed during development: (1) my regex `/^image\//` typo → parser error, fixed; (2) pdfjs v6 API — render({canvas}) required, destroy() on loading task, PDFDocumentLoadingTask not generic → fixed; (3) hand-rolled PNG in test asset decoded blank in Chrome (python-valid but Chrome-invisible; createImageBitmap gave "source image could not be decoded") → replaced with sharp-generated PNGs, app code itself was fine; (4) goal stepper stale-closure on rapid taps → fresh getState reads.
- Browser-verified end-to-end (agent-browser): Field Guide opens at page 3 (25% resume), slider 3/8, Next → 4/8, Zoom 1.5× re-renders crisp; imported "The Coral Test Book" shows extracted coral cover + "Z. Tester", ch2 embedded illustration renders with figcaption, ch3 Persian RTL correct; saved filter "Reading now" (READING+Downloaded) → grid 17→4, clear → chip reapply → 4; goal stepper 25→0→20→30 rapid taps; storage donut + wifi row render; EPUB/PDF regression pass after every change.
- Verified: eslint CLEAN, tsc CLEAN (app files), /api 200, dev.log clean.
- APK REBUILT: download/oniLibrary-v1.0.0.apk — 4.3 MB signed (was 3.2) — now bundles pdf worker (1.2MB) + wasm decoders (1.5MB) + sample guide PDF + sw.js; MainActivity MIME += pdf/wasm.

Stage Summary:
- Round-3 delivered: real PDF engine (PRD FMT-003 acceptance now genuinely met), EPUB images + cover + metadata (FMT-002 hardened), saved filters (LIB-011), daily reading goal + goal rings, PWA offline shell, storage donut + misc polish. All flows browser-verified; APK updated in place.
- Formats matrix now: CBZ/images/EPUB/PDF = full, CBR/folders = planned/demo.
- Risks/notes: (1) sample PDF/EPUB attach still gated to first-run hydration — if IDB is cleared but localStorage persists, guide falls back to generated pages (graceful); (2) imported EPUB images live in IDB only (clearing site data loses book text; metadata persists); (3) pdf.js wasm decoders only fetched for JBIG2/JPX/QCMS scans — standard PDFs never touch them; (4) Chrome-only PNG quirk documented above for test assets — always use real encoders.
- Next-round priorities: 1) PDF text selection/search + TOC outline in chapter list; 2) EPUB font-family choice + theme-aware sepia in book view; 3) smart categories (LIB-008: auto rules like "status = READING"); 4) OPDS/Komga live browsing when servers become reachable; 5) TTS read-aloud for books; 6) reading-goal notifications when the daily ring completes.

---
Task ID: cron-review-3 (round 4)
Agent: webDevReview agent
Task: Status assessment + browser QA + new features (smart categories LIB-008, book font/theme, personal rating TRK-001, goal celebration) + styling polish + APK rebuild

Work Log:
- STATUS ASSESSMENT: worklog reviewed; dev.log clean (all 200s); eslint src CLEAN; tsc CLEAN for app files. Full agent-browser QA sweep: onboarding→home→library→details (dark)→reader (paged 13/18)→statistics (19h37m, goal ring 100%) — all PASS, no console errors. Only cosmetic bug found: "1 works" pluralization.
- FIXED — pluralization: added "common.work" key (en/fa) + "hist.entry"; category cards and history/statistics counters now render "1 work"/"1 entry" correctly (Persian unaffected — no pluralization after numbers).
- FIXED — real reader bug: full-height center tap-zone button (`inset-x-1/3 top-0 h-full`, rendered for all scrollable modes at zoom 1) blocked wheel/touch scrolling in the MIDDLE THIRD of EPUB/continuous/webtoon readers (events bubbled to page instead of the scroll container). Replaced with a 16% top chrome-toggle strip for all scrollable modes (epub already had one). Verified: epub scrollTop settable, page no longer scrolls behind phone.
- NEW — Smart categories (LIB-008): types +SmartRule (status/type-group/downloaded/unread/favorite, AND semantics); Category.rule; store createCategory(name, rule?) + updateCategoryRule + exported matchesRule(). Categories screen: "New smart category" dialog with rule builder (status chips, type chips, 3 toggle chips) + live match count; smart cards = coral-gradient Sparkles tile + SMART badge + inspectable rule chips + live counts; rename dialog doubles as rule editor. Library: smart categories appear in the rail (ring highlight, gradient tile) — tapping applies the rule as a live filter with a dismissible "✨ <name>" indicator pill; regular categories unchanged. Verified: rule Reading+Manga+unread → 7 matches live (17→7), grid filtered exactly, indicator pill shows/clears.
- NEW — Book font + theme (FMT-002 typography): readerDefaults.epubFont ("serif"|"sans") + epubTheme ("dark"|"sepia"|"paper"); EpubBookView consumes both (serif stack Georgia→Vazirmatn for real latin serifs; sans = Nunito→Vazirmatn; theme tints bg+fg with 300ms transition); reader settings sheet gains "Book font" + "Book theme" rows when reading an EPUB (persisted — verified in localStorage + sepia/sans rendering in browser).
- NEW — Personal rating (TRK-001): Work.userRating 0..5 + store.setUserRating (tap same star clears); details screen gains "YOUR RATING" star row under the stats grid (coral filled stars, radiogroup ARIA, toast "You rated {n}/5"). Verified 4/5 rating.
- NEW — Daily-goal celebration (TRK-004/005): logReading detects crossing (before<goal && after>=goal) → pushes "Daily goal reached! 🎉" notification + toast with today's minutes (i18n'd en/fa via translate()). Verified: today=29/goal=30 → read → notification created, minutes ticked up.
- STYLING — Home continue-reading hero: coral progress rail at the very top of the banner (glow shadow) showing chapter completion. More screen: profile card now includes a 3-cell mini-stats row (In library / today minutes with Flame accent when goal reached / Finished). Categories smart cards get gradient tiles + badge; library smart tile ring highlight.
- i18n: 22 new keys (cat.*, rdr.bookFont/rdr.fontSerif/rdr.fontSans/rdr.btheme.*, det.yourRating/rateHint/rated, stats.goalReachedTitle/Body, common.work, hist.entry) added to BOTH en+fa; Persian smoke-tested (RTL flip, "۷ اثر" counters, FA hint rows).
- Verified: eslint CLEAN, tsc CLEAN, dev.log clean, /api 200. APK REBUILT: download/oniLibrary-v1.0.0.apk — 4.3MB signed (fresh static export includes round-4 features).

Stage Summary:
- Round-4 delivered: smart categories (LIB-008 acceptance met: rules savable, results update live, active rules inspectable), book font/theme choice, personal rating (TRK-001), goal celebration, scroll-blocking reader bug fixed, pluralization fixed, profile/hero styling upgrades. APK updated in place.
- Risks/notes: (1) smart rules are client-side only (fine — whole store is); (2) epub theme "paper"/"sepia" tints only the article area, reader chrome stays dark by design; (3) goal celebration fires once per crossing (no spam), resets naturally next day; (4) old persisted stores get epubFont/epubTheme as undefined → defaults serif/dark via ?? fallbacks.
- Next-round priorities: 1) PDF text selection/search + TOC outline in chapter list; 2) TTS read-aloud for books; 3) OPDS/Komga live browsing; 4) LIB-009 duplicate detection; 5) LIB-010 custom covers/tags/notes editor; 6) TRK-006 AniList sync scaffolding.

---
Task ID: cron-review-4 (round 5)
Agent: webDevReview agent
Task: Status assessment + browser QA + new features (duplicate detection LIB-009, work editor LIB-010, TTS read-aloud, PDF outline) + styling polish + APK rebuild

Work Log:
- STATUS ASSESSMENT: worklog reviewed; dev.log clean (all 200s); tsc CLEAN; eslint src CLEAN. Full agent-browser QA sweep (onboarding→home→library→details→reader at resume page 13/18 verified via slider aria-valuenow→statistics→more) — ALL PASS, 0 console errors. Two initial false alarms investigated and cleared: (1) card click "covered" complaints are agent-browser strictness (clicks on cover img bubble to the button — verified via JS click); (2) Escape "not working" was an agent-browser focus artifact — window-dispatched Escape pops overlays correctly. No blocking bugs found; proceeded to features.
- FIXED during QA: "Remove 1 copies" pluralization in duplicates screen → new "dup.removeOther" key (en/fa); "1 copies"-style n=1 case now handled.
- NEW — Duplicate detection (LIB-009): src/lib/duplicates.ts — findDuplicateGroups() unions works by normalized title AND title↔alt-title cross-match (latin diacritics stripped, punctuation/space-insensitive); duplicateWorkCount() for badges. New DuplicatesScreen overlay (More → "Duplicate scan", Copy icon): group cards ("2 copies" header, coral remove-others CTA), per-copy rows with cover/chapters/read-count/local/categories meta, "Keep this" (deletes others, window.confirm, progress of kept copy wins) + per-row delete; empty state when clean. More menu shows live coral "N dup" badge via duplicateWorkCount. Import-time check (LIB-009 import half): after importFiles, library onImport toasts "Possible duplicate: … already in your library — see More → Duplicate scan" per affected fresh group (≤2 toasts).
- NEW — Work editor (LIB-010): details ⋮ menu gains "Edit details" → EditWorkDialog (remount-seeded inner form): custom cover via real file input (canvas-resized to ≤480px JPEG 0.82 → dataURL; preview; "Remove custom cover"), title/author inputs, tag chips editor (add via input/Enter, dedupe, × remove, max 12), personal notes textarea. Details screen: cover uses customCover ?? cover (WorkCover now renders data: URLs via plain <img> — next/image dev optimizer rejects data URLs); new amber "My notes" sticky card (tap → opens editor; italic placeholder when empty). All persisted on Work (customCover/personalNotes) and verified across reload.
- NEW — TTS read-aloud for books: src/lib/tts.ts — Web Speech singleton with generation-token chunk queue (paragraph→sentence chunking ≤260 chars), play/pause/resume/stop, debounced rate change (restarts current chunk), useSyncExternalStore hook. Reader (EPUB only): new "Read aloud" toolbar button (first position, coral when active) → popover with status line ("Reading aloud…/Paused/Ready", paragraph p/t progress), Play/Pause primary + Stop, Speed slider 0.6–1.8× (persisted to settings.readerDefaults.ttsRate, 250ms debounce). Text sourced via loadEpub → DOMParser → top-level block extraction (no nested duplicates). Auto-stop on chapter change/reader close. Verified: play builds 10 utterances from sample book ch1 in headless Chrome; sandbox has 0 voices so playback is silent (graceful).
- NEW — PDF outline/TOC: pdf-engine.getPdfToc() resolves pdf.js outline → getDestination → getPageIndex (string + explicit dests, depth ≤3, defensive). Reader chapter sheet (PDFs with an outline) renders "Outline" section: depth-indented rows, coral page badges, tap → goToPage + scrollCmd jump. Verified end-to-end with a hand-crafted /Outlines PDF (scripts/make-toc-pdf.ts): 2 items resolved to pages 1/2, jump lands on 2/2, sheet closes; outline-less PDFs hide the section (guide PDF re-verified).
- STYLING — duplicates group cards (secondary header strip + coral CTAs + emerald keep pills), edit dialog (rounded inputs, coral chips, gradient save), TTS popover (gradient play pill, animated icon while playing), More badge (coral gradient pill), details notes card (amber tint), outline rows (coral dot per depth).
- i18n: 45 new keys ×2 (dup.*, edit.*, det.myNotes/editWork/notesEmpty, tts.*, pdf.outline/jumpPage, imp.duplicateFound) en+fa; Persian smoke test passed (RTL layout, جست‌وجوی موارد تکراری screen + empty state, یادداشت‌های من card, TTS popover پخش/ایست/سرعت).
- QA loop fixes: (1) EditWorkDialog seeding rewritten from setState-in-effect (lint error) to remount-keyed inner component with useState initializers; (2) `new Image()` collided with next/image import → window.Image(); (3) unused eslint-disable directives removed; (4) scripts/make-toc-pdf.ts shaped for tsc (writeFileSync, async main).
- All test artifacts cleaned from the live store (injected duplicate + imported TOC PDF deleted; Solo Leveling demo tag/notes/cover reverted; public/tmp-oni-toc.pdf removed).
- Verified: tsc CLEAN, eslint src CLEAN, 0 console errors across full session, dev.log clean. APK REBUILT (see below).

Stage Summary:
- Round-5 delivered: duplicate scan + cleanup (LIB-009, both library scan AND import warning), full work editor with custom cover/tags/notes (LIB-010), TTS read-aloud for books with speed control, PDF outline TOC navigation — all PRD gaps from round-4's next-priorities list closed except OPDS/AniList (network-dependent).
- APK rebuilt: download/oniLibrary-v1.0.0.apk (signed, static export with round-5 features bundled).
- Risks/notes: (1) TTS needs browser voices — headless/APK WebView may have none → silent no-op or "unsupported" toast; consider Android native TTS bridge later; (2) duplicate matching is title/alt-title based only (same title + different authors are still flagged — acceptable, human confirms via Keep-this flow); (3) custom covers are dataURLs in localStorage (~30-60KB each after resize) — fine for typical use; (4) rate changes mid-playback restart the current chunk (by design); (5) scripts/make-toc-pdf.ts is a QA utility, not part of the app.
- Next-round priorities: 1) Android TTS bridge (JS interface → android.speech.tts) for APK read-aloud; 2) OPDS/Komga live browsing when servers reachable; 3) EPUB font-family picker (custom fonts); 4) TRK-006 AniList export scaffolding; 5) duplicates: content-hash detection for image imports.

---
Task ID: cron-review-5 (round 6)
Agent: webDevReview agent
Task: Status assessment + browser QA + new features (PDF full-text search RDR-015, reading heatmap, keyboard shortcuts, Android TTS bridge) + styling polish + APK rebuild

Work Log:
- STATUS ASSESSMENT: worklog reviewed; dev.log clean (all 200s); tsc CLEAN (app files); eslint src CLEAN. Full agent-browser QA sweep (fresh session): onboarding EN/Light → home → library (categories/grid/progress) → discover → details (dark, rating, notes) → reader paged 13/18 chrome → statistics (goal ring 100%, bars, streak) → more (profile mini-stats). ALL PASS, 0 console errors, no blocking bugs → proceeded to features.
- FIXED — Escape double-pop: pressing Escape while a reader sheet (chapters/search/settings) was open closed BOTH the sheet and the reader. app-shell ESC handler now skips pop when a [role=dialog] is mounted (radix consumes Escape itself). Verified: sheet closes, reader stays.
- FIXED — heatmap month labels (found during own QA): labeled by week-column start → duplicate "JUL"; now labeled with the month in which the day-of-month change occurs (JUL/AUG/SEP/OCT correct).
- NEW — PDF full-text search (RDR-015): pdf-engine.searchPdfText() extracts all pages' text via pdf.js getTextContent (cached per work in textCache, dropPdfText() exported), up to 3 snippets/page, 80-page cap; reader gains a coral Search toolbar button (PDF only) opening a bottom sheet: rounded search input (dir=auto), debounced 380ms live search, page badges + case-insensitive highlighted snippets (<mark> in coral-soft) + per-page match count (×3), tap → jump to page (scrollCmd for scroll modes). Verified: "library" query on Field Guide → 6+ hits, jump to page 2 (slider 1/7).
- NEW — Reading activity heatmap (Statistics): GitHub-style 15-week grid (Mon-first columns, weekday narrow letters localized, month labels), 5-step coral intensity (0/25/50/75%/gradient+glow), future days transparent, native title + aria-label tooltips ("May 12 · 34 min"), "N active days" coral-soft badge, Less→More legend. Seeded data renders 14 active days.
- NEW — Reader keyboard shortcuts (desktop): arrows (direction-aware), Space = next / Shift+Space = prev, B = bookmark toggle, Z = zoom cycle, C = chapter sheet, S = settings, ? = shortcuts help sheet (kbd-styled rows). Input/textarea guard; fine-pointer media query gates the "Keyboard shortcuts" row in the settings sheet (Keyboard icon + "?" kbd chip).
- NEW — Android TTS bridge (closes round-5 risk #1): MainActivity now initializes android.speech.tts.TextToSpeech + UtteranceProgressListener, Bridge gains ttsAvailable()/ttsSpeak(text,lang,rate)/ttsStop(), chunk completion posted to the UI thread → evaluateJavascript("window.OniNativeTts.done()"); TTS silenced in onPause, shut down in onDestroy. src/lib/tts.ts rewritten as a dual-backend queue: native branch (window.OniAndroid present + ttsAvailable()===1) drives chunk-by-chunk speech (Android TTS has no pause → pause halts + status "paused", resume re-speaks current chunk; rate change restarts current chunk), web branch unchanged. Headless browser verified with a stubbed speechSynthesis: "Reading aloud… · Paragraph 1/10" → Pause/Stop functional. Real-device voices now come from Android system TTS.
- STYLING — search sheet (coral-soft icon tile, focus ring, mark highlights), shortcuts rows (inset-shadow kbd chips), heatmap card (coral-soft badge, legend), search hits match-count pills.
- i18n: 15 new keys ×2 (rdr.pdfSearch/pdfSearchHint/pdfSearchPlaceholder/pdfSearchEmpty, rdr.shortcuts, rdr.sc.turn/next/prev/bookmark/zoom/chapters/settings, stat.heatmap/activeDays/heatmapLess/heatmapMore) in en+fa.
- QA loop fixes: (1) search debounce effect alive-flag was nested inside the timeout callback (never cancelled) → moved to effect scope; (2) Escape/sheet interaction fix above; (3) heatmap label logic. Test bookmark added via `b` was deleted via the details Bookmarks sheet (store back to clean).
- Verified: tsc CLEAN, eslint src CLEAN, 0 console errors, /api 200, api route intact after export. APK REBUILT: download/oniLibrary-v1.0.0.apk — 4.32 MB signed (fresh static export; MainActivity TTS bridge compiled in — ttsAvailable present in classes.dex).

Stage Summary:
- Round-6 delivered: PDF full-text search (RDR-015), 15-week reading heatmap, keyboard shortcuts + help sheet, native Android TTS for the APK read-aloud, Escape-nesting fix. All browser-verified; APK updated in place.
- Risks/notes: (1) native TTS pause = stop-current-chunk (resume re-speaks the chunk from its start — acceptable for sentence-length chunks); (2) PDF search snippets only (no in-page highlight overlay on the canvas — jump-to-page granularity); (3) heatmap keys use the app's utcDay convention (consistent with sessions, minor boundary effects near midnight); (4) keyboard shortcuts hidden on touch devices (fine-pointer gate).
- Next-round priorities: 1) in-page PDF search highlight overlay (pdf.js textLayer); 2) OPDS/Komga live browsing when servers reachable; 3) TRK-006 AniList/CSV export scaffolding; 4) session-timer widget + per-day goal history edit; 5) Android native share-in (send imported files straight from the system share sheet into the app).

---
Task ID: cron-review-6 (round 7)
Agent: webDevReview agent
Task: Status assessment + browser QA + new features (EPUB in-book search, live session timer, CSV export TRK-006) + styling polish + APK rebuild

Work Log:
- STATUS ASSESSMENT: worklog reviewed; dev.log clean; tsc CLEAN (app files); repo-wide lint errors confined to public/pdf* third-party artifacts (pre-existing). Found dev server DOWN at session start (sandbox kills non-detached processes between tool calls) → relaunched via double-fork `(setsid ... &)` which persists. Full agent-browser QA sweep (fresh onboarding EN → home hero/stats-goal-ring → library grid → details dark + rating → manga reader paged 13→14/17 → statistics goal ring 100% + "1 entry" pluralization → more menu) — ALL PASS, 0 console errors, no blocking bugs.
- INVESTIGATED — sandbox filesystem quirk: reader-screen.tsx reads alternated between a corrupted view ("const elpOpen, setHelpOpen]") and the correct one across consecutive tool calls. Verified with 5 independent tools (grep, bun fs, TS parse API, tsc, eslint): the on-disk file is CORRECT (25/25 consistent reads, stable md5); earlier views were stale page-cache artifacts. Mitigation adopted: after every edit, verify via grep marker + tsc before relying on it.
- NEW — EPUB in-book full-text search (RDR-015 parity for books): src/lib/importer.ts adds searchEpubText() (DOMParser per chapter, whitespace-collapsed text, case-insensitive, one hit per matching chapter with ±34/46-char snippet + count, cap 40); reader gains a "Search in book" toolbar button (EPUB only) + bottom sheet mirroring the PDF search sheet (debounced 380ms live search, coral-soft icon tile, chapter badge + title + highlighted snippet + ×count); tapping a hit switches chapter if needed, then scrolls to the match and flashes a coral highlight (.epub-search-flash, 2.6s fade). Keyboard "/" opens search in both PDF and EPUB readers; shortcuts help sheet gained a "/" row.
- FIXED — real reader bug found during feature QA: EVERY reader-screen re-render (search typing, scroll-progress saves, chrome toggles) re-applied dangerouslySetInnerHTML, wiping the flash highlight and (pre-existing latent bug) resetting resolved oni-img blob srcs on imported EPUBs. Root fix: split EpubArticle = memo() leaf inside epub-view.tsx that only takes html/font/fontSize/title strings — reader re-renders no longer touch book content; flash lifetime decoupled from effect cleanup (self-expiring timeout, jumpTarget intentionally persists until next jump). Verified via MutationObserver (innerHTML re-application events eliminated) and flash persistence probes (visible 200ms→2500ms, fades ~2.6s).
- FIXED — session timer perf design: initial per-second setInterval in the reader body re-rendered the whole heavy reader tree every second; refactored into SessionPill self-contained leaf component (own tick, props: title+visible) — zero reader re-renders while ticking.
- NEW — Live reading-session timer pill: coral play icon + tabular mm:ss (h:mm:ss past 1h) in the reader top-left, mirroring the offline badge (top-right), auto-hides with reader chrome, title tooltip i18n'd.
- NEW — CSV export (TRK-006 scaffolding): Backup screen gains "Spreadsheet export" card (emerald FileSpreadsheet tile) with two CTAs: Library CSV (17 cols: Title/AltTitle/Author/Type/WorkStatus/ReadingStatus/YourRating/CommunityRating/ChaptersRead/ChaptersTotal/ProgressPct/Favorite/InVault/Tags/Categories/AddedAt/LastReadAt — avg lastPage ratio → ProgressPct, tags/categories "; "-joined) and History CSV (Date/Minutes/Chapters sorted by date). Proper CSV escaping (quote/comma/newline) + UTF-8 BOM for Excel; downloadFile helper extracted, createBackup refactored to shared ymd(). Browser-verified real downloads: 3.0KB library CSV + history CSV with seeded data.
- STYLING — search sheets matched visual language (coral-soft icon tile, rounded input, mark highlights); session pill glass style; CSV card with emerald accent tile + coral gradient primary CTA + outlined secondary; flash highlight rounded with layered glow.
- i18n: 8 new keys ×2 (rdr.sc.search, rdr.session, rdr.bookSearch/Hint/Placeholder, bkp.csvTitle/Hint/csvLibrary/csvHistory/csvDone) in en+fa.
- Verified: tsc CLEAN, eslint src CLEAN, dev.log clean, /api 200. APK REBUILT: download/oniLibrary-v1.0.0.apk — 4.32 MB signed (fresh static export; bookSearchHint + epub-search-flash + Spreadsheet export strings confirmed inside out/_next chunks).

Stage Summary:
- Round-7 delivered: EPUB in-book search with cross-chapter jump + flash highlight, "/" shortcut for document/book search, live session timer pill, CSV library+history export (TRK-006). One real reader bug fixed (innerHTML re-application on re-render) + one perf design fix (timer leaf). All flows browser-verified; APK updated in place.
- Risks/notes: (1) sandbox FS stale-read quirk documented — always re-verify file state with a second tool before debugging "impossible" errors; (2) search hit granularity is per-chapter with first-match scroll (multiple matches in one chapter → first occurrence highlighted); (3) flash uses DOM classList on the memoized content — a font/theme/fontSize change mid-flash re-renders the article and clears it early (acceptable); (4) CSV download works on web browsers; APK WebView may need a native save bridge later (share/download intent) — JSON .onibackup has the same limitation and is accepted.
- Next-round priorities: 1) Android native share/save bridge for exports (CSV + .onibackup) via MainActivity; 2) in-page PDF textLayer highlight overlay; 3) per-chapter match navigation (next/prev hit inside a chapter); 4) OPDS/Komga live browsing when servers reachable; 5) reading-goal celebration could reuse SessionPill design for a focus-mode timer with pause.

---
Task ID: cron-review-7 (round 8)
Agent: webDevReview agent
Task: Status assessment + browser QA + new features (find-in-page bar with prev/next match navigation, focus-timer pause, goal confetti celebration) + double-logging bug fix + styling polish + APK rebuild

Work Log:
- STATUS ASSESSMENT: worklog reviewed; dev server UP (all 200s); tsc CLEAN (app files; examples/skills errors pre-existing); eslint src CLEAN. Full agent-browser QA sweep (fresh onboarding EN → home hero → library categories → details dark → manga reader paged with session pill) — ALL PASS, 0 console errors, no blocking bugs → proceeded to features.
- DIAGNOSED — the round-7 "sandbox filesystem quirk" is conclusively a TOOL-OUTPUT DISPLAY ARTIFACT, not file corruption: epub-view.tsx shows `const tml, setHtml]` in Read/grep/sed output, but hexdump proves the bytes are `005b 0068` ("[h") — the sequence `[h` is being swallowed by the output transport layer (ANSI-CSI-like parsing). TS parser reports 0 diagnostics; tsc/dev compile clean. Workaround: verify with hexdump/bun JSON.stringify dumps, never trust bracket-bearing snippets.
- FIXED — REAL BUG: reading minutes were logged TWICE — engine.ts useClientEngine had a "rough" logger (1 min per 20s of reader open = 3× inflation) running alongside the reader's own 60s logger → ~4 min accrued per real minute, goals crossed 4× early, and the new pause couldn't gate the engine tick. Removed the engine logger (reader's 60s interval is authoritative + pause-aware). Verified: with minutes reset to 29/goal 30, exactly +1 min accrued at the 60s tick (was +6 before the fix).
- NEW — find-in-page bar (rounds-7 priority #3): Chrome-style glass pill (counter "2 / 12" + prev/next/close) floating top-right of the reader, stays active after the search sheet closes; entrance animation. PDF: searchPdfText now counts ALL matches per page (global budget 2000); matches flattened into a global sequence, prev/next jumps pages (cross-page verified 2/12→6/12 → page 3). EPUB: real in-chapter highlights — EpubBookView wraps every query match in <mark class="oni-find"> (cap 200/chapter), active match gets solid coral + glow + scrollIntoView(center); prev/next walks the whole-book sequence INCLUDING chapter switches (verified ch2 → prev → back into ch1, marks rebuilt, wrap-around works). Closing the bar clears marks (epubJump → null).
- NEW — focus-timer pause: SessionPill is now a button (tap = pause/resume). Paused: CirclePause icon + coral ring + "Paused" label + dimmed digits, clock freezes, and the reader's 60s logReading skips paused minutes (sessionPausedRef). aria-pressed reflects state. Verified: aria-pressed true→false, ring + label render.
- NEW — daily-goal confetti celebration (TRK-004/005 in-reader): when the 60s logger's logReading crosses the goal (before<goal≤after) the reader shows a full-reader overlay — 26 CSS confetti pieces (coral/cream palette, per-piece drift/spin CSS vars, oni-confetti-fall keyframes) + center card (coral-gradient Trophy tile, goalReachedTitle + "{min} min today", pop-in + timed fade, 5.2s window). End-to-end verified via MutationObserver capture: card + confetti + store toast all fire at the exact crossing tick (test harness cloned the live overlay into a holder for the screenshot — not part of the app).
- STYLING — search sheets gained a match-summary row (coral-soft icon chip + "{n} matches in {p} pages / {c} chapters" + "Stays active" pill) with singular/plural variants; find-bar glass styling with spring entrance; confetti + goal-card keyframes in globals.css; session pill hover/active affordances.
- i18n: 12 new keys ×2 (rdr.findPrev/findNext/findClose/matchOf/findKept/pdfSummary/pdfSummaryOne/epubSummary/epubSummaryOne/sessionPaused) in en+fa; fixed "1 chapters" pluralization via *_SummaryOne keys.
- QA-loop findings during feature testing: (1) rapid same-tick synthetic clicks share a stale closure (React batching) — not a bug, real users click in separate tasks; (2) celebration capture required an observer-clone harness because the overlay outlives slow poll gaps, not because it fails.
- Verified: tsc CLEAN, eslint src CLEAN, /api 200 + route file intact after export, home regression clean. APK REBUILT: download/oniLibrary-v1.0.0.apk — 4.32 MB signed (fresh static export; round-8 strings confirmed in out/_next chunks).

Stage Summary:
- Round-8 delivered: find-in-page bar (PDF page-granular + EPUB true in-page marks with cross-chapter navigation), session-pill pause, in-reader goal celebration, and a significant stats-accuracy bug fix (double logging removed). APK updated in place.
- Risks/notes: (1) PDF match highlight is page-granular (no textLayer overlay yet — jumping to the right page only); (2) EPUB marks are wiped by font/size/theme changes and re-apply on the next find interaction (same trade-off as flash); (3) match sequence caps: PDF 2000 counted matches, sequence 1000, EPUB 200 marks/chapter — generous for books; (4) goal celebration fires once per crossing (re-crossing after pause-spam can re-fire — acceptable); (5) sessions minutes now accrue 1:1 with wall-clock reading — historical seed data unchanged.
- Next-round priorities: 1) PDF.js textLayer highlight overlay for exact match positions; 2) Android native share/save bridge for CSV + .onibackup exports; 3) OPDS/Komga live browsing when servers reachable; 4) per-day goal history editing + focus-mode with configurable target; 5) reading-goal celebration for weekly/streak milestones (reuse GoalCelebration).

---
Task ID: cron-review-8 (round 9)
Agent: webDevReview agent
Task: Status assessment + browser QA + round-9 features (PDF exact-position highlight overlay, goal-streak/weekly milestone celebration chips, native APK export bridge) + APK rebuild

Work Log:
- STATUS ASSESSMENT: worklog reviewed (round 8 complete); dev server UP (all 200s, /api 200); tsc CLEAN; eslint src CLEAN. Full agent-browser QA sweep: home → library → details (dark) → manga reader paged (session pill ticking) → statistics → backup. 0 console errors, no blocking bugs. One harness note: Radix sheets need real pointerdown to dismiss — synthetic el.click() doesn't fire it (test artifact, not an app bug; real taps work).
- SELECTED FOCUS (stable phase → new features from round-8 priority list): (1) PDF exact-position highlight overlay, (2) streak/weekly milestone celebration, (3) native export bridge for the APK.
- NEW — PDF textLayer-style highlight overlay (round-8 priority #1): pdf-engine.getPdfPageMatches() computes match rects per page from pdf.js getTextContent items (proportional char slicing, baseline±ascent/descender band, budget 200/page, cached per work/page/query in rectCache). PdfCanvas gained a `highlight` prop: rects arrive in unrotated scale-1 user space, converted through the SAME viewport params as the canvas render (convertToViewportPoint on both corners → rotation/zoom stay in sync), rendered as pointer-events-none coral marks over the canvas. Reader maps the global findIdx to a local in-page index (pdfHighlightFor) and passes it to both render sites (paged slides + PDF vertical scroll). Verified in browser: "toolbar" → single mark EXACTLY over the word; "reading" → 6 matches/5 pages, counter 1/6 → next → 2/6 cross-page jump with active mark glowing on page 2 ("reading" in "change their reading status"). Inactive marks coral/22%, active mark solid coral + breathing glow (oni-mark-pulse keyframes).
- NEW — goal-streak + weekly milestone chips in the celebration (round-8 priority #5): the 60s crossing tick now computes (a) goal streak = consecutive days ending today with minutes ≥ goal, (b) weekly goal = rolling last-7-days total vs 7×daily, fired only on the crossing tick that completes the week (yesterday's rolling sum was short). Milestone chips (Flame coral chip "N-day streak!" / CalendarCheck emerald chip "Weekly goal!") pop in under the trophy card with staggered delay (650ms/850ms, oni-chip-pop). End-to-end verified: today reset to 29 min → reader open → tick → card + "14-day streak!" chip (expected streak 14 from seed) + 26 confetti + toast; weekly chip correctly absent (week already completed before today). i18n: stats.streakChip (with {n}) + stats.weeklyChip in en+fa.
- NEW — native export bridge for the APK (round-8 priority #2): MainActivity Bridge gained exportFile(base64, fileName, mime) — API 29+: MediaStore.Downloads insert + native Toast "Saved to Downloads"; API <29: legacy public Downloads write; on any failure → ACTION_SEND share sheet. New ShareProvider.java = minimal FileProvider replacement (build compiles against android.jar only — no AndroidX): serves cache/share/* via content://com.onilibrary.app.share, flat-name + canonical-path traversal guards, uses android.util.Base64 (java.util.Base64 needs API 26; minSdk 24). JS side: backup-screen downloadFile + createBackup now encode UTF-8 → base64 (chunked String.fromCharCode) and prefer window.OniAndroid.exportFile, falling back to the anchor download in browsers. Verified: CSV export regression in browser (toast "CSV exported"), APK compile clean (ecj + d8), manifest provider registered.
- STYLING — coral glow pulse on active PDF match; milestone chips with flame/calendar icons, layered borders + glass fill; staggered pop-in choreography (card → chip 1 → chip 2); all within the coral/cream visual language.
- Verified: tsc CLEAN, eslint src CLEAN, dev.log clean, /api 200, home regression clean. APK REBUILT: download/oniLibrary-v1.0.0.apk — 4.33 MB signed (fresh static export; "day streak" / "Weekly goal" / "exportFile" strings confirmed in out/_next chunks).

Stage Summary:
- Round-9 delivered: PDF find-in-page upgraded from page-granular to exact-position textLayer-style marks (incl. cross-page prev/next with glowing active match), celebration milestones (goal streak + weekly chips), and a real native export path for the APK (Downloads via MediaStore + share-sheet fallback). APK updated in place.
- Risks/notes: (1) PDF mark rects use proportional char slicing — proportional fonts make marks approximate (±2-4px); verified visually good on the guide PDF. (2) Matches spanning two text items (queries containing spaces across item boundaries) get counted in the sequence but may not render a mark (best-effort overlay). (3) EPUB marks unchanged (chapter-scoped). (4) Native bridge untestable in the sandbox (no Android emulator) — Java compiled clean and follows documented MediaStore/ContentProvider patterns; share-sheet fallback covers permission-denied devices. (5) Legacy (<API 29) Downloads write usually throws without WRITE_EXTERNAL_STORAGE → share sheet is the expected path there.
- Next-round priorities: 1) OPDS/Komga live browsing when servers reachable; 2) per-day goal history editing + configurable focus-mode target; 3) bookmark manager UI upgrade (notes + grid view); 4) EPUB text selection → highlight annotations (saved, colored); 5) in-reader TTS read-aloud for PDFs (page text extraction already available).
