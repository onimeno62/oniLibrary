"use client";

import { useState, useMemo } from "react";
import {
  Download,
  BarChart3,
  Highlighter,
  ShieldCheck,
  Bookmark,
  Database,
  Puzzle,
  Server,
  FileStack,
  Settings as SettingsIcon,
  ChevronRight,
  RefreshCw,
  Copy,
} from "lucide-react";
import { OniLogo } from "@/components/oni-logo";
import { useApp, useNav, toFa } from "@/lib/store";
import { duplicateWorkCount } from "@/lib/duplicates";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

/* mini stats row under the profile — works / today minutes / finished */
function ProfileStats() {
  const { t, lang } = useT();
  const works = useApp((s) => s.works);
  const sessions = useApp((s) => s.sessions);
  const goal = useApp((s) => s.settings.dailyGoalMin);

  const today = new Date().toISOString().slice(0, 10);
  const todayMin = sessions.find((x) => x.date === today)?.minutes ?? 0;
  const inLibrary = works.filter((w) => !w.inVault).length;
  const finished = works.filter((w) => w.readingStatus === "COMPLETED").length;

  const cells: { value: string; label: string; hot?: boolean }[] = [
    { value: String(inLibrary), label: t("stat.totalWorks") },
    {
      value: lang === "fa" ? toFa(todayMin) : String(todayMin),
      label: `${t("stat.minutesUnit")} · ${t("stat.goalToday")}`,
      hot: goal > 0 && todayMin >= goal,
    },
    { value: String(finished), label: t("stat.finishedWorks") },
  ];

  return (
    <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border pt-3">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col items-center gap-0.5 text-center">
          <span
            className={cn(
              "flex items-center gap-1 text-[15px] font-black",
              c.hot ? "text-primary" : "text-foreground"
            )}
          >
            {c.hot && <Flame className="h-3.5 w-3.5" />}
            {c.value}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   MoreScreen — tab screen: profile, menu, update check, footer
   ============================================================ */

export function MoreScreen() {
  const { t, lang } = useT();
  const userName = useApp((s) => s.settings.userName);
  const works = useApp((s) => s.works);
  const hlCount = useApp((s) => s.highlights.length);
  const runUpdateCheck = useApp((s) => s.runUpdateCheck);
  const setTab = useNav((s) => s.setTab);
  const push = useNav((s) => s.push);
  const [checking, setChecking] = useState(false);

  const dupCount = useMemo(() => duplicateWorkCount(works), [works]);

  const initial = (userName.trim()[0] ?? "R").toUpperCase();

  const menu = [
    { Icon: Download, label: t("more.downloads"), onClick: () => setTab("downloads") },
    { Icon: BarChart3, label: t("more.statistics"), onClick: () => push({ kind: "statistics" }) },
    {
      Icon: Highlighter,
      label: t("nhl.title"),
      badge: hlCount > 0 ? String(lang === "fa" ? toFa(hlCount) : hlCount) : undefined,
      onClick: () => push({ kind: "highlights" }),
    },
    { Icon: ShieldCheck, label: t("more.vault"), onClick: () => push({ kind: "vault" }) },
    { Icon: Bookmark, label: t("more.categories"), onClick: () => push({ kind: "categories" }) },
    {
      Icon: Copy,
      label: t("dup.title"),
      badge: dupCount > 0 ? t("dup.scanBadge", { n: lang === "fa" ? toFa(dupCount) : dupCount }) : undefined,
      onClick: () => push({ kind: "duplicates" }),
    },
    { Icon: Database, label: t("more.backup"), onClick: () => push({ kind: "backup" }) },
    { Icon: Puzzle, label: t("more.extensions"), onClick: () => push({ kind: "extensions" }) },
    { Icon: Server, label: t("more.servers"), onClick: () => push({ kind: "servers" }) },
    { Icon: FileStack, label: t("more.formats"), onClick: () => push({ kind: "formats" }) },
    { Icon: SettingsIcon, label: t("more.settings"), onClick: () => push({ kind: "settings" }) },
  ];

  const checkUpdates = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const n = await runUpdateCheck();
      toast({ title: n > 0 ? t("upd.found", { n }) : t("upd.upToDate") });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col px-5 pb-8">
      {/* header */}
      <header className="pt-2">
        <h1 className="text-[24px] font-black tracking-tight">{t("more.title")}</h1>
      </header>

      {/* profile card */}
      <section className="mt-4 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-coral-gradient text-[22px] font-black text-white shadow-[0_10px_22px_-10px_rgba(248,105,76,0.7)]"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[16px] font-extrabold">{userName}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold leading-snug text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
              {t("more.account")}
            </p>
          </div>
        </div>
        {/* mini library stats */}
        <ProfileStats />
      </section>

      {/* menu card */}
      <nav aria-label={t("more.title")} className="mt-3 divide-y divide-border rounded-3xl border border-border bg-card">
        {menu.map(({ Icon, label, badge, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors first:rounded-t-3xl last:rounded-b-3xl hover:bg-secondary/50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{label}</span>
            {badge && (
              <span className="shrink-0 rounded-full bg-coral-gradient px-2 py-0.5 text-[10px] font-black text-white shadow-[0_6px_14px_-6px_rgba(248,105,76,0.8)]">
                {badge}
              </span>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
          </button>
        ))}
      </nav>

      {/* update check */}
      <button
        onClick={checkUpdates}
        disabled={checking}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-coral-soft py-3 text-[13px] font-extrabold text-primary transition-opacity hover:opacity-85 disabled:opacity-60"
      >
        <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        {checking ? t("upd.checking") : t("more.updatesCheck")}
      </button>

      {/* footer */}
      <footer className="mt-auto flex flex-col items-center gap-1.5 pt-8 pb-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <OniLogo size={20} />
          <p className="text-[11px] font-bold">
            oniLibrary v1.0.0
            <span className="sr-only"> — {t("more.version")} 1.0.0</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
