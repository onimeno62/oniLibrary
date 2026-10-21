"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Search, SlidersHorizontal, ChevronRight, Plus, Settings2, Globe, RefreshCw } from "lucide-react";
import { SectionHeader, WorkCover } from "@/components/shared";
import { MangaDexCard, FreeCatalogList, MdCover } from "@/components/sources/free-catalogs";
import { MdFilterSheet } from "@/components/sources/md-filter-sheet";
import { RecShelf } from "@/components/sources/rec-shelf";
import { useApp, useNav, continueReading, chapterProgressFraction } from "@/lib/store";
import { useT, useMedia } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { mdLatest, type MdManga } from "@/lib/mangadex";
import { MANGADEX_ID } from "@/lib/builtin-sources";
import type { Chapter, Work } from "@/lib/types";

type Cat = "ALL" | "MANGA" | "COMICS" | "BOOKS";
type Chip = Cat | "MORE";

/* coarse type groups for the library shelves (chips row) */
function matchesCat(w: Work, cat: Cat): boolean {
  if (cat === "ALL") return true;
  if (cat === "MANGA") return ["MANGA", "MANHWA", "MANHUA", "WEBTOON"].includes(w.type);
  if (cat === "COMICS") return w.type === "COMIC";
  return ["BOOK", "NOVEL", "PDF", "EPUB"].includes(w.type); // BOOKS
}

export function DiscoverScreen() {
  const { t } = useT();
  const servers = useApp((s) => s.servers);
  const works = useApp((s) => s.works);
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);
  const openWork = useNav((s) => s.openWork);
  const openReader = useNav((s) => s.openReader);
  const [cat, setCat] = useState<Cat>("ALL");

  /* promo carousel (mockup: "Discover More" banner with page dots) */
  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
  /* ACC-004: the 5 s auto-advance is motion — never run it when the user
     asks the OS for reduced motion (live media-query, updates on change) */
  const reduceMotion = useMedia("(prefers-reduced-motion: reduce)");
  const bannerPausedUntil = useRef(0);
  const bannerSlides: { img: string; title: string; body: string; cta: string; go: () => void }[] = [
    {
      img: "/banners/discover-more.png",
      title: t("disc.discoverMore"),
      body: t("disc.discoverMoreBody"),
      cta: t("disc.exploreSources"),
      go: () => push({ kind: "extensions" }),
    },
    {
      img: "/banners/offline.png",
      title: t("disc.banner2Title"),
      body: t("disc.banner2Body"),
      cta: t("disc.banner2Cta"),
      go: () => setTab("downloads"),
    },
    {
      img: "/banners/vault.png",
      title: t("disc.banner3Title"),
      body: t("disc.banner3Body"),
      cta: t("disc.banner3Cta"),
      go: () => push({ kind: "vault" }),
    },
  ];
  const onBannerScroll = () => {
    const el = bannerRef.current;
    if (!el || el.clientWidth === 0) return;
    setBannerIdx(Math.max(0, Math.min(2, Math.round(el.scrollLeft / el.clientWidth))));
  };
  const goBanner = (i: number) => {
    bannerPausedUntil.current = Date.now() + 8000;
    const el = bannerRef.current;
    el?.scrollTo({ left: i * (el?.clientWidth ?? 0), behavior: "smooth" });
  };
  useEffect(() => {
    if (reduceMotion) return;
    const id = setInterval(() => {
      if (Date.now() < bannerPausedUntil.current) return;
      const el = bannerRef.current;
      if (!el || el.clientWidth === 0) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % bannerSlides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, [reduceMotion]);

  /* ----- real library shelves (v1.2.2 — no more fake catalogs) ----- */
  const visibleWorks = useMemo(() => works.filter((w) => !w.inVault).filter((w) => matchesCat(w, cat)), [works, cat]);

  /* plan §10 (Phase 5): disabled catalogs stay configured but hidden */
  const activeServers = useMemo(() => servers.filter((s) => s.enabled !== false), [servers]);

  const continueShelf = useMemo(() => {
    return visibleWorks
      .filter((w) => w.readingStatus === "READING")
      .map((w) => ({ work: w, cr: continueReading(w) }))
      .filter((x): x is { work: Work; cr: { chapter: Chapter; page: number } } => x.cr !== null)
      .map(({ work, cr }) => ({
        work,
        chapterId: cr.chapter.id,
        page: cr.page,
        // dual lastPage interpretation (ratio now / absolute legacy) — same
        // normalization as workProgress(); legacy records showed a fake 99%
        pct: Math.min(99, Math.max(1, Math.round(chapterProgressFraction(cr.chapter) * 100))),
      }))
      .slice(0, 10);
  }, [visibleWorks]);

  const recentShelf = useMemo(
    () => [...visibleWorks].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1)).slice(0, 10),
    [visibleWorks]
  );

  /* v1.4.0: the shelf previously labeled "Recently added" now shows the real
     MangaDex latest-uploads feed (user request); it degrades gracefully to
     the local recently-added shelf when offline/disabled. Failures get a
     distinct retryable card instead of silently pretending to be offline
     (plan §6 intentional states; Phase 1 findings D3/D7). */
  const [mdLatestItems, setMdLatestItems] = useState<MdManga[] | null>(null);
  const [mdLatestLoading, setMdLatestLoading] = useState(false);
  const [mdLatestFailed, setMdLatestFailed] = useState(false);
  const [netTick, setNetTick] = useState(0); // bumped by online/offline events
  const [retryTick, setRetryTick] = useState(0);
  const mdDisabled = useApp((s) => s.builtinDisabled.includes(MANGADEX_ID));
  const mdOffline = useApp((s) => s.settings.offlineMode);
  /* plan §6 (D2): the filter button opens the real MangaDex filter sheet;
     applying jumps into the source browser with the filters applied */
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    const sync = () => setNetTick((n) => n + 1); // connectivity changes refetch
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (mdDisabled || mdOffline || !online) {
      setMdLatestItems(null);
      setMdLatestLoading(false);
      setMdLatestFailed(false);
      return;
    }
    setMdLatestLoading(true);
    setMdLatestFailed(false);
    mdLatest(0)
      .then((list) => {
        if (!alive) return;
        setMdLatestItems(list.slice(0, 12));
        setMdLatestLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setMdLatestItems(null);
        setMdLatestFailed(true); // distinguishable from disabled/offline
        setMdLatestLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [mdDisabled, mdOffline, netTick, retryTick]);

  return (
    <div className="min-h-full px-5 pb-8">
      {/* header */}
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
            <defs>
              <linearGradient id="dh" x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FF9270" />
                <stop offset="0.55" stopColor="#F8694C" />
                <stop offset="1" stopColor="#E8442F" />
              </linearGradient>
            </defs>
            <path d="M14.5 15.5C12 9.5 13.5 4.8 16.2 2.6c1-.8 2.4-.2 2.7 1l1.9 8.2-6.3 3.7Z" fill="url(#dh)" />
            <path d="M49.5 15.5C52 9.5 50.5 4.8 47.8 2.6c-1-.8-2.4-.2-2.7 1l-1.9 8.2 6.3 3.7Z" fill="url(#dh)" />
            <path d="M32 6c8.6 0 15.6 2.6 19.4 5.4 2.4 1.8 3.4 4.8 3 7.8-.8 6.3-3 15.6-7.6 22.9C43 47.8 38 54.6 33.9 59.1c-1 1.1-2.8 1.1-3.8 0-4.1-4.5-9.1-11.3-12.9-17C12.6 34.8 10.4 25.5 9.6 19.2c-.4-3 .6-6 3-7.8C16.4 8.6 23.4 6 32 6Z" fill="url(#dh)" />
            <path d="M17.5 25.5c3.2-2.6 8.3-2.9 11.6-.7.9.6 1 1.9.2 2.7-2.7 2.6-8.3 3.2-11.6 1.4-1.2-.7-1.3-2.5-.2-3.4Z" fill="#FFF3EC" />
            <path d="M46.5 25.5c-3.2-2.6-8.3-2.9-11.6-.7-.9.6-1 1.9-.2 2.7 2.7 2.6 8.3 3.2 11.6 1.4 1.2-.7 1.3-2.5.2-3.4Z" fill="#FFF3EC" />
            <circle cx="24.5" cy="27.4" r="2.1" fill="#33221D" />
            <circle cx="39.5" cy="27.4" r="2.1" fill="#33221D" />
            <path d="M24.5 39.5c2.3 3 5 4.5 7.5 4.5s5.2-1.5 7.5-4.5c.8-1 .4-2.6-.9-2.9-4.3-1-8.9-1-13.2 0-1.3.3-1.7 1.9-.9 2.9Z" fill="#7E2417" />
          </svg>
          <span className="text-[19px] font-black tracking-tight">
            oni<span className="text-primary">Library</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => push({ kind: "search" })}
            aria-label={t("common.search")}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-secondary"
          >
            <Search className="h-[21px] w-[21px]" />
          </button>
          <button
            onClick={() => push({ kind: "extensions" })}
            aria-label={t("ext.title")}
            className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-secondary"
          >
            <Settings2 className="h-[21px] w-[21px]" />
          </button>
        </div>
      </header>

      {/* title */}
      <div className="mt-3">
        <h1 className="text-[26px] font-black tracking-tight">{t("disc.title")}</h1>
        <p className="text-[14px] font-semibold text-muted-foreground">{t("disc.subtitle")}</p>
      </div>

      {/* search + real filter UI (plan §6: the filter button must open an
          actual filter panel — D2; extensions stay reachable from More) */}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => push({ kind: "search" })}
          className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 text-start shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="w-full truncate text-[14px] font-semibold text-muted-foreground">{t("disc.searchPlaceholder")}</span>
        </button>
        <button
          onClick={() => setFilterSheetOpen(true)}
          aria-label={t("flt.title")}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)] transition-colors hover:bg-secondary"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* chips — filter the real library shelves */}
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {(
          [
            ["ALL", t("common.all")],
            ["MANGA", t("type.MANGA")],
            ["COMICS", t("type.COMIC")],
            ["BOOKS", t("type.BOOK")],
            ["MORE", t("common.more")],
          ] as [Chip, string][]
        ).map(([id, label]) => {
          const isMore = id === "MORE";
          return (
            <button
              key={id}
              onClick={() => (isMore ? push({ kind: "extensions" }) : setCat(id))}
              className={cn(
                "flex h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-bold transition-all",
                !isMore && cat === id
                  ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                  : "bg-card text-secondary-foreground shadow-[0_4px_12px_-8px_rgba(43,36,29,0.3)] hover:bg-secondary"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ====== from your library: continue reading ====== */}
      {continueShelf.length > 0 && (
        <section className="mt-6">
          <SectionHeader title={t("disc.continueShelf")} onSeeAll={() => setTab("library")} />
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
            {continueShelf.map(({ work, chapterId, page, pct }) => (
              <button
                key={work.id}
                onClick={() => openReader(work.id, chapterId, page)}
                className="group w-[96px] shrink-0 text-start"
              >
                <WorkCover
                  src={work.cover}
                  color={work.coverColor}
                  title={work.title}
                  className="aspect-[3/4] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]"
                  sizes="96px"
                />
                <p className="mt-1.5 truncate text-[12px] font-extrabold">{work.title}</p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-coral-gradient" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{pct}%</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ====== on-device picks (plan §9, Phase 5) — explainable + controllable ====== */}
      <RecShelf />

      {/* ====== MangaDex latest uploads (v1.4.0) — falls back to local recents offline ====== */}
      {mdLatestItems !== null && mdLatestItems.length > 0 ? (
        <section className="mt-6">
          <SectionHeader title={t("disc.mdLatest")} />
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
            {mdLatestItems.map((m) => (
              <button
                key={m.id}
                onClick={() => push({ kind: "source", sourceId: MANGADEX_ID, focusMangaId: m.id })}
                className="w-[96px] shrink-0 text-start"
              >
                <span className="block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-secondary shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]">
                  <MdCover url={m.coverUrl} title={m.title} />
                </span>
                <p className="mt-1.5 truncate text-[12px] font-extrabold">{m.title}</p>
                <p className="truncate text-[10px] font-semibold text-muted-foreground">{m.author || "MangaDex"}</p>
              </button>
            ))}
          </div>
        </section>
      ) : mdLatestFailed ? (
        /* failed ≠ offline: show a retryable error card (plan §6) */
        <section className="mt-6">
          <SectionHeader title={t("disc.mdLatest")} />
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-red-500/25 bg-red-500/5 p-5 text-center">
            <span className="text-[13px] font-extrabold text-red-500">{t("md.error")}</span>
            <button
              onClick={() => setRetryTick((n) => n + 1)}
              className="flex h-9 items-center gap-1.5 rounded-full bg-coral-soft px-4 text-[12px] font-extrabold text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("srch.retry")}
            </button>
          </div>
        </section>
      ) : mdLatestLoading && recentShelf.length === 0 ? (
        /* skeleton while the remote shelf is in flight and there is nothing
           local to show (Phase 1 finding D4) */
        <section className="mt-6">
          <SectionHeader title={t("disc.mdLatest")} />
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="w-[96px] shrink-0">
                <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-secondary/70" />
                <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-secondary/70" />
              </div>
            ))}
          </div>
        </section>
      ) : recentShelf.length > 0 ? (
        <section className="mt-6">
          <SectionHeader title={t("disc.recentShelf")} onSeeAll={() => setTab("library")} />
          <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
            {recentShelf.map((w) => (
              <button key={w.id} onClick={() => openWork(w.id)} className="w-[96px] shrink-0 text-start">
                <WorkCover
                  src={w.cover}
                  color={w.coverColor}
                  title={w.title}
                  className="aspect-[3/4] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]"
                  sizes="96px"
                />
                <p className="mt-1.5 truncate text-[12px] font-extrabold">{w.title}</p>
                <p className="truncate text-[10px] font-semibold text-muted-foreground">
                  {t("common.chapter")} {w.chapters.length} · {w.author}
                </p>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ====== catalogs (real OPDS / Komga servers) ====== */}
      <section className="mt-6">
        <SectionHeader title={t("disc.catalogs")} onSeeAll={() => push({ kind: "servers" })} />
        {activeServers.length === 0 ? (
          <button
            onClick={() => push({ kind: "servers" })}
            className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card/50 p-6 text-center transition-colors hover:bg-card"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-coral-soft text-primary">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-[14px] font-extrabold">{t("disc.addCatalog")}</span>
            <span className="text-[11.5px] font-semibold leading-snug text-muted-foreground">{t("disc.noCatalogsHint")}</span>
          </button>
        ) : (
          <>
            <div className="space-y-2.5">
              {activeServers.map((s) => {
                const statusColor =
                  s.status === "OK" ? "bg-emerald-500" : s.status === "FAIL" ? "bg-red-500" : "bg-zinc-400";
                return (
                  <button
                    key={s.id}
                    onClick={() => push({ kind: "catalog", serverId: s.id })}
                    className="flex w-full items-center gap-3.5 rounded-3xl border border-border/60 bg-card p-3 text-start shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)] transition-all hover:shadow-[0_12px_26px_-16px_rgba(43,36,29,0.5)]"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-primary">
                      <Globe className="h-5.5 w-5.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[15px] font-extrabold">
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[9.5px] font-black text-primary">
                          {s.kind}
                        </span>
                      </span>
                      <span className="block truncate text-[12px] font-semibold text-muted-foreground" dir="ltr">
                        {(() => {
                          try {
                            return new URL(s.url).host;
                          } catch {
                            return s.url;
                          }
                        })()}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold">
                        <span className={cn("h-1.5 w-1.5 rounded-full", statusColor)} aria-hidden />
                        <span
                          className={cn(
                            s.status === "OK" ? "text-emerald-600" : s.status === "FAIL" ? "text-red-500" : "text-zinc-500"
                          )}
                        >
                          {s.status === "OK" ? t("srv.ok") : s.status === "FAIL" ? t("srv.fail") : t("disc.untested")}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => push({ kind: "servers" })}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-border py-3.5 text-[13px] font-extrabold text-primary transition-colors hover:bg-card"
            >
              <Plus className="h-4 w-4" />
              {t("disc.addCatalog")}
            </button>
          </>
        )}
      </section>

      {/* ====== free built-in catalogs (v1.3.0 — one-tap sources) ====== */}
      <section className="mt-6">
        <SectionHeader title={t("src.title")} onSeeAll={() => push({ kind: "extensions" })} />
        <div className="space-y-2.5">
          <MangaDexCard />
          <FreeCatalogList />
        </div>
      </section>

      {/* discover-more carousel (mockup: promo banner with page dots) */}
      <section className="mt-6">
        <div className="relative">
          <div
            ref={bannerRef}
            dir="ltr"
            onScroll={onBannerScroll}
            onPointerDown={() => (bannerPausedUntil.current = Date.now() + 8000)}
            className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto rounded-3xl shadow-[0_18px_40px_-18px_rgba(43,36,29,0.55)]"
          >
            {bannerSlides.map((s, i) => (
              <button key={i} onClick={s.go} className="relative block min-w-full snap-center text-start" aria-label={s.title}>
                <div className="relative h-[150px] w-full">
                  <Image src={s.img} alt={s.title} fill sizes="412px" className="object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
                </div>
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="text-[17px] font-extrabold text-white">{s.title}</p>
                  <p className="mt-0.5 max-w-[260px] text-[12px] font-semibold leading-snug text-white/85">{s.body}</p>
                  <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-coral-gradient px-4 py-1.5 text-[12px] font-extrabold text-white shadow-lg">
                    {s.cta}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="absolute bottom-2 right-3 z-10 flex items-center">
            {bannerSlides.map((_, i) => (
              /* full 44px hit area around a small visual dot (audit D6) */
              <button
                key={i}
                onClick={() => goBanner(i)}
                aria-label={t("disc.slide", { n: i + 1 })}
                aria-current={i === bannerIdx}
                className="flex h-11 w-11 items-center justify-center"
              >
                <span
                  className={cn(
                    "rounded-full transition-all",
                    i === bannerIdx ? "h-1.5 w-4 bg-white" : "h-1.5 w-1.5 bg-white/50"
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      </section>
      {/* plan §6: real filter sheet (server-side MangaDex filters) */}
      <MdFilterSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        onApply={(filters) => {
          setFilterSheetOpen(false);
          push({ kind: "source", sourceId: MANGADEX_ID, filters });
        }}
      />
    </div>
  );
}
