"use client";

/* ============================================================
   oniLibrary — MangaDex filter sheet (plan §6 "an actual filter UI")
   Shared by the Discover header button and the source browser.

   Every control maps to a server-side MangaDex parameter — nothing
   is filtered client-side only, and nothing is fabricated:
     • content type → originalLanguage[] (ja/ko/zh, zh includes zh-hk)
     • publication status → status[]
     • genres → includedTags[] (real /manga/tag UUIDs, AND-joined)
   ============================================================ */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw } from "lucide-react";
import { mdTagList, type MdTag } from "@/lib/mangadex";
import type { MdFeedFilters } from "@/lib/types";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

const CONTENT_TYPES: Array<{ id: "ja" | "ko" | "zh"; labelKey: TranslationKey; langs: string[] }> = [
  { id: "ja", labelKey: "type.MANGA", langs: ["ja"] },
  { id: "ko", labelKey: "type.MANHWA", langs: ["ko"] },
  { id: "zh", labelKey: "type.MANHUA", langs: ["zh", "zh-hk"] },
];

const STATUSES: TranslationKey[] = ["md.status.ongoing", "md.status.completed", "md.status.hiatus", "md.status.cancelled"];
const STATUS_IDS = ["ongoing", "completed", "hiatus", "cancelled"];

type Draft = { types: Set<string>; statuses: Set<string>; tags: Set<string> };

function toDraft(f: MdFeedFilters | undefined): Draft {
  const types = new Set<string>();
  for (const ct of CONTENT_TYPES) {
    const langs = f?.originalLanguage ?? [];
    if (langs.length > 0 && ct.langs.every((l) => langs.includes(l))) types.add(ct.id);
  }
  return {
    types,
    statuses: new Set(f?.status ?? []),
    tags: new Set(f?.includedTags ?? []),
  };
}

function toFilters(d: Draft): MdFeedFilters {
  const langs = new Set<string>();
  for (const ct of CONTENT_TYPES) if (d.types.has(ct.id)) for (const l of ct.langs) langs.add(l);
  return {
    originalLanguage: langs.size > 0 ? [...langs] : undefined,
    status: d.statuses.size > 0 ? [...d.statuses] : undefined,
    includedTags: d.tags.size > 0 ? [...d.tags] : undefined,
  };
}

export function activeFilterCount(f?: MdFeedFilters): number {
  return (f?.status?.length ?? 0) + (f?.originalLanguage?.length ?? 0) + (f?.includedTags?.length ?? 0);
}

export function MdFilterSheet({
  open,
  onOpenChange,
  value,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value?: MdFeedFilters;
  onApply: (filters: MdFeedFilters) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [tags, setTags] = useState<MdTag[] | null>(null);
  const [tagsFailed, setTagsFailed] = useState(false);

  // fresh draft each open — render-phase reset (same pattern as MdSheet):
  // the sheet is a modal, cheap to rebuild
  const [resetState, setResetState] = useState<"closed" | "reset" | "open">("closed");
  if (!open && resetState !== "closed") setResetState("closed");
  if (open && resetState === "closed") {
    setResetState("open");
    setDraft(toDraft(value));
  }

  useEffect(() => {
    if (!open || tags || tagsFailed) return;
    let alive = true;
    mdTagList()
      .then((list) => alive && setTags(list))
      .catch(() => alive && setTagsFailed(true));
    return () => {
      alive = false;
    };
  }, [open, tags, tagsFailed]);

  const toggle = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  const chipBtn = (selected: boolean) =>
    cn(
      "min-h-[38px] rounded-full px-4 py-1.5 text-[12.5px] font-extrabold transition-colors",
      selected
        ? "bg-coral-gradient text-white shadow-[0_6px_14px_-8px_rgba(248,105,76,0.7)]"
        : "bg-secondary text-foreground hover:bg-secondary/70"
    );

  const Chip = ({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) => (
    <button onClick={onClick} aria-pressed={selected} className={chipBtn(selected)}>
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] rounded-3xl border-border bg-card p-0" style={{ maxWidth: 400 }} dir={undefined}>
        <div className="max-h-[78vh] overflow-y-auto thin-scrollbar">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="text-[16px] font-extrabold">{t("flt.title")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 px-4 pb-4">
            {/* content type */}
            <section>
              <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {t("flt.contentType")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {CONTENT_TYPES.map((ct) => (
                  <Chip
                    key={ct.id}
                    selected={draft.types.has(ct.id)}
                    label={t(ct.labelKey)}
                    onClick={() => setDraft((d) => ({ ...d, types: toggle(d.types, ct.id) }))}
                  />
                ))}
              </div>
            </section>

            {/* publication status */}
            <section>
              <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {t("flt.status")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((key, i) => (
                  <Chip
                    key={key}
                    selected={draft.statuses.has(STATUS_IDS[i])}
                    label={t(key)}
                    onClick={() => setDraft((d) => ({ ...d, statuses: toggle(d.statuses, STATUS_IDS[i]) }))}
                  />
                ))}
              </div>
            </section>

            {/* genres (real tag UUIDs from /manga/tag) */}
            <section>
              <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                {t("flt.genres")}
              </h3>
              {tagsFailed ? (
                <button
                  onClick={() => {
                    setTagsFailed(false);
                    setTags(null);
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-red-500/25 bg-red-500/5 text-[12px] font-extrabold text-red-500"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t("srch.retry")}
                </button>
              ) : tags === null ? (
                <div className="flex flex-wrap gap-2" aria-busy>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-[38px] w-20 animate-pulse rounded-full bg-secondary/70" />
                  ))}
                </div>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-2xl border border-border/60 p-2 thin-scrollbar">
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <Chip
                        key={tag.id}
                        selected={draft.tags.has(tag.id)}
                        label={tag.name}
                        onClick={() => setDraft((d) => ({ ...d, tags: toggle(d.tags, tag.id) }))}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* actions */}
          <div className="sticky bottom-0 flex gap-2 border-t border-border/60 bg-card p-4 pt-3">
            <button
              onClick={() => {
                setDraft({ types: new Set(), statuses: new Set(), tags: new Set() });
                onApply({});
              }}
              className="h-11 flex-1 rounded-2xl border border-border text-[13px] font-extrabold hover:bg-secondary"
            >
              {t("flt.reset")}
            </button>
            <button
              onClick={() => onApply(toFilters(draft))}
              className="h-11 flex-1 rounded-2xl bg-coral-gradient text-[13px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)]"
            >
              {t("flt.apply")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
