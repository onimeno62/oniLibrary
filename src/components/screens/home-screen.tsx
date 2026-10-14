"use client";

import { useMemo } from "react";
import Image from "next/image";
import {
  Search,
  Bell,
  ChevronRight,
  BarChart3,
  BookOpen,
  Clock3,
  CheckCircle2,
  Flame,
} from "lucide-react";
import { SectionHeader, WorkCover } from "@/components/shared";
import { useApp, useNav, continueReading, timeAgo } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { useWeeklyStats } from "@/lib/engine";
import { cn } from "@/lib/utils";

export function HomeScreen() {
  const { t, lang, rtl } = useT();
  const works = useApp((s) => s.works);
  const userName = useApp((s) => s.settings.userName);
  const openWork = useNav((s) => s.openWork);
  const openReader = useNav((s) => s.openReader);
  const push = useNav((s) => s.push);
  const setTab = useNav((s) => s.setTab);
  const stats = useWeeklyStats();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("home.morning") : hour < 18 ? t("home.afternoon") : t("home.evening");

  const publicWorks = works.filter((w) => !w.inVault);

  const continueItem = (() => {
    const reading = publicWorks
      .filter((w) => w.readingStatus === "READING" && w.lastReadAt)
      .sort((a, b) => (a.lastReadAt! < b.lastReadAt! ? 1 : -1));
    for (const w of reading) {
      const cr = continueReading(w);
      if (cr) return { work: w, ...cr };
    }
    return null;
  })();

  const latestUpdates = publicWorks
    .flatMap((w) => {
      const ch = w.chapters[0];
      if (!ch || ch.isRead) return [];
      return [{ work: w, ch }];
    })
    .sort((a, b) => (a.ch.releaseDate < b.ch.releaseDate ? 1 : -1))
    .slice(0, 8);

  const recentlyAdded = [...publicWorks].sort((a, b) => (a.addedAt < b.addedAt ? 1 : -1)).slice(0, 8);

  const unreadNtf = useApp((s) => s.notifications.filter((n) => !n.read).length);
  const sessions = useApp((s) => s.sessions);
  const streak = useMemo(() => {
    const active = new Set(sessions.filter((x) => x.minutes > 0).map((x) => x.date));
    let n = 0;
    const d = new Date();
    if (!active.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
    while (active.has(d.toISOString().slice(0, 10))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [sessions]);

  return (
    <div className="min-h-full px-5 pb-6">
      {/* header */}
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <OniMark />
          <span className="text-[19px] font-black tracking-tight">
            oni<span className="text-primary">Library</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => push({ kind: "search" })}
            aria-label={t("common.search")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
          >
            <Search className="h-[21px] w-[21px]" />
          </button>
          <button
            onClick={() => push({ kind: "notifications" })}
            aria-label={t("home.notifications")}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
          >
            <Bell className="h-[21px] w-[21px]" />
            {unreadNtf > 0 && (
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-coral-gradient ring-2 ring-background" />
            )}
          </button>
        </div>
      </header>

      {/* greeting */}
      <div className="mt-4">
        <p className="text-[15px] font-semibold text-muted-foreground">{greeting}</p>
        <h1 className="mt-0.5 text-[26px] font-black tracking-tight">
          {userName} {hour < 12 ? "☀️" : hour < 18 ? "🌤️" : "🌙"}
        </h1>
      </div>

      {/* continue reading hero */}
      {continueItem && (
        <button
          onClick={() => openReader(continueItem.work.id, continueItem.chapter.id)}
          className="group relative mt-4 block w-full overflow-hidden rounded-3xl text-start shadow-[0_18px_40px_-18px_rgba(43,36,29,0.5)]"
        >
          <div className="relative h-[150px] w-full">
            {continueItem.work.banner || continueItem.work.cover ? (
              <Image
                src={continueItem.work.banner ?? continueItem.work.cover}
                alt={continueItem.work.title}
                fill
                sizes="412px"
                priority
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <WorkCover title={continueItem.work.title} color={continueItem.work.coverColor} className="h-full w-full" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/5" />
          </div>
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="text-[17px] font-extrabold text-white drop-shadow">{t("home.continueReading")}</p>
              <p className="mt-0.5 truncate text-[14px] font-bold text-white/95">{continueItem.work.title}</p>
              <p className="text-[12px] font-semibold text-white/80">
                {t("common.chapter")} {continueItem.chapter.number} · {Math.round((continueItem.chapter.lastPage ?? 0) * 100)}%
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-coral-gradient text-white shadow-lg transition-transform group-hover:scale-105">
              <ChevronRight className={cn("h-5 w-5", rtl && "rotate-180")} />
            </span>
          </div>
        </button>
      )}

      {/* latest updates */}
      <section className="mt-7">
        <SectionHeader title={t("home.latestUpdates")} onSeeAll={() => setTab("updates")} />
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar" dir="ltr">
          {latestUpdates.length === 0 && (
            <p className="py-6 text-[13px] font-semibold text-muted-foreground">{t("upd.empty")}</p>
          )}
          {latestUpdates.map(({ work, ch }) => (
            <button
              key={work.id}
              onClick={() => openWork(work.id)}
              className="group w-[92px] shrink-0 text-start"
            >
              <div className="relative">
                <WorkCover
                  src={work.cover}
                  color={work.coverColor}
                  title={work.title}
                  eager
                  className="aspect-[3/4] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)] transition-transform group-hover:-translate-y-0.5"
                  sizes="92px"
                />
                <span className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-coral-gradient ring-2 ring-white/90" />
              </div>
              <p className="mt-1.5 truncate text-[12px] font-extrabold">{work.title}</p>
              <p className="text-[11px] font-semibold text-muted-foreground">
                {t("common.ch")} {ch.number}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground/80">{timeAgo(ch.releaseDate, lang)}</p>
            </button>
          ))}
        </div>
      </section>

      {/* recently added */}
      <section className="mt-6">
        <SectionHeader title={t("home.recentlyAdded")} onSeeAll={() => setTab("library")} />
        <div className="grid grid-cols-4 gap-3">
          {recentlyAdded.map((w) => (
            <button key={w.id} onClick={() => openWork(w.id)} className="group text-start">
              <WorkCover
                src={w.cover}
                color={w.coverColor}
                title={w.title}
                className="aspect-[3/4] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.45)] transition-transform group-hover:-translate-y-0.5"
                sizes="24vw"
              />
              <p className="mt-1.5 truncate text-[12px] font-extrabold">{w.title}</p>
              <p className="text-[11px] font-semibold text-muted-foreground">
                {t("common.vol")} {Math.max(1, Math.ceil((w.chapters[0]?.number ?? 1) / 8))}
              </p>
              <p className="text-[10px] font-semibold text-muted-foreground/80">{timeAgo(w.addedAt, lang)}</p>
            </button>
          ))}
        </div>
      </section>

      {/* reading stats */}
      <section className="mt-7">
        <button
          onClick={() => push({ kind: "statistics" })}
          className="w-full rounded-3xl border border-border bg-card p-4 text-start shadow-[0_10px_26px_-18px_rgba(43,36,29,0.4)] transition-all hover:shadow-[0_14px_30px_-16px_rgba(43,36,29,0.5)] active:scale-[0.99]"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-soft text-primary">
              <BarChart3 className="h-5 w-5" />
            </span>
            <p className="text-[15px] font-extrabold">{t("home.readingStats")}</p>
            {streak > 1 && (
              <span className="flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-black text-primary">
                <Flame className="h-3 w-3" />
                {streak} {lang === "fa" ? "روز" : "days"}
              </span>
            )}
            <ChevronRight className="ms-auto h-5 w-5 text-muted-foreground rtl:rotate-180" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 ps-1">
            <StatCell icon={<Clock3 className="h-3.5 w-3.5" />} value={stats.label} label={t("home.thisWeek")} />
            <StatCell icon={<BookOpen className="h-3.5 w-3.5" />} value={String(stats.chapters)} label={t("home.chaptersRead")} />
            <StatCell icon={<CheckCircle2 className="h-3.5 w-3.5" />} value={String(stats.finished)} label={t("home.finished")} />
          </div>
        </button>
      </section>
    </div>
  );
}

function StatCell({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <span className="text-[17px] font-extrabold text-foreground">{value}</span>
      <span className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
        {icon}
        {label}
      </span>
    </div>
  );
}

function OniMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="hm" x1="10" y1="6" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF9270" />
          <stop offset="0.55" stopColor="#F8694C" />
          <stop offset="1" stopColor="#E8442F" />
        </linearGradient>
      </defs>
      <path d="M14.5 15.5C12 9.5 13.5 4.8 16.2 2.6c1-.8 2.4-.2 2.7 1l1.9 8.2-6.3 3.7Z" fill="url(#hm)" />
      <path d="M49.5 15.5C52 9.5 50.5 4.8 47.8 2.6c-1-.8-2.4-.2-2.7 1l-1.9 8.2 6.3 3.7Z" fill="url(#hm)" />
      <path
        d="M32 6c8.6 0 15.6 2.6 19.4 5.4 2.4 1.8 3.4 4.8 3 7.8-.8 6.3-3 15.6-7.6 22.9C43 47.8 38 54.6 33.9 59.1c-1 1.1-2.8 1.1-3.8 0-4.1-4.5-9.1-11.3-12.9-17C12.6 34.8 10.4 25.5 9.6 19.2c-.4-3 .6-6 3-7.8C16.4 8.6 23.4 6 32 6Z"
        fill="url(#hm)"
      />
      <path d="M17.5 25.5c3.2-2.6 8.3-2.9 11.6-.7.9.6 1 1.9.2 2.7-2.7 2.6-8.3 3.2-11.6 1.4-1.2-.7-1.3-2.5-.2-3.4Z" fill="#FFF3EC" />
      <path d="M46.5 25.5c-3.2-2.6-8.3-2.9-11.6-.7-.9.6-1 1.9-.2 2.7 2.7 2.6 8.3 3.2 11.6 1.4 1.2-.7 1.3-2.5.2-3.4Z" fill="#FFF3EC" />
      <circle cx="24.5" cy="27.4" r="2.1" fill="#33221D" />
      <circle cx="39.5" cy="27.4" r="2.1" fill="#33221D" />
      <path d="M24.5 39.5c2.3 3 5 4.5 7.5 4.5s5.2-1.5 7.5-4.5c.8-1 .4-2.6-.9-2.9-4.3-1-8.9-1-13.2 0-1.3.3-1.7 1.9-.9 2.9Z" fill="#7E2417" />
    </svg>
  );
}
