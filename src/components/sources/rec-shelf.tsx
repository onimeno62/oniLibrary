"use client";

/* ============================================================
   oniLibrary — "Picked for you" shelf + personalization prefs
   (plan §9, Phase 5)

   Honest-by-construction:
   • candidates come from the MangaDex popularity feed — the neutral
     variant is labeled "Popular on MangaDex", never "global";
   • when personalized, the feed is narrowed with server-side tag
     filters derived from on-device signals, and each card explains
     itself with a concise reason;
   • personalization OFF ⇒ pure feed order, no local signals used;
   • every input stays on this device — nothing is uploaded, and the
     sheet says exactly that.

   Ranking lives in src/lib/recommendations.ts (pure, unit-tested).
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SectionHeader } from "@/components/shared";
import { MdCover } from "@/components/sources/free-catalogs";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { MANGADEX_ID } from "@/lib/builtin-sources";
import { mdPopularFeed, mdTagList, type MdManga, type MdTag } from "@/lib/mangadex";
import {
  buildProviderTagFilter,
  buildRecSignals,
  isNewUser,
  librarySourceIds,
  rankRecommendations,
  type RecCandidate,
  type ScoredCandidate,
} from "@/lib/recommendations";
import type { TranslationKey } from "@/lib/i18n";

const SHELF_SIZE = 12;

function candidateFromMd(m: MdManga, order: number): RecCandidate {
  return {
    id: `md:${m.id}`,
    title: m.title,
    author: m.author || "MangaDex",
    coverUrl: m.coverUrl,
    tags: m.tags,
    type: m.workType,
    providerId: MANGADEX_ID,
    order,
    focusMangaId: m.id,
  };
}

type FetchState =
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "data"; items: ScoredCandidate[]; personalized: boolean };

export function RecShelf() {
  const { t } = useT();
  const push = useNav((s) => s.push);

  const works = useApp((s) => s.works);
  const history = useApp((s) => s.history);
  const dismissed = useApp((s) => s.dismissedRecs);
  const recPrefs = useApp((s) => s.settings.recommendations);
  const mdDisabled = useApp((s) => s.builtinDisabled.includes(MANGADEX_ID));
  const offlineMode = useApp((s) => s.settings.offlineMode);
  const dismissRecommendation = useApp((s) => s.dismissRecommendation);

  const [netTick, setNetTick] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [result, setResult] = useState<{ key: string; state: FetchState } | null>(null);

  const personalized = recPrefs.enabled;

  /* local signals are pure — memoized on their inputs */
  const signals = useMemo(
    () =>
      buildRecSignals({
        works: works.filter((w) => !w.inVault),
        history,
      }),
    [works, history]
  );

  useEffect(() => {
    const sync = () => setNetTick((n) => n + 1);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  /* hidden while the source is off or the device is offline — the same
     screen already communicates MangaDex state honestly elsewhere */
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  const hidden = mdDisabled || offlineMode || !online;

  /* stable fetch identity — a change re-runs the fetch; the UI derives the
     loading state by comparing keys (no setState inside the effect) */
  const fetchKey = useMemo(
    () =>
      JSON.stringify([
        hidden,
        personalized,
        netTick,
        retryTick,
        recPrefs.interests,
        recPrefs.excluded,
        dismissed.length,
        signals,
      ]),
    [hidden, personalized, netTick, retryTick, recPrefs.interests, recPrefs.excluded, dismissed.length, signals]
  );

  useEffect(() => {
    if (hidden) return;
    let alive = true;

    (async () => {
      try {
        /* name→uuid map only when we might narrow the feed server-side */
        let includedTags: string[] = [];
        if (personalized && (signals.hasActivity || recPrefs.interests.length > 0)) {
          const tags: MdTag[] = await mdTagList();
          const nameToUuid = new Map<string, string>(tags.map((tg) => [tg.name.trim().toLowerCase(), tg.id]));
          includedTags = buildProviderTagFilter(signals, recPrefs, nameToUuid);
        }

        const feed = await mdPopularFeed(0, includedTags.length > 0 ? { includedTags } : undefined);
        if (!alive) return;

        const candidates = feed.list.map(candidateFromMd);
        const libraryIds = librarySourceIds(
          works.map((w) => ({ id: w.id, sourceRef: w.sourceRef })),
          MANGADEX_ID
        );
        const items = rankRecommendations(candidates, signals, recPrefs, {
          libraryIds,
          dismissed,
          limit: SHELF_SIZE,
        });
        if (alive) setResult({ key: fetchKey, state: { phase: "data", items, personalized } });
      } catch {
        if (alive) setResult({ key: fetchKey, state: { phase: "error" } });
      }
    })();

    return () => {
      alive = false;
    };
  }, [fetchKey, hidden]);

  if (hidden) return null;

  const state: FetchState = result && result.key === fetchKey ? result.state : { phase: "loading" };

  const newUser = isNewUser(signals, recPrefs);
  const titleKey: TranslationKey = personalized && !newUser ? "rec.title" : "rec.titleNeutral";

  return (
    <section className="mt-6">
      <SectionHeader
        title={t(titleKey)}
        right={
          <button
            onClick={() => setPrefsOpen(true)}
            aria-label={t("rec.refine")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        }
      />

      {state.phase === "loading" ? (
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-[96px] shrink-0">
              <div className="aspect-[3/4] w-full animate-pulse rounded-2xl bg-secondary/70" />
              <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-secondary/70" />
            </div>
          ))}
        </div>
      ) : state.phase === "error" ? (
        /* failed ≠ offline — retryable, plan §6 */
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-red-500/25 bg-red-500/5 p-5 text-center">
          <span className="text-[13px] font-extrabold text-red-500">{t("md.error")}</span>
          <button
            onClick={() => setRetryTick((n) => n + 1)}
            className="flex h-9 items-center gap-1.5 rounded-full bg-coral-soft px-4 text-[12px] font-extrabold text-primary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("srch.retry")}
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-border bg-card/50 p-5 text-center text-[12.5px] font-semibold text-muted-foreground">
          {t("rec.empty")}
        </p>
      ) : (
        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 no-scrollbar">
          {state.items.map(({ candidate, reasons }) => (
            <div key={candidate.id} className="w-[96px] shrink-0">
              <button
                onClick={() =>
                  push({ kind: "source", sourceId: MANGADEX_ID, focusMangaId: candidate.focusMangaId })
                }
                className="group relative block w-full text-start"
                aria-label={candidate.title}
              >
                <span className="block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-secondary shadow-[0_10px_22px_-12px_rgba(43,36,29,0.5)]">
                  <MdCover url={candidate.coverUrl ?? ""} title={candidate.title} />
                </span>
                {/* 44px dismiss target overlaid on the cover */}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t("rec.dismiss")}
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissRecommendation(candidate.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      dismissRecommendation(candidate.id);
                    }
                  }}
                  className="absolute end-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/75 rtl:rotate-180"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              </button>
              <p className="mt-1.5 truncate text-[12px] font-extrabold">{candidate.title}</p>
              <p className="truncate text-[10px] font-semibold text-muted-foreground">
                {reasons.map((r) => t(r.key, "params" in r ? (r.params as Record<string, string>) : undefined)).join(" · ")}
              </p>
            </div>
          ))}

          {newUser && (
            <button
              onClick={() => setPrefsOpen(true)}
              className="flex w-[132px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-3 text-center transition-colors hover:bg-card"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-coral-soft text-primary">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <span className="text-[11.5px] font-extrabold leading-tight text-primary">{t("rec.personalizeCta")}</span>
            </button>
          )}
        </div>
      )}

      <RecPrefsDialog open={prefsOpen} onOpenChange={setPrefsOpen} />
    </section>
  );
}

/* ================= personalization sheet (plan §9 controls) ================= */

function RecPrefsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useT();
  const recPrefs = useApp((s) => s.settings.recommendations);
  const setSettings = useApp((s) => s.setSettings);
  const clearRecSignals = useApp((s) => s.clearRecSignals);

  const [tags, setTags] = useState<MdTag[] | null>(null);
  const [tagsFailed, setTagsFailed] = useState(false);

  useEffect(() => {
    if (!open || tags) return;
    let alive = true;
    mdTagList()
      .then((list) => {
        if (alive) setTags(list);
      })
      .catch(() => {
        if (alive) setTagsFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [open, tags]);

  const toggle = (list: string[], tag: string) =>
    list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px] font-black">
            <Sparkles className="h-4.5 w-4.5 text-primary" />
            {t("rec.sheetTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("rec.sheetPrivacy")}</DialogDescription>
        </DialogHeader>

        {/* master switch */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-3.5">
          <div className="min-w-0">
            <p className="text-[13.5px] font-extrabold">{t("rec.personalization")}</p>
            <p className="mt-0.5 text-[11.5px] font-semibold leading-snug text-muted-foreground">{t("rec.sheetPrivacy")}</p>
          </div>
          <Switch
            checked={recPrefs.enabled}
            onCheckedChange={(v) => setSettings({ recommendations: { ...recPrefs, enabled: v } })}
            aria-label={t("rec.personalization")}
          />
        </div>

        {recPrefs.enabled && (
          <>
            {/* interests */}
            <div>
              <p className="text-[13px] font-extrabold">{t("rec.interests")}</p>
              <p className="mb-2 text-[11.5px] font-semibold text-muted-foreground">{t("rec.interestsHint")}</p>
              <TagChips
                tags={tags}
                failed={tagsFailed}
                selected={recPrefs.interests}
                onToggle={(tag) => setSettings({ recommendations: { ...recPrefs, interests: toggle(recPrefs.interests, tag) } })}
                selectedClass="bg-coral-gradient text-white border-transparent"
                retryLabel={t("srch.retry")}
                onRetry={() => {
                  setTags(null);
                  setTagsFailed(false);
                  mdTagList().then(setTags).catch(() => setTagsFailed(true));
                }}
              />
            </div>

            {/* exclusions */}
            <div>
              <p className="text-[13px] font-extrabold">{t("rec.excluded")}</p>
              <p className="mb-2 text-[11.5px] font-semibold text-muted-foreground">{t("rec.excludedHint")}</p>
              <TagChips
                tags={tags}
                failed={tagsFailed}
                selected={recPrefs.excluded}
                onToggle={(tag) => setSettings({ recommendations: { ...recPrefs, excluded: toggle(recPrefs.excluded, tag) } })}
                selectedClass="bg-red-500/10 text-red-600 border-red-500/40 dark:text-red-400"
                retryLabel={t("srch.retry")}
                onRetry={() => {
                  setTags(null);
                  setTagsFailed(false);
                  mdTagList().then(setTags).catch(() => setTagsFailed(true));
                }}
              />
            </div>

            {/* reset */}
            <button
              onClick={() => {
                clearRecSignals();
                onOpenChange(false);
              }}
              className="w-full rounded-2xl border border-border/60 py-2.5 text-[12.5px] font-extrabold text-muted-foreground transition-colors hover:bg-secondary"
            >
              {t("rec.clearSignals")}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TagChips({
  tags,
  failed,
  selected,
  onToggle,
  selectedClass,
  retryLabel,
  onRetry,
}: {
  tags: MdTag[] | null;
  failed: boolean;
  selected: string[];
  onToggle: (tag: string) => void;
  selectedClass: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  if (failed) {
    return (
      <button
        onClick={onRetry}
        className="flex h-9 items-center gap-1.5 rounded-full bg-secondary px-4 text-[12px] font-extrabold text-muted-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {retryLabel}
      </button>
    );
  }
  if (!tags) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-secondary/70" />
        ))}
      </div>
    );
  }
  return (
    <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
      {tags.map((tag) => {
        const on = selected.includes(tag.name);
        return (
          <button
            key={tag.id}
            onClick={() => onToggle(tag.name)}
            aria-pressed={on}
            className={cn(
              "rounded-full border px-3 py-1 text-[11.5px] font-bold transition-all",
              on ? selectedClass : "border-border bg-card text-secondary-foreground hover:bg-secondary"
            )}
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}
