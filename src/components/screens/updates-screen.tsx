"use client";

import { useMemo } from "react";
import { RefreshCw, Check, MailOpen, Mail, ChevronRight } from "lucide-react";
import { WorkCover, EmptyState } from "@/components/shared";
import { useApp, useNav, timeAgo } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export function UpdatesScreen() {
  const { t, lang } = useT();
  const works = useApp((s) => s.works);
  const updateCheck = useApp((s) => s.updateCheck);
  const runCheck = useApp((s) => s.runUpdateCheck);
  const markRead = useApp((s) => s.markChapterRead);
  const openReader = useNav((s) => s.openReader);
  const openWork = useNav((s) => s.openWork);

  const items = useMemo(() => {
    const list = works
      .filter((w) => !w.inVault)
      .flatMap((w) => {
        const ch = w.chapters[0];
        if (!ch) return [];
        return [{ w, ch }];
      })
      .sort((a, b) => (a.ch.releaseDate < b.ch.releaseDate ? 1 : -1));
    return list;
  }, [works]);

  const groups = useMemo(() => {
    const now = Date.now();
    const g: Record<string, typeof items> = { today: [], yesterday: [], week: [], earlier: [] };
    for (const it of items) {
      const age = now - new Date(it.ch.releaseDate).getTime();
      if (age < 86_400_000) g.today.push(it);
      else if (age < 2 * 86_400_000) g.yesterday.push(it);
      else if (age < 7 * 86_400_000) g.week.push(it);
      else g.earlier.push(it);
    }
    return g;
  }, [items]);

  const onCheck = async () => {
    const found = await runCheck();
    if (found > 0) toast({ title: t("upd.found", { n: found }) });
    else toast({ title: t("upd.upToDate") });
  };

  const GroupBlock = ({ label, list }: { label: string; list: typeof items }) =>
    list.length === 0 ? null : (
      <section className="mt-5">
        <h2 className="mb-2.5 text-[13px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</h2>
        <div className="space-y-2">
          {list.map(({ w, ch }) => (
            <div
              key={w.id}
              className={cn(
                "flex items-center gap-3 rounded-3xl border bg-card p-2.5 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)] transition-all",
                ch.isRead ? "border-border/50 opacity-75" : "border-primary/25"
              )}
            >
              <button onClick={() => openWork(w.id)}>
                <WorkCover src={w.cover} color={w.coverColor} title={w.title} className="h-[60px] w-[48px] rounded-2xl" sizes="48px" />
              </button>
              <button onClick={() => openReader(w.id, ch.id)} className="min-w-0 flex-1 text-start">
                <p className="truncate text-[14px] font-extrabold">{w.title}</p>
                <p className="text-[12px] font-semibold text-muted-foreground">
                  {t("common.ch")} {ch.number} · {ch.pages} {t("common.page")}
                </p>
                <p className="text-[10px] font-bold text-muted-foreground/80">{timeAgo(ch.releaseDate, lang)}</p>
              </button>
              {!ch.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-coral-gradient" />}
              <button
                onClick={() => markRead(w.id, ch.id, !ch.isRead)}
                aria-label={ch.isRead ? t("upd.markUnread") : t("upd.markRead")}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
                  ch.isRead ? "bg-secondary text-muted-foreground hover:text-foreground" : "bg-coral-soft text-primary hover:bg-primary hover:text-white"
                )}
              >
                {ch.isRead ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
              </button>
            </div>
          ))}
        </div>
      </section>
    );

  return (
    <div className="min-h-full px-5 pb-8">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-[24px] font-black tracking-tight">{t("upd.title")}</h1>
        <button
          onClick={onCheck}
          disabled={updateCheck.checking}
          className="flex items-center gap-2 rounded-full bg-coral-gradient px-4 py-2 text-[13px] font-extrabold text-white shadow-[0_8px_20px_-8px_rgba(248,105,76,0.6)] transition-all hover:opacity-90 disabled:opacity-60"
        >
          <RefreshCw className={cn("h-4 w-4", updateCheck.checking && "animate-spin")} />
          {updateCheck.checking ? t("upd.checking") : t("upd.check")}
        </button>
      </header>

      <p className="mt-1.5 text-[11px] font-bold text-muted-foreground">
        {t("upd.lastCheck")}:{" "}
        {updateCheck.lastCheck ? timeAgo(updateCheck.lastCheck, lang) : t("upd.never")}
      </p>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<RefreshCw className="h-6 w-6" />}
            title={t("upd.empty")}
            hint={t("upd.emptyHint")}
          />
        </div>
      ) : (
        <>
          <GroupBlock label={t("upd.today")} list={groups.today} />
          <GroupBlock label={t("upd.yesterday")} list={groups.yesterday} />
          <GroupBlock label={t("upd.thisWeek")} list={groups.week} />
          <GroupBlock label={t("upd.earlier")} list={groups.earlier} />
        </>
      )}

      <section className="mt-6 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Check className="h-4 w-4 text-primary" />
          <p className="text-[13px] font-extrabold">{t("upd.autoCheck")}</p>
          <ChevronRight className="ms-auto h-4 w-4 text-muted-foreground rtl:rotate-180" />
          <AutoToggle />
        </div>
        <p className="mt-1 ps-6 text-[11px] font-semibold text-muted-foreground">{t("upd.autoCheckHint")}</p>
      </section>
    </div>
  );
}

function AutoToggle() {
  const { t } = useT();
  const auto = useApp((s) => s.settings.autoUpdateCheck);
  const set = useApp((s) => s.setSettings);
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={t("upd.autoCheck")}
      checked={auto}
      onChange={(e) => set({ autoUpdateCheck: e.target.checked })}
      className="h-5 w-9 appearance-none rounded-full bg-secondary transition-colors before:block before:h-4 before:w-4 before:translate-x-0.5 before:translate-y-0.5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:bg-primary checked:before:translate-x-[18px]"
    />
  );
}
