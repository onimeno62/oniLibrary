"use client";

import { useMemo, useRef, useState } from "react";
import { Highlighter, StickyNote, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import type { Highlight, HighlightColor, Work } from "@/lib/types";

/**
 * Reader Notes & Highlights sheets (repo-audit §7).
 * Both reuse the EXISTING persistence — highlights slice + Work.personalNotes
 * — no second subsystem. Opened from the reader's overflow menu.
 */

const HL_SWATCH: Record<HighlightColor, string> = {
  coral: "bg-[#f8694c]",
  mint: "bg-emerald-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
};

/** current chapter first (by page), then the rest by chapter number/page */
function sortHighlights(list: Highlight[], chapterId: string, chapterNumber: (id: string) => number): Highlight[] {
  return [...list].sort((a, b) => {
    if (a.chapterId === chapterId && b.chapterId !== chapterId) return -1;
    if (b.chapterId === chapterId && a.chapterId !== chapterId) return 1;
    if (a.chapterId !== b.chapterId) return chapterNumber(a.chapterId) - chapterNumber(b.chapterId);
    return (a.page ?? 0) - (b.page ?? 0);
  });
}

export function HighlightsSheet({
  open,
  onOpenChange,
  work,
  chapterId,
  onJump,
  onJumpCrossChapter,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  work: Work;
  chapterId: string;
  /** jump inside the current chapter (focus + page flip) — same-chapter items */
  onJump: (hl: Highlight) => void;
  /** switch chapter first, then focus the highlight — cross-chapter items */
  onJumpCrossChapter: (hl: Highlight) => void;
}) {
  const { t } = useT();
  const allHighlights = useApp((s) => s.highlights);
  const updateHighlight = useApp((s) => s.updateHighlight);
  const removeHighlight = useApp((s) => s.removeHighlight);

  const chapterNumber = useMemo(() => {
    const map = new Map(work.chapters.map((c) => [c.id, c.number]));
    return (id: string) => map.get(id) ?? 0;
  }, [work.chapters]);

  const items = useMemo(
    () => sortHighlights(allHighlights.filter((h) => h.workId === work.id), chapterId, chapterNumber),
    [allHighlights, work.id, chapterId, chapterNumber]
  );

  /* inline note editing — one open editor at a time (fresh per open via key) */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="dark top-auto bottom-0 left-1/2 w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start text-[16px] font-extrabold">
            <Highlighter className="h-4.5 w-4.5 text-primary" />
            {t("rdr.highlights")} · {work.title}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("rdr.highlights")}</DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-secondary/40 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
              <Highlighter className="h-5 w-5" />
            </span>
            <p className="text-[13px] font-bold">{t("rdr.noHighlights")}</p>
            <p className="max-w-[260px] text-[11.5px] font-semibold leading-relaxed text-muted-foreground">
              {t("rdr.noHighlightsHint")}
            </p>
          </div>
        ) : (
          <div className="thin-scrollbar max-h-[52vh] space-y-2 overflow-y-auto pe-1">
            {items.map((hl) => {
              const sameChapter = hl.chapterId === chapterId;
              const pageLabel = hl.page !== undefined ? `${t("common.page")} ${hl.page}` : undefined;
              return (
                <div
                  key={hl.id}
                  className={cn(
                    "rounded-2xl border p-3",
                    sameChapter ? "border-primary/30 bg-primary/[0.06]" : "border-border bg-white/[0.03]"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", HL_SWATCH[hl.color])} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-3 text-[12.5px] font-semibold leading-relaxed text-foreground" dir="auto">
                        {hl.text || "…"}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10.5px] font-bold text-muted-foreground">
                        <span>
                          {t("common.ch")} {chapterNumber(hl.chapterId)}
                          {pageLabel ? ` · ${pageLabel}` : ""}
                        </span>
                        {!sameChapter && <span className="text-primary/80">({t("rdr.jumpTo")})</span>}
                      </p>
                      {hl.note && editingId !== hl.id && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl bg-secondary/60 px-2.5 py-1.5 text-[11.5px] font-semibold text-foreground/90" dir="auto">
                          <StickyNote className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 whitespace-pre-wrap">{hl.note}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <Button
                        size="sm"
                        onClick={() => (sameChapter ? onJump(hl) : onJumpCrossChapter(hl))}
                        className="h-8 rounded-full bg-coral-gradient px-3 text-[11.5px] font-bold text-white hover:opacity-90"
                      >
                        {t("rdr.jumpTo")}
                      </Button>
                      <button
                        onClick={() => {
                          setEditingId(editingId === hl.id ? null : hl.id);
                          setDraft(hl.note ?? "");
                        }}
                        className="flex h-8 items-center justify-center gap-1 rounded-full bg-secondary px-2 text-[10.5px] font-bold text-secondary-foreground transition-colors hover:bg-accent"
                      >
                        <StickyNote className="h-3 w-3" />
                        {t("rdr.notes")}
                      </button>
                    </div>
                  </div>

                  {editingId === hl.id && (
                    <div className="mt-2.5 border-t border-border pt-2.5">
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={t("rdr.notePlaceholder")}
                        rows={3}
                        dir="auto"
                        className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-[12.5px] font-semibold outline-none transition-colors focus:border-primary"
                      />
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          onClick={() => {
                            removeHighlight(hl.id);
                            setEditingId(null);
                          }}
                          aria-label={t("common.delete")}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-red-400 transition-colors hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingId(null)}
                            className="h-9 rounded-full px-4 text-[12px] font-bold"
                          >
                            {t("common.cancel")}
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              updateHighlight(hl.id, { note: draft.trim() || undefined });
                              setEditingId(null);
                            }}
                            className="h-9 rounded-full bg-coral-gradient px-4 text-[12px] font-bold text-white hover:opacity-90"
                          >
                            {t("common.save")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function NotesSheet({
  open,
  onOpenChange,
  work,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  work: Work;
}) {
  const { t } = useT();
  const updateWork = useApp((s) => s.updateWork);
  /* fresh copy of the persisted notes on every open — the reader keys this
     component by the open flag, so mount == open (no effect-setState) */
  const [text, setText] = useState(work.personalNotes ?? "");
  const saveTimer = useRef<number | null>(null);

  /* debounced autosave (500 ms) — flushed immediately when the sheet closes */
  const scheduleSave = (value: string) => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      updateWork(work.id, { personalNotes: value });
    }, 500);
  };

  const close = () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      updateWork(work.id, { personalNotes: text });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? close() : undefined)}>
      <DialogContent
        showCloseButton={false}
        className="dark top-auto bottom-0 left-1/2 w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start text-[16px] font-extrabold">
            <StickyNote className="h-4.5 w-4.5 text-primary" />
            {t("rdr.notes")} · {work.title}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("rdr.notesHint")}</DialogDescription>
        </DialogHeader>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            scheduleSave(e.target.value);
          }}
          placeholder={t("rdr.notePlaceholder")}
          rows={7}
          dir="auto"
          aria-label={t("rdr.notes")}
          className="thin-scrollbar w-full resize-none rounded-2xl border border-border bg-background px-3.5 py-3 text-[13px] font-semibold leading-relaxed outline-none transition-colors focus:border-primary"
        />
        <p className="mt-1 px-1 text-[11px] font-semibold text-muted-foreground">{t("rdr.notesHint")}</p>

        <Button
          onClick={close}
          className="mt-2 w-full rounded-full bg-coral-gradient py-2.5 text-[13px] font-extrabold text-white hover:opacity-90"
        >
          {t("common.done")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
