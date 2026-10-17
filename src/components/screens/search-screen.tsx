"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Globe, RefreshCw, Plus, ChevronRight, Sparkles } from "lucide-react";
import { WorkCover, EmptyState } from "@/components/shared";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { opdsSearchTemplate, searchOpds } from "@/lib/opds";
import { importOpdsEntry } from "@/lib/opds-import";
import { mdSearch } from "@/lib/mangadex";
import { MANGADEX_ID } from "@/lib/builtin-sources";
import type { ServerEntry } from "@/lib/types";
import type { OpdsEntry } from "@/lib/opds";
import type { MdManga } from "@/lib/mangadex";

interface CatalogHit {
  srv: ServerEntry;
  entries: OpdsEntry[];
}

export function SearchScreen() {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const servers = useApp((s) => s.servers);
  const addWork = useApp((s) => s.addWork);
  const pop = useNav((s) => s.pop);
  const openWork = useNav((s) => s.openWork);
  const push = useNav((s) => s.push);
  const [query, setQuery] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* catalog search results (real OpenSearch queries, v1.2.2) + MangaDex (v1.3.0) */
  const [catHits, setCatHits] = useState<CatalogHit[] | null>(null);
  const [catNoSearch, setCatNoSearch] = useState<ServerEntry[]>([]);
  const [searchingCats, setSearchingCats] = useState(false);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [mdHits, setMdHits] = useState<MdManga[] | null>(null);
  const [mdFailed, setMdFailed] = useState(false);

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
            w.author.toLowerCase().includes(q) ||
            w.tags.some((tag) => tag.toLowerCase().includes(q)))
      )
      .slice(0, 6);
  }, [works, q]);

  /* ----- live catalog search (departs from the committed query) ----- */
  const mdEnabled = useApp((s) => !s.builtinDisabled.includes(MANGADEX_ID));

  useEffect(() => {
    const term = committedQ;
    let alive = true;
    const run = async () => {
      if (!term || (servers.length === 0 && !mdEnabled)) {
        if (alive) {
          setCatHits(null);
          setCatNoSearch([]);
          setSearchingCats(false);
          setMdHits(null);
          setMdFailed(false);
        }
        return;
      }
      setSearchingCats(true);
      const hits: CatalogHit[] = [];
      const noSearch: ServerEntry[] = [];
      // MangaDex runs in parallel with the OPDS catalogs — one source failing
      // never blocks the others ([SRC-002])
      const mdPromise = mdEnabled
        ? mdSearch(term, 0)
            .then((list) => (alive ? setMdHits(list.slice(0, 6)) : undefined))
            .catch(() => alive && setMdFailed(true))
        : Promise.resolve();
      if (!mdEnabled && alive) setMdHits(null);
      await Promise.all([
        mdPromise,
        ...servers.map(async (srv) => {
          try {
            const template = await opdsSearchTemplate(srv);
            if (!template) {
              noSearch.push(srv);
              return;
            }
            const feed = await searchOpds(template, term);
            if (feed.entries.length > 0) hits.push({ srv, entries: feed.entries.slice(0, 6) });
          } catch {
            /* this catalog failed — the others still render */
          }
        }),
      ]);
      if (!alive) return;
      setCatHits(hits);
      setCatNoSearch(noSearch);
      setSearchingCats(false);
    };
    void run();
    return () => {
      alive = false;
    };
  }, [committedQ, servers, mdEnabled]);

  const addEntry = async (srv: ServerEntry, entry: OpdsEntry) => {
    if (addedIds.includes(entry.id)) return;
    try {
      const work = await importOpdsEntry(srv, entry);
      addWork(work);
      setAddedIds((a) => [...a, entry.id]);
      toast({ title: t("imp.added", { n: 1 }), description: entry.title });
    } catch (e) {
      toast({
        title: t("srv.importFail"),
        description: (e as Error).message?.slice(0, 80),
        variant: "destructive",
      });
    }
  };

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

            {/* from catalogs (real OpenSearch results) + MangaDex (v1.3.0) */}
            <section className="mt-5">
              <h2 className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {t("srch.fromCatalogs")}
              </h2>

              {servers.length === 0 && !mdEnabled ? (
                <button
                  onClick={() => push({ kind: "servers" })}
                  className="flex w-full flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card/50 p-5 text-center transition-colors hover:bg-card"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-coral-soft text-primary">
                    <Plus className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-[13px] font-extrabold">{t("srch.noCatalogs")}</span>
                  <span className="text-[11.5px] font-semibold text-muted-foreground">{t("disc.noCatalogsHint")}</span>
                </button>
              ) : searchingCats ? (
                <div className="flex items-center gap-2 py-4 text-[13px] font-bold text-muted-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  {t("srch.searchingCatalogs")}
                </div>
              ) : (
                <>
                  {/* MangaDex results ([SRC-002]: labeled, isolated failures) */}
                  {mdEnabled && committedQ && (
                    <div className="mb-3">
                      <button
                        onClick={() => push({ kind: "source", sourceId: MANGADEX_ID })}
                        className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold text-primary"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>MangaDex</span>
                        <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                      </button>
                      {mdFailed ? (
                        <p className="py-1 text-[11.5px] font-bold text-red-500">{t("md.error")}</p>
                      ) : mdHits === null ? (
                        <p className="py-1 text-[11.5px] font-bold text-muted-foreground">…</p>
                      ) : mdHits.length === 0 ? (
                        <p className="py-1 text-[11.5px] font-bold text-muted-foreground">{t("md.noResults")}</p>
                      ) : (
                        <div className="space-y-2">
                          {mdHits.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => push({ kind: "source", sourceId: MANGADEX_ID, focusMangaId: m.id })}
                              className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-2 text-start"
                            >
                              <span className="h-14 w-11 shrink-0 overflow-hidden rounded-xl bg-secondary">
                                {m.coverUrl ? (
                                  <img src={m.coverUrl} alt={m.title} loading="lazy" className="h-full w-full object-cover" />
                                ) : null}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-extrabold">{m.title}</span>
                                <span className="block truncate text-[11px] font-semibold text-muted-foreground">
                                  {m.author || "MangaDex"} · {t(`type.${m.workType}`)}
                                </span>
                              </span>
                              <span className="shrink-0 rounded-full bg-coral-soft px-3 py-1.5 text-[11.5px] font-extrabold text-primary">
                                {t("src.open")}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {catHits?.map(({ srv, entries }) => (
                    <div key={srv.id} className="mb-3">
                      <button
                        onClick={() => push({ kind: "catalog", serverId: srv.id })}
                        className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold text-primary"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span className="truncate">{srv.name}</span>
                        <ChevronRight className="h-3 w-3 rtl:rotate-180" />
                      </button>
                      <div className="space-y-2">
                        {entries.map((e) => {
                          const added = addedIds.includes(e.id);
                          return (
                            <div
                              key={`${srv.id}-${e.id}`}
                              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-2 text-start"
                            >
                              <EntryCover entry={e} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-extrabold">{e.title}</p>
                                {e.author && (
                                  <p className="truncate text-[11px] font-semibold text-muted-foreground">{e.author}</p>
                                )}
                              </div>
                              <button
                                onClick={() => void addEntry(srv, e)}
                                disabled={added || !e.acquisitionUrl}
                                className={
                                  added
                                    ? "flex h-8 shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-3 text-[11.5px] font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                    : "flex h-8 shrink-0 items-center gap-1 rounded-full bg-coral-gradient px-3 text-[11.5px] font-extrabold text-white shadow-[0_6px_14px_-8px_rgba(248,105,76,0.7)] disabled:opacity-60"
                                }
                              >
                                {added ? t("srv.added") : t("disc.addToLibrary")}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  {/* catalogs without OpenSearch → honest browse links */}
                  {catNoSearch.map((srv) => (
                    <button
                      key={srv.id}
                      onClick={() => push({ kind: "catalog", serverId: srv.id })}
                      className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-2.5 text-start"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral-soft text-primary">
                        <Globe className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-extrabold">{srv.name}</span>
                        <span className="block text-[11px] font-semibold text-muted-foreground">{t("srch.catalogNoSearch")}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-coral-soft px-3 py-1.5 text-[11.5px] font-extrabold text-primary">
                        {t("srch.browseCatalog")}
                      </span>
                    </button>
                  ))}

                  {catHits !== null && catHits.length === 0 && catNoSearch.length === 0 && (
                    <p className="py-2 text-[13px] font-semibold text-muted-foreground">{t("srch.noResults", { q: query.trim() })}</p>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/* lazy cover for a catalog entry (thumbnail → graceful letter tile) */
function EntryCover({ entry }: { entry: OpdsEntry }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    if (!entry.coverUrl) return;
    void (async () => {
      const { opdsFetchBinary } = await import("@/lib/opds");
      const { blobToThumbDataUrl } = await import("@/lib/local-files");
      const f = await opdsFetchBinary(entry.coverUrl, "cover");
      if (!f || !alive) return;
      const url = await blobToThumbDataUrl(f).catch(() => "");
      if (alive && url) setSrc(url);
    })();
    return () => {
      alive = false;
    };
  }, [entry.coverUrl]);
  return <WorkCover src={src} color="from-orange-500 to-rose-900" title={entry.title} className="h-14 w-11 rounded-xl" sizes="44px" />;
}
