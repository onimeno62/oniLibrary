"use client";

import { useMemo, useState } from "react";
import {
  Search,
  MoreVertical,
  Pause,
  Play,
  Check,
  X,
  RotateCcw,
  Trash2,
  Database,
  Download,
  BookOpen,
  AlertTriangle,
  Wifi,
} from "lucide-react";
import { WorkCover, EmptyState, ProgressBar } from "@/components/shared";
import { useApp, useNav } from "@/lib/store";
import { STORAGE } from "@/lib/seed";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import type { DownloadItem } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

type Filter = "ALL" | "ACTIVE" | "DONE" | "ERROR";

export function DownloadsScreen() {
  const { t } = useT();
  const downloads = useApp((s) => s.downloads);
  const works = useApp((s) => s.works);
  const openReader = useNav((s) => s.openReader);
  const openWork = useNav((s) => s.openWork);
  const [filter, setFilter] = useState<Filter>("ALL");

  const byId = useMemo(() => {
    const m = new Map<string, { title: string; cover: string; color?: string; num: number }>();
    for (const w of works) {
      for (const c of w.chapters) {
        m.set(c.id, { title: w.title, cover: w.cover, color: w.coverColor, num: c.number });
      }
    }
    return m;
  }, [works]);

  const active = downloads.filter((d) => d.status === "ACTIVE" || d.status === "QUEUED");
  const paused = downloads.filter((d) => d.status === "PAUSED");
  const done = downloads.filter((d) => d.status === "DONE");
  const failed = downloads.filter((d) => d.status === "ERROR");

  const shown = useMemo(() => {
    switch (filter) {
      case "ACTIVE":
        return [...active, ...paused];
      case "DONE":
        return done;
      case "ERROR":
        return failed;
      default:
        return downloads;
    }
  }, [filter, downloads, active, paused, done, failed]);

  const activeShown = filter === "ALL" ? active : [];
  const pausedShown = filter === "ALL" ? paused : [];
  const doneShown = filter === "ALL" ? done : shown.filter((d) => d.status === "DONE");
  const failedShown = filter === "ALL" ? failed : shown.filter((d) => d.status === "ERROR");

  const downloadedMb = done.reduce((a, d) => a + d.downloadedMb, 0);
  const totalUsedGb = STORAGE.usedOtherGb + STORAGE.downloadsGb + downloadedMb / 1024;
  const usedPct = Math.round((totalUsedGb / STORAGE.totalGb) * 100);

  return (
    <div className="min-h-full px-5 pb-8">
      {/* header */}
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-soft text-primary">
            <Download className="h-5 w-5" />
          </span>
          <h1 className="text-[24px] font-black tracking-tight">{t("dl.title")}</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => useNav.getState().push({ kind: "search" })}
            aria-label={t("common.search")}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-secondary"
          >
            <Search className="h-[21px] w-[21px]" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button aria-label={t("common.more")} className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-secondary">
                <MoreVertical className="h-[21px] w-[21px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              <DropdownMenuItem onClick={() => useNav.getState().push({ kind: "settings" })} className="gap-2 rounded-xl text-[13px] font-semibold">
                <Wifi className="h-4 w-4 text-primary" /> {t("more.dlRules")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* filter chips */}
      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {(
          [
            ["ALL", t("common.all")],
            ["ACTIVE", t("dl.active")],
            ["DONE", t("dl.completed")],
            ["ERROR", t("dl.failed")],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-all",
              filter === id
                ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                : "bg-card text-secondary-foreground shadow-[0_4px_12px_-8px_rgba(43,36,29,0.3)] hover:bg-secondary"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {filter === "ALL" || filter === "ACTIVE" ? (
        <>
          {/* active */}
          <section className="mt-6">
            <SectionRow title={t("dl.activeDownloads")} />
            {activeShown.length === 0 && pausedShown.length === 0 ? (
              <EmptyState icon={<Download className="h-6 w-6" />} title={t("dl.emptyActive")} hint={t("dl.emptyActiveHint")} />
            ) : (
              <div className="space-y-2.5">
                {activeShown.map((d) => (
                  <ActiveRow key={d.id} d={d} meta={byId.get(d.chapterId)} onOpen={() => openWork(d.workId)} />
                ))}
                {pausedShown.map((d) => (
                  <ActiveRow key={d.id} d={d} meta={byId.get(d.chapterId)} onOpen={() => openWork(d.workId)} />
                ))}
              </div>
            )}
          </section>

          {/* completed */}
          <section className="mt-6">
            <SectionRow title={t("dl.completedDownloads")} />
            {doneShown.length === 0 ? (
              <p className="py-3 text-[13px] font-semibold text-muted-foreground">{t("dl.emptyDone")}</p>
            ) : (
              <div className="space-y-2.5">
                {doneShown.map((d) => (
                  <DoneRow key={d.id} d={d} meta={byId.get(d.chapterId)} onRead={() => openReader(d.workId, d.chapterId)} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="mt-6">
          <SectionRow title={filter === "DONE" ? t("dl.completedDownloads") : t("dl.failedDownloads")} />
          {shown.length === 0 ? (
            <EmptyState
              icon={filter === "ERROR" ? <AlertTriangle className="h-6 w-6" /> : <Download className="h-6 w-6" />}
              title={filter === "ERROR" ? t("dl.emptyFailed") : t("dl.emptyDone")}
            />
          ) : (
            <div className="space-y-2.5">
              {filter === "DONE"
                ? doneShown.map((d) => <DoneRow key={d.id} d={d} meta={byId.get(d.chapterId)} onRead={() => openReader(d.workId, d.chapterId)} />)
                : failedShown.map((d) => <DoneRow key={d.id} d={d} meta={byId.get(d.chapterId)} onRead={() => openReader(d.workId, d.chapterId)} />)}
            </div>
          )}
        </section>
      )}

      {/* storage */}
      <section className="mt-6">
        <div className="rounded-3xl border border-border bg-card p-4 shadow-[0_10px_26px_-18px_rgba(43,36,29,0.4)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Database className="h-5 w-5" />
            </span>
            <p className="text-[14px] font-extrabold">{t("dl.storageUsage")}</p>
            <span className="ms-auto text-[11px] font-bold text-muted-foreground">{usedPct}%</span>
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <ProgressBar value={usedPct} className="h-1.5 flex-1" />
            <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
              {totalUsedGb.toFixed(1)} GB / {STORAGE.totalGb} GB
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-2xl bg-secondary/50 px-3.5 py-2.5">
            <span className="text-[12px] font-bold text-secondary-foreground">{t("dl.wifiOnly")}</span>
            <WifiSwitch />
          </div>
          <button
            onClick={() => toast({ title: t("dl.cacheCleared"), description: `${STORAGE.cacheMb} MB` })}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-coral-soft py-2.5 text-[13px] font-extrabold text-primary transition-opacity hover:opacity-85"
          >
            <Trash2 className="h-4 w-4" />
            {t("dl.clearCache")} · {STORAGE.cacheMb} MB
          </button>
        </div>
      </section>
    </div>
  );
}

function WifiSwitch() {
  const { t } = useT();
  const wifiOnly = useApp((s) => s.settings.wifiOnly);
  const setSettings = useApp((s) => s.setSettings);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold text-muted-foreground">{t("dl.wifiOnlyHint")}</span>
      <Switch checked={wifiOnly} onCheckedChange={(v) => setSettings({ wifiOnly: v })} className="data-[state=checked]:bg-primary" />
    </div>
  );
}

function SectionRow({ title }: { title: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[16px] font-extrabold tracking-tight">{title}</h2>
    </div>
  );
}

function ActiveRow({
  d,
  meta,
  onOpen,
}: {
  d: DownloadItem;
  meta?: { title: string; cover: string; color?: string; num: number };
  onOpen: () => void;
}) {
  const { t, lang } = useT();
  const pause = useApp((s) => s.pauseDownload);
  const resume = useApp((s) => s.resumeDownload);
  if (!meta) return null;
  const paused = d.status === "PAUSED" || d.status === "QUEUED";
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-2.5 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)]">
      <button onClick={onOpen}>
        <WorkCover src={meta.cover} color={meta.color} title={meta.title} className="h-[64px] w-[52px] rounded-2xl" sizes="52px" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold">{meta.title}</p>
        <p className="text-[12px] font-semibold text-muted-foreground">
          {t("common.chapter")} {meta.num}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <ProgressBar value={d.progress} className="h-[4px] flex-1" />
          <span className="shrink-0 text-[10px] font-black text-muted-foreground">{Math.round(d.progress)}%</span>
        </div>
        <p className="mt-1 text-[10px] font-bold text-muted-foreground">
          {paused ? (
            <span className="text-primary">{d.status === "PAUSED" ? t("dl.pausedState") : t("dl.queue")}</span>
          ) : (
            `${d.downloadedMb.toFixed(1)} MB / ${d.totalMb.toFixed(1)} MB · ${d.speedMbps.toFixed(1)} MB/s`
          )}
        </p>
      </div>
      <button
        onClick={() => (paused ? resume(d.id) : pause(d.id))}
        aria-label={paused ? t("dl.resume") : t("dl.pause")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent hover:text-primary"
      >
        {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
      </button>
    </div>
  );
}

function DoneRow({
  d,
  meta,
  onRead,
}: {
  d: DownloadItem;
  meta?: { title: string; cover: string; color?: string; num: number };
  onRead: () => void;
}) {
  const { t } = useT();
  const remove = useApp((s) => s.removeDownload);
  const retry = useApp((s) => s.retryDownload);
  const failed = d.status === "ERROR";
  if (!meta) return null;
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-2.5 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)]">
      <button onClick={onRead}>
        <WorkCover src={meta.cover} color={meta.color} title={meta.title} className="h-[64px] w-[52px] rounded-2xl" sizes="52px" />
      </button>
      <button onClick={onRead} className="min-w-0 flex-1 text-start">
        <p className="truncate text-[14px] font-extrabold">{meta.title}</p>
        <p className="text-[12px] font-semibold text-muted-foreground">
          {t("common.chapter")} {meta.num}
        </p>
        <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
          {failed ? (
            <span className="text-destructive">{d.error ?? t("dl.failedState")}</span>
          ) : (
            `${d.downloadedMb.toFixed(1)} MB • ${t("dl.completeState")}`
          )}
        </p>
      </button>
      {failed ? (
        <button
          onClick={() => retry(d.id)}
          aria-label={t("dl.retry")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-foreground hover:bg-accent"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={onRead}
          aria-label={t("common.open")}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 transition-colors hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-400"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label={t("common.more")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary">
            <MoreVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-2xl">
          <DropdownMenuItem onClick={onRead} className="gap-2.5 rounded-xl text-[13px] font-semibold">
            <BookOpen className="h-4 w-4 text-primary" /> {t("common.open")}
          </DropdownMenuItem>
          {failed && (
            <DropdownMenuItem onClick={() => retry(d.id)} className="gap-2.5 rounded-xl text-[13px] font-semibold">
              <RotateCcw className="h-4 w-4 text-primary" /> {t("dl.retry")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => {
              if (window.confirm(t("dl.deleteConfirm"))) remove(d.id);
            }}
            className="gap-2.5 rounded-xl text-[13px] font-semibold text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
