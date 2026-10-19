"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { Clock3, BookOpen, LibraryBig, CheckCircle2, Flame, History, Target, Minus, Plus, CalendarDays } from "lucide-react";
import { OverlayHeader } from "@/components/shared";
import { useApp, useNav } from "@/lib/store";
import { toFa } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import type { WorkType } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";

/* ============================================================
   StatisticsScreen — totals, 14-day chart, heatmap, streak, by type
   ============================================================ */

const HEAT_WEEKS = 15;

interface HeatCell {
  iso: string; // YYYY-MM-DD (utc-day key, consistent with sessions)
  minutes: number;
  future: boolean;
  label: string; // "May 12" style for tooltip
}

function heatLevel(minutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0) return 0;
  if (minutes < 15) return 1;
  if (minutes < 30) return 2;
  if (minutes < 60) return 3;
  return 4;
}

const HEAT_CLASS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-secondary",
  1: "bg-[#f8694c]/25",
  2: "bg-[#f8694c]/50",
  3: "bg-[#f8694c]/75",
  4: "bg-coral-gradient shadow-[0_0_6px_rgba(248,105,76,0.45)]",
};

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function SummaryCard({
  Icon,
  value,
  label,
}: {
  Icon: typeof Clock3;
  value: string;
  label: string;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-soft text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-2.5 text-[20px] font-black leading-none tracking-tight" dir="ltr">
        {value}
      </p>
      <p className="mt-1 text-[11px] font-bold text-muted-foreground">{label}</p>
    </div>
  );
}

type ChartDatum = { minutes: number; label: string; dateLabel: string };

function ChartTip({
  active,
  payload,
  minUnit,
}: {
  active?: boolean;
  payload?: unknown[];
  minUnit: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = (payload[0] as { payload?: ChartDatum } | undefined)?.payload;
  if (!datum) return null;
  return (
    <div className="rounded-lg bg-[#1e1c1a] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg">
      {datum.dateLabel} · {datum.minutes} {minUnit}
    </div>
  );
}

export function StatisticsScreen() {
  const { t, lang } = useT();
  const works = useApp((s) => s.works);
  const sessions = useApp((s) => s.sessions);
  const historyCount = useApp((s) => s.history.length);

  const fa = lang === "fa";
  const num = (n: number | string) => (fa ? toFa(n) : String(n));

  const totalMinutes = useMemo(() => sessions.reduce((a, s) => a + s.minutes, 0), [sessions]);
  const totalChapters = useMemo(() => sessions.reduce((a, s) => a + s.chapters, 0), [sessions]);
  const publicWorks = useMemo(() => works.filter((w) => !w.inVault), [works]);
  const finished = useMemo(
    () => publicWorks.filter((w) => w.readingStatus === "COMPLETED").length,
    [publicWorks]
  );

  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const totalTimeLabel = `${num(h)}${t("stat.hoursShort")} ${num(m)}${t("stat.minutesShort")}`;

  /* chart data — last 14 sessions, ascending */
  const chartData: ChartDatum[] = [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((s) => ({
      minutes: s.minutes,
      label: num(Number(s.date.slice(8, 10))),
      dateLabel: fa ? toFa(s.date) : s.date,
    }));

  /* streak — consecutive days with minutes > 0 ending today or yesterday */
  const streak = useMemo(() => {
    const byDate = new Map(sessions.map((s) => [s.date, s]));
    const cursor = new Date();
    const active = (d: Date) => (byDate.get(utcDay(d))?.minutes ?? 0) > 0;
    if (!active(cursor)) cursor.setDate(cursor.getDate() - 1);
    let n = 0;
    while (active(cursor)) {
      n++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return n;
  }, [sessions]);

  /* by type */
  const typeGroups = useMemo<{ label: TranslationKey; types: WorkType[]; count: number }[]>(
    () =>
      (
        [
          ["type.MANGA", ["MANGA", "MANHUA"]],
          ["type.MANHWA", ["MANHWA"]],
          ["type.WEBTOON", ["WEBTOON"]],
          ["type.COMIC", ["COMIC"]],
          ["type.BOOK", ["BOOK", "NOVEL", "EPUB"]],
          ["type.PDF", ["PDF"]],
        ] as [TranslationKey, WorkType[]][]
      ).map(([label, types]) => ({
        label,
        types,
        count: publicWorks.filter((w) => types.includes(w.type)).length,
      })),
    [publicWorks]
  );
  const maxType = Math.max(1, ...typeGroups.map((g) => g.count));

  /* heatmap grid — HEAT_WEEKS columns of 7 days (Mon..Sun) ending this week */
  const heat = useMemo(() => {
    const byDate = new Map(sessions.map((s) => [s.date, s.minutes]));
    const dowMon0 = (d: Date) => (d.getDay() + 6) % 7; // Mon = 0
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    start.setDate(start.getDate() - dowMon0(start) - (HEAT_WEEKS - 1) * 7);
    const weeks: { cells: HeatCell[]; monthLabel: string | null }[] = [];
    let prevMonth = -1;
    for (let w = 0; w < HEAT_WEEKS; w++) {
      const cells: HeatCell[] = [];
      let monthLabel: string | null = null;
      for (let d = 0; d < 7; d++) {
        const day = new Date(start);
        day.setDate(start.getDate() + w * 7 + d);
        const iso = utcDay(day);
        const future = day.getTime() > today.getTime();
        if (day.getMonth() !== prevMonth) {
          prevMonth = day.getMonth();
          // label the column with the month in which the change actually occurs
          monthLabel = day.toLocaleDateString(fa ? "fa" : "en-US", { month: "short" });
        }
        cells.push({
          iso,
          minutes: byDate.get(iso) ?? 0,
          future,
          label: day.toLocaleDateString(fa ? "fa" : "en-US", { month: "short", day: "numeric" }),
        });
      }
      weeks.push({ cells, monthLabel });
    }
    return weeks;
  }, [sessions, fa]);

  /* selected heatmap day → detail + per-day minute editing (round 11) */
  const [selDay, setSelDay] = useState<string | null>(null);
  const selSession = useMemo(
    () => (selDay ? sessions.find((s) => s.date === selDay) : undefined),
    [selDay, sessions]
  );
  const selLabel = useMemo(() => {
    if (!selDay) return "";
    const [y, m, d] = selDay.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d).toLocaleDateString(fa ? "fa" : "en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [selDay, fa]);
  const adjustSel = (delta: number) => {
    if (!selDay) return;
    useApp.getState().adjustDay(selDay, delta);
  };
  const activeDays = useMemo(
    () => heat.reduce((a, w) => a + w.cells.filter((c) => c.minutes > 0).length, 0),
    [heat]
  );
  const weekdayLabels = useMemo(() => {
    // Jan 1 2024 = Monday → narrow weekday letters Mon..Sun in the active locale
    return Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + i).toLocaleDateString(fa ? "fa" : "en-US", { weekday: "narrow" })
    );
  }, [fa]);

  /* daily goal */
  const dailyGoalMin = useApp((s) => s.settings.dailyGoalMin ?? 0);
  const todayMinutes = useMemo(() => {
    const key = utcDay(new Date());
    return sessions.find((x) => x.date === key)?.minutes ?? 0;
  }, [sessions]);
  const goalPct = dailyGoalMin > 0 ? Math.min(1, todayMinutes / dailyGoalMin) : 0;
  const bumpGoal = (delta: number) => {
    // read fresh state so rapid taps accumulate correctly
    const cur = useApp.getState().settings.dailyGoalMin ?? 0;
    const next = Math.max(0, Math.min(180, Math.round((cur + delta) / 5) * 5));
    useApp.getState().setSettings({ dailyGoalMin: next });
    if (next === 0 && cur > 0) toast({ title: t("stat.goalOff") });
  };
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
      <OverlayHeader title={t("stat.title")} />

      {/* history entry point (TRK-002) */}
      <button
        onClick={() => useNav.getState().push({ kind: "history" })}
        className="mt-1 flex w-full items-center gap-3 rounded-3xl border border-border bg-card p-3 text-start shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)] transition-all hover:shadow-[0_12px_26px_-16px_rgba(43,36,29,0.5)] active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-coral-soft text-primary">
          <History className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-extrabold">{t("stat.viewHistory")}</span>
          <span className="block text-[11px] font-semibold text-muted-foreground">
            {historyCount === 1 ? t("hist.entry", { n: historyCount }) : t("hist.entries", { n: historyCount })}
          </span>
        </span>
        <span className="h-2 w-2 rounded-full bg-coral-gradient" />
      </button>

      {/* summary 2x2 */}
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        <SummaryCard Icon={Clock3} value={totalTimeLabel} label={t("stat.totalTime")} />
        <SummaryCard Icon={BookOpen} value={num(totalChapters)} label={t("stat.totalChapters")} />
        <SummaryCard Icon={LibraryBig} value={num(publicWorks.length)} label={t("stat.totalWorks")} />
        <SummaryCard Icon={CheckCircle2} value={num(finished)} label={t("stat.finishedWorks")} />
      </div>

      {/* daily goal */}
      <section className="mt-3 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-4">
          <div className="relative h-[68px] w-[68px] shrink-0">
            <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
              <circle cx="34" cy="34" r={R} fill="none" strokeWidth="7" className="stroke-secondary" />
              <circle
                cx="34"
                cy="34"
                r={R}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                stroke={dailyGoalMin > 0 && goalPct >= 1 ? "#2f9e6e" : "#f8694c"}
                strokeDasharray={C}
                strokeDashoffset={C * (1 - goalPct)}
                style={{ transition: "stroke-dashoffset 600ms ease" }}
              />
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[13px] font-black leading-none text-foreground">{num(Math.round(goalPct * 100))}%</span>
              <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{t("stat.goalToday")}</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[14px] font-extrabold">
              <Target className="h-4 w-4 text-primary" />
              {t("stat.dailyGoal")}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
              {dailyGoalMin > 0
                ? `${num(todayMinutes)} / ${num(dailyGoalMin)} ${t("stat.minutesUnit")} — ${
                    goalPct >= 1 ? t("stat.goalReached") : t("stat.goalToday")
                  }`
                : t("stat.goalOff")}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                aria-label="-5 min"
                onClick={() => bumpGoal(-5)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex-1 rounded-full bg-secondary px-3 py-1.5 text-center text-[12px] font-black text-secondary-foreground" dir="ltr">
                {dailyGoalMin === 0 ? "—" : `${num(dailyGoalMin)} ${t("stat.minutesUnit")}`}
              </div>
              <button
                aria-label="+5 min"
                onClick={() => bumpGoal(5)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-coral-gradient text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)] transition-transform hover:scale-105"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* reading time chart */}
      <section className="mt-3 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-extrabold tracking-tight">{t("stat.readingTime")}</p>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-secondary-foreground">
            {t("stat.last14")}
          </span>
        </div>
        <div className="mt-2 h-[160px] w-full" dir="ltr">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "currentColor", fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "rgba(248,105,76,0.08)", radius: 8 }}
                content={<ChartTip minUnit={t("stat.minutesShort")} />}
              />
              <Bar dataKey="minutes" fill="#f8694c" radius={[6, 6, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* reading activity heatmap (15 weeks, tap a day to view/edit) */}
      <section className="mt-3 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-extrabold tracking-tight">{t("stat.heatmap")}</p>
          <span className="rounded-full bg-coral-soft px-2.5 py-1 text-[10px] font-bold text-primary">
            {num(activeDays)} {t("stat.activeDays")}
          </span>
        </div>
        <p className="mt-0.5 text-[10.5px] font-semibold text-muted-foreground">{t("stat.tapDayHint")}</p>
        <div dir="ltr" className="mt-3 overflow-x-auto no-scrollbar">
          <div className="flex min-w-max flex-col gap-1">
            {/* month labels */}
            <div className="flex gap-[3px] ps-[26px]">
              {heat.map((w, i) => (
                <div key={`m${i}`} className="relative h-3 w-2.5">
                  {w.monthLabel && (
                    <span className="absolute left-0 top-0 whitespace-nowrap text-[8.5px] font-bold uppercase tracking-wide text-muted-foreground">
                      {w.monthLabel}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-[3px]">
              {/* weekday letters */}
              <div className="flex w-[23px] flex-col gap-[3px] pe-0.5 text-end">
                {weekdayLabels.map((lbl, i) => (
                  <span key={i} className="h-[13px] text-[8px] font-bold leading-[13px] text-muted-foreground">
                    {i % 2 === 0 ? lbl : ""}
                  </span>
                ))}
              </div>
              {heat.map((w, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {w.cells.map((c, ci) => {
                    const goalMet = dailyGoalMin > 0 && c.minutes >= dailyGoalMin;
                    return (
                      <button
                        key={ci}
                        type="button"
                        disabled={c.future}
                        onClick={() => setSelDay((cur) => (cur === c.iso ? null : c.iso))}
                        title={`${c.label} · ${c.minutes} ${t("stat.minutesShort")}${goalMet ? " · ✓" : ""}`}
                        aria-label={`${c.label} — ${c.minutes} ${t("stat.minutesShort")}${goalMet ? ` — ${t("stat.goalDay")}` : ""}`}
                        aria-pressed={selDay === c.iso}
                        className={cn(
                          "h-[13px] w-[13px] rounded-[4px] transition-all duration-150",
                          !c.future && "hover:scale-125 active:scale-95",
                          c.future ? "bg-transparent" : HEAT_CLASS[heatLevel(c.minutes)],
                          goalMet && "oni-heat-goal",
                          selDay === c.iso && "ring-2 ring-primary ring-offset-1 ring-offset-card"
                        )}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-end gap-1.5" dir="ltr">
          <span className="text-[9px] font-bold text-muted-foreground">{t("stat.heatmapLess")}</span>
          {([0, 1, 2, 3, 4] as const).map((lv) => (
            <span key={lv} className={cn("h-2.5 w-2.5 rounded-[3px]", HEAT_CLASS[lv])} />
          ))}
          <span className="text-[9px] font-bold text-muted-foreground">{t("stat.heatmapMore")}</span>
          {dailyGoalMin > 0 && (
            <span className="ms-2 flex items-center gap-1 text-[9px] font-bold text-muted-foreground">
              <span className="oni-heat-goal h-2.5 w-2.5 rounded-[4px] bg-secondary" aria-hidden />
              {t("stat.goalDay")}
            </span>
          )}
        </div>

        {/* day detail + per-day editing (round 11) */}
        {selDay && (
          <div className="oni-day-panel mt-3 rounded-2xl border border-border bg-white/[0.03] p-3.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-coral-soft text-primary">
                <CalendarDays className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-extrabold">{selLabel}</p>
                <p className="text-[10.5px] font-semibold text-muted-foreground" dir="ltr">
                  {selDay}
                </p>
              </div>
              {dailyGoalMin > 0 && (selSession?.minutes ?? 0) >= dailyGoalMin && (
                <span className="flex items-center gap-1 rounded-full bg-coral-soft px-2 py-1 text-[10px] font-extrabold text-primary">
                  <Flame className="h-3 w-3" />
                  {t("stat.goalDay")}
                </span>
              )}
              <button
                type="button"
                onClick={() => setSelDay(null)}
                aria-label={t("common.close")}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            <div className="mt-2.5 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[22px] font-black leading-none text-foreground" dir="ltr">
                  {num(selSession?.minutes ?? 0)}
                  <span className="ms-1 text-[11px] font-bold text-muted-foreground">{t("stat.minutesUnit")}</span>
                </p>
                {dailyGoalMin > 0 && (
                  <div className="mt-2 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-coral-gradient transition-all duration-300"
                      style={{ width: `${Math.min(100, ((selSession?.minutes ?? 0) / dailyGoalMin) * 100)}%` }}
                    />
                  </div>
                )}
                <p className="mt-1 text-[10.5px] font-semibold text-muted-foreground">
                  {selSession?.chapters
                    ? `${num(selSession.chapters)} ${t("stat.totalChapters").toLowerCase()}`
                    : t("stat.noData")}
                </p>
              </div>

              {/* adjust buttons */}
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => adjustSel(-5)}
                  aria-label="-5"
                  disabled={!selSession}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-all hover:bg-accent active:scale-90 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                {[5, 15].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => adjustSel(d)}
                    aria-label={`+${d}`}
                    className={cn(
                      "flex h-9 items-center rounded-full px-3 text-[12px] font-black transition-all active:scale-90",
                      d === 15
                        ? "bg-coral-gradient text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)]"
                        : "bg-secondary text-secondary-foreground hover:bg-accent"
                    )}
                  >
                    +{num(d)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* streak */}
      <section className="mt-3 flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-primary">
          <Flame className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold">{t("stat.streak")}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
            {t("stat.last14")}
          </p>
        </div>
        <p className="shrink-0 text-[24px] font-black leading-none text-primary">
          {num(streak)}
          <span className="ms-1 text-[12px] font-bold text-muted-foreground">
            {t("stat.daysUnit")}
          </span>
        </p>
      </section>

      {/* by type */}
      <section className="mt-3 rounded-3xl border border-border bg-card p-4">
        <p className="text-[15px] font-extrabold tracking-tight">{t("stat.byType")}</p>
        <div className="mt-3 space-y-3">
          {typeGroups.map((g) => (
            <div key={g.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-bold text-foreground">{t(g.label)}</span>
                <span className="text-[11px] font-bold text-muted-foreground">{num(g.count)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-coral-gradient transition-all duration-500"
                  style={{ width: `${Math.round((g.count / maxType) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
