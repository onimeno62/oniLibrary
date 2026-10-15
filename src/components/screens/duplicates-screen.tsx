"use client";

/* ============================================================
   oniLibrary — Duplicate scan screen (PRD LIB-009)
   Lists works sharing a title; lets you keep one copy and
   remove the rest in a tap. Progress of the kept copy wins.
   ============================================================ */

import { useMemo } from "react";
import { Copy, Trash2, CheckCircle2, Sparkles } from "lucide-react";
import { OverlayHeader, WorkCover, EmptyState } from "@/components/shared";
import { useApp, useNav, toFa } from "@/lib/store";
import { findDuplicateGroups } from "@/lib/duplicates";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function DuplicatesScreen() {
  const { t, lang } = useT();
  const works = useApp((s) => s.works);
  const deleteWorks = useApp((s) => s.deleteWorks);
  const workCategories = useApp((s) => s.workCategories);
  const pop = useNav((s) => s.pop);

  const groups = useMemo(() => findDuplicateGroups(works), [works]);

  const removeOthers = (keepId: string, group: typeof works) => {
    const others = group.filter((w) => w.id !== keepId);
    const kept = group.find((w) => w.id === keepId);
    if (!kept || others.length === 0) return;
    if (!window.confirm(t("dup.deleteConfirm", { n: others.length, t: kept.title }))) return;
    deleteWorks(others.map((w) => w.id));
    toast({ title: t("dup.removedToast", { n: others.length }) });
  };

  const removeOne = (id: string, title: string) => {
    if (!window.confirm(t("lib.deleteConfirm", { n: 1 }))) return;
    deleteWorks([id]);
    toast({ title: `${title} — ${t("common.delete")} ✓` });
  };

  return (
    <div className="flex h-full flex-col">
      <OverlayHeader title={t("dup.title")} onBack={pop} />

      <div className="flex-1 overflow-y-auto px-5 pb-8 thin-scrollbar">
        <p className="mt-1 text-[12px] font-semibold leading-relaxed text-muted-foreground">
          {t("dup.subtitle")}
        </p>

        {groups.length === 0 ? (
          <div className="mt-10">
            <EmptyState
              icon={<Sparkles className="h-6 w-6" />}
              title={t("dup.none")}
              hint={t("dup.noneHint")}
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {groups.map((group, gi) => {
              const others = group.length - 1;
              return (
                <section
                  key={gi}
                  className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_10px_30px_-18px_rgba(43,36,29,0.35)]"
                >
                  {/* group header */}
                  <header className="flex items-center gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-coral-soft text-primary">
                      <Copy className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[13px] font-extrabold">
                      {t("dup.copies", { n: lang === "fa" ? toFa(group.length) : group.length })}
                    </span>
                    <button
                      onClick={() => removeOthers(group[0].id, group)}
                      className="ms-auto rounded-full bg-coral-gradient px-3.5 py-1.5 text-[11px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)] transition-transform hover:scale-[1.03] active:scale-95"
                    >
                      {others === 1
                        ? t("dup.removeOther")
                        : t("dup.removeOthers", { n: lang === "fa" ? toFa(others) : others })}
                    </button>
                  </header>

                  {/* copies */}
                  <div className="divide-y divide-border">
                    {group.map((w, i) => {
                      const readCount = w.chapters.filter((c) => c.isRead).length;
                      const catCount = Object.values(workCategories).filter((ids) =>
                        ids.includes(w.id)
                      ).length;
                      return (
                        <div key={w.id} className="flex items-center gap-3 p-3">
                          <WorkCover
                            src={w.customCover ?? w.cover}
                            color={w.coverColor}
                            title={w.title}
                            className="h-[58px] w-[42px] shrink-0 rounded-lg"
                            sizes="42px"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-extrabold" dir="auto">
                              {w.title}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10.5px] font-semibold text-muted-foreground">
                              <span>{lang === "fa" ? toFa(w.chapters.length) : w.chapters.length} {t("common.chapters")}</span>
                              <span className="text-primary">
                                {lang === "fa" ? toFa(readCount) : readCount} ✓
                              </span>
                              {w.isLocal && <span className="rounded bg-secondary px-1.5 py-px">local</span>}
                              {catCount > 0 && (
                                <span>
                                  {lang === "fa" ? toFa(catCount) : catCount} {t("more.categories").toLowerCase()}
                                </span>
                              )}
                            </p>
                          </div>
                          <button
                            onClick={() => removeOthers(w.id, group)}
                            className={cn(
                              "flex h-8 items-center gap-1 rounded-full border px-2.5 text-[10.5px] font-extrabold transition-colors",
                              "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                            )}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t("dup.keepThis")}
                          </button>
                          <button
                            onClick={() => removeOne(w.id, w.title)}
                            aria-label={`${t("common.delete")}: ${w.title}`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
