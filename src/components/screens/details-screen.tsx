"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Bookmark,
  MoreVertical,
  Play,
  Download,
  Check,
  ChevronDown,
  Heart,
  ShieldCheck,
  Share2,
  Settings2,
  Star,
  BookMarked,
  CheckCircle2,
  Loader2,
  Trash2,
  Pencil,
  StickyNote,
  Highlighter,
  ImagePlus,
  X,
  FolderOpen,
  RefreshCw,
  Globe,
} from "lucide-react";
import { WorkCover } from "@/components/shared";
import { WorkMenu } from "@/components/screens/library-screen";
import { useApp, useNav, continueReading, timeAgo, workProgress, toFa } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { enqueueMangaDexChapterDownloads } from "@/lib/bg-downloads";
import { mdChapterToStored } from "@/lib/mangadex";
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
} from "@/components/ui/dialog";
import type { Chapter, ReadingStatus, ReaderMode, ReadingDirection, FitMode, Work } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";
import { mdNewChapters, mdChapterLabel, type MdChapter } from "@/lib/mangadex";

export function DetailsScreen({ workId }: { workId: string }) {
  const { t, lang, rtl } = useT();
  const work = useApp((s) => s.works.find((w) => w.id === workId));
  const pop = useNav((s) => s.pop);
  const openReader = useNav((s) => s.openReader);
  const push = useNav((s) => s.push);
  const startDownload = useApp((s) => s.startDownload);
  const markChapterRead = useApp((s) => s.markChapterRead);
  const [sortNewest, setSortNewest] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [readerSettings, setReaderSettings] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  /* chapter management mode (v1.4.0): multi-select → rename / move / delete */
  const [manageMode, setManageMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveOpen, setMoveOpen] = useState(false);
  const [renameChOpen, setRenameChOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  /* source update check (v1.3.0, [UPD-001]) — MangaDex works only */
  const [updChecking, setUpdChecking] = useState(false);
  const [updNew, setUpdNew] = useState<MdChapter[] | null>(null);
  const [updBusy, setUpdBusy] = useState(false);

  const bookmarks = useApp((s) => s.bookmarks);
  const workBookmarkCount = bookmarks.filter((b) => b.workId === workId).length;
  const workHighlightCount = useApp((s) => s.highlights.filter((h) => h.workId === workId).length);

  const chapters = useMemo(() => {
    if (!work) return [];
    const list = [...work.chapters];
    list.sort((a, b) => (sortNewest ? b.number - a.number : a.number - b.number));
    return list;
  }, [work, sortNewest]);

  if (!work) {
    return (
      <div className="dark flex h-full flex-col bg-background text-foreground">
        <div className="flex items-center p-4">
          <button onClick={pop} aria-label={t("common.back")} className="flex h-10 w-10 items-center justify-center rounded-full text-white">
            <ChevronLeft className="h-6 w-6 rtl:rotate-180" />
          </button>
        </div>
        <p className="mt-20 text-center text-sm text-muted-foreground">{t("common.unknown")}</p>
      </div>
    );
  }

  const cr = continueReading(work);
  const progress = workProgress(work);
  const readCount = work.chapters.filter((c) => c.isRead).length;

  /* ---- source update check ([UPD-001]): diff against MangaDex, offer download ---- */
  const runUpdateCheck = async () => {
    if (!work?.sourceRef || updChecking || updBusy) return;
    setUpdChecking(true);
    try {
      // diff by upstream chapter UUIDs (same key the store-wide check uses),
      // so a chapter appended by the global check is never re-reported here
      // (Phase 1 finding M3 — the two paths previously used different keys)
      const knownIds = work.chapters
        .map((c) => c.sourceChapterId)
        .filter((x): x is string => typeof x === "string" && x.length > 0);
      const all = await mdNewChapters(work.sourceRef.itemId, knownIds);
      const knownNums = new Set(work.chapters.map((c) => c.number));
      const fresh = all.filter((c) => !knownNums.has(c.number));
      useApp.getState().updateWork(work.id, { lastSourceCheck: new Date().toISOString() });
      if (fresh.length === 0) {
        toast({ title: t("upd.contentUpToDate"), description: work.title });
      } else {
        setUpdNew(fresh);
      }
    } catch {
      toast({ title: t("md.chapterError"), description: "MangaDex", variant: "destructive" });
    } finally {
      setUpdChecking(false);
    }
  };

  const downloadNewChapters = () => {
    if (!work?.sourceRef || !updNew || updBusy) return;
    setUpdBusy(true);
    try {
      // append the new chapters as STREAMABLE rows instantly, then let the
      // background manager fetch their pages — nothing blocks the UI
      const st = useApp.getState();
      const startIdx = work.chapters.length;
      const rows = updNew.map((ch, i) => mdChapterToStored(work.id, ch, startIdx + i, false));
      st.appendSourceChapters(work.id, rows);
      const wNow = useApp.getState().works.find((x) => x.id === work.id);
      if (wNow) {
        const bySource = new Map(wNow.chapters.map((c, i) => [c.sourceChapterId, i]));
        const jobs = updNew
          .map((ch) => ({ chapterIndex: bySource.get(ch.id) ?? -1, md: ch }))
          .filter((j) => j.chapterIndex >= 0);
        enqueueMangaDexChapterDownloads(wNow, jobs);
      }
      useApp.getState().updateWork(work.id, { lastSourceCheck: new Date().toISOString() });
      toast({ title: t("upd.addedN", { n: updNew.length }), description: work.title });
      setUpdNew(null);
    } finally {
      setUpdBusy(false);
    }
  };

  const statusChip = (): { key: TranslationKey; cls: string } => {
    switch (work.readingStatus) {
      case "COMPLETED":
        return { key: "status.COMPLETED", cls: "text-emerald-400 border-emerald-400/40 bg-emerald-400/10" };
      case "ON_HOLD":
        return { key: "status.ON_HOLD", cls: "text-amber-400 border-amber-400/40 bg-amber-400/10" };
      case "DROPPED":
        return { key: "status.DROPPED", cls: "text-rose-400 border-rose-400/40 bg-rose-400/10" };
      case "PLANNED":
        return { key: "status.PLANNED", cls: "text-sky-400 border-sky-400/40 bg-sky-400/10" };
      default:
        return { key: "status.READING", cls: "text-primary border-primary/40 bg-primary/10" };
    }
  };

  const st = statusChip();

  return (
    <div className="dark flex h-full flex-col bg-background text-foreground">
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {/* banner */}
        <div className="relative h-[240px]">
          {work.banner || work.cover ? (
            <Image
              src={(work.banner ?? work.cover) as string}
              alt={work.title}
              fill
              sizes="412px"
              priority
              className="object-cover"
            />
          ) : (
            <div className={cn("h-full w-full bg-gradient-to-br", work.coverColor ?? "from-orange-500 to-rose-900")} />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-background" />

          {/* top actions */}
          <div className="absolute inset-x-0 top-1 flex items-center justify-between px-2">
            <button
              onClick={pop}
              aria-label={t("common.back")}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
            >
              <ChevronLeft className="h-6 w-6 rtl:rotate-180" />
            </button>
            <div className="flex items-center">
              <button
                onClick={() => push({ kind: "search" })}
                aria-label={t("common.search")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                onClick={() => setBookmarksOpen(true)}
                aria-label={t("bm.title")}
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
              >
                <Bookmark className="h-5 w-5" />
                {workBookmarkCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-gradient px-1 text-[9px] font-black text-white">
                    {workBookmarkCount}
                  </span>
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label={t("common.more")} className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem onClick={() => setEditOpen(true)} className="gap-2.5 rounded-xl text-[13px] font-semibold">
                    <Pencil className="h-4 w-4 text-primary" /> {t("det.editWork")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setReaderSettings(true)} className="gap-2.5 rounded-xl text-[13px] font-semibold">
                    <Settings2 className="h-4 w-4 text-primary" /> {t("det.readerMode")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard?.writeText(`${work.title} — oniLibrary`).catch(() => undefined);
                      toast({ title: t("det.share") });
                    }}
                    className="gap-2.5 rounded-xl text-[13px] font-semibold"
                  >
                    <Share2 className="h-4 w-4 text-primary" /> {t("det.share")}
                  </DropdownMenuItem>
                  <WorkMenuInline workId={work.id} />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* cover + meta */}
        <div className="relative z-10 -mt-24 px-5">
          <div className="flex gap-4">
            <WorkCover
              src={work.customCover ?? work.cover}
              color={work.coverColor}
              title={work.title}
              eager
              className="h-[150px] w-[106px] shrink-0 rounded-2xl border-4 border-background/30 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.8)]"
              sizes="106px"
            />
            <div className="min-w-0 flex-1 pt-12">
              <h1 className="text-[21px] font-black leading-tight tracking-tight text-white">{work.title}</h1>
              {work.altTitle && <p className="mt-0.5 truncate text-[12px] font-semibold text-white/60" dir="auto">{work.altTitle}</p>}
              <p className="mt-1 text-[13px] font-bold text-white/80">{work.author}</p>
            </div>
          </div>

          {/* tags */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {work.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-white/80">
                {tag}
              </span>
            ))}
            <span className={cn("rounded-full border px-3 py-1 text-[11px] font-bold", st.cls)}>
              {t(st.key)}
            </span>
            {work.rating > 0 && (
              <span className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-amber-300">
                <Star className="h-3 w-3 fill-current" />
                {work.rating.toFixed(1)}
                {work.ratingCount > 0 ? ` (${(work.ratingCount / 1000).toFixed(1)}k)` : ""}
              </span>
            )}
          </div>

          {/* stats row (v1.2.1): Chapters · personal rating 4/5 · Status */}
          <div className="mt-4 grid grid-cols-3 rounded-3xl border border-white/8 bg-white/[0.04] py-3">
            <StatCell
              icon={<BookMarked className="h-4 w-4" />}
              value={String(work.chapters.length)}
              label={t("det.chapters")}
            />
            <button
              onClick={() => setRatingOpen((o) => !o)}
              aria-label={t("det.yourRating")}
              aria-expanded={ratingOpen}
              className="flex flex-col items-center gap-1 rounded-2xl border-x border-white/8 px-2 text-center transition-colors hover:bg-white/[0.05]"
            >
              <span className="text-[15px] font-black text-white">
                {(work.userRating ?? 0) > 0 ? `${work.userRating}/5` : "—"}
              </span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-white/55">
                <Star className={cn("h-4 w-4", (work.userRating ?? 0) > 0 && "fill-[#f8694c] text-[#f8694c]")} />
                {t("det.yourRating")}
              </span>
            </button>
            <StatCell
              icon={<CheckCircle2 className="h-4 w-4" />}
              value={t(`workstatus.${work.workStatus}` as TranslationKey)}
              label={t("det.status")}
            />
          </div>

          {/* numeric rating picker (v1.2.1) — replaces the old star row */}
          {ratingOpen && (
            <div className="mt-2 flex items-center justify-between rounded-2xl border border-primary/25 bg-coral-soft/30 px-4 py-2.5">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">
                {t("det.rateHint")}
              </span>
              <div className="flex items-center gap-1" role="radiogroup" aria-label={t("det.yourRating")}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = (work.userRating ?? 0) >= n;
                  return (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={work.userRating === n}
                      aria-label={`${t("det.yourRating")}: ${n}/5`}
                      onClick={() => {
                        const cur = work.userRating ?? 0;
                        useApp.getState().setUserRating(work.id, n);
                        if (cur !== n) toast({ title: t("det.rated", { n }) });
                      }}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-black transition-all active:scale-90",
                        on
                          ? "bg-coral-gradient text-white shadow-[0_6px_14px_-6px_rgba(248,105,76,0.8)]"
                          : "bg-white/10 text-white/60 hover:bg-white/20"
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
                <button
                  aria-label={`${t("det.yourRating")}: 0/5`}
                  onClick={() => useApp.getState().setUserRating(work.id, 0)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition-colors hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* personal notes (LIB-010) */}
          <button
            onClick={() => setEditOpen(true)}
            className={cn(
              "mt-3 block w-full rounded-2xl border p-3.5 text-start transition-colors",
              work.personalNotes
                ? "border-amber-300/30 bg-amber-300/[0.07] hover:bg-amber-300/[0.12]"
                : "border-white/8 bg-white/[0.04] hover:bg-white/[0.07]"
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/50">
              <StickyNote className={cn("h-3.5 w-3.5", work.personalNotes && "text-amber-300")} />
              {t("det.myNotes")}
            </span>
            <span
              dir="auto"
              className={cn(
                "mt-1.5 block whitespace-pre-wrap text-[12.5px] font-medium leading-relaxed",
                work.personalNotes ? "text-white/85" : "text-white/60 italic"
              )}
            >
              {work.personalNotes || t("det.notesEmpty")}
            </span>
          </button>

          {/* notes & highlights (round 11) */}
          <button
            onClick={() => push({ kind: "highlights", workId: work.id })}
            className="mt-2.5 flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-2.5 text-start transition-colors hover:bg-white/[0.07]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-coral-soft text-primary">
              <Highlighter className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 text-[13px] font-bold text-white/90">{t("nhl.title")}</span>
            {workHighlightCount > 0 && (
              <span className="shrink-0 rounded-full bg-coral-gradient px-2 py-0.5 text-[10px] font-black text-white shadow-[0_6px_14px_-6px_rgba(248,105,76,0.8)]">
                {lang === "fa" ? toFa(workHighlightCount) : workHighlightCount}
              </span>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-white/60 rtl:rotate-180" />
          </button>

          {/* description */}
          <p
            className={cn(
              "mt-4 text-[13px] font-medium leading-relaxed text-white/70",
              !expanded && "line-clamp-3"
            )}
          >
            {work.description}
          </p>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-1 flex items-center gap-1 text-[12px] font-extrabold text-primary"
          >
            {expanded ? t("det.less") : t("det.more")}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </button>

          {/* local import facts (v1.2.1): size / path / date added / files */}
          {work.isLocal && work.sourceMeta && (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-white/50">
                <FolderOpen className="h-3.5 w-3.5 text-primary" />
                {t("det.localInfo")}
              </p>
              <dl className="mt-2.5 space-y-1.5">
                <InfoRow label={t("det.infoFormat")} value={work.sourceMeta.formats.join(" · ") || "—"} />
                <InfoRow label={t("det.infoSize")} value={formatBytes(work.sourceMeta.sizeBytes)} />
                <InfoRow label={t("det.infoPath")} value={work.sourceMeta.pathLabel || "—"} mono />
                <InfoRow label={t("det.infoAdded")} value={formatDate(work.addedAt, lang)} />
                <InfoRow label={t("det.infoFiles")} value={String(work.sourceMeta.fileCount)} />
              </dl>
            </div>
          )}

          {/* online source card (v1.3.0, [SRC-003]/[UPD-001]): keeps the honest
              source attribution + a real check-for-updates flow for MangaDex */}
          {work.sourceRef?.sourceId === "mangadex" && (
            <div className="mt-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-coral-gradient text-white">
                  <Globe className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-extrabold text-white/90">MangaDex</span>
                  <span className="block truncate text-[10.5px] font-semibold text-white/45" dir="ltr">
                    {work.sourceUrl?.replace("https://", "") ?? "mangadex.org"}
                  </span>
                </span>
                <button
                  onClick={() => void runUpdateCheck()}
                  disabled={updChecking || updBusy}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-coral-gradient px-3.5 text-[11.5px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.7)] disabled:opacity-60"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", (updChecking || updBusy) && "animate-spin")} />
                  {t("upd.checkContent")}
                </button>
              </div>
              {work.lastSourceCheck && (
                <p className="mt-2 text-[10px] font-bold text-white/60">
                  {t("upd.lastChecked")}: {formatDate(work.lastSourceCheck, lang)}
                </p>
              )}
            </div>
          )}
          {!work.sourceRef && work.sourceUrl && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.04] px-3.5 py-2.5">
              <Globe className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-white/60" dir="ltr">
                {(() => {
                  try {
                    return new URL(work.sourceUrl).host;
                  } catch {
                    return work.sourceUrl;
                  }
                })()}
              </span>
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[9.5px] font-black text-white/60">
                OPDS
              </span>
            </div>
          )}

          {/* progress summary */}
          <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-white/60">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-coral-gradient" style={{ width: `${progress}%` }} />
            </div>
            <span>{progress}%</span>
            <span>·</span>
            <span>
              {readCount}/{work.chapters.length}
            </span>
          </div>

          {/* chapters */}
          <div className="mt-6 flex items-center justify-between">
            <h2 className="text-[17px] font-extrabold text-white">{t("det.chapters")}</h2>
            <div className="flex items-center gap-2">
              {manageMode && (
                <button
                  onClick={() => {
                    setSelected(new Set(work.chapters.map((c) => c.id)));
                  }}
                  className="text-[12px] font-bold text-white/70 transition-colors hover:text-white"
                >
                  {t("det.selectAll")}
                </button>
              )}
              <button
                onClick={() => {
                  setManageMode((v) => !v);
                  setSelected(new Set());
                }}
                aria-label={t("det.manageChapters")}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                  manageMode ? "bg-coral-gradient text-white" : "text-white/70 hover:bg-white/10"
                )}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSortNewest((v) => !v)}
                className="flex items-center gap-1 text-[12px] font-bold text-white/70 transition-colors hover:text-white"
              >
                {t("det.sortBy")} {sortNewest ? t("det.latest") : t("det.oldest")}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-2 pb-40">
            {chapters.map((ch) => {
              const idx = work.chapters.findIndex((c) => c.id === ch.id);
              return (
                <ChapterRow
                  key={ch.id}
                  ch={ch}
                  work={work}
                  manage={manageMode}
                  selected={selected.has(ch.id)}
                  onToggleSelect={() => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(ch.id)) n.delete(ch.id);
                      else n.add(ch.id);
                      return n;
                    });
                  }}
                  onRead={() => openReader(work.id, ch.id)}
                  onDownload={() => {
                    if (work.sourceRef?.sourceId === "mangadex" && ch.sourceChapterId) {
                      // real background download for source chapters
                      enqueueMangaDexChapterDownloads(work, [
                        {
                          chapterIndex: idx,
                          md: {
                            id: ch.sourceChapterId,
                            number: ch.number,
                            title: "",
                            pages: ch.pages,
                            publishedAt: ch.releaseDate,
                          },
                        },
                      ]);
                      toast({ title: t("dl.queued"), description: `${t("common.chapter")} ${ch.number}` });
                    } else {
                      // seeded demo library — keep the legacy simulated queue
                      startDownload(work.id, ch.id);
                      toast({ title: `${t("det.download")} — ${t("common.chapter")} ${ch.number}` });
                    }
                  }}
                  onMarkRead={() => markChapterRead(work.id, ch.id, !ch.isRead, true)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* manage-mode action bar (fixed above the CTA zone) */}
      {manageMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 px-5">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#1c1a18]/95 p-2 shadow-[0_18px_44px_-12px_rgba(0,0,0,0.65)] backdrop-blur">
            <button
              onClick={() => {
                if (selected.size !== 1) return;
                setRenameChOpen(true);
              }}
              disabled={selected.size !== 1}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 text-[12px] font-extrabold text-white transition-colors hover:bg-white/20 disabled:opacity-40"
            >
              <Pencil className="h-3.5 w-3.5" /> {t("det.rename")}
            </button>
            <button
              onClick={() => {
                if (selected.size === 0) return;
                setMoveOpen(true);
              }}
              disabled={selected.size === 0}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-white/10 text-[12px] font-extrabold text-white transition-colors hover:bg-white/20 disabled:opacity-40"
            >
              <FolderOpen className="h-3.5 w-3.5" /> {t("det.moveToWork", { n: selected.size })}
            </button>
            <button
              onClick={() => {
                if (selected.size === 0) return;
                setDeleteConfirm(true);
              }}
              disabled={selected.size === 0}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-red-500/20 text-[12px] font-extrabold text-red-300 transition-colors hover:bg-red-500/30 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
            </button>
            <button
              onClick={() => {
                setManageMode(false);
                setSelected(new Set());
              }}
              aria-label={t("common.close")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* continue CTA */}
      {cr && !manageMode && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-30 px-5">
          <button
            onClick={() => openReader(work.id, cr.chapter.id)}
            className="pointer-events-auto flex w-full items-center gap-3 rounded-full bg-coral-gradient py-2.5 ps-3 pe-5 text-white shadow-[0_18px_40px_-12px_rgba(248,105,76,0.75)] transition-transform hover:scale-[1.02]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur">
              <Play className="h-5 w-5 fill-current" />
            </span>
            <span className="min-w-0 flex-1 text-start">
              <span className="block text-[15px] font-extrabold leading-tight">
                {progress > 0 ? t("det.continueReading") : t("det.startReading")}
              </span>
              <span className="block text-[11px] font-semibold text-white/85">
                {t("common.chapter")} {cr.chapter.number}
                {cr.page > 0 ? ` · ${t("common.page")} ${cr.page + 1}` : ""}
              </span>
            </span>
            <ChevronRight className={cn("h-5 w-5 shrink-0", rtl && "rotate-180")} />
          </button>
        </div>
      )}

      {/* per-series reader settings */}
      <Dialog open={readerSettings} onOpenChange={setReaderSettings}>
        <DialogContent className="rounded-3xl bg-card p-5 max-w-[380px] mx-auto" style={{ maxWidth: 380 }}>
          <DialogHeader>
            <DialogTitle className="text-[17px] font-extrabold">{t("det.readerMode")}</DialogTitle>
          </DialogHeader>
          <PerSeriesSettings workId={work.id} />
          <p className="text-[11px] font-semibold text-muted-foreground">{t("rdr.savePerSeries")}</p>
        </DialogContent>
      </Dialog>

      {/* new chapters from the source update check (v1.3.0, [UPD-001]) —
          v1.4.0: chapters append instantly as streamable rows, pages download
          in the background (no more blocking progress dialog) */}
      <Dialog open={updNew !== null} onOpenChange={(v) => !v && setUpdNew(null)}>
        <DialogContent className="max-w-[380px] rounded-3xl border-border bg-card p-5" style={{ maxWidth: 380 }}>
          <>
            <DialogHeader>
              <DialogTitle className="text-[16px] font-extrabold">
                {t("upd.newChapters", { n: updNew?.length ?? 0 })}
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-border/60 p-2 thin-scrollbar">
              {(updNew ?? []).map((c) => (
                <p key={c.id} className="truncate px-2 py-1 text-[12px] font-bold" dir="ltr">
                  {mdChapterLabel(c)}
                </p>
              ))}
            </div>
            <p className="text-[10.5px] font-semibold leading-snug text-muted-foreground">{t("upd.viaMangadex")}</p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setUpdNew(null)}
                disabled={updBusy}
                className="flex-1 rounded-full border border-border bg-background py-2.5 text-[13px] font-extrabold transition-colors hover:bg-secondary"
              >
                {t("common.later")}
              </button>
              <button
                onClick={() => downloadNewChapters()}
                disabled={updBusy}
                className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral-gradient py-2.5 text-[13px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)] disabled:opacity-50"
              >
                {updBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {t("md.downloadN", { n: updNew?.length ?? 0 })}
              </button>
            </div>
          </>
        </DialogContent>
      </Dialog>

      {/* bookmarks list (RDR-013) */}
      <BookmarksSheet
        workId={work.id}
        open={bookmarksOpen}
        onOpenChange={setBookmarksOpen}
        onJump={(chapterId, page) => {
          setBookmarksOpen(false);
          openReader(work.id, chapterId, page);
        }}
      />

      {/* chapter rename (v1.4.0) */}
      <RenameChapterDialog
        workId={work.id}
        chapterId={selected.size === 1 ? [...selected][0] : ""}
        open={renameChOpen}
        onOpenChange={(v) => {
          setRenameChOpen(v);
          if (!v) setSelected(new Set());
        }}
      />

      {/* move chapters to another work (v1.4.0) */}
      <MoveChaptersDialog
        fromId={work.id}
        chapterIds={[...selected]}
        open={moveOpen}
        onOpenChange={(v) => {
          setMoveOpen(v);
          if (!v) setSelected(new Set());
        }}
      />

      {/* delete-chapters confirm (v1.4.0) */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="rounded-3xl bg-card p-5 max-w-[360px] mx-auto" style={{ maxWidth: 360 }}>
          <DialogHeader>
            <DialogTitle className="text-[16px] font-extrabold">{t("det.deleteChaptersTitle", { n: selected.size })}</DialogTitle>
          </DialogHeader>
          <p className="text-[12px] font-semibold leading-relaxed text-muted-foreground">{t("det.deleteChaptersBody")}</p>
          <div className="mt-3 flex gap-2.5">
            <button
              onClick={() => setDeleteConfirm(false)}
              className="flex-1 rounded-full border border-border bg-background py-2.5 text-[13px] font-extrabold transition-colors hover:bg-secondary"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => {
                useApp.getState().deleteChapters(work.id, [...selected]);
                toast({ title: t("det.chaptersDeleted", { n: selected.size }) });
                setDeleteConfirm(false);
                setSelected(new Set());
                setManageMode(false);
              }}
              className="flex-1 rounded-full bg-red-500 py-2.5 text-[13px] font-extrabold text-white"
            >
              {t("common.delete")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* work editor (LIB-010) */}
      <EditWorkDialog workId={work.id} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

function BookmarksSheet({
  workId,
  open,
  onOpenChange,
  onJump,
}: {
  workId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onJump: (chapterId: string, page: number) => void;
}) {
  const { t } = useT();
  const bookmarks = useApp((s) => s.bookmarks);
  const works = useApp((s) => s.works);
  const removeBookmark = useApp((s) => s.removeBookmark);
  const mine = useMemo(() => bookmarks.filter((b) => b.workId === workId), [bookmarks, workId]);
  const work = works.find((w) => w.id === workId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-auto bottom-0 translate-y-0 rounded-t-[2rem] border-0 bg-card p-5 max-w-[412px] mx-auto" style={{ maxWidth: 412 }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[18px] font-extrabold">
            <Bookmark className="h-5 w-5 text-primary" />
            {t("bm.title")}
            {mine.length > 0 && (
              <span className="ms-auto rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-bold text-secondary-foreground">
                {mine.length}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {mine.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-[14px] font-bold">{t("bm.empty")}</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[12px] leading-relaxed text-muted-foreground">{t("bm.emptyHint")}</p>
          </div>
        ) : (
          <div className="max-h-[320px] space-y-2 overflow-y-auto thin-scrollbar">
            {mine.map((b) => {
              const ch = work?.chapters.find((c) => c.id === b.chapterId);
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-secondary/40 p-2.5"
                >
                  <button
                    onClick={() => ch && onJump(ch.id, b.page)}
                    className="min-w-0 flex-1 text-start"
                  >
                    <p className="truncate text-[13px] font-extrabold">
                      {t("common.chapter")} {ch?.number ?? "—"}
                      {" · "}
                      {t("common.page")} {b.page + 1}
                    </p>
                    <p className="truncate text-[11px] font-semibold text-muted-foreground">
                      {ch?.title}
                    </p>
                  </button>
                  <button
                    onClick={() => ch && onJump(ch.id, b.page)}
                    className="flex h-8 items-center rounded-full bg-coral-soft px-3 text-[11px] font-extrabold text-primary"
                  >
                    {t("hist.resume")}
                  </button>
                  <button
                    onClick={() => removeBookmark(b.id)}
                    aria-label={t("bm.remove")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function WorkMenuInline({ workId }: { workId: string }) {
  const work = useApp((s) => s.works.find((w) => w.id === workId));
  if (!work) return null;
  return <WorkMenu work={work} onDone={() => undefined} />;
}

function StatCell({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 text-center">
      <span className="text-[15px] font-black text-white">{value}</span>
      <span className="flex items-center gap-1 text-[10px] font-bold text-white/55">
        {icon}
        {label}
      </span>
    </div>
  );
}

/* local file facts helpers (v1.2.1) */

function formatBytes(n: number): string {
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(2)} GB`;
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

function formatDate(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] font-bold text-white/45">{label}</dt>
      <dd
        dir="auto"
        title={value}
        className={cn("min-w-0 truncate text-end font-semibold text-white/85", mono && "font-mono text-[11px]")}
      >
        {value}
      </dd>
    </div>
  );
}

function ChapterRow({
  ch,
  work,
  onRead,
  onDownload,
  onMarkRead,
  manage = false,
  selected = false,
  onToggleSelect,
}: {
  ch: Chapter;
  work: { title: string; cover: string; coverColor?: string };
  onRead: () => void;
  onDownload: () => void;
  onMarkRead: () => void;
  manage?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { t, lang } = useT();
  const dlState = ch.download;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.045] p-2.5 transition-colors",
        !ch.isRead && "border-primary/20",
        manage && selected && "border-primary bg-primary/10"
      )}
    >
      {manage ? (
        <button
          onClick={onToggleSelect}
          aria-label={t("det.selectAll")}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected ? "border-transparent bg-coral-gradient text-white" : "border-white/20 text-white/60"
          )}
        >
          {selected && <Check className="h-4 w-4" strokeWidth={3} />}
        </button>
      ) : (
        <button onClick={onRead}>
          <WorkCover src={work.cover} color={work.coverColor} title={work.title} className="h-[52px] w-[76px] rounded-xl" sizes="76px" />
        </button>
      )}
      <button
        onClick={manage ? onToggleSelect : onRead}
        className="min-w-0 flex-1 text-start"
      >
        <p className={cn("truncate text-[14px] font-extrabold", ch.isRead ? "text-white/60" : "text-white")}>
          {t("common.chapter")} {ch.number}
        </p>
        <p className="truncate text-[11px] font-semibold text-white/55">{ch.title}</p>
        <p className="flex items-center gap-1.5 text-[10px] font-bold text-white/60">
          {timeAgo(ch.releaseDate, lang)}
          {/* v1.4.0: honest stream/download state for source chapters */}
          {ch.download === "NONE" && ch.sourceChapterId && (
            <span className="rounded-full bg-white/10 px-1.5 py-px text-[9px] font-black text-white/60">
              {t("det.streaming")}
            </span>
          )}
          {ch.download === "DONE" && ch.localPages?.length && (
            <span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-black text-primary">
              {ch.pages}p · {ch.sizeMb > 0 ? `${ch.sizeMb} MB` : t("det.downloadedBadge")}
            </span>
          )}
        </p>
      </button>
      {manage ? null : dlState === "DOWNLOADING" || dlState === "QUEUED" ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
      ) : dlState === "DONE" ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary" title={t("det.downloadedBadge")}>
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      ) : (
        <button
          onClick={onDownload}
          aria-label={t("det.download")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/75 transition-colors hover:border-primary hover:text-primary"
        >
          <Download className="h-4 w-4" />
        </button>
      )}
      {!manage && (
        <button
          onClick={onMarkRead}
          aria-label={t("upd.markRead")}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
            ch.isRead
              ? "border-transparent bg-coral-gradient text-white shadow-[0_6px_14px_-6px_rgba(248,105,76,0.8)]"
              : "border-white/15 text-white/50 hover:border-primary hover:text-primary"
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function PerSeriesSettings({ workId }: { workId: string }) {
  const { t } = useT();
  const work = useApp((s) => s.works.find((w) => w.id === workId));
  const updateWork = useApp((s) => s.updateWork);
  if (!work) return null;

  const Option = ({
    active,
    onClick,
    children,
  }: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all",
        active ? "bg-coral-gradient text-white" : "bg-secondary text-secondary-foreground"
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[13px] font-bold text-muted-foreground">{t("rdr.direction")}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["RTL", "rdr.dir.rtl"],
              ["LTR", "rdr.dir.ltr"],
              ["VERTICAL", "rdr.mode.webtoon"],
            ] as [ReadingDirection, TranslationKey][]
          ).map(([id, label]) => (
            <Option key={id} active={work.direction === id} onClick={() => updateWork(workId, { direction: id })}>
              {t(label)}
            </Option>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-bold text-muted-foreground">{t("rdr.readingMode")}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["PAGED", "rdr.mode.paged"],
              ["DOUBLE", "rdr.mode.double"],
              ["CONTINUOUS", "rdr.mode.continuous"],
              ["WEBTOON", "rdr.mode.webtoon"],
            ] as [ReaderMode, TranslationKey][]
          ).map(([id, label]) => (
            <Option key={id} active={work.readerMode === id} onClick={() => updateWork(workId, { readerMode: id })}>
              {t(label)}
            </Option>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-[13px] font-bold text-muted-foreground">{t("rdr.fit")}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["WIDTH", "rdr.fit.WIDTH"],
              ["HEIGHT", "rdr.fit.HEIGHT"],
              ["SCREEN", "rdr.fit.SCREEN"],
              ["ORIGINAL", "rdr.fit.ORIGINAL"],
            ] as [FitMode, TranslationKey][]
          ).map(([id, label]) => (
            <Option key={id} active={work.fitMode === id} onClick={() => updateWork(workId, { fitMode: id })}>
              {t(label)}
            </Option>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   EditWorkDialog — custom cover / title / author / tags /
   personal notes (PRD LIB-010). Cover images are canvas-resized
   to keep localStorage small.
   ============================================================ */

const MAX_COVER_H = 480;

async function fileToCoverDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("read-failed"));
    fr.readAsDataURL(file);
  });
  return new Promise<string>((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_COVER_H / img.naturalHeight);
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const ctx = cv.getContext("2d");
      if (!ctx) {
        resolve(raw);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(cv.toDataURL("image/jpeg", 0.82));
      } catch {
        resolve(raw);
      }
    };
    img.onerror = () => resolve(raw);
    img.src = raw;
  });
}

function EditWorkDialog({
  workId,
  open,
  onOpenChange,
}: {
  workId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const work = useApp((s) => s.works.find((w) => w.id === workId));
  // remount-based seeding: the inner form only exists while the dialog is
  // open, so plain useState initializers always reflect the current work
  if (!open || !work) return null;
  return <EditWorkDialogInner key={`${work.id}:${work.customCover ?? "-"}:${work.personalNotes ?? "-"}`} work={work} onOpenChange={onOpenChange} />;
}

function EditWorkDialogInner({
  work,
  onOpenChange,
}: {
  work: Work;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT();
  const workId = work.id;
  const [title, setTitle] = useState(work.title);
  const [author, setAuthor] = useState(work.author);
  const [tags, setTags] = useState<string[]>([...work.tags]);
  const [tagDraft, setTagDraft] = useState("");
  const [notes, setNotes] = useState(work.personalNotes ?? "");
  const [cover, setCover] = useState<string | undefined>(work.customCover);

  const addTag = () => {
    const v = tagDraft.trim().replace(/^#/, "");
    if (!v) return;
    if (!tags.some((x) => x.toLowerCase() === v.toLowerCase()) && tags.length < 12) {
      setTags([...tags, v]);
    }
    setTagDraft("");
  };

  const save = () => {
    useApp.getState().updateWork(workId, {
      title: title.trim() || work.title,
      author: author.trim() || work.author,
      tags,
      personalNotes: notes.trim() || undefined,
      customCover: cover,
    });
    onOpenChange(false);
    toast({ title: t("edit.saved") });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dark top-auto bottom-0 left-1/2 max-h-[90%] w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 overflow-y-auto rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9 thin-scrollbar"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start text-[16px] font-extrabold">
            <Pencil className="h-4.5 w-4.5 text-primary" />
            {t("edit.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* cover */}
          <div className="flex items-center gap-4 rounded-2xl border border-border bg-white/[0.03] p-3">
            <div className="relative h-[84px] w-[60px] shrink-0 overflow-hidden rounded-xl bg-secondary shadow-inner">
              {cover ? (
                <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : work.cover ? (
                <img src={work.cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className={cn("h-full w-full bg-gradient-to-br", work.coverColor ?? "from-orange-500 to-rose-900")} />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-[12px] font-extrabold">{t("edit.cover")}</p>
              <p className="text-[10.5px] font-semibold text-muted-foreground">{t("edit.coverHint")}</p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-coral-soft px-3 text-[11px] font-extrabold text-primary transition-opacity hover:opacity-85">
                  <ImagePlus className="h-3.5 w-3.5" />
                  {t("edit.chooseCover")}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      void fileToCoverDataUrl(f).then(setCover);
                    }}
                  />
                </label>
                {cover && (
                  <button
                    type="button"
                    onClick={() => setCover(undefined)}
                    className="flex h-8 items-center rounded-full border border-border px-3 text-[11px] font-bold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    {t("edit.removeCover")}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* title + author */}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                {t("edit.name")}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                dir="auto"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-bold outline-none transition-colors focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                {t("edit.author")}
              </span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                dir="auto"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-bold outline-none transition-colors focus:border-primary"
              />
            </label>
          </div>

          {/* tags */}
          <div>
            <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
              {t("edit.tags")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full bg-coral-soft py-1 ps-3 pe-1.5 text-[11px] font-bold text-primary"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== tag))}
                    aria-label={`${t("common.delete")}: ${tag}`}
                    className="flex h-4.5 w-4.5 items-center justify-center rounded-full transition-colors hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder={t("edit.addTag")}
                dir="auto"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-[12.5px] font-semibold outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
              />
              <button
                type="button"
                onClick={addTag}
                className="rounded-xl bg-secondary px-3.5 text-[12px] font-extrabold text-secondary-foreground transition-colors hover:bg-secondary/70"
              >
                {t("edit.add")}
              </button>
            </div>
          </div>

          {/* notes */}
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
              {t("edit.notes")}
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("edit.notesPlaceholder")}
              dir="auto"
              rows={4}
              className="w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-3 text-[13px] font-medium leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
            />
          </label>

          {/* actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-full border border-border py-3 text-[13px] font-extrabold text-muted-foreground transition-colors hover:bg-secondary/50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={save}
              className="flex-1 rounded-full bg-coral-gradient py-3 text-[13px] font-extrabold text-white shadow-[0_12px_26px_-10px_rgba(248,105,76,0.8)] transition-transform hover:scale-[1.02]"
            >
              {t("common.save")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* chapter rename dialog (v1.4.0)                                      */
/* ------------------------------------------------------------------ */

function RenameChapterDialog({
  workId,
  chapterId,
  open,
  onOpenChange,
}: {
  workId: string;
  chapterId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT();
  const chapter = useApp((s) =>
    s.works.find((w) => w.id === workId)?.chapters.find((c) => c.id === chapterId)
  );
  const [draft, setDraft] = useState("");

  // seed the input each time the dialog opens with a different chapter
  const [seededFor, setSeededFor] = useState("");
  if (open && chapterId && seededFor !== chapterId) {
    setSeededFor(chapterId);
    setDraft(chapter?.title ?? "");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl bg-card p-5 max-w-[380px] mx-auto" style={{ maxWidth: 380 }}>
        <DialogHeader>
          <DialogTitle className="text-[16px] font-extrabold">{t("det.renameChapterTitle")}</DialogTitle>
        </DialogHeader>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              useApp.getState().renameChapter(workId, chapterId, draft);
              toast({ title: t("det.chapterRenamed") });
              onOpenChange(false);
            }
          }}
          dir="auto"
          className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-4 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="mt-3 flex gap-2.5">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-full border border-border bg-background py-2.5 text-[13px] font-extrabold transition-colors hover:bg-secondary"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => {
              if (!draft.trim()) return;
              useApp.getState().renameChapter(workId, chapterId, draft);
              toast({ title: t("det.chapterRenamed") });
              onOpenChange(false);
            }}
            disabled={!draft.trim()}
            className="flex-1 rounded-full bg-coral-gradient py-2.5 text-[13px] font-extrabold text-white disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* move-chapters dialog (v1.4.0) — searchable target work picker       */
/* ------------------------------------------------------------------ */

function MoveChaptersDialog({
  fromId,
  chapterIds,
  open,
  onOpenChange,
}: {
  fromId: string;
  chapterIds: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const [query, setQuery] = useState("");
  const [busyTo, setBusyTo] = useState<string | null>(null);

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return works
      .filter((w) => w.id !== fromId)
      .filter((w) => !q || w.title.toLowerCase().includes(q))
      .slice(0, 30);
  }, [works, fromId, query]);

  const move = async (toId: string, toTitle: string) => {
    if (busyTo || chapterIds.length === 0) return;
    setBusyTo(toId);
    const ok = await useApp.getState().moveChapters(fromId, chapterIds, toId);
    setBusyTo(null);
    if (ok) {
      toast({ title: t("det.chaptersMoved", { n: chapterIds.length }), description: toTitle });
      onOpenChange(false);
      setQuery("");
    } else {
      toast({ title: t("det.moveFailed"), variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl bg-card p-5 max-w-[400px] mx-auto" style={{ maxWidth: 400 }}>
        <DialogHeader>
          <DialogTitle className="text-[16px] font-extrabold">
            {t("det.moveToWork", { n: chapterIds.length })}
          </DialogTitle>
        </DialogHeader>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("common.search")}
          className="mt-2 h-10 w-full rounded-2xl border border-border bg-background px-4 text-[13.5px] font-semibold outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="mt-2 max-h-72 space-y-1.5 overflow-y-auto thin-scrollbar">
          {targets.map((w) => (
            <button
              key={w.id}
              onClick={() => void move(w.id, w.title)}
              disabled={!!busyTo}
              className="flex w-full items-center gap-3 rounded-2xl border border-border/60 p-2 text-start transition-colors hover:bg-secondary/60 disabled:opacity-50"
            >
              <WorkCover src={w.cover} color={w.coverColor} title={w.title} className="h-[44px] w-[64px] rounded-xl" sizes="64px" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-extrabold">{w.title}</span>
                <span className="block text-[10.5px] font-semibold text-muted-foreground">
                  {t("common.chapters")} {w.chapters.length}
                </span>
              </span>
              {busyTo === w.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
              )}
            </button>
          ))}
          {targets.length === 0 && (
            <p className="py-4 text-center text-[12px] font-bold text-muted-foreground">{t("md.noResults")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
