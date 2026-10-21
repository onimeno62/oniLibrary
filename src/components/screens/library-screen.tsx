"use client";

import { useMemo, useRef, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Plus,
  MoreHorizontal,
  Check,
  Pause,
  CheckCircle2,
  Import,
  Compass,
  ChevronDown,
  X,
  FolderPlus,
  FolderTree,
  ShieldCheck,
  Heart,
  Trash2,
  Bookmark,
  Sparkles,
  Loader2,
  Images,
  FileArchive,
  FileText,
  BookOpen,
  Download,
} from "lucide-react";
import { SectionHeader, WorkCover, ProgressBar, EmptyState } from "@/components/shared";
import { useApp, useNav, workProgress, workSizeBytes, currentChapter, matchesRule } from "@/lib/store";
import { enqueueMangaDexChapterDownloads } from "@/lib/bg-downloads";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import {
  buildFolderPreview,
  importFolderCommit,
  UNSUPPORTED_REASON_KEYS,
  type FolderPreview,
  type FolderItemTreatment,
  type FolderItemPlan,
} from "@/lib/importer";
import { ImportDestinationDialog } from "@/components/import/import-destination-dialog";
import { findDuplicateGroups } from "@/lib/duplicates";
import { deleteWorkFiles } from "@/lib/local-files";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import type { Work, ReadingStatus, LibraryFilterSnapshot, SmartRule } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

type TypeFilter = "ALL" | "MANGA" | "COMIC" | "BOOK" | "PDF";
type SortKey = "lastRead" | "title" | "added" | "progress" | "latest" | "size";

export function LibraryScreen() {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const categories = useApp((s) => s.categories);
  const workCategories = useApp((s) => s.workCategories);
  const sources = useApp((s) => s.sources);
  const openWork = useNav((s) => s.openWork);
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [sort, setSort] = useState<SortKey>("lastRead");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | null>(null);
  // Phase C (LIB-005): content-language filter — options derive from what
  // the library actually contains (honest; empty libraries show no options)
  const [langFilter, setLangFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [smartRule, setSmartRule] = useState<{ name: string; rule: SmartRule } | null>(null);
  const [bulkPick, setBulkPick] = useState<null | "category" | "status">(null);
  const savedFilters = useApp((s) => s.savedFilters);
  const density = useApp((s) => s.settings.libraryDensity);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  /* file import (v1.2.1): the destination dialog asks existing vs new work */
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);

  /* folder import (v1.2.1): review plan → per-item treatment → commit */
  const [folderPreview, setFolderPreview] = useState<FolderPreview | null>(null);
  const [folderTitle, setFolderTitle] = useState("");
  const [folderBusy, setFolderBusy] = useState(false);
  const [itemTreatments, setItemTreatments] = useState<Record<string, FolderItemTreatment>>({});
  const [itemTitles, setItemTitles] = useState<Record<string, string>>({});

  /** snapshot of every chip/checkbox that a saved filter restores */
  const snapshotFilters = (): LibraryFilterSnapshot => ({
    type: typeFilter,
    status: statusFilter,
    source: sourceFilter,
    downloadedOnly,
    unreadOnly,
    sort,
    lang: langFilter,
  });

  const applySnapshot = (f: LibraryFilterSnapshot) => {
    setTypeFilter(f.type);
    setStatusFilter(f.status);
    setSourceFilter(f.source);
    setDownloadedOnly(f.downloadedOnly);
    setUnreadOnly(f.unreadOnly);
    setSort(f.sort);
    setLangFilter(f.lang ?? null); // pre-Phase-C snapshots have no lang
  };

  const anyFilterActive =
    typeFilter !== "ALL" || statusFilter !== null || sourceFilter !== null || langFilter !== null || downloadedOnly || unreadOnly;

  /** current filters equal to a saved filter? (highlight chip) */
  const sameFilter = (a: LibraryFilterSnapshot, b: LibraryFilterSnapshot) =>
    a.type === b.type &&
    a.status === b.status &&
    a.source === b.source &&
    a.downloadedOnly === b.downloadedOnly &&
    a.unreadOnly === b.unreadOnly &&
    a.sort === b.sort &&
    (a.lang ?? null) === (b.lang ?? null);

  // highlight follows live state (also when the user tweaks chips manually)
  const liveSnapshot = snapshotFilters();
  const activeSaved = savedFilters.find((f) => sameFilter(f.filter, liveSnapshot)) ?? null;

  /** Phase C (LIB-007): bulk download — queue the next unread, not-yet-
      downloaded chapter of every selected source work. Honest summary:
      works with nothing downloadable are counted, never silently ignored. */
  const bulkDownload = (ids: string[]) => {
    const st = useApp.getState();
    let queued = 0;
    let skipped = 0;
    for (const id of ids) {
      const w = st.works.find((x) => x.id === id);
      if (!w || w.inVault || w.sourceRef?.sourceId !== "mangadex") {
        skipped++;
        continue;
      }
      const asc = [...w.chapters].sort((a, b) => a.number - b.number);
      const target = asc.find((c) => !c.isRead && c.download !== "DONE" && c.sourceChapterId);
      if (!target) {
        skipped++;
        continue;
      }
      const idx = w.chapters.findIndex((c) => c.id === target.id);
      const n = enqueueMangaDexChapterDownloads(w, [
        {
          chapterIndex: idx,
          md: {
            id: target.sourceChapterId!,
            number: target.number,
            title: target.title,
            pages: target.pages,
            publishedAt: target.releaseDate,
          },
        },
      ]);
      if (n > 0) queued += n;
      else skipped++;
    }
    setSelection(null);
    if (queued > 0) {
      toast({
        title: t("lib.bulkDownloadToast", { n: queued }),
        ...(skipped > 0 ? { description: t("lib.bulkDownloadSkipped", { n: skipped }) } : {}),
      });
    } else {
      toast({ title: t("lib.bulkDownloadNone") });
    }
  };

  // Phase C (LIB-005): distinct content languages actually present
  const availableLangs = useMemo(() => {
    const set = new Set(works.map((w) => (w.language || "unknown")).filter(Boolean));
    return [...set].sort();
  }, [works]);

  const publicWorks = useMemo(() => works.filter((w) => !w.inVault), [works]);

  const filtered = useMemo(() => {
    let list = [...publicWorks];
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          (w.altTitle ?? "").toLowerCase().includes(q) ||
          w.author.toLowerCase().includes(q)
      );
    }
    if (typeFilter === "MANGA") list = list.filter((w) => ["MANGA", "MANHWA", "MANHUA", "WEBTOON"].includes(w.type));
    if (typeFilter === "COMIC") list = list.filter((w) => w.type === "COMIC");
    if (typeFilter === "BOOK") list = list.filter((w) => ["BOOK", "NOVEL", "EPUB"].includes(w.type));
    if (typeFilter === "PDF") list = list.filter((w) => w.type === "PDF");
    if (statusFilter) list = list.filter((w) => w.readingStatus === statusFilter);
    if (sourceFilter) list = list.filter((w) => w.source === sourceFilter);
    if (langFilter) list = list.filter((w) => (w.language || "unknown") === langFilter); // Phase C (LIB-005)
    if (downloadedOnly) list = list.filter((w) => w.chapters.some((c) => c.download === "DONE"));
    if (unreadOnly) list = list.filter((w) => w.chapters.some((c) => !c.isRead));
    if (smartRule) list = list.filter((w) => matchesRule(w, smartRule.rule));
    switch (sort) {
      case "lastRead":
        list.sort((a, b) => ((a.lastReadAt ?? a.addedAt) < (b.lastReadAt ?? b.addedAt) ? 1 : -1));
        break;
      case "title":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "added":
        list.sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1));
        break;
      case "progress":
        list.sort((a, b) => workProgress(b) - workProgress(a));
        break;
      case "latest":
        list.sort((a, b) => ((b.chapters[0]?.number ?? 0) - (a.chapters[0]?.number ?? 0)));
        break;
      case "size":
        // Phase C (LIB-004): file-size sort — largest first; unknown sizes (0) last
        list.sort((a, b) => workSizeBytes(b) - workSizeBytes(a));
        break;
    }
    return list;
  }, [publicWorks, query, typeFilter, sort, statusFilter, sourceFilter, langFilter, downloadedOnly, unreadOnly, smartRule]);

  const catCards = useMemo(() => {
    return categories.map((c) => ({
      ...c,
      smart: !!c.rule,
      count: c.rule
        ? publicWorks.filter((w) => matchesRule(w, c.rule!)).length
        : Object.values(workCategories).filter((ids) => ids.includes(c.id)).length,
      thumbs: c.rule
        ? publicWorks.filter((w) => matchesRule(w, c.rule!)).slice(0, 1)
        : publicWorks
            .filter((w) => (workCategories[w.id] ?? []).includes(c.id))
            .slice(0, 1),
    }));
  }, [categories, workCategories, publicWorks]);

  const toggleSelect = (id: string) => {
    setSelection((sel) =>
      sel ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id]
    );
  };

  /**
   * In the Android shell the WebView <input type=file> path is flaky across
   * WebView builds, so prefer the deterministic native picker bridge — the
   * picked file arrives via `oni-android-import` and the app-shell opens the
   * shared destination dialog for it (same channel as Share/Open-With).
   */
  const startImport = () => {
    const bridge = (window as unknown as { OniAndroid?: { pickImportFile?: () => void } }).OniAndroid;
    if (typeof bridge?.pickImportFile === "function") {
      try {
        bridge.pickImportFile();
      } catch {
        /* bridge quirk — fall back to the WebView file chooser */
        fileRef.current?.click();
      }
      return;
    }
    fileRef.current?.click();
  };

  /* ---------- folder import (v1.2.1) ---------- */
  const startFolderImport = () => {
    // webkitdirectory covers web/desktop + modern Android WebView file trees;
    // where a device can't browse folders it degrades to a multi-file picker
    folderRef.current?.click();
  };

  const onFolderPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const preview = buildFolderPreview(Array.from(files));
    if (!preview) {
      toast({ title: t("imp.folderEmpty"), variant: "destructive" });
      return;
    }
    setFolderTitle(preview.rootName);
    setItemTreatments(Object.fromEntries(preview.items.map((it) => [it.id, it.treatment])));
    setItemTitles(Object.fromEntries(preview.items.map((it) => [it.id, it.title])));
    setFolderPreview(preview);
  };

  const commitFolder = async () => {
    if (!folderPreview || folderBusy) return;
    setFolderBusy(true);
    try {
      const { work, works, reason, partial } = await importFolderCommit(folderPreview, folderTitle, {
        treatments: itemTreatments,
        titles: itemTitles,
      });
      const st = useApp.getState();
      if (work) st.addWork(work);
      for (const w of works) st.addWork(w);
      if (work || works.length > 0) {
        toast({ title: t("imp.added", { n: (work ? 1 : 0) + works.length }), description: [work?.title, ...works.map((w) => w.title)].filter(Boolean).join(", ").slice(0, 90) });
        // honest warning: some chapters lost pages to storage pressure
        if (partial.length) {
          toast({
            title: t("imp.partialPages"),
            description: t("imp.partialChapters", { names: partial.slice(0, 3).join(", ") }),
          });
        }
        // LIB-009: flag possible duplicates right after import
        const groups = findDuplicateGroups(st.works);
        const freshIds = [work?.id, ...works.map((w) => w.id)].filter(Boolean) as string[];
        const fresh = groups.filter((g) => g.some((w) => freshIds.includes(w.id)));
        for (const g of fresh.slice(0, 2)) {
          const kept = g.find((w) => freshIds.includes(w.id));
          const other = g.find((w) => w.id !== kept?.id);
          if (kept && other) toast({ title: t("imp.duplicateFound", { t: other.title }) });
        }
        setFolderPreview(null);
      } else {
        toast({
          title: t("imp.failed"),
          description: t(UNSUPPORTED_REASON_KEYS[reason ?? "format"] ?? "imp.reason.format"),
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: t("imp.failed"), variant: "destructive" });
    } finally {
      setFolderBusy(false);
    }
  };

  const activeFilterCount = (statusFilter ? 1 : 0) + (sourceFilter ? 1 : 0) + (downloadedOnly ? 1 : 0) + (unreadOnly ? 1 : 0);
  const searchRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-h-full px-5 pb-24">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-[24px] font-black tracking-tight">{t("lib.title")}</h1>
        <button
          onClick={() => searchRef.current?.focus()}
          aria-label={t("common.search")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
        >
          <Search className="h-[21px] w-[21px]" />
        </button>
      </header>

      {/* search */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("lib.searchPlaceholder")}
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground"
          />
        </div>
        <button
          onClick={() => setShowFilters(true)}
          aria-label={t("lib.filters")}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-card text-foreground shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)] transition-colors hover:bg-secondary"
        >
          <SlidersHorizontal className="h-4.5 w-4.5" />
          {activeFilterCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-coral-gradient text-[10px] font-black text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* type chips */}
      <div className="-mx-5 mt-3 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {(
          [
            ["ALL", t("common.all")],
            ["MANGA", t("type.MANGA")],
            ["COMIC", t("type.COMIC")],
            ["BOOK", t("type.BOOK")],
            ["PDF", "PDF"],
          ] as [TypeFilter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTypeFilter(id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-all",
              typeFilter === id
                ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                : "bg-card text-secondary-foreground shadow-[0_4px_12px_-8px_rgba(43,36,29,0.3)] hover:bg-secondary"
            )}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setShowFilters(true)}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-card text-secondary-foreground shadow-[0_4px_12px_-8px_rgba(43,36,29,0.3)]"
          aria-label={t("lib.filters")}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* my filters (LIB-011) */}
      {savedFilters.length > 0 && (
        <div className="-mx-5 mt-2.5 flex items-center gap-2 overflow-x-auto px-5 no-scrollbar">
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            <Bookmark className="h-3 w-3 text-primary" />
            {t("lib.myFilters")}
          </span>
          {savedFilters.map((f) => {
            const active = activeSaved?.id === f.id;
            return (
              <span key={f.id} className="relative shrink-0">
                <button
                  onClick={() => applySnapshot(f.filter)}
                  className={cn(
                    "rounded-full py-1.5 ps-3.5 pe-7 text-[12px] font-bold transition-all",
                    active
                      ? "bg-ink text-cream shadow-[0_6px_16px_-6px_rgba(43,36,29,0.6)]"
                      : "border border-primary/25 bg-coral-soft text-primary hover:bg-primary/15"
                  )}
                >
                  {f.name}
                </button>
                <button
                  aria-label={`${t("lib.filterDeleted")}: ${f.name}`}
                  onClick={() => {
                    useApp.getState().deleteSavedFilter(f.id);
                    toast({ title: t("lib.filterDeleted") });
                  }}
                  className={cn(
                    "absolute end-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 transition-colors",
                    active ? "text-cream/70 hover:text-cream" : "text-primary/60 hover:text-primary"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* categories */}
      <section className="mt-6">
        <SectionHeader title={t("lib.categories")} onSeeAll={() => push({ kind: "categories" })} />
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
          {catCards.map((c) => (
            <button
              key={c.id}
              onClick={() =>
                c.rule
                  ? setSmartRule({ name: c.name, rule: c.rule })
                  : push({ kind: "categories" })
              }
              className="w-[104px] shrink-0 text-start"
            >
              <div
                className={cn(
                  "relative h-[104px] overflow-hidden rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.45)]",
                  c.smart && "ring-2 ring-primary/50"
                )}
              >
                {c.smart ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#f8694c] via-[#f97e5f] to-[#f8a58f] text-white">
                    <Sparkles className="h-7 w-7" />
                    <span className="px-1 text-center text-[10px] font-black uppercase leading-tight tracking-wide">
                      {c.name}
                    </span>
                  </div>
                ) : c.thumbs[0] ? (
                  <WorkCover src={c.thumbs[0].cover} color={c.thumbs[0].coverColor} title={c.name} className="h-full w-full" sizes="104px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-coral-soft to-secondary text-primary">
                    <Bookmark className="h-7 w-7" />
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-[13px] font-extrabold">{c.name}</p>
              <p className="text-[11px] font-semibold text-muted-foreground">
                {c.count} {c.count === 1 ? t("common.work") : t("common.works")}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* active smart rule indicator (LIB-008) */}
      {smartRule && (
        <div className="mt-3 flex items-center justify-between rounded-full border border-primary/25 bg-coral-soft px-3 py-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold text-primary">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{smartRule.name}</span>
          </span>
          <button
            aria-label={t("lib.clearFilters")}
            onClick={() => setSmartRule(null)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary/70 transition-colors hover:text-primary"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* all works header */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold tracking-tight">{t("lib.allWorks")}</h2>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                {sortLabel(sort, t)}
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-2xl">
                {(
                  [
                    ["lastRead", "lib.lastRead"],
                    ["title", "lib.titleSort"],
                    ["added", "lib.dateAdded"],
                    ["progress", "lib.progress"],
                    ["latest", "lib.latestChapter"],
                    ["size", "lib.size"],
                  ] as [SortKey, TranslationKey][]
                ).map(([k, label]) => (
                  <DropdownMenuItem key={k} onClick={() => setSort(k)} className="gap-2 rounded-xl text-[13px] font-semibold">
                    {sort === k && <Check className="h-3.5 w-3.5 text-primary" />}
                    {t(label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex items-center rounded-full bg-card p-0.5 shadow-[0_4px_12px_-8px_rgba(43,36,29,0.3)]">
              <button
                onClick={() => setView("grid")}
                aria-label={t("a11y.gridView")}
                className={cn("flex h-11 w-11 items-center justify-center rounded-full", view === "grid" ? "bg-coral-gradient text-white" : "text-muted-foreground")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setView("list")}
                aria-label={t("a11y.listView")}
                className={cn("flex h-11 w-11 items-center justify-center rounded-full", view === "list" ? "bg-coral-gradient text-white" : "text-muted-foreground")}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title={query ? t("lib.noResults") : t("lib.empty")}
            hint={query ? undefined : t("lib.emptyHint")}
          />
        ) : view === "grid" ? (
          <div
            className={cn(
              "grid gap-x-3 gap-y-4",
              density === "compact" ? "grid-cols-4" : density === "large" ? "grid-cols-2" : "grid-cols-3"
            )}
          >
            {filtered.map((w) => (
              <WorkGridCard
                key={w.id}
                work={w}
                onOpen={() => (selection !== null ? toggleSelect(w.id) : openWork(w.id))}
                onLongPress={() => setSelection((s) => (s ?? []).concat(w.id))}
                selected={selection?.includes(w.id) ?? false}
                selectionMode={selection !== null}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((w) => (
              <WorkListRow
                key={w.id}
                work={w}
                onOpen={() => (selection !== null ? toggleSelect(w.id) : openWork(w.id))}
                selected={selection?.includes(w.id) ?? false}
                selectionMode={selection !== null}
              />
            ))}
          </div>
        )}
      </section>

      {/* FAB */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("imp.importFiles")}
            className="fixed bottom-24 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-coral-gradient text-white shadow-[0_16px_34px_-12px_rgba(248,105,76,0.7)] transition-transform hover:scale-105 ltr:right-6 rtl:left-6 max-lg:bottom-24"
            style={{ position: "absolute", bottom: 92 }}
          >
            <Plus className="h-7 w-7" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="mb-2 rounded-2xl">
          <DropdownMenuItem onClick={startImport} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <Import className="h-4 w-4 text-primary" /> {t("imp.importFiles")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={startFolderImport} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <FolderTree className="h-4 w-4 text-primary" /> {t("imp.importFolder")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTab("discover")} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <Compass className="h-4 w-4 text-primary" /> {t("disc.title")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNewCatOpen(true)} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <FolderPlus className="h-4 w-4 text-primary" /> {t("lib.newCategory")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".cbz,.zip,.cbr,.rar,.pdf,.epub,image/*"
        className="hidden"
        onChange={(e) => {
          const fs = e.target.files;
          if (fs && fs.length > 0) setPendingFiles(Array.from(fs));
          e.target.value = "";
        }}
      />
      <input
        ref={folderRef}
        type="file"
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        className="hidden"
        onChange={(e) => {
          onFolderPick(e.target.files);
          e.target.value = "";
        }}
      />

      {/* import destination (v1.2.1): existing work (smart search) or new work */}
      <ImportDestinationDialog files={pendingFiles} onClose={() => setPendingFiles(null)} />

      {/* selection action bar */}
      {selection !== null && (
        <div className="absolute inset-x-4 bottom-20 z-40 rounded-3xl border border-border bg-card/95 p-2 shadow-[0_20px_50px_-20px_rgba(43,36,29,0.6)] backdrop-blur animate-screen-in">
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="text-[13px] font-extrabold">
              {selection.length} {t("lib.selected")}
            </span>
            <button onClick={() => setSelection(null)} className="flex items-center gap-1 text-[12px] font-bold text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" /> {t("lib.exitSelection")}
            </button>
          </div>
          <div className="flex items-center justify-around">
            <SelAction
              icon={<FolderPlus className="h-5 w-5" />}
              label={t("lib.moveCategory")}
              onClick={() => {
                if (selection.length === 0) return;
                setBulkPick("category");
              }}
            />
            <SelAction
              icon={<CheckCircle2 className="h-5 w-5" />}
              label={t("lib.setStatus")}
              onClick={() => {
                if (selection.length === 0) return;
                setBulkPick("status");
              }}
            />
            <SelAction
              icon={<Heart className="h-5 w-5 text-primary" />}
              label={t("lib.bulkFavorite")}
              onClick={() => {
                if (selection.length === 0) return;
                const upd = useApp.getState().updateWork;
                selection.forEach((id) => upd(id, { isFavorite: true }));
                toast({ title: t("lib.bulkFavoriteToast", { n: selection.length }) });
                setSelection(null);
              }}
            />
            <SelAction
              icon={<ShieldCheck className="h-5 w-5" />}
              label={t("lib.moveToVault")}
              onClick={() => {
                const setVaultFlag = useApp.getState().setVaultFlag;
                selection.forEach((id) => setVaultFlag(id, true));
                toast({ title: t("vlt.title") });
                setSelection(null);
              }}
            />
            <SelAction
              icon={<Download className="h-5 w-5 text-primary" />}
              label={t("lib.bulkDownload")}
              onClick={() => {
                if (selection.length === 0) return;
                bulkDownload(selection);
              }}
            />
            <SelAction
              icon={<Trash2 className="h-5 w-5 text-destructive" />}
              label={t("lib.deleteWorks")}
              destructive
              onClick={() => {
                if (selection.length === 0) return;
                if (!window.confirm(t("lib.deleteConfirm", { n: selection.length }))) return;
                const ids = selection;
                useApp.getState().deleteWorks(ids);
                ids.forEach((id) => deleteWorkFiles(id));
                toast({ title: t("common.done") });
                setSelection(null);
              }}
            />
          </div>
        </div>
      )}

      {/* bulk pickers (LIB-007) — real category/status choosers */}
      <Dialog open={bulkPick === "category"} onOpenChange={(o) => !o && setBulkPick(null)}>
        <DialogContent className="max-h-[70dvh] rounded-3xl p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle className="text-[16px] font-black">{t("lib.pickCategory")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[46dvh] overflow-y-auto p-3">
            {categories.length === 0 && (
              <p className="px-2 py-6 text-center text-[13px] font-semibold text-muted-foreground">
                {t("lib.empty")}
              </p>
            )}
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  const assign = useApp.getState().assignCategories;
                  selection?.forEach((id) => {
                    const cur = useApp.getState().workCategories[id] ?? [];
                    assign(id, Array.from(new Set([...cur, c.id])));
                  });
                  toast({ title: `${t("lib.moveCategory")}: ${c.name}` });
                  setBulkPick(null);
                  setSelection(null);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-colors hover:bg-secondary"
              >
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", c.rule ? "bg-coral-gradient text-white" : "bg-secondary text-primary")}>
                  <FolderPlus className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] font-extrabold">{c.name}</span>
                {c.rule && <Sparkles className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkPick === "status"} onOpenChange={(o) => !o && setBulkPick(null)}>
        <DialogContent className="max-h-[70dvh] rounded-3xl p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle className="text-[16px] font-black">{t("lib.pickStatus")}</DialogTitle>
          </DialogHeader>
          <div className="p-3">
            {(["PLANNED", "READING", "COMPLETED", "ON_HOLD", "DROPPED"] as const).map((st) => (
              <button
                key={st}
                onClick={() => {
                  const setStatus = useApp.getState().setStatus;
                  selection?.forEach((id) => setStatus(id, st));
                  toast({ title: t(`status.${st}`) });
                  setBulkPick(null);
                  setSelection(null);
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-colors hover:bg-secondary"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1 text-[14px] font-extrabold">{t(`status.${st}`)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* folder import review (v1.2.1) — rename the work, choose a treatment
          for every detected item, then commit */}
      <Dialog open={!!folderPreview} onOpenChange={(o) => !o && !folderBusy && setFolderPreview(null)}>
        <DialogContent className="max-h-[76dvh] rounded-3xl p-0 max-w-[380px] mx-auto" style={{ maxWidth: 380 }}>
          <DialogHeader className="border-b border-border/60 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-[16px] font-black">
              <FolderTree className="h-4.5 w-4.5 text-primary" /> {t("imp.importFolder")}
            </DialogTitle>
            <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
              {t("imp.items", { n: folderPreview?.items.length ?? 0 })}
            </p>
          </DialogHeader>
          <div className="max-h-[54dvh] overflow-y-auto thin-scrollbar px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("imp.folderTitleLabel")}</p>
            <input
              value={folderTitle}
              onChange={(e) => setFolderTitle(e.target.value.slice(0, 80))}
              aria-label={t("imp.folderTitleLabel")}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] font-extrabold outline-none transition-colors focus:border-primary"
            />
            <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {t("imp.treat.title")}
            </p>
            <div className="mt-1.5 space-y-1.5">
              {folderPreview?.items.map((it) => (
                <FolderItemRow
                  key={it.id}
                  item={it}
                  workTitle={folderTitle || folderPreview.rootName}
                  treatment={itemTreatments[it.id] ?? it.treatment}
                  title={itemTitles[it.id] ?? it.title}
                  busy={folderBusy}
                  onTreatment={(tr) => setItemTreatments((m) => ({ ...m, [it.id]: tr }))}
                  onTitle={(v) => setItemTitles((m) => ({ ...m, [it.id]: v }))}
                />
              ))}
            </div>
          </div>
          <div className="border-t border-border/60 p-4">
            <button
              onClick={commitFolder}
              disabled={folderBusy}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-coral-gradient text-[14px] font-extrabold text-white shadow-[0_12px_26px_-10px_rgba(248,105,76,0.7)] transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              {folderBusy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Import className="h-4.5 w-4.5" />}
              {folderBusy ? t("imp.importing") : t("imp.folderImportBtn")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* filter sheet */}
      <Dialog open={showFilters} onOpenChange={setShowFilters}>
        <DialogContent className="top-auto bottom-0 translate-y-0 rounded-t-[2rem] border-0 bg-card p-5 max-w-[412px] mx-auto" style={{ maxWidth: 412 }}>
          <DialogHeader>
            <DialogTitle className="text-[18px] font-extrabold">{t("lib.filters")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[13px] font-bold text-muted-foreground">{t("lib.filterStatus")}</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["READING", "status.READING"],
                    ["PLANNED", "status.PLANNED"],
                    ["COMPLETED", "status.COMPLETED"],
                    ["ON_HOLD", "status.ON_HOLD"],
                    ["DROPPED", "status.DROPPED"],
                  ] as [ReadingStatus, TranslationKey][]
                ).map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setStatusFilter((s) => (s === id ? null : id))}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all",
                      statusFilter === id ? "bg-coral-gradient text-white" : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-bold text-muted-foreground">{t("lib.filterSource")}</p>
              <div className="flex flex-wrap gap-2">
                {sources.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSourceFilter((x) => (x === s.id ? null : s.id))}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all",
                      sourceFilter === s.id ? "bg-coral-gradient text-white" : "bg-secondary text-secondary-foreground"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              <label className="flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3">
                <span className="text-[13px] font-bold">{t("lib.filterDownloaded")}</span>
                <Checkbox checked={downloadedOnly} onCheckedChange={(v) => setDownloadedOnly(!!v)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
              </label>
              <label className="flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3">
                <span className="text-[13px] font-bold">{t("lib.filterUnread")}</span>
                <Checkbox checked={unreadOnly} onCheckedChange={(v) => setUnreadOnly(!!v)} className="data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
              </label>
              {/* Phase C (LIB-005): content-language filter — honest options */}
              {availableLangs.length > 0 && (
                <div className="rounded-2xl bg-secondary/60 px-4 py-3">
                  <p className="text-[13px] font-bold">{t("lib.language")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setLangFilter(null)}
                      className={cn(
                        "min-h-[36px] rounded-full px-3 py-1 text-[12px] font-bold transition-colors",
                        langFilter === null ? "bg-coral-gradient text-white" : "bg-card text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {t("lib.langAll")}
                    </button>
                    {availableLangs.map((l) => (
                      <button
                        key={l}
                        onClick={() => setLangFilter(l)}
                        className={cn(
                          "min-h-[36px] rounded-full px-3 py-1 text-[12px] font-bold transition-colors",
                          langFilter === l ? "bg-coral-gradient text-white" : "bg-card text-muted-foreground hover:text-foreground"
                        )}
                        dir="ltr"
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* save current filters (LIB-011) */}
            <div className="rounded-2xl border border-primary/25 bg-coral-soft/60 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-extrabold">{t("lib.saveFilter")}</p>
                  <p className="truncate text-[11px] font-semibold text-muted-foreground">{t("lib.saveFilterHint")}</p>
                </div>
                <Button
                  size="sm"
                  disabled={!anyFilterActive}
                  onClick={() => {
                    setFilterName("");
                    setSaveFilterOpen(true);
                  }}
                  className="shrink-0 rounded-full bg-coral-gradient px-4 text-white hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {!anyFilterActive && (
                <p className="mt-2 text-[11px] font-bold text-primary/80">{t("lib.noFiltersToSave")}</p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-2 gap-2">
            <Button
              variant="secondary"
              className="flex-1 rounded-full"
              onClick={() => {
                setStatusFilter(null);
                setSourceFilter(null);
                setLangFilter(null);
                setDownloadedOnly(false);
                setUnreadOnly(false);
              }}
            >
              {t("lib.clearFilters")}
            </Button>
            <Button className="flex-1 rounded-full bg-coral-gradient text-white hover:opacity-90" onClick={() => setShowFilters(false)}>
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* save filter name */}
      <Dialog open={saveFilterOpen} onOpenChange={setSaveFilterOpen}>
        <DialogContent className="rounded-3xl bg-card p-5 max-w-[360px] mx-auto" style={{ maxWidth: 360 }}>
          <DialogHeader>
            <DialogTitle className="text-[18px] font-extrabold">{t("lib.saveFilter")}</DialogTitle>
          </DialogHeader>
          <Input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder={t("lib.saveFilterName")}
            className="rounded-2xl border-border bg-secondary/50"
            onKeyDown={(e) => {
              if (e.key === "Enter" && filterName.trim()) {
                useApp.getState().saveFilter(filterName.trim(), snapshotFilters());
                toast({ title: t("lib.filterSaved") });
                setSaveFilterOpen(false);
                setShowFilters(false);
              }
            }}
          />
          <DialogFooter>
            <Button variant="secondary" className="rounded-full" onClick={() => setSaveFilterOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!filterName.trim()}
              className="rounded-full bg-coral-gradient text-white hover:opacity-90"
              onClick={() => {
                useApp.getState().saveFilter(filterName.trim(), snapshotFilters());
                toast({ title: t("lib.filterSaved") });
                setSaveFilterOpen(false);
                setShowFilters(false);
              }}
            >
              {t("common.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* new category */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="rounded-3xl bg-card p-5 max-w-[360px] mx-auto" style={{ maxWidth: 360 }}>
          <DialogHeader>
            <DialogTitle className="text-[18px] font-extrabold">{t("lib.newCategory")}</DialogTitle>
          </DialogHeader>
          <Input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder={t("lib.categoryName")} className="rounded-2xl border-border bg-secondary/50" />
          <DialogFooter>
            <Button variant="secondary" className="rounded-full" onClick={() => setNewCatOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="rounded-full bg-coral-gradient text-white hover:opacity-90"
              onClick={() => {
                if (newCatName.trim()) {
                  useApp.getState().createCategory(newCatName.trim());
                  toast({ title: t("lib.newCategory") });
                }
                setNewCatName("");
                setNewCatOpen(false);
              }}
            >
              {t("lib.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function sortLabel(sort: SortKey, t: (k: TranslationKey, v?: Record<string, string | number>) => string): string {
  switch (sort) {
    case "lastRead":
      return t("lib.lastRead");
    case "title":
      return t("lib.titleSort");
    case "added":
      return t("lib.dateAdded");
    case "progress":
      return t("lib.progress");
    case "latest":
      return t("lib.latestChapter");
    case "size":
      return t("lib.size");
  }
}

function SelAction({ icon, label, onClick, destructive }: { icon: React.ReactNode; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button onClick={onClick} className={cn("flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-bold transition-colors hover:bg-secondary", destructive ? "text-destructive" : "text-foreground")}>
      {icon}
      <span className="w-full truncate text-center">{label}</span>
    </button>
  );
}

/* ---------- folder import review row (v1.2.1) ---------- */

function formatBytesLabel(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function FolderItemRow({
  item,
  workTitle,
  treatment,
  title,
  busy,
  onTreatment,
  onTitle,
}: {
  item: FolderItemPlan;
  workTitle: string;
  treatment: FolderItemTreatment;
  title: string;
  busy: boolean;
  onTreatment: (t: FolderItemTreatment) => void;
  onTitle: (v: string) => void;
}) {
  const { t } = useT();
  const Icon =
    item.kind === "images" ? Images : item.kind === "archive" ? FileArchive : item.kind === "pdf" ? FileText : BookOpen;
  const size = item.files.reduce((a, f) => a + (f.size || 0), 0);
  const treatCls =
    treatment === "chapter"
      ? "text-primary"
      : treatment === "work"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground line-through decoration-1";

  return (
    <div
      className={cn(
        "rounded-xl bg-secondary/60 px-3 py-2 transition-opacity",
        treatment === "skip" && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-coral-soft text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value.slice(0, 120))}
          disabled={busy}
          aria-label={t("imp.folderTitleLabel")}
          dir="auto"
          className="min-w-0 flex-1 border-b border-transparent bg-transparent py-0.5 text-[12.5px] font-extrabold outline-none transition-colors focus:border-primary"
        />
        <span className="shrink-0 rounded-md bg-background/70 px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-wide text-secondary-foreground">
          {item.extLabel === "Images" ? t("imp.kind.images") : item.extLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={busy}>
            <button
              aria-label={t("imp.treat.title")}
              className={cn("flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black transition-colors hover:bg-background/60", treatCls)}
            >
              {t(treatment === "chapter" ? "imp.treatShort.chapter" : treatment === "work" ? "imp.treatShort.work" : "imp.treatShort.skip")}
              <ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-2xl">
            {item.options.map((opt) => (
              <DropdownMenuItem
                key={opt}
                onClick={() => onTreatment(opt)}
                className="gap-2 rounded-xl text-[12.5px] font-semibold"
              >
                {opt === treatment && <Check className="h-3.5 w-3.5 text-primary" />}
                {t(opt === "chapter" ? "imp.treat.chapter" : opt === "work" ? "imp.treat.work" : "imp.treat.skip")}
                {opt === "chapter" && (
                  <span className="ms-auto max-w-[110px] truncate text-[10px] font-bold text-muted-foreground">{workTitle}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-0.5 truncate ps-9 text-[10px] font-semibold text-muted-foreground" dir="auto">
        {item.origin} · {item.files.length} {t("imp.folderFiles")}
        {size > 0 && ` · ${formatBytesLabel(size)}`}
      </p>
    </div>
  );
}

/* ---------- grid card (mockup: cover, ⋯, title, progress + %, Ch.) ---------- */

function WorkGridCard({
  work,
  onOpen,
  onLongPress,
  selected,
  selectionMode,
}: {
  work: Work;
  onOpen: () => void;
  onLongPress: () => void;
  selected: boolean;
  selectionMode: boolean;
}) {
  const { t, lang } = useT();
  const progress = workProgress(work);
  const [menuForMenu, setMenuForMenu] = useState(false);

  const longPressProps = useLongPress(onLongPress);

  // mockup style: minimal dot/label status instead of pill badges
  const done = progress >= 100;
  const badge = () => {
    // fully read → Completed badge, no progress bar (user request)
    if (done)
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t("status.COMPLETED")}
        </span>
      );
    if (work.readingStatus === "COMPLETED")
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t("status.COMPLETED")}
        </span>
      );
    if (work.readingStatus === "ON_HOLD")
      return (
        <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
          <Pause className="h-3 w-3" />
          {t("status.ON_HOLD")}
        </span>
      );
    if (work.readingStatus === "PLANNED")
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          {t("status.PLANNED")}
        </span>
      );
    if (work.readingStatus === "DROPPED")
      return (
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 dark:text-red-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          {t("status.DROPPED")}
        </span>
      );
    return null;
  };

  return (
    <div className="relative">
      <button
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          onLongPress();
        }}
        {...longPressProps}
        className="group block w-full text-start transition-transform active:scale-[0.96]"
      >
        <div className={cn("relative", selected && "opacity-80")}>
          <WorkCover
            src={work.cover}
            color={work.coverColor}
            title={work.title}
            className="aspect-[3/4] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)] transition-transform group-hover:-translate-y-0.5"
            sizes="30vw"
          />
          {selectionMode && (
            <span
              className={cn(
                "absolute left-1.5 top-1.5 flex h-5.5 w-5.5 items-center justify-center rounded-full border-2",
                selected ? "border-white bg-coral-gradient" : "border-white/80 bg-black/30"
              )}
            >
              {selected && <Check className="h-3 w-3 text-white" />}
            </span>
          )}
          {work.isFavorite && !selectionMode && (
            <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/45 backdrop-blur">
              <Heart className="h-3 w-3 fill-white text-white" />
            </span>
          )}
        </div>
        <p className="mt-1.5 truncate text-[12px] font-extrabold">{work.title}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {progress > 0 && !done && (
            <>
              <ProgressBar value={progress} className="h-[3px] flex-1" />
              <span className="text-[10px] font-black text-primary">{progress}%</span>
              {work.readingStatus === "ON_HOLD" && <Pause className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </>
          )}
        </div>
        {(done || work.readingStatus === "COMPLETED" || work.readingStatus === "ON_HOLD" || work.readingStatus === "PLANNED" || work.readingStatus === "DROPPED") && (
          <div className="mt-0.5">{badge()}</div>
        )}
        <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
          {t("common.ch")} {currentChapter(work)?.number ?? work.chapters[0]?.number ?? "—"}
        </p>
      </button>
      {!selectionMode && (
        <DropdownMenu open={menuForMenu} onOpenChange={setMenuForMenu}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("common.more")}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white opacity-95 backdrop-blur transition-opacity hover:opacity-100 data-[state=open]:opacity-100"
              style={{ position: "absolute" }}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <WorkMenu work={work} onDone={() => setMenuForMenu(false)} />
        </DropdownMenu>
      )}
    </div>
  );
}

function WorkListRow({ work, onOpen, selected, selectionMode }: { work: Work; onOpen: () => void; selected: boolean; selectionMode: boolean }) {
  const { t } = useT();
  const progress = workProgress(work);
  const readCount = work.chapters.filter((c) => c.isRead).length;
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-2.5 text-start shadow-[0_6px_18px_-14px_rgba(43,36,29,0.4)] transition-all hover:shadow-[0_10px_24px_-14px_rgba(43,36,29,0.5)]",
        selected && "ring-2 ring-primary"
      )}
    >
      {selectionMode ? (
        <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", selected ? "border-primary bg-coral-gradient" : "border-muted-foreground")}>
          {selected && <Check className="h-3.5 w-3.5 text-white" />}
        </span>
      ) : null}
      <WorkCover src={work.cover} color={work.coverColor} title={work.title} className="h-16 w-12 shrink-0 rounded-xl" sizes="48px" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold">{work.title}</p>
        <p className="truncate text-[11px] font-semibold text-muted-foreground">
          {t("common.ch")} {work.chapters[0]?.number} · {readCount}/{work.chapters.length} {t("common.chapters")}
        </p>
        {progress < 100 && <ProgressBar value={progress} className="mt-1.5 h-[3px]" />}
      </div>
      {(progress >= 100 || work.readingStatus === "COMPLETED") && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
      {progress < 100 && work.readingStatus === "ON_HOLD" && <Pause className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

export function WorkMenu({ work, onDone }: { work: Work; onDone: () => void }) {
  const { t } = useT();
  const store = useApp;
  return (
    <DropdownMenuContent align="end" className="w-52 rounded-2xl">
      <DropdownMenuItem
        className="gap-2.5 rounded-xl text-[13px] font-semibold"
        onClick={() => {
          store.getState().toggleFavorite(work.id);
          onDone();
        }}
      >
        <Heart className={cn("h-4 w-4", work.isFavorite && "fill-primary text-primary")} />
        {work.isFavorite ? t("lib.unfavorite") : t("lib.favorite")}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="gap-2.5 rounded-xl text-[13px] font-semibold"
        onClick={() => {
          store.getState().setStatus(work.id, work.readingStatus === "READING" ? "COMPLETED" : "READING");
          onDone();
        }}
      >
        <CheckCircle2 className="h-4 w-4 text-primary" />
        {work.readingStatus === "READING" ? t("status.COMPLETED") : t("status.READING")}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="gap-2.5 rounded-xl text-[13px] font-semibold"
        onClick={() => {
          store.getState().setVaultFlag(work.id, !work.inVault);
          toast({ title: work.inVault ? t("lib.unhide") : t("lib.moveToVault") });
          onDone();
        }}
      >
        <ShieldCheck className="h-4 w-4 text-primary" />
        {work.inVault ? t("lib.unhide") : t("lib.moveToVault")}
      </DropdownMenuItem>
      <DropdownMenuItem
        className="gap-2.5 rounded-xl text-[13px] font-semibold text-destructive focus:text-destructive"
        onClick={() => {
          if (window.confirm(t("lib.deleteConfirm", { n: 1 }))) {
            store.getState().deleteWorks([work.id]);
            deleteWorkFiles(work.id);
          }
          onDone();
        }}
      >
        <Trash2 className="h-4 w-4" />
        {t("lib.deleteWorks")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

function useLongPress(cb: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: () => {
      clear();
      timer.current = setTimeout(() => cb(), 550);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
  };
}
