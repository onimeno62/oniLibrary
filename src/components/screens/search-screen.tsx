"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Globe, RefreshCw, Plus, ChevronRight, Sparkles, WifiOff } from "lucide-react";
import { WorkCover, EmptyState } from "@/components/shared";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { opdsSearchTemplate, searchOpds } from "@/lib/opds";
import { importOpdsEntry } from "@/lib/opds-import";
import { mdSearch } from "@/lib/mangadex";
import { MANGADEX_ID } from "@/lib/builtin-sources";
import { makeRunGuard } from "@/lib/search-contract";
import { MdCover } from "@/components/sources/free-catalogs";
import type { ServerEntry } from "@/lib/types";
import type { OpdsEntry } from "@/lib/opds";
import type { MdManga } from "@/lib/mangadex";

interface CatalogHit {
  srv: ServerEntry;
  entries: OpdsEntry[];
}

/** a source that was queried and failed — surfaced per plan §7 with a retry */
interface FailedSource {
  id: string;
  label: string;
  error: string;
}

export function SearchScreen() {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const servers = useApp((s) => s.servers);
  /* plan §10 (Phase 5): disabled catalogs are skipped entirely — their
     config is preserved but they contribute no search work */
  const activeServers = useMemo(() => servers.filter((s) => s.enabled !== false), [servers]);
  const addWork = useApp((s) => s.addWork);
  const offlineMode = useApp((s) => s.settings.offlineMode);
  const pop = useNav((s) => s.pop);
  const openWork = useNav((s) => s.openWork);
  const push = useNav((s) => s.push);
  const [query, setQuery] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [browserOffline, setBrowserOffline] = useState(false);

  /* catalog search results (real OpenSearch queries, v1.2.2) + MangaDex (v1.3.0) */
  const [catHits, setCatHits] = useState<CatalogHit[]>([]);
  const [catNoSearch, setCatNoSearch] = useState<ServerEntry[]>([]);
  const [catFailed, setCatFailed] = useState<FailedSource[]>([]);
  /** the committed term the current result sets belong to — results are
   *  only rendered for it, so an older term can never masquerade (§7) */
  const [resultsFor, setResultsFor] = useState("");
  const [searchingCats, setSearchingCats] = useState(false);
  const [addedKeys, setAddedKeys] = useState<string[]>([]);
  const [mdHits, setMdHits] = useState<MdManga[]>([]);
  const [mdFailed, setMdFailed] = useState(false);

  /* latest-wins guard: a response from an older committed term is dropped */
  const runs = useRef(makeRunGuard());

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* plan §7 "Fix debounce cleanup": leaving the screen must not fire the
     pending commit (which would run a search nobody sees) */
  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    },
    []
  );

  const q = query.trim().toLowerCase();

  const onQueryChange = (v: string) => {
    setQuery(v);
    const qq = v.trim();
    if (commitTimer.current) clearTimeout(commitTimer.current);
    if (qq) {
      commitTimer.current = setTimeout(() => setCommittedQ(qq), 900);
    } else {
      // keyboard AND clear-button path both land here: pending debounce work
      // is cancelled and the committed term resets — cleared queries cannot
      // resurrect old results (plan §6/§7)
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
  const offline = offlineMode || browserOffline;

  useEffect(() => {
    const sync = () => setBrowserOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    const term = committedQ;
    let alive = true;
    const run = runs.current.start();
    const current = () => alive && runs.current.isCurrent(run);
    const resetAll = () => {
      if (!alive) return;
      setCatHits([]);
      setCatNoSearch([]);
      setCatFailed([]);
      setMdHits([]);
      setMdFailed(false);
      setSearchingCats(false);
      setResultsFor("");
    };
    if (!term || (activeServers.length === 0 && !mdEnabled)) {
      resetAll();
      return;
    }
    if (offline) {
      // honest offline state — no network calls, no fake "no results" (§6)
      if (alive) {
        setCatHits([]);
        setCatNoSearch([]);
        setCatFailed([]);
        setMdHits([]);
        setMdFailed(false);
        setSearchingCats(false);
        setResultsFor(term);
      }
      return;
    }
    if (alive) {
      setSearchingCats(true);
      setResultsFor(term);
      setCatHits([]);
      setCatNoSearch([]);
      setCatFailed([]);
      setMdHits([]);
      setMdFailed(false); // a fresh run clears stale failures (Phase 1 S2)
    }
    let pending = (mdEnabled ? 1 : 0) + activeServers.length;
    const settle = () => {
      pending -= 1;
      if (pending <= 0 && current()) setSearchingCats(false);
    };
    // MangaDex runs in parallel with the OPDS catalogs — one source failing
    // never blocks the others ([SRC-002]); every response passes the guard
    if (mdEnabled) {
      mdSearch(term, 0)
        .then((list) => {
          if (current()) setMdHits(list.slice(0, 6));
        })
        .catch(() => {
          if (current()) setMdFailed(true);
        })
        .finally(settle);
    }
    for (const srv of activeServers) {
      void (async () => {
        try {
          const template = await opdsSearchTemplate(srv);
          if (!template) {
            if (current()) setCatNoSearch((p) => (p.some((x) => x.id === srv.id) ? p : [...p, srv]));
            return;
          }
          const feed = await searchOpds(template, term);
          if (current() && feed.entries.length > 0) {
            // progressive: this catalog's results show as soon as they land,
            // while the others are still in flight (Phase 1 S8)
            setCatHits((prev) =>
              current() && !prev.some((h) => h.srv.id === srv.id)
                ? [...prev, { srv, entries: feed.entries.slice(0, 6) }]
                : prev
            );
          }
        } catch (e) {
          if (current()) {
            const error = e instanceof Error ? e.message : String(e);
            setCatFailed((p) => (p.some((f) => f.id === srv.id) ? p : [...p, { id: srv.id, label: srv.name, error }]));
          }
        } finally {
          settle();
        }
      })();
    }
    return () => {
      alive = false;
    };
  }, [committedQ, activeServers, mdEnabled, offline, retryTick]);

  const addEntry = async (srv: ServerEntry, entry: OpdsEntry) => {
    const key = `${srv.id}::${entry.id}`; // entry ids are only unique per catalog
    if (addedKeys.includes(key)) return;
    try {
      const work = await importOpdsEntry(srv, entry);
      addWork(work);
      setAddedKeys((a) => [...a, key]);
      toast({ title: t("imp.added", { n: 1 }), description: entry.title });
    } catch (e) {
      toast({
        title: t("srv.importFail"),
        description: (e as Error).message?.slice(0, 80),
        variant: "destructive",
      });
    }
  };

  const showResults = resultsFor !== "" && resultsFor === committedQ;
  const nothingFound =
    showResults &&
    !searchingCats &&
    !mdFailed &&
    mdHits.length === 0 &&
    catHits.length === 0 &&
    catNoSearch.length === 0 &&
    catFailed.length === 0;

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
        <div
          className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]"
          role="search"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t("srch.placeholder")}
            aria-label={t("srch.placeholder")}
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => onQueryChange("")}
              aria-label={t("srch.clear")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8 thin-scrollbar" aria-live="polite">
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

              {offline && q ? (
                <div className="mt-2 flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-card/50 p-5 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-coral-soft text-primary">
                    <WifiOff className="h-4.5 w-4.5" />
                  </span>
                  <span className="text-[13px] font-extrabold">{t("srch.offlineTitle")}</span>
                  <span className="text-[11.5px] font-semibold text-muted-foreground">{t("srch.offlineHint")}</span>
                  <button
                    onClick={() => setRetryTick((n) => n + 1)}
                    className="mt-1 flex h-9 items-center gap-1.5 rounded-full bg-coral-soft px-4 text-[12px] font-extrabold text-primary"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("srch.retry")}
                  </button>
                </div>
              ) : activeServers.length === 0 && !mdEnabled ? (
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
              ) : (
                <>
                  {/* compact live indicator — results below stay visible while
                      further sources are still in flight (Phase 1 S8) */}
                  {searchingCats && showResults && (
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-bold text-muted-foreground" role="status">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                      {t("srch.searchingCatalogs")}
                    </div>
                  )}

                  {/* per-source failures with retry — never swallowed (Phase 1 S3) */}
                  {catFailed.length > 0 && (
                    <div className="mb-3 space-y-1.5" role="alert">
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-red-500">
                        {t("srch.failedSources")}
                      </p>
                      {catFailed.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/5 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-extrabold">{f.label}</span>
                            <span className="block truncate text-[10.5px] font-semibold text-muted-foreground">
                              {f.error}
                            </span>
                          </span>
                          <button
                            onClick={() => setRetryTick((n) => n + 1)}
                            aria-label={`${t("srch.retry")} ${f.label}`}
                            className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-coral-soft px-3 text-[11px] font-extrabold text-primary"
                          >
                            <RefreshCw className="h-3 w-3" />
                            {t("srch.retry")}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

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
                        <div className="flex items-center gap-2 py-1">
                          <p className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-red-500">{t("md.error")}</p>
                          <button
                            onClick={() => setRetryTick((n) => n + 1)}
                            aria-label={t("srch.retry")}
                            className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-coral-soft px-3 text-[11px] font-extrabold text-primary"
                          >
                            <RefreshCw className="h-3 w-3" />
                            {t("srch.retry")}
                          </button>
                        </div>
                      ) : mdHits.length === 0 ? (
                        <p className="py-1 text-[11.5px] font-bold text-muted-foreground">
                          {searchingCats ? "…" : t("md.noResults")}
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {mdHits.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => push({ kind: "source", sourceId: MANGADEX_ID, focusMangaId: m.id })}
                              className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-2 text-start"
                            >
                              <span className="h-14 w-11 shrink-0 overflow-hidden rounded-xl bg-secondary">
                                {/* bridge-aware loader — raw <img> fails in the
                                    APK where the CDN refuses the WebView UA (S10) */}
                                <MdCover url={m.coverUrl} title={m.title} className="" />
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

                  {showResults &&
                    catHits.map(({ srv, entries }) => (
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
                            const added = addedKeys.includes(`${srv.id}::${e.id}`);
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
                  {showResults &&
                    catNoSearch.map((srv) => (
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

                  {nothingFound && (
                    <p className="py-2 text-[13px] font-semibold text-muted-foreground">{t("srch.noResults", { q: committedQ })}</p>
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
