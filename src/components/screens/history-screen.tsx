"use client";

import { useMemo } from "react";
import { History, Trash2, BookOpen } from "lucide-react";
import { OverlayHeader, WorkCover, EmptyState } from "@/components/shared";
import { useApp, useNav, timeAgo } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";

/** TRK-002 — view, resume and clear reading history for local & online works. */
export function HistoryScreen() {
  const { t, lang } = useT();
  const history = useApp((s) => s.history);
  const works = useApp((s) => s.works);
  const clearHistory = useApp((s) => s.clearHistory);
  const openReader = useNav((s) => s.openReader);
  const openWork = useNav((s) => s.openWork);

  const rows = useMemo(() => {
    return history
      .map((h) => {
        const w = works.find((x) => x.id === h.workId);
        if (!w) return null;
        const ch = w.chapters.find((c) => c.id === h.chapterId);
        if (!ch) return null;
        const vault = w.inVault;
        return { h, w, ch, vault };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [history, works]);

  return (
    <div className="flex h-full flex-col">
      <OverlayHeader
        title={t("hist.title")}
        right={
          rows.length > 0 ? (
            <button
              onClick={() => {
                if (window.confirm(t("more.clearHistoryConfirm"))) {
                  clearHistory();
                  toast({ title: t("more.historyCleared") });
                }
              }}
              aria-label={t("more.clearHistory")}
              className="flex h-10 w-10 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto px-5 pb-8 thin-scrollbar">
        {rows.length === 0 ? (
          <div className="mt-8">
            <EmptyState icon={<History className="h-6 w-6" />} title={t("hist.empty")} hint={t("hist.emptyHint")} />
          </div>
        ) : (
          <>
            <p className="mt-1 pb-3 text-[11px] font-bold text-muted-foreground">
              {rows.length === 1 ? t("hist.entry", { n: rows.length }) : t("hist.entries", { n: rows.length })}
            </p>
            <div className="space-y-2">
              {rows.map(({ h, w, ch, vault }) => (
                <div
                  key={h.id}
                  className="flex items-center gap-3 rounded-3xl border border-border/60 bg-card p-2.5 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)]"
                >
                  {vault ? (
                    <span className="flex h-[60px] w-[48px] shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                      <BookOpen className="h-5 w-5" />
                    </span>
                  ) : (
                    <button onClick={() => openWork(w.id)}>
                      <WorkCover src={w.cover} color={w.coverColor} title={w.title} className="h-[60px] w-[48px] rounded-2xl" sizes="48px" />
                    </button>
                  )}
                  <button
                    onClick={() => !vault && openReader(w.id, ch.id, h.page)}
                    className="min-w-0 flex-1 text-start"
                  >
                    <p className="truncate text-[14px] font-extrabold">
                      {vault ? t("ntf.sensitive") : w.title}
                    </p>
                    <p className="text-[12px] font-semibold text-muted-foreground">
                      {t("common.ch")} {ch.number}
                      {h.page > 0 ? ` · ${t("common.page")} ${h.page + 1}` : ""}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground/70">{timeAgo(h.at, lang)}</p>
                  </button>
                  {!vault && (
                    <button
                      onClick={() => openReader(w.id, ch.id, h.page)}
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-coral-soft px-3.5 text-[12px] font-extrabold text-primary transition-opacity hover:opacity-85"
                    >
                      <BookOpen className="h-4 w-4" />
                      {t("hist.resume")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
