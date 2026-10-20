"use client";

/**
 * SourceScreen (v1.3.0) — real MangaDex browse/search/download ([SRC-001..003],
 * [DWN-001]). The first party-built online source: popular/latest feeds,
 * relevance search, per-chapter selection and a page-level download pipeline
 * that lands the chapters straight into the local library (same IndexedDB
 * page keys the reader already uses).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Search, X, Download, Check, Globe, BookOpen, LibraryBig, SlidersHorizontal } from "lucide-react";
import { OverlayHeader, EmptyState, Chip } from "@/components/shared";
import { MdCover } from "@/components/sources/free-catalogs";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  mdPopularFeed,
  mdLatestFeed,
  mdSearchFeed,
  mdManga,
  mdChapters,
  mdChapterLabel,
  addMangaDexToLibrary,
  mdCoverThumbDataUrl,
  type MdManga,
  type MdChapter,
} from "@/lib/mangadex";
import { enqueueMangaDexChapterDownloads } from "@/lib/bg-downloads";
import { MANGADEX_ID } from "@/lib/builtin-sources";
import { dedupeBy, resolveAddTarget } from "@/lib/search-contract";
import { MdFilterSheet, activeFilterCount } from "@/components/sources/md-filter-sheet";
import type { Work, MdFeedFilters } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

/* ---------------- detail / add sheet ---------------- */

function MdSheet({
  manga,
  onClose,
  onAdded,
}: {
  manga: MdManga;
  onClose: () => void;
  onAdded: (w: Work) => void;
}) {
  const { t } = useT();
  const addWork = useApp((s) => s.addWork);
  const push = useNav((s) => s.push);

  const [chapters, setChapters] = useState<MdChapter[] | null>(null);
  const [chErr, setChErr] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // render-phase reset when a different manga is opened (no setState-in-effect)
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (loadedFor !== manga.id) {
    setLoadedFor(manga.id);
    setChapters(null);
    setChErr(false);
    setPicked(new Set());
  }

  useEffect(() => {
    let alive = true;
    mdChapters(manga.id, 60)
      .then((list) => {
        if (!alive) return;
        setChapters(list);
      })
      .catch(() => alive && setChErr(true));
    return () => {
      alive = false;
    };
  }, [manga.id]);

  const toggle = (id: string) => {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const statusKey = `md.status.${manga.status}` as TranslationKey;

  const addToLibrary = async (downloadToo: boolean) => {
    if (busy || !chapters) return;
    const selected = chapters.filter((c) => picked.has(c.id));
    if (downloadToo && selected.length === 0) return;
    setBusy(true);
    try {
      // plan §8: repeated adds are idempotent — if this manga is already in
      // the library, reuse that work instead of minting a duplicate (T6).
      // When chapters were picked, the downloads attach to the existing work.
      const existing = resolveAddTarget(useApp.getState().works, {
        sourceId: "mangadex",
        itemId: manga.id,
      });
      let work: Work;
      if (existing) {
        work = existing;
        if (!downloadToo) {
          toast({ title: t("md.alreadyInLibrary"), description: work.title });
          setBusy(false);
          onAdded(work);
          onClose();
          return;
        }
      } else {
        // fast path: metadata + streamable chapter rows (no pages fetched);
        // the cover thumbnail is patched in afterwards (never blocks the add)
        work = await addMangaDexToLibrary(manga, chapters);
        addWork(work);
        void mdCoverThumbDataUrl(manga.coverUrl).then((cover) => {
          if (cover) useApp.getState().updateWork(work.id, { cover });
        });
      }
      if (downloadToo) {
        // pages flow in the background — the Downloads screen shows the
        // real per-chapter progress; nothing blocks this dialog. Jobs are
        // resolved through sourceChapterId (stable upstream identity), not
        // positional indexes, so they survive chapter-list mutation.
        const target = useApp.getState().works.find((x) => x.id === work.id) ?? work;
        const bySource = new Map(target.chapters.map((c, i) => [c.sourceChapterId, i]));
        const jobs = selected
          .map((c) => ({ chapterIndex: bySource.get(c.id) ?? -1, md: c }))
          .filter((j) => j.chapterIndex >= 0)
          .filter((j) => target.chapters[j.chapterIndex].download !== "DONE");
        if (jobs.length > 0) {
          enqueueMangaDexChapterDownloads(target, jobs);
          toast({ title: t("md.bgDownloading", { n: jobs.length }), description: work.title });
        } else {
          toast({ title: t("md.alreadyInLibrary"), description: work.title });
        }
      } else {
        toast({ title: t("md.added"), description: work.title });
      }
      setBusy(false);
      onAdded(work);
      onClose();
    } catch (e) {
      setBusy(false);
      toast({
        title: t("md.importFailed"),
        description: (e as Error).message?.slice(0, 80),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-[400px] rounded-3xl border-border bg-card p-0" style={{ maxWidth: 400 }}>
        <div className="max-h-[80vh] overflow-y-auto thin-scrollbar">
            {/* head */}
            <div className="flex gap-3 p-4 pb-3">
              <div className="h-[132px] w-[92px] shrink-0 overflow-hidden rounded-2xl bg-secondary shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]">
                <MdCover url={manga.coverUrl} title={manga.title} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[16px] font-extrabold leading-snug">{manga.title}</DialogTitle>
                {manga.author && (
                  <p className="mt-0.5 truncate text-[12px] font-semibold text-muted-foreground">{manga.author}</p>
                )}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-coral-soft px-2 py-0.5 text-[9.5px] font-black text-primary">
                    {t(`type.${manga.workType}`)}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[9.5px] font-black text-secondary-foreground">
                    {t(statusKey)}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[9.5px] font-black text-secondary-foreground">
                    EN
                  </span>
                </div>
                {manga.tags.length > 0 && (
                  <p className="mt-1.5 line-clamp-1 text-[10.5px] font-semibold text-muted-foreground" dir="ltr">
                    {manga.tags.slice(0, 4).join(" · ")}
                  </p>
                )}
              </div>
            </div>

            {/* description */}
            {manga.description && (
              <p className="mx-4 mb-3 line-clamp-4 text-[12px] font-medium leading-relaxed text-muted-foreground" dir="auto">
                {manga.description}
              </p>
            )}

            {/* chapters */}
            <div className="px-4 pb-2">
              <p className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {t("md.chapters")}
              </p>
              {chapters === null && !chErr && (
                <p className="flex items-center gap-2 py-4 text-[12.5px] font-bold text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {t("common.loading")}
                </p>
              )}
              {chErr && (
                <p className="py-3 text-[12.5px] font-bold text-red-500">{t("md.chapterError")}</p>
              )}
              {chapters !== null && chapters.length === 0 && (
                <p className="py-3 text-[12.5px] font-bold text-muted-foreground">{t("md.noChapters")}</p>
              )}
              {chapters && chapters.length > 0 && (
                <>
                  {/* quick picks [DWN-001] */}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => setPicked(new Set(chapters.slice(0, 10).map((c) => c.id)))}
                      className="flex min-h-11 items-center rounded-full bg-secondary px-4 text-[11.5px] font-bold text-secondary-foreground transition-colors hover:bg-accent"
                    >
                      {t("md.latest10")}
                    </button>
                    <button
                      onClick={() => setPicked(new Set(chapters.map((c) => c.id)))}
                      className="flex min-h-11 items-center rounded-full bg-secondary px-4 text-[11.5px] font-bold text-secondary-foreground transition-colors hover:bg-accent"
                    >
                      {t("md.all")} ({chapters.length})
                    </button>
                    {picked.size > 0 && (
                      <button
                        onClick={() => setPicked(new Set())}
                        className="ms-auto text-[11px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        {t("md.clear")}
                      </button>
                    )}
                  </div>

                  <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-border/60 p-2 thin-scrollbar">
                    {chapters.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-secondary/60"
                      >
                        <Checkbox
                          checked={picked.has(c.id)}
                          onCheckedChange={() => toggle(c.id)}
                          className="data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                        />
                        <span className="min-w-0 flex-1 truncate text-[12px] font-bold" dir="ltr">
                          {mdChapterLabel(c)}
                        </span>
                        <span className="shrink-0 text-[10px] font-semibold text-muted-foreground">
                          {c.pages}p
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* actions — add to library first (v1.4.0): the work lands in the
                library instantly with streamable chapters; downloads are
                optional, per-chapter, and run in the background */}
            <div className="space-y-2 p-4 pt-2">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => void addToLibrary(false)}
                  disabled={busy || !chapters || chapters.length === 0}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background py-2.5 text-[13px] font-extrabold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LibraryBig className="h-4 w-4" />}
                  {t("md.addToLibrary")}
                </button>
                <button
                  onClick={() => void addToLibrary(true)}
                  disabled={busy || picked.size === 0}
                  className="flex flex-[1.2] items-center justify-center gap-2 rounded-full bg-coral-gradient py-2.5 text-[13px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)] transition-transform active:scale-[0.98] disabled:opacity-50"
                >
                  {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t("md.addDownloadN", { n: picked.size })}
                </button>
              </div>
              <p className="text-center text-[10.5px] font-semibold leading-snug text-muted-foreground">
                {t("md.bgHint")}
              </p>
            </div>
            {/* footer link keeps the honest source reference [SRC-003] */}
            <p className="pb-3 text-center text-[10.5px] font-semibold text-muted-foreground" dir="ltr">
              MangaDex.org · {t("md.langNote")}
            </p>
          </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- browse grid ---------------- */

export function SourceScreen({
  sourceId,
  focusMangaId,
  initialFilters,
}: {
  sourceId: string;
  focusMangaId?: string;
  initialFilters?: MdFeedFilters;
}) {
  const { t } = useT();
  const disabled = useApp((s) => s.builtinDisabled.includes(MANGADEX_ID));
  const push = useNav((s) => s.push);

  const [tab, setTab] = useState<"popular" | "latest">("popular");
  const [query, setQuery] = useState("");
  const [ranQuery, setRanQuery] = useState("");
  const [items, setItems] = useState<MdManga[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [pageError, setPageError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const [sheetFor, setSheetFor] = useState<MdManga | null>(null);
  /* plan §6: a real filter panel — server-side MangaDex filters (type/status/genre) */
  const [filters, setFilters] = useState<MdFeedFilters>(initialFilters ?? {});
  const [filterOpen, setFilterOpen] = useState(false);
  const focusDone = useRef(false);
  /* latest-wins: a slow response from an older tab/page/query must never
     commit into a newer view (plan §7; Phase 1 finding T1) */
  const runSeq = useRef(0);

  const runLoad = useCallback(
    async (which: "popular" | "latest" | "search", p: number, q: string) => {
      const seq = ++runSeq.current;
      const current = () => seq === runSeq.current;
      if (p === 0) setLoading(true);
      else setMore(true);
      setError(false);
      setPageError(false);
      try {
        // total-aware feed variants — "load more" is driven by the server's
        // total instead of the `items.length % 24` guess (Phase 1 finding T7)
        const feed =
          which === "search"
            ? await mdSearchFeed(q, p, filters)
            : which === "latest"
              ? await mdLatestFeed(p, filters)
              : await mdPopularFeed(p, filters);
        if (!current()) return; // stale response — drop it
        setTotal(feed.total);
        setItems((prev) => {
          const merged = p === 0 ? feed.list : [...prev, ...feed.list];
          // dedup across pages: provider feeds shift between requests, so
          // the same title can land twice (plan §7; Phase 1 finding T2)
          return dedupeBy(merged, (m) => m.id);
        });
        setPage(p);
      } catch {
        if (!current()) return;
        setError(true);
        if (p === 0) {
          setItems([]);
        } else {
          // failed "load more" must be visible and retryable (Phase 1 T3)
          setPageError(true);
        }
      } finally {
        if (current()) {
          setLoading(false);
          setMore(false);
        }
      }
    },
    [filters]
  );

  useEffect(() => {
    if (disabled) return;
    const which = ranQuery ? "search" : tab;
    void runLoad(which, 0, ranQuery);
  }, [disabled, tab, ranQuery, runLoad]);

  /* deep link from the global search — open the sheet for one manga */
  useEffect(() => {
    if (!focusMangaId || focusDone.current) return;
    focusDone.current = true;
    mdManga(focusMangaId)
      .then((m) => {
        if (m) setSheetFor(m);
      })
      .catch(() => undefined);
  }, [focusMangaId]);

  const runSearch = () => {
    const q = query.trim();
    setRanQuery(q);
  };

  const clearSearch = () => {
    setQuery("");
    setRanQuery("");
  };

  if (disabled) {
    return (
      <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
        <OverlayHeader title="MangaDex" />
        <EmptyState icon={<Globe className="h-6 w-6" />} title={t("md.disabled")} hint={t("md.disabledHint")} />
        <button
          onClick={() => push({ kind: "extensions" })}
          className="mx-auto mt-2 flex items-center gap-2 rounded-full bg-coral-gradient px-5 py-2.5 text-[13px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)]"
        >
          <Check className="h-4 w-4" />
          {t("md.enableIn")}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
      <OverlayHeader
        title="MangaDex"
        subtitle={t("md.subtitle")}
        right={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-soft text-primary">
            <Globe className="h-5 w-5" />
          </span>
        }
      />

      {/* search */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder={t("md.searchHint")}
            aria-label={t("md.searchHint")}
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={clearSearch}
              aria-label={t("srch.clear")}
              className="-me-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          onClick={runSearch}
          disabled={!query.trim()}
          aria-label={t("common.search")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-coral-gradient text-white shadow-[0_8px_20px_-10px_rgba(248,105,76,0.7)] transition-transform active:scale-95 disabled:opacity-50"
        >
          <Search className="h-4.5 w-4.5" />
        </button>
        {/* plan §6: the filter button opens an actual filter UI */}
        <button
          onClick={() => setFilterOpen(true)}
          aria-label={t("flt.title")}
          className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
          {activeFilterCount(filters) > 0 && (
            <span
              aria-hidden
              className="absolute -end-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[9.5px] font-black text-primary-foreground"
            >
              {activeFilterCount(filters)}
            </span>
          )}
        </button>
      </div>

      {/* active filters — visible and removable, never silent (§6) */}
      {activeFilterCount(filters) > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <Chip
            active
            onClick={() => setFilters({})}
          >
            {t("flt.active", { n: activeFilterCount(filters) })}
            <X className="ms-1 inline h-3 w-3" />
          </Chip>
        </div>
      )}

      {/* tabs / search state */}
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {ranQuery ? (
          <Chip active onClick={clearSearch}>
            {t("md.resultsFor", { q: ranQuery })} <X className="ms-1 inline h-3 w-3" />
          </Chip>
        ) : (
          <>
            <Chip active={tab === "popular"} onClick={() => setTab("popular")}>
              {t("md.popular")}
            </Chip>
            <Chip active={tab === "latest"} onClick={() => setTab("latest")}>
              {t("md.latest")}
            </Chip>
          </>
        )}
      </div>

      {/* grid */}
      {loading && items.length === 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-secondary/70" style={{ aspectRatio: "2/3" }} />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <div className="mt-4">
          <EmptyState icon={<Globe className="h-6 w-6" />} title={t("md.error")} hint="api.mangadex.org" />
          <button
            onClick={() => void runLoad(ranQuery ? "search" : tab, 0, ranQuery)}
            className="mx-auto mt-2 flex items-center gap-2 rounded-full border border-border px-5 py-2 text-[12.5px] font-extrabold transition-colors hover:bg-secondary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("common.retry")}
          </button>
        </div>
      ) : items.length === 0 && !loading ? (
        <div className="mt-4">
          <EmptyState icon={<Search className="h-6 w-6" />} title={t("md.noResults")} />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {items.map((m) => (
              <button
                key={m.id}
                onClick={() => setSheetFor(m)}
                className="group text-start"
              >
                <div
                  className={cn(
                    "relative overflow-hidden rounded-2xl bg-secondary shadow-[0_10px_22px_-14px_rgba(43,36,29,0.55)]",
                    "transition-transform group-active:scale-[0.97]"
                  )}
                  style={{ aspectRatio: "2/3" }}
                >
                  <MdCover url={m.coverUrl} title={m.title} className="absolute inset-0" />
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11.5px] font-extrabold leading-tight">{m.title}</p>
              </button>
            ))}
          </div>

          {/* inline retry for a failed "load more" — invisible errors are
              a contract violation (Phase 1 finding T3) */}
          {pageError && items.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/5 px-3 py-2">
              <p className="text-[12px] font-bold text-red-500">{t("md.error")}</p>
              <button
                onClick={() => void runLoad(ranQuery ? "search" : tab, page + 1, ranQuery)}
                className="flex h-8 items-center gap-1 rounded-full bg-coral-soft px-3 text-[11px] font-extrabold text-primary"
              >
                <RefreshCw className="h-3 w-3" />
                {t("common.retry")}
              </button>
            </div>
          )}

          {/* load more — offered while the server still has matches (total) */}
          {items.length > 0 && !pageError && total > items.length && (
            <button
              onClick={() => void runLoad(ranQuery ? "search" : tab, page + 1, ranQuery)}
              disabled={more}
              className="mx-auto mt-5 flex items-center gap-2 rounded-full border border-border px-5 py-2 text-[12.5px] font-extrabold transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 text-primary", more && "animate-spin")} />
              {t("srv.loadMore")}
            </button>
          )}
        </>
      )}

      {/* detail + download sheet */}
      {sheetFor && (
        <MdSheet
          manga={sheetFor}
          onClose={() => setSheetFor(null)}
          onAdded={(w) => push({ kind: "details", workId: w.id })}
        />
      )}

      {/* plan §6: real filter sheet (server-side MangaDex filters) */}
      <MdFilterSheet
        open={filterOpen}
        onOpenChange={setFilterOpen}
        value={filters}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
        }}
      />
    </div>
  );
}
