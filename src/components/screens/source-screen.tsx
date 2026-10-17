"use client";

/**
 * SourceScreen (v1.3.0) — real MangaDex browse/search/download ([SRC-001..003],
 * [DWN-001]). The first party-built online source: popular/latest feeds,
 * relevance search, per-chapter selection and a page-level download pipeline
 * that lands the chapters straight into the local library (same IndexedDB
 * page keys the reader already uses).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Search, X, Download, Check, Globe, BookOpen } from "lucide-react";
import { OverlayHeader, EmptyState, ProgressBar, Chip } from "@/components/shared";
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
  mdPopular,
  mdLatest,
  mdSearch,
  mdManga,
  mdChapters,
  mdChapterLabel,
  importMangaDexWork,
  type MdManga,
  type MdChapter,
  type MdImportProgress,
} from "@/lib/mangadex";
import { MANGADEX_ID } from "@/lib/builtin-sources";
import type { Work } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

/* ---------------- detail / download sheet ---------------- */

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
  const [importing, setImporting] = useState(false);
  const [prog, setProg] = useState<MdImportProgress | null>(null);

  useEffect(() => {
    let alive = true;
    setChapters(null);
    setChErr(false);
    setPicked(new Set());
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

  const pct = prog
    ? Math.round(((prog.chapterDone + (prog.pageTotal > 0 ? prog.pageDone / prog.pageTotal : 0)) / prog.chapterTotal) * 100)
    : 0;

  const runImport = async () => {
    if (importing || !chapters) return;
    const selected = chapters.filter((c) => picked.has(c.id));
    if (selected.length === 0) return;
    setImporting(true);
    setProg(null);
    try {
      const work = await importMangaDexWork(manga, selected, setProg);
      addWork(work);
      toast({ title: t("md.imported"), description: work.title });
      onAdded(work);
      onClose();
    } catch (e) {
      toast({
        title: t("md.importFailed"),
        description: (e as Error).message?.slice(0, 80),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      setProg(null);
    }
  };

  const statusKey = `md.status.${manga.status}` as TranslationKey;

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !importing) onClose();
      }}
    >
      <DialogContent className="max-w-[400px] rounded-3xl border-border bg-card p-0" style={{ maxWidth: 400 }}>
        {importing ? (
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="text-[16px] font-extrabold">{t("md.downloading")}</DialogTitle>
            </DialogHeader>
            <p className="mt-2 truncate text-[12px] font-bold text-muted-foreground" dir="ltr">
              {prog?.chapterLabel ?? manga.title}
            </p>
            <ProgressBar value={pct} className="mt-3" />
            <p className="mt-2 text-[11px] font-bold text-muted-foreground">
              {pct}% · {t("md.pageCount", { p: (prog?.pageDone ?? 0) + (prog && prog.pageTotal > 0 ? 1 : 0), total: prog?.pageTotal ?? 0 })}
            </p>
            <p className="mt-3 text-[11px] font-semibold text-muted-foreground">{t("md.keepOpen")}</p>
          </div>
        ) : (
          <div className="max-h-[80vh] overflow-y-auto thin-scrollbar">
            {/* head */}
            <div className="flex gap-3 p-4 pb-3">
              <div className="h-[132px] w-[92px] shrink-0 overflow-hidden rounded-2xl bg-secondary shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]">
                {manga.coverUrl ? (
                  <img src={manga.coverUrl} alt={manga.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-coral-soft text-primary">
                    <BookOpen className="h-6 w-6" />
                  </div>
                )}
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
                      className="rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-secondary-foreground transition-colors hover:bg-accent"
                    >
                      {t("md.latest10")}
                    </button>
                    <button
                      onClick={() => setPicked(new Set(chapters.map((c) => c.id)))}
                      className="rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-secondary-foreground transition-colors hover:bg-accent"
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

            {/* actions */}
            <div className="flex items-center gap-2.5 p-4 pt-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-full border border-border bg-background py-2.5 text-[13px] font-extrabold text-foreground transition-colors hover:bg-secondary"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void runImport()}
                disabled={picked.size === 0}
                className="flex flex-[1.4] items-center justify-center gap-2 rounded-full bg-coral-gradient py-2.5 text-[13px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)] transition-transform active:scale-[0.98] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {t("md.downloadN", { n: picked.size })}
              </button>
            </div>
            {/* footer link keeps the honest source reference [SRC-003] */}
            <p className="pb-3 text-center text-[10.5px] font-semibold text-muted-foreground" dir="ltr">
              MangaDex.org · {t("md.langNote")}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- browse grid ---------------- */

export function SourceScreen({ sourceId, focusMangaId }: { sourceId: string; focusMangaId?: string }) {
  const { t } = useT();
  const disabled = useApp((s) => s.builtinDisabled.includes(MANGADEX_ID));
  const push = useNav((s) => s.push);

  const [tab, setTab] = useState<"popular" | "latest">("popular");
  const [query, setQuery] = useState("");
  const [ranQuery, setRanQuery] = useState("");
  const [items, setItems] = useState<MdManga[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(false);
  const [sheetFor, setSheetFor] = useState<MdManga | null>(null);
  const focusDone = useRef(false);

  const runLoad = useCallback(
    async (which: "popular" | "latest" | "search", p: number, q: string) => {
      if (p === 0) setLoading(true);
      else setMore(true);
      setError(false);
      try {
        const list =
          which === "search"
            ? await mdSearch(q, p)
            : which === "latest"
              ? await mdLatest(p)
              : await mdPopular(p);
        setItems((prev) => (p === 0 ? list : [...prev, ...list]));
        setPage(p);
      } catch {
        setError(true);
        if (p === 0) setItems([]);
      } finally {
        setLoading(false);
        setMore(false);
      }
    },
    []
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
      <div className="min-h-full px-5 pb-8">
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
    <div className="min-h-full px-5 pb-8">
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
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={clearSearch} aria-label={t("srch.clear")}>
              <X className="h-4 w-4 text-muted-foreground" />
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
      </div>

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
                  {m.coverUrl ? (
                    <img
                      src={m.coverUrl}
                      alt={m.title}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-coral-soft text-primary">
                      <BookOpen className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11.5px] font-extrabold leading-tight">{m.title}</p>
              </button>
            ))}
          </div>

          {/* load more (24/page) */}
          {!ranQuery && items.length > 0 && items.length % 24 === 0 && (
            <button
              onClick={() => void runLoad(tab, page + 1, "")}
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
    </div>
  );
}
