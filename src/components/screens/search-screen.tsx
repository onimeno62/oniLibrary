"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Clock, ArrowLeftRight } from "lucide-react";
import { WorkCover, SourceIcon, EmptyState } from "@/components/shared";
import { AddSourceButton } from "@/components/screens/discover-screen";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";

export function SearchScreen() {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const sources = useApp((s) => s.sources);
  const pop = useNav((s) => s.pop);
  const openWork = useNav((s) => s.openWork);
  const push = useNav((s) => s.push);
  const [query, setQuery] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const searchingSources = q !== "" && committedQ !== q;

  const onQueryChange = (v: string) => {
    setQuery(v);
    const qq = v.trim().toLowerCase();
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (qq) {
      commitTimer.current = setTimeout(() => setCommittedQ(qq), 900);
    } else {
      setCommittedQ("");
    }
  };

  const libraryHits = useMemo(() => {
    if (!q) return [];
    return works
      .filter(
        (w) =>
          !w.inVault &&
          (w.title.toLowerCase().includes(q) ||
            (w.altTitle ?? "").toLowerCase().includes(q) ||
            w.author.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [works, q]);

  const sourceHits = useMemo(() => {
    if (!committedQ) return [];
    return TITLE_POOL.filter((title) => title.toLowerCase().includes(committedQ)).slice(0, 6);
  }, [committedQ]);

  const sourceMatches = useMemo(() => {
    if (!q) return [];
    return sources.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 3);
  }, [sources, q]);

  return (
    <div className="flex h-full flex-col">
      {/* search bar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <button
          onClick={pop}
          aria-label={t("common.back")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-secondary"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("srch.placeholder")}
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} aria-label={t("srch.clear")}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 thin-scrollbar">
        {!q ? (
          <div className="mt-8">
            <EmptyState icon={<Search className="h-6 w-6" />} title={t("srch.title")} hint={t("disc.globalSearchHint")} />
          </div>
        ) : (
          <>
            {/* library results */}
            <section className="mt-3">
              <h2 className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {t("srch.inLibrary")}
              </h2>
              {libraryHits.length === 0 ? (
                <p className="py-2 text-[13px] font-semibold text-muted-foreground">—</p>
              ) : (
                <div className="space-y-2">
                  {libraryHits.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => openWork(w.id)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-2 text-start shadow-[0_6px_16px_-14px_rgba(43,36,29,0.4)]"
                    >
                      <WorkCover src={w.cover} color={w.coverColor} title={w.title} className="h-14 w-11 rounded-xl" sizes="44px" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-extrabold">{w.title}</p>
                        <p className="truncate text-[11px] font-semibold text-muted-foreground">
                          {w.author} · {t(`type.${w.type}`)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* source matches */}
            {sourceMatches.length > 0 && (
              <section className="mt-5">
                <h2 className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
                  {t("disc.searchSources")}
                </h2>
                <div className="space-y-2">
                  {sourceMatches.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => push({ kind: "source", sourceId: s.id })}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-2 text-start"
                    >
                      <SourceIcon bg={s.iconBg} text={s.iconText} size={36} className="rounded-xl" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-extrabold">{s.name}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground">{s.itemCount}</p>
                      </div>
                      <ArrowLeftRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* from sources */}
            <section className="mt-5">
              <h2 className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {t("srch.fromSources")}
              </h2>
              {searchingSources ? (
                <div className="flex items-center gap-2 py-4 text-[13px] font-bold text-muted-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  {t("srch.searchingSources")}
                </div>
              ) : sourceHits.length === 0 ? (
                <p className="py-2 text-[13px] font-semibold text-muted-foreground">{t("srch.noResults", { q: query.trim() })}</p>
              ) : (
                <div className="grid grid-cols-3 gap-x-3 gap-y-4">
                  {sourceHits.map((title, i) => (
                    <div key={title}>
                      <WorkCover title={title} className="aspect-[3/4] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]" sizes="30vw" />
                      <p className="mt-1.5 truncate text-[12px] font-extrabold">{title}</p>
                      <div className="mt-1">
                        <AddSourceButton sourceId={sources[i % sources.length]?.id ?? "src-mangadex"} title={title} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const TITLE_POOL = [
  "Chrono Blade Saga", "Moonlight Diner", "Steel Alchemist Rebirth", "Kaiju Voice",
  "Her Private Tutor is a Villain", "The Sword Saint's Second Life", "Galaxy Express 9999",
  "My Master is a Demon Lord", "Petals of the Silent Garden", "Return of the Iron Blood",
  "Café of Forgotten Spells", "Starlight Academy", "The Wolf of Winter Street",
  "Ninth Life of a Cat Burglar", "Emperor's Favorite Baker", "Blade of the Southern Wind",
  "Apocalypse Cooking Show", "Rooftop Astronaut", "Mistborn Detective", "Hana and the Thunder God",
  "Underwater Armory", "The Last Calligrapher", "Neon Samurai", "Grandfather's Mecha",
];
