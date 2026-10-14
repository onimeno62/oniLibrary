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
  ShieldCheck,
  Heart,
  Trash2,
  Bookmark,
  Sparkles,
} from "lucide-react";
import { SectionHeader, WorkCover, ProgressBar, EmptyState, StatusBadge } from "@/components/shared";
import { useApp, useNav, workProgress, currentChapter, matchesRule } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { importFiles } from "@/lib/importer";
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
type SortKey = "lastRead" | "title" | "added" | "progress" | "latest";

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
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [saveFilterOpen, setSaveFilterOpen] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [smartRule, setSmartRule] = useState<{ name: string; rule: SmartRule } | null>(null);
  const savedFilters = useApp((s) => s.savedFilters);
  const fileRef = useRef<HTMLInputElement>(null);

  /** snapshot of every chip/checkbox that a saved filter restores */
  const snapshotFilters = (): LibraryFilterSnapshot => ({
    type: typeFilter,
    status: statusFilter,
    source: sourceFilter,
    downloadedOnly,
    unreadOnly,
    sort,
  });

  const applySnapshot = (f: LibraryFilterSnapshot) => {
    setTypeFilter(f.type);
    setStatusFilter(f.status);
    setSourceFilter(f.source);
    setDownloadedOnly(f.downloadedOnly);
    setUnreadOnly(f.unreadOnly);
    setSort(f.sort);
  };

  const anyFilterActive =
    typeFilter !== "ALL" || statusFilter !== null || sourceFilter !== null || downloadedOnly || unreadOnly;

  /** current filters equal to a saved filter? (highlight chip) */
  const sameFilter = (a: LibraryFilterSnapshot, b: LibraryFilterSnapshot) =>
    a.type === b.type &&
    a.status === b.status &&
    a.source === b.source &&
    a.downloadedOnly === b.downloadedOnly &&
    a.unreadOnly === b.unreadOnly &&
    a.sort === b.sort;

  // highlight follows live state (also when the user tweaks chips manually)
  const liveSnapshot = snapshotFilters();
  const activeSaved = savedFilters.find((f) => sameFilter(f.filter, liveSnapshot)) ?? null;

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
    }
    return list;
  }, [publicWorks, query, typeFilter, sort, statusFilter, sourceFilter, downloadedOnly, unreadOnly, smartRule]);

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

  const onImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { created, unsupported } = await importFiles(Array.from(files));
    const addWork = useApp.getState().addWork;
    for (const w of created) addWork(w);
    if (created.length) {
      toast({ title: t("imp.added", { n: created.length }), description: created.map((c) => c.title).join(", ") });
    }
    if (unsupported.length) {
      toast({ title: t("imp.unsupported", { names: unsupported.slice(0, 2).join(", ") }), variant: "destructive" });
    }
  };

  const activeFilterCount = (statusFilter ? 1 : 0) + (sourceFilter ? 1 : 0) + (downloadedOnly ? 1 : 0) + (unreadOnly ? 1 : 0);

  return (
    <div className="min-h-full px-5 pb-24">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-[24px] font-black tracking-tight">{t("lib.title")}</h1>
        <button
          onClick={() => setSelection([])}
          aria-label={t("lib.select")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
        >
          <Check className="h-[21px] w-[21px]" />
        </button>
      </header>

      {/* search */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
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
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary/70 transition-colors hover:text-primary"
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
                aria-label="Grid view"
                className={cn("flex h-7 w-7 items-center justify-center rounded-full", view === "grid" ? "bg-coral-gradient text-white" : "text-muted-foreground")}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setView("list")}
                aria-label="List view"
                className={cn("flex h-7 w-7 items-center justify-center rounded-full", view === "list" ? "bg-coral-gradient text-white" : "text-muted-foreground")}
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
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
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
          <DropdownMenuItem onClick={() => fileRef.current?.click()} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <Import className="h-4 w-4 text-primary" /> {t("imp.importFiles")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTab("discover")} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <Compass className="h-4 w-4 text-primary" /> {t("disc.title")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNewCatOpen(true)} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <FolderPlus className="h-4 w-4 text-primary" /> {t("lib.newCategory")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input ref={fileRef} type="file" multiple accept=".cbz,.zip,.cbr,.pdf,.epub,image/*" className="hidden" onChange={(e) => onImport(e.target.files)} />

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
                const cat = useApp.getState().categories[0];
                if (!cat) return;
                const assign = useApp.getState().assignCategories;
                selection.forEach((id) => {
                  const cur = useApp.getState().workCategories[id] ?? [];
                  assign(id, Array.from(new Set([...cur, cat.id])));
                });
                toast({ title: `${t("lib.moveCategory")}: ${cat.name}` });
                setSelection(null);
              }}
            />
            <SelAction
              icon={<CheckCircle2 className="h-5 w-5" />}
              label={t("lib.setStatus")}
              onClick={() => {
                if (selection.length === 0) return;
                const setStatus = useApp.getState().setStatus;
                selection.forEach((id) => setStatus(id, "COMPLETED"));
                toast({ title: t("status.COMPLETED") });
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

  const badge = () => {
    if (work.readingStatus === "COMPLETED")
      return <StatusBadge kind="done" label={`✓ ${t("status.COMPLETED")}`} />;
    if (work.readingStatus === "ON_HOLD") return <StatusBadge kind="paused" label={`⏸ ${t("status.ON_HOLD")}`} />;
    if (progress > 0) return <StatusBadge kind="percent" label={`${progress}%`} />;
    if (work.readingStatus === "PLANNED") return <StatusBadge kind="planned" label={t("status.PLANNED")} />;
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
          {progress > 0 && (
            <>
              <ProgressBar value={progress} className="h-[3px] flex-1" />
              <span className="text-[10px] font-black text-primary">{progress}%</span>
            </>
          )}
        </div>
        <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
          {t("common.ch")} {currentChapter(work)?.number ?? work.chapters[0]?.number ?? "—"}
        </p>
        <div className="mt-1">
          {(work.readingStatus === "COMPLETED" || work.readingStatus === "ON_HOLD" || work.readingStatus === "PLANNED" || work.readingStatus === "DROPPED") && badge()}
        </div>
      </button>
      {!selectionMode && (
        <DropdownMenu open={menuForMenu} onOpenChange={setMenuForMenu}>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={t("common.more")}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
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
        <ProgressBar value={progress} className="mt-1.5 h-[3px]" />
      </div>
      {work.readingStatus === "COMPLETED" && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}
      {work.readingStatus === "ON_HOLD" && <Pause className="h-4 w-4 shrink-0 text-muted-foreground" />}
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
