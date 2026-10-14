"use client";

import { useMemo } from "react";
import { Bell, CheckCheck, Download, AlertTriangle, BookOpen, RefreshCw, ShieldAlert } from "lucide-react";
import { WorkCover, EmptyState } from "@/components/shared";
import { useApp, useNav, timeAgo } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/types";

export function NotificationsScreen() {
  const { t, lang } = useT();
  const notifications = useApp((s) => s.notifications);
  const works = useApp((s) => s.works);
  const markAll = useApp((s) => s.markAllNotificationsRead);
  const markRead = useApp((s) => s.markNotificationRead);
  const openWork = useNav((s) => s.openWork);

  const byWork = useMemo(() => {
    const m = new Map<string, { title: string; cover: string; color?: string; vault: boolean }>();
    for (const w of works) m.set(w.id, { title: w.title, cover: w.cover, color: w.coverColor, vault: w.inVault });
    return m;
  }, [works]);

  const typeIcon = (n: Notification) => {
    switch (n.type) {
      case "CHAPTER":
        return <BookOpen className="h-4 w-4" />;
      case "DOWNLOAD":
        return <Download className="h-4 w-4" />;
      case "ERROR":
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <RefreshCw className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <h1 className="text-[22px] font-black tracking-tight">{t("ntf.title")}</h1>
        <button
          onClick={markAll}
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-[12px] font-bold text-secondary-foreground transition-colors hover:bg-accent"
        >
          <CheckCheck className="h-4 w-4" />
          {t("ntf.markAll")}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-8 thin-scrollbar">
        {notifications.length === 0 ? (
          <div className="mt-8">
            <EmptyState icon={<Bell className="h-6 w-6" />} title={t("ntf.empty")} />
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => {
              const meta = n.workId ? byWork.get(n.workId) : undefined;
              const sensitive = n.workId && meta?.vault;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    markRead(n.id);
                    if (n.workId && !sensitive) openWork(n.workId);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-3xl border p-3 text-start transition-all",
                    n.read
                      ? "border-border/50 bg-card/60 opacity-70"
                      : "border-primary/25 bg-card shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)]"
                  )}
                >
                  {sensitive ? (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                      <ShieldAlert className="h-5 w-5" />
                    </span>
                  ) : meta ? (
                    <WorkCover src={meta.cover} color={meta.color} title={meta.title} className="h-11 w-11 shrink-0 rounded-2xl" sizes="44px" />
                  ) : (
                    <span
                      className={cn(
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
                        n.type === "ERROR" ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400" : "bg-coral-soft text-primary"
                      )}
                    >
                      {typeIcon(n)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-extrabold">
                      {sensitive
                        ? t("ntf.sensitive")
                        : n.type === "CHAPTER"
                          ? t("ntf.newChapter", { t: n.title })
                          : n.type === "DOWNLOAD"
                            ? t("ntf.downloadDone", { t: `${n.title} ${n.chapterLabel ?? ""}` })
                            : n.type === "ERROR"
                              ? t("ntf.sourceErr", { s: n.title })
                              : n.title}
                    </p>
                    {n.body && !sensitive && (
                      <p className="mt-0.5 truncate text-[12px] font-semibold text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-0.5 text-[10px] font-bold text-muted-foreground/70">{timeAgo(n.createdAt, lang)}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-coral-gradient" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
