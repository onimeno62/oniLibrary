"use client";

import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import { Clock3, BookOpen, LibraryBig, CheckCircle2, Flame, History, Target, Minus, Plus } from "lucide-react";
import { OverlayHeader } from "@/components/shared";
import { useApp, useNav } from "@/lib/store";
import { toFa } from "@/lib/store";
import { useT } from "@/lib/use-app";
import type { WorkType } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";

/* ============================================================
   StatisticsScreen — totals, 14-day chart, streak, by type
   ============================================================ */

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
    <div className="min-h-full px-5 pb-8">
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
