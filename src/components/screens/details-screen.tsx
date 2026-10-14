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
  ArrowUpDown,
} from "lucide-react";
import { WorkCover } from "@/components/shared";
import { WorkMenu } from "@/components/screens/library-screen";
import { useApp, useNav, continueReading, timeAgo, workProgress } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
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
import type { Chapter, ReadingStatus, ReaderMode, ReadingDirection, FitMode } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

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
                onClick={() => toast({ title: t("rdr.bookmarkAdded") })}
                aria-label={t("rdr.zoom")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
              >
                <Bookmark className="h-5 w-5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button aria-label={t("common.more")} className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
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
              src={work.cover}
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
          </div>

          {/* stats row */}
          <div className="mt-4 grid grid-cols-3 rounded-3xl border border-white/8 bg-white/[0.04] py-3">
            <StatCell
              icon={<BookMarked className="h-4 w-4" />}
              value={String(work.chapters.length)}
              label={t("det.chapters")}
            />
            <div className="border-x border-white/8" />
            <StatCell
              icon={<CheckCircle2 className="h-4 w-4" />}
              value={t(`workstatus.${work.workStatus}` as TranslationKey)}
              label={t("det.status")}
            />
            <div className="border-x border-white/8" />
            <StatCell
              icon={<Star className="h-4 w-4 fill-current" />}
              value={work.rating > 0 ? work.rating.toFixed(1) : "—"}
              label={work.ratingCount > 0 ? `(${(work.ratingCount / 1000).toFixed(0)}k)` : ""}
            />
          </div>

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
            <button
              onClick={() => setSortNewest((v) => !v)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-white/70 transition-colors hover:text-white"
            >
              {t("det.sortBy")} {sortNewest ? t("det.latest") : t("det.oldest")}
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 space-y-2 pb-40">
            {chapters.map((ch) => (
              <ChapterRow
                key={ch.id}
                ch={ch}
                work={work}
                onRead={() => openReader(work.id, ch.id)}
                onDownload={() => {
                  startDownload(work.id, ch.id);
                  toast({ title: `${t("det.download")} — ${t("common.chapter")} ${ch.number}` });
                }}
                onMarkRead={() => markChapterRead(work.id, ch.id, !ch.isRead, true)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* continue CTA */}
      {cr && (
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
    </div>
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

function ChapterRow({
  ch,
  work,
  onRead,
  onDownload,
  onMarkRead,
}: {
  ch: Chapter;
  work: { title: string; cover: string; coverColor?: string };
  onRead: () => void;
  onDownload: () => void;
  onMarkRead: () => void;
}) {
  const { t, lang } = useT();
  const dlState = ch.download;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.045] p-2.5 transition-colors",
        !ch.isRead && "border-primary/20"
      )}
    >
      <button onClick={onRead}>
        <WorkCover src={work.cover} color={work.coverColor} title={work.title} className="h-[52px] w-[76px] rounded-xl" sizes="76px" />
      </button>
      <button onClick={onRead} className="min-w-0 flex-1 text-start">
        <p className={cn("truncate text-[14px] font-extrabold", ch.isRead ? "text-white/60" : "text-white")}>
          {t("common.chapter")} {ch.number}
        </p>
        <p className="truncate text-[11px] font-semibold text-white/55">{ch.title}</p>
        <p className="text-[10px] font-bold text-white/40">{timeAgo(ch.releaseDate, lang)}</p>
      </button>
      {dlState === "DOWNLOADING" || dlState === "QUEUED" ? (
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
      <button
        onClick={onMarkRead}
        aria-label={t("upd.markRead")}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors",
          ch.isRead ? "border-primary/50 bg-primary/15 text-primary" : "border-white/15 text-white/50 hover:border-primary hover:text-primary"
        )}
      >
        <CheckCircle2 className="h-4 w-4" />
      </button>
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
