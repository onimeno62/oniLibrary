"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Search, SlidersHorizontal, ChevronRight, Plus, Settings2, Pin, PinOff, Power, PowerOff } from "lucide-react";
import { SectionHeader, SourceIcon } from "@/components/shared";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TranslationKey } from "@/lib/i18n";

type Cat = "ALL" | "MANGA" | "MANHWA" | "COMICS" | "BOOKS" | "MORE";

export function DiscoverScreen() {
  const { t } = useT();
  const sources = useApp((s) => s.sources);
  const offlineMode = useApp((s) => s.settings.offlineMode);
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);
  const setSourceEnabled = useApp((s) => s.setSourceEnabled);
  const setSourcePinned = useApp((s) => s.setSourcePinned);
  const [cat, setCat] = useState<Cat>("ALL");
  const [query, setQuery] = useState("");

  /* promo carousel (mockup: "Discover More" banner with page dots) */
  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerIdx, setBannerIdx] = useState(0);
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
    const id = setInterval(() => {
      if (Date.now() < bannerPausedUntil.current) return;
      const el = bannerRef.current;
      if (!el || el.clientWidth === 0) return;
      const next = (Math.round(el.scrollLeft / el.clientWidth) + 1) % bannerSlides.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const kindOf = (s: (typeof sources)[number]): string[] =>
    s.kinds.flatMap((k) => k.split(" "));

  const filteredSources = useMemo(() => {
    let list = [...sources].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    if (cat === "MANGA") list = list.filter((s) => kindOf(s).includes("Manga") && !s.kinds.includes("Anime"));
    if (cat === "MANHWA") list = list.filter((s) => s.languages.some((l) => ["KO", "ZH"].includes(l)) || s.name === "Webtoon");
    if (cat === "COMICS") list = list.filter((s) => s.kinds.includes("Comics"));
    if (cat === "BOOKS") list = list.filter((s) => s.kinds.some((k) => k.includes("Novel")));
    return list;
  }, [sources, cat]);

  const visible = useMemo(() => {
    const base = query.trim()
      ? filteredSources.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
      : filteredSources;
    return base;
  }, [filteredSources, query]);

  const statusLabel = (s: (typeof sources)[number]) =>
    !s.enabled
      ? t("disc.sourceDisabled")
      : offlineMode
        ? t("common.offline")
        : s.status === "ONLINE"
          ? t("common.online")
          : s.status === "OFFLINE"
            ? t("disc.sourceOffline")
            : t("disc.sourceError");

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
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-secondary"
          >
            <Search className="h-[21px] w-[21px]" />
          </button>
          <button
            onClick={() => push({ kind: "extensions" })}
            aria-label={t("ext.title")}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-secondary"
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

      {/* search */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => query.trim() && push({ kind: "search" })}
            placeholder={t("disc.searchPlaceholder")}
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={() => push({ kind: "extensions" })}
          aria-label={t("ext.title")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-card shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)] transition-colors hover:bg-secondary"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
        </button>
      </div>

      {/* chips */}
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {(
          [
            ["ALL", t("common.all")],
            ["MANGA", t("type.MANGA")],
            ["MANHWA", t("disc.manhwa")],
            ["COMICS", t("type.COMIC")],
            ["BOOKS", t("type.BOOK")],
            ["MORE", t("common.more")],
          ] as [Cat, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => (id === "MORE" ? push({ kind: "extensions" }) : setCat(id))}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-all",
              cat === id && id !== "MORE"
                ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                : "bg-card text-secondary-foreground shadow-[0_4px_12px_-8px_rgba(43,36,29,0.3)] hover:bg-secondary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* sources */}
      <section className="mt-6">
        <SectionHeader title={t("disc.popularSources")} onSeeAll={() => push({ kind: "extensions" })} />
        <div className="space-y-2.5">
          {visible.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex w-full items-center gap-3.5 rounded-3xl border border-border/60 bg-card p-3 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)] transition-all hover:shadow-[0_12px_26px_-16px_rgba(43,36,29,0.5)]",
                !s.enabled && "opacity-60"
              )}
            >
              <button
                onClick={() => push({ kind: "source", sourceId: s.id })}
                className="flex min-w-0 flex-1 items-center gap-3.5 text-start"
              >
                <SourceIcon bg={s.iconBg} text={s.iconText} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-[15px] font-extrabold">
                    {s.name}
                    {s.pinned && <Pin className="h-3 w-3 shrink-0 rotate-45 text-primary" fill="currentColor" />}
                  </p>
                  <p className="truncate text-[12px] font-semibold text-muted-foreground">
                    {s.kinds.join(" · ")} <span className="mx-1">•</span> {s.itemCount}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-bold">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        !s.enabled
                          ? "bg-zinc-400"
                          : offlineMode || s.status !== "ONLINE"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      )}
                    />
                    <span
                      className={
                        !s.enabled
                          ? "text-zinc-500"
                          : offlineMode || s.status !== "ONLINE"
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }
                    >
                      {statusLabel(s)}
                    </span>
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
              </button>
              {/* SRC-004: enable / disable / pin sources */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("common.more")}
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                  >
                    <Settings2 className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem
                    onClick={() => {
                      setSourcePinned(s.id, !s.pinned);
                      toast({ title: s.pinned ? t("src.unpinned") : t("src.pinned"), description: s.name });
                    }}
                    className="gap-2.5 rounded-xl text-[13px] font-semibold"
                  >
                    {s.pinned ? <PinOff className="h-4 w-4 text-primary" /> : <Pin className="h-4 w-4 text-primary" />}
                    {s.pinned ? t("src.unpin") : t("src.pin")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setSourceEnabled(s.id, !s.enabled);
                      toast({
                        title: s.enabled ? t("src.disabledToast") : t("src.enabledToast"),
                        description: s.name,
                      });
                    }}
                    className="gap-2.5 rounded-xl text-[13px] font-semibold"
                  >
                    {s.enabled ? <PowerOff className="h-4 w-4 text-destructive" /> : <Power className="h-4 w-4 text-primary" />}
                    {s.enabled ? t("src.disable") : t("src.enable")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
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
          <div className="absolute bottom-3 right-4 z-10 flex gap-1">
            {bannerSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => goBanner(i)}
                aria-label={`Slide ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === bannerIdx ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                )}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function AddSourceButton({ sourceId, title }: { sourceId: string; title: string }) {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const inLibrary = works.some((w) => w.title === title);
  const add = useApp((s) => s.addSampleWorkFromSource);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (!inLibrary) {
          add(sourceId, title);
          toast({ title: t("disc.addToLibrary"), description: title });
        }
      }}
      disabled={inLibrary}
      className={cn(
        "flex h-8 items-center gap-1 rounded-full px-3 text-[12px] font-extrabold transition-all",
        inLibrary
          ? "bg-secondary text-muted-foreground"
          : "bg-coral-gradient text-white shadow-[0_6px_16px_-8px_rgba(248,105,76,0.6)] hover:scale-[1.03]"
      )}
    >
      {inLibrary ? <CheckSmall /> : <Plus className="h-3.5 w-3.5" />}
      {inLibrary ? t("disc.inLibrary") : t("disc.addToLibrary")}
    </button>
  );
}

function CheckSmall() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
