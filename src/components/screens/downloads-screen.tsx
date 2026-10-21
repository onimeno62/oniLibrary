"use client";

import { useEffect, useMemo, useState } from "react";
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
import { oniBridge } from "@/lib/android-bridge";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { cancelBgDownload, enqueueMangaDexChapterDownloads, pumpBgDownloads } from "@/lib/bg-downloads";
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
    const m = new Map<string, { title: string; cover: string; color?: string; num: number; workId: string; streamable: boolean; pages: number; publishedAt: string; sourceChapterId?: string }>();
    for (const w of works) {
      for (const c of w.chapters) {
        m.set(c.id, {
          title: w.title,
          cover: w.cover,
          color: w.coverColor,
          num: c.number,
          workId: w.id,
          streamable: w.sourceRef?.sourceId === "mangadex" && !!c.sourceChapterId,
          pages: c.pages,
          publishedAt: c.releaseDate,
          sourceChapterId: c.sourceChapterId,
        });
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

  // Audit D4 (DWN-010): honest storage numbers. The old card summed mockup
  // constants from seed.ts and shipped a no-op "Clear cache" button. Now:
  // - "Downloaded content" = real bytes of DONE rows
  // - "App data" = navigator.storage.estimate() usage (browser-measured)
  // - "Free on device" = StatFs via the OniAndroid bridge (APK only)
  // Unknown values render as "—" instead of being fabricated.
  const [st, setSt] = useState<{ appMb: number | null; freeGb: number | null; totalGb: number | null }>({
    appMb: null,
    freeGb: null,
    totalGb: null,
  });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        if (alive && est && typeof est.usage === "number") {
          setSt((s) => ({ ...s, appMb: Math.round(est.usage as number / (1024 * 1024)) }));
        }
      } catch {
        /* estimate unavailable — the row stays honest "—" */
      }
      try {
        const raw = oniBridge()?.deviceStorage?.();
        if (alive && typeof raw === "string") {
          const [total, free] = raw.split("|").map(Number);
          if (Number.isFinite(total) && Number.isFinite(free)) {
            setSt((s) => ({ ...s, freeGb: free / 1024 ** 3, totalGb: total / 1024 ** 3 }));
          }
        }
      } catch {
        /* bridge unavailable (web build) — row stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const lowStorage = st.freeGb !== null && st.freeGb < 1;

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
            <SectionRow title={t("dl.activeDownloads")} onSeeAll={() => setFilter("ACTIVE")} />
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
            <SectionRow title={t("dl.completedDownloads")} onSeeAll={() => setFilter("DONE")} />
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

      {/* storage — honest numbers only (audit D4): no mockup constants,
          no "other apps" guesswork, no fake cache-clear action */}
      <section className="mt-6">
        <div className="rounded-3xl border border-border bg-card p-4 shadow-[0_10px_26px_-18px_rgba(43,36,29,0.4)]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
              <Database className="h-5 w-5" />
            </span>
            <p className="text-[14px] font-extrabold">{t("dl.storageUsage")}</p>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 ps-0.5" dir="ltr">
            <span className="text-[20px] font-black leading-none">
              {st.freeGb !== null ? `${st.freeGb.toFixed(1)} GB` : st.appMb !== null ? `${(st.appMb / 1024).toFixed(2)} GB` : "—"}
            </span>
            <span className="text-[12px] font-bold text-muted-foreground">
              {st.freeGb !== null && st.totalGb !== null ? `/ ${st.totalGb.toFixed(0)} GB` : ""}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold leading-snug text-muted-foreground">
            {st.freeGb !== null ? t("dl.deviceFree") : t("dl.appData")}
          </p>
          <div className="mt-3 space-y-1.5">
            <LegendRow
              color="#f8694c"
              label={t("dl.downloaded")}
              value={downloadedMb > 0 ? `${(downloadedMb / 1024).toFixed(2)} GB` : "0 MB"}
            />
            <LegendRow
              color="#a0917f"
              label={t("dl.appData")}
              value={st.appMb !== null ? `${(st.appMb / 1024).toFixed(2)} GB` : "—"}
            />
            {st.freeGb !== null && (
              <LegendRow
                color="var(--secondary)"
                label={t("dl.deviceFree")}
                value={`${st.freeGb.toFixed(1)} GB`}
              />
            )}
          </div>
          <p className="mt-2.5 text-[11px] font-semibold leading-snug text-muted-foreground">{t("dl.storageNote")}</p>
          {lowStorage && (
            <div className="mt-2.5 flex items-center gap-2 rounded-2xl bg-amber-500/10 px-3.5 py-2.5 text-[12px] font-bold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t("dl.storageWarn")}
            </div>
          )}
          <div className="mt-3 rounded-2xl bg-secondary/50 px-3.5 py-2.5">
            <WifiSwitch />
          </div>
        </div>
      </section>
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-secondary-foreground">{label}</span>
      <span className="text-[11px] font-extrabold text-muted-foreground" dir="ltr">
        {value}
      </span>
    </div>
  );
}

/** donut removed in favor of the mockup's linear storage bar */

function WifiSwitch() {
  const { t } = useT();
  const wifiOnly = useApp((s) => s.settings.wifiOnly);
  const setSettings = useApp((s) => s.setSettings);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[12px] font-bold text-secondary-foreground">{t("dl.wifiOnly")}</span>
        <span className="block text-[10px] font-semibold text-muted-foreground">{t("dl.wifiOnlyHint")}</span>
      </span>
      <Switch checked={wifiOnly} onCheckedChange={(v) => setSettings({ wifiOnly: v })} className="data-[state=checked]:bg-primary" />
    </div>
  );
}

function SectionRow({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  const { t } = useT();
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[16px] font-extrabold tracking-tight">{title}</h2>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="text-[12px] font-bold text-primary transition-opacity hover:opacity-75"
        >
          {t("common.seeAll")}
        </button>
      )}
    </div>
  );
}

function ActiveRow({
  d,
  meta,
  onOpen,
}: {
  d: DownloadItem;
  meta?: { title: string; cover: string; color?: string; num: number; workId: string; streamable: boolean; pages: number; publishedAt: string; sourceChapterId?: string };
  onOpen: () => void;
}) {
  const { t } = useT();
  const pause = useApp((s) => s.pauseDownload);
  const resume = useApp((s) => s.resumeDownload);
  const cancel = useApp((s) => s.cancelDownload);
  if (!meta) return null;
  const paused = d.status === "PAUSED" || d.status === "QUEUED";
  // Phase 4: the durable pump drives every real row; pause aborts any
  // in-flight pipeline (the registry signals it) and resume re-queues it
  const isBgRow = d.id.startsWith("dlbg-");
  const stop = () => {
    if (isBgRow) cancelBgDownload(d.id);
    cancel(d.id);
  };
  const hold = () => {
    if (isBgRow) cancelBgDownload(d.id);
    pause(d.id);
  };
  const unpause = () => {
    resume(d.id);
    pumpBgDownloads(); // wake the pump — it will honestly resolve non-source rows too
  };
  // honest state line: paused rows show why they are not moving
  const stateLine = paused
    ? d.status === "PAUSED"
      ? t("dl.pausedState")
      : t("dl.queue")
    : `${d.downloadedMb.toFixed(1)} MB / ${d.totalMb.toFixed(1)} MB${d.speedMbps > 0 ? ` · ${d.speedMbps.toFixed(1)} MB/s` : ""}`;
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-2.5 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)]">
      <button onClick={onOpen} aria-label={meta.title}>
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
        <p className="mt-1 text-[10px] font-bold text-muted-foreground" dir="ltr">
          {paused ? <span className="text-primary">{stateLine}</span> : stateLine}
        </p>
      </div>
      <button
        onClick={paused ? unpause : hold}
        aria-label={paused ? t("dl.resume") : t("dl.pause")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground transition-colors hover:bg-accent hover:text-primary"
      >
        {paused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
      </button>
      <button
        onClick={stop}
        aria-label={t("dl.cancelDl")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-4 w-4" />
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
  meta?: { title: string; cover: string; color?: string; num: number; workId: string; streamable: boolean; pages: number; publishedAt: string; sourceChapterId?: string };
  onRead: () => void;
}) {
  const { t } = useT();
  const remove = useApp((s) => s.removeDownload);
  const works = useApp((s) => s.works);
  const failed = d.status === "ERROR";
  if (!meta) return null;
  // failed downloads must not "open" into the reader — the tap retries instead
  const primary = () => {
    if (!failed) return onRead();
    // Phase 4: source chapters retry through the REAL background pump;
    // rows without a source adapter say so instead of faking a retry
    const w = works.find((x) => x.id === meta.workId);
    if (meta.streamable && w) {
      const idx = w.chapters.findIndex((c) => c.id === d.chapterId);
      const ch = w.chapters[idx];
      if (idx >= 0 && ch?.sourceChapterId) {
        remove(d.id);
        enqueueMangaDexChapterDownloads(w, [
          { chapterIndex: idx, md: { id: ch.sourceChapterId, number: ch.number, title: ch.title, pages: ch.pages, publishedAt: ch.releaseDate } },
        ]);
        toast({ title: t("dl.queued"), description: meta.title });
        return;
      }
    }
    toast({ title: t("dl.errUnsupported"), description: meta.title });
  };
  const retryLabel = d.error === "network"
    ? t("dl.errNetwork")
    : d.error === "incomplete"
      ? t("dl.errIncomplete")
      : d.error === "unsupported"
        ? t("dl.errUnsupported")
        : d.error === "missing"
          ? t("dl.errMissing")
          : (d.error ?? t("dl.failedState"));
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-2.5 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)]">
      <button onClick={primary}>
        <WorkCover src={meta.cover} color={meta.color} title={meta.title} className="h-[64px] w-[52px] rounded-2xl" sizes="52px" />
      </button>
      <button onClick={primary} className="min-w-0 flex-1 text-start">
        <p className="truncate text-[14px] font-extrabold">{meta.title}</p>
        <p className="text-[12px] font-semibold text-muted-foreground">
          {t("common.chapter")} {meta.num}
        </p>
        <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">
          {failed ? (
            <span className="text-destructive">{retryLabel}</span>
          ) : (
            `${d.downloadedMb.toFixed(1)} MB • ${t("dl.completeState")}`
          )}
        </p>
      </button>
      {failed ? (
        <button
          onClick={primary}
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
          {!failed && (
            <DropdownMenuItem onClick={onRead} className="gap-2.5 rounded-xl text-[13px] font-semibold">
              <BookOpen className="h-4 w-4 text-primary" /> {t("common.open")}
            </DropdownMenuItem>
          )}
          {failed && (
            <DropdownMenuItem onClick={primary} className="gap-2.5 rounded-xl text-[13px] font-semibold">
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
