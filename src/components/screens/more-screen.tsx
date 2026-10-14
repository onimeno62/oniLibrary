"use client";

import { useState } from "react";
import {
  Download,
  BarChart3,
  ShieldCheck,
  Bookmark,
  Database,
  Puzzle,
  Server,
  FileStack,
  Settings as SettingsIcon,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { OniLogo } from "@/components/oni-logo";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";

/* ============================================================
   MoreScreen — tab screen: profile, menu, update check, footer
   ============================================================ */

export function MoreScreen() {
  const { t } = useT();
  const userName = useApp((s) => s.settings.userName);
  const runUpdateCheck = useApp((s) => s.runUpdateCheck);
  const setTab = useNav((s) => s.setTab);
  const push = useNav((s) => s.push);
  const [checking, setChecking] = useState(false);

  const initial = (userName.trim()[0] ?? "R").toUpperCase();

  const menu = [
    { Icon: Download, label: t("more.downloads"), onClick: () => setTab("downloads") },
    { Icon: BarChart3, label: t("more.statistics"), onClick: () => push({ kind: "statistics" }) },
    { Icon: ShieldCheck, label: t("more.vault"), onClick: () => push({ kind: "vault" }) },
    { Icon: Bookmark, label: t("more.categories"), onClick: () => push({ kind: "categories" }) },
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
      <section className="mt-4 flex items-center gap-3.5 rounded-3xl border border-border bg-card p-4">
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
      </section>

      {/* menu card */}
      <nav aria-label={t("more.title")} className="mt-3 divide-y divide-border rounded-3xl border border-border bg-card">
        {menu.map(({ Icon, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors first:rounded-t-3xl last:rounded-b-3xl hover:bg-secondary/50"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{label}</span>
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
