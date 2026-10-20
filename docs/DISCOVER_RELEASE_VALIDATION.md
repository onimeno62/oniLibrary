# Discover — Release validation report (v1.5.0)

> Plan: `docs/DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md` (§12 gates, §14 definition of
> done, §15.7/§15.10 reporting rules). This report is generated for the v1.5.0 release
> and states exactly what was verified, how, and what remains unverified.

## 1. Phase gates

| Phase | Scope | Gate | Verdict |
| --- | --- | --- | --- |
| 1 — Audit | path-by-path findings S/T/D/O/M/B/G/A/X + risks R1–R5 | verified bugs distinguished from risks; no code changed first | ✅ `docs/DISCOVER_PHASE1_AUDIT.md` |
| 2 — Search contract | run guard, dedup, partial failure, deadlines | one source failing keeps others; clear cannot resurrect results; no dup pages | ✅ `tests/search-contract.test.ts` |
| 3 — Feeds & filters | real MangaDex/OPDS filters, pagination, attribution | every feed/filter has source semantics; nothing fabricated | ✅ `tests/md-filters.test.ts`, live UI |
| 4 — Detail & downloads | durable queue, verified completion, honest linking | selected content survives restart, offline reopen; add-to-library never downloads | ✅ `tests/download-contract.test.ts`, live gate evidence in worklog |
| 5 — Recommendations & source settings | explainable local ranking, interests, exclusions, dismissal; catalog enable/disable | useful new-user recommendations, privacy controls, no history upload | ✅ `tests/recommendations.test.ts`, live UI verification (this round) |
| 6 — Hardening | en/fa RTL, a11y targets, PWA, release validation | checks run against the exact reviewed commit; unverified items reported | ✅ this report |

## 2. Automated checks (exact commit)

Run against the release commit (see git tag `v1.5.0`):

- `bun test tests/` → **138 pass / 0 fail** (10 files: search contract, download
  contract, md filters, recommendations, i18n parity, importer, progress, store
  management/restore, vault crypto)
- `bun run lint` → clean (eslint, Next.js rules incl. react-hooks)
- `bunx tsc --noEmit` → clean
- `node scripts/verify-apk-assets.cjs <apk>` → all bundled asset URLs resolve
  (0 missing) — run in CI on the produced APK
- GitHub Actions `CI` + `Build APK` → green on the release commit

## 3. Live verification (agent-browser, this round)

- **Picks shelf**: renders real MangaDex candidates with server-side narrowed feed
  (`order[followedCount]=desc&includedTags[]=…` — uuids derived on-device from
  reading activity); reason lines explain every card
  ("Matches your interest: Comedy · You've read Action", ≤2 reasons).
- **Dismissal**: clicking a card's ✕ removes it immediately (persisted, capped 300).
- **Interests**: picking "Comedy" in the sheet instantly changes both the feed query
  and the reasons on cards.
- **Personalization off**: shelf retitles honestly to "Popular on MangaDex", zero
  local-signal reasons, feed order preserved.
- **Persian/RTL**: full sweep at 412×915 — mirrored layout, Persian reasons
  ("مناسب علایق شما"), dismiss controls mirrored; screenshots archived in-session.
- **a11y**: header buttons/chips/clear/dots at 44px, inputs labeled, dialog has
  accessible description, aria-live regions retained.

## 4. Explicitly unverified / partial (honesty per §15.10)

- **Android device/emulator behavior** — not run in this environment (no emulator
  available in the sandbox). The WebView shell changes are compile-checked (ecj
  against android-34); on-device installation was not executed here. The APK asset
  verification and prior rounds' install evidence cover packaging.
- **OPDS/Komga connection tests** against live personal servers — the built-in
  public OPDS catalogs (Gutenberg/Standard Ebooks) are exercised, but personal
  Komga/Kavita instances are user-specific and were not available.
- **Standard Ebooks authenticated OPDS** requires a free account; only the
  unauthenticated paths were live-verified.
- **PWA service-worker update flows** — registration/unregistration degrade
  silently by design; the SW update cycle was not force-driven in a browser here.
- **Recommendation quality at scale** — ranking is proven deterministic and honest
  on fixtures and a seeded library; taste quality on a large real library is
  subjective and unmeasured.

## 5. Data & privacy statement (plan §9)

Recommendation signals (interests, exclusions, dismissals, reading-derived tag
weights) are computed and stored **only on the device** (persisted app state).
Nothing is uploaded — the recommendation pipeline performs exactly two network
calls, both reads against the public MangaDex API (tag list, popularity feed).
Disabling personalization stops all signal use and reverts to the neutral feed.
"Reset picks data" clears interests, exclusions and dismissals; reading history
keeps its own independent control in Settings.
