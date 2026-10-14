"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { OverlayHeader, SourceIcon, WorkCover, EmptyState } from "@/components/shared";
import { AddSourceButton } from "@/components/screens/discover-screen";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";

/* plausible catalog titles for browsing a source */
const TITLE_POOL = [
  "Chrono Blade Saga", "Moonlight Diner", "Steel Alchemist Rebirth", "Kaiju Voice",
  "Her Private Tutor is a Villain", "The Sword Saint's Second Life", "Galaxy Express 9999",
  "My Master is a Demon Lord", "Petals of the Silent Garden", "Return of the Iron Blood",
  "Café of Forgotten Spells", "Starlight Academy", "The Wolf of Winter Street",
  "Ninth Life of a Cat Burglar", "Emperor's Favorite Baker", "Blade of the Southern Wind",
  "Apocalypse Cooking Show", "Rooftop Astronaut", "Mistborn Detective", "Hana and the Thunder God",
  "Underwater Armory", "The Last Calligrapher", "Neon Samurai", "Grandfather's Mecha",
];

export function SourceScreen({ sourceId }: { sourceId: string }) {
  const { t } = useT();
  const source = useApp((s) => s.sources.find((x) => x.id === sourceId));
  const offline = useApp((s) => s.settings.offlineMode);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"latest" | "popular">("latest");

  const results = useMemo(() => {
    if (!source) return [];
    let pool = TITLE_POOL.map((title, i) => ({
      title,
      seed: (title.length * 31 + i * 7 + source.id.length) % 97,
    }));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      pool = pool.filter((x) => x.title.toLowerCase().includes(q));
    }
    if (tab === "popular") pool = [...pool].sort((a, b) => b.seed - a.seed);
    else pool = [...pool].sort((a, b) => a.seed - b.seed);
    return pool;
  }, [source, query, tab]);

  if (!source) return <EmptyState icon={<Search />} title={t("common.unknown")} />;

  const online = !offline && source.status === "ONLINE";

  return (
    <div className="flex h-full flex-col">
      <OverlayHeader
        right={
          <SourceIcon bg={source.iconBg} text={source.iconText} size={34} className="rounded-xl" />
        }
      />
      <div className="px-5 pb-3">
        <h1 className="text-[22px] font-black tracking-tight">{source.name}</h1>
        <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
          {source.kinds.join(" · ")} <span className="mx-1">•</span> {source.itemCount}{" "}
          <span className="mx-1">•</span>{" "}
          <span className={online ? "text-emerald-600" : "text-amber-600"}>
            {online ? t("common.online") : t("common.offline")}
          </span>
        </p>

        <div className="mt-3 flex h-10 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`${t("common.search")} ${source.name}...`}
            className="w-full bg-transparent text-[13px] font-semibold outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-3 flex gap-2">
          {(
            [
              ["latest", "disc.latest"],
              ["popular", "disc.popular"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-bold transition-all",
                tab === id ? "bg-coral-gradient text-white" : "bg-secondary text-secondary-foreground"
              )}
            >
              {t(label)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6 thin-scrollbar">
        {!online && (
          <div className="mb-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-[12px] font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-400">
            {t("common.offline")} — {t("disc.sourceOffline")}
          </div>
        )}
        {results.length === 0 ? (
          <EmptyState icon={<Search className="h-6 w-6" />} title={t("disc.noResultsSources")} />
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {results.map((r) => (
              <div key={r.title} className="text-start">
                <WorkCover
                  title={r.title}
                  className="aspect-[3/4] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]"
                  sizes="30vw"
                />
                <p className="mt-1.5 truncate text-[12px] font-extrabold">{r.title}</p>
                <p className="text-[10px] font-semibold text-muted-foreground">
                  ★ {(7.5 + (r.seed % 25) / 10).toFixed(1)}
                </p>
                <div className="mt-1">
                  <AddSourceButton sourceId={sourceId} title={r.title} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
