"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  Highlighter,
  Loader2,
  NotebookPen,
  PenLine,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { OverlayHeader } from "@/components/shared";
import { useApp, useNav, toFa, timeAgo } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { downloadFile, toCsv } from "@/lib/export-file";
import { HL_COLORS } from "@/components/screens/epub-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Highlight, HighlightColor } from "@/lib/types";

/* ============================================================
   HighlightsScreen — Notes & highlights manager (round 11)
   Every highlight across the library in one place: filter by
   work / color / search / noted-only, tap a card to jump into
   the reader (EPUB scrolls + flashes the mark, PDF jumps to the
   page), edit color + note, copy, delete, export as Markdown
   or CSV (native-bridge aware inside the APK).
   ============================================================ */

const COLORS: HighlightColor[] = ["coral", "mint", "amber", "violet"];

function ymd(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

/* edit dialog: color dots + note editor + delete */
function EditDialog({
  hl,
  onDone,
}: {
  hl: Highlight;
  onDone: () => void;
}) {
  const { t } = useT();
  const updateHighlight = useApp((s) => s.updateHighlight);
  const removeHighlight = useApp((s) => s.removeHighlight);
  const [note, setNote] = useState(hl.note ?? "");

  return (
    <Dialog open onOpenChange={(v) => !v && onDone()}>
      <DialogContent
        showCloseButton={false}
        className="dark top-auto bottom-0 left-1/2 w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-start text-[16px] font-extrabold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-coral-soft text-primary">
              <Highlighter className="h-4 w-4" />
            </span>
            {t("nhl.editTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">{t("nhl.editTitle")}</DialogDescription>
        </DialogHeader>

        {/* quoted text */}
        <p
          dir="auto"
          className="max-h-24 overflow-y-auto rounded-2xl border-s-4 bg-secondary/50 px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-foreground/85 thin-scrollbar"
          style={{ borderInlineStartColor: HL_COLORS[hl.color] }}
        >
          “{hl.text}”
        </p>

        {/* colors */}
        <div className="flex items-center gap-2.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t("hl.color", { c })}
              onClick={() => updateHighlight(hl.id, { color: c })}
              className={cn(
                "h-8 w-8 rounded-full transition-transform hover:scale-110 active:scale-95",
                hl.color === c && "ring-2 ring-primary ring-offset-2 ring-offset-card"
              )}
              style={{ background: HL_COLORS[c], boxShadow: `0 4px 10px -3px ${HL_COLORS[c]}99` }}
            />
          ))}
        </div>

        {/* note */}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder={t("hl.notePlaceholder")}
          aria-label={t("hl.note")}
          className="w-full resize-none rounded-2xl border border-border bg-secondary/60 px-3.5 py-2.5 text-[13px] font-semibold leading-relaxed outline-none transition-colors placeholder:font-semibold placeholder:text-muted-foreground focus:border-primary/60"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              removeHighlight(hl.id);
              toast({ title: t("hl.removed") });
              onDone();
            }}
            aria-label={t("hl.remove")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-500/25 text-red-400 transition-colors hover:bg-red-500/15"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              updateHighlight(hl.id, { note: note.trim() || undefined });
              toast({ title: t("hl.updated") });
              onDone();
            }}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-coral-gradient text-[13px] font-extrabold text-white shadow-[0_10px_22px_-10px_rgba(248,105,76,0.9)] transition-transform active:scale-[0.98]"
          >
            <Check className="h-4 w-4" />
            {t("common.save")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HighlightsScreen({ workId }: { workId?: string }) {
  const { t, lang } = useT();
  const works = useApp((s) => s.works);
  const highlights = useApp((s) => s.highlights);
  const push = useNav((s) => s.push);
  const pop = useNav((s) => s.pop);

  const fa = lang === "fa";
  const num = (n: number | string) => (fa ? toFa(n) : String(n));

  const [workFilter, setWorkFilter] = useState<string>(workId ?? "all");
  const [colorFilter, setColorFilter] = useState<HighlightColor | "all">("all");
  const [notedOnly, setNotedOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  /* works that actually have highlights (chip row) */
  const hlWorks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of highlights) counts.set(h.workId, (counts.get(h.workId) ?? 0) + 1);
    return works
      .filter((w) => counts.has(w.id))
      .map((w) => ({ work: w, count: counts.get(w.id)! }));
  }, [highlights, works]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return highlights.filter((h) => {
      if (workFilter !== "all" && h.workId !== workFilter) return false;
      if (colorFilter !== "all" && h.color !== colorFilter) return false;
      if (notedOnly && !h.note) return false;
      if (q && !(h.text.toLowerCase().includes(q) || (h.note ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [highlights, workFilter, colorFilter, notedOnly, query]);

  const jump = (h: Highlight) => {
    /* reader effect focuses the mark: epub scrolls+flashes, pdf flips to the page */
    push({ kind: "reader", workId: h.workId, chapterId: h.chapterId, highlightId: h.id });
  };

  const copyText = async (h: Highlight) => {
    const payload = h.note ? `${h.text}\n— ${h.note}` : h.text;
    try {
      await navigator.clipboard.writeText(payload);
      toast({ title: t("nhl.copied") });
    } catch {
      toast({ title: t("nhl.copied") });
    }
  };

  /* ------- exports (Markdown / CSV, native-bridge aware) ------- */
  const locationLabel = (h: Highlight): string => {
    const w = works.find((x) => x.id === h.workId);
    const ch = w?.chapters.find((c) => c.id === h.chapterId);
    if (h.page) return `Page ${h.page}`;
    if (ch) return `${ch.number ? `Chapter ${ch.number}` : ch.title}`;
    return "—";
  };

  const exportMd = () => {
    setExporting(true);
    try {
      const lines: string[] = [
        `# oniLibrary — ${t("nhl.title")}`,
        ``,
        `_${new Date().toLocaleString("en-US")} · ${filtered.length === 1 ? t("nhl.countOne") : t("nhl.count", { n: filtered.length })}_`,
        ``,
      ];
      let curWork = "";
      for (const h of filtered) {
        const w = works.find((x) => x.id === h.workId);
        const title = w?.title ?? h.workId;
        if (title !== curWork) {
          curWork = title;
          lines.push(`## ${title}`, ``);
        }
        lines.push(`> ${h.text.replace(/\n+/g, " ")}`);
        lines.push(``);
        lines.push(
          `— ${locationLabel(h)} · ${h.color}${h.note ? ` · 📝 ${h.note.replace(/\n+/g, " ")}` : ""} · ${h.createdAt.slice(0, 10)}`,
          ``
        );
      }
      downloadFile(`onilibrary-highlights-${ymd()}.md`, "text/markdown;charset=utf-8", lines.join("\n"));
      toast({ title: t("nhl.exported"), description: `onilibrary-highlights-${ymd()}.md` });
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = () => {
    setExporting(true);
    try {
      const rows: (string | number)[][] = [
        ["Work", "Location", "Color", "Text", "Note", "CreatedAt"],
        ...filtered.map((h) => [
          works.find((x) => x.id === h.workId)?.title ?? h.workId,
          locationLabel(h),
          h.color,
          h.text,
          h.note ?? "",
          h.createdAt,
        ]),
      ];
      downloadFile(`onilibrary-highlights-${ymd()}.csv`, "text/csv;charset=utf-8", toCsv(rows));
      toast({ title: t("nhl.exported"), description: `onilibrary-highlights-${ymd()}.csv` });
    } finally {
      setExporting(false);
    }
  };

  const editingHl = editing ? highlights.find((h) => h.id === editing) : undefined;

  return (
    <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
      <OverlayHeader
        title={t("nhl.title")}
        right={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={exportMd}
              disabled={exporting || filtered.length === 0}
              aria-label={t("nhl.exportMd")}
              className="flex h-9 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[10.5px] font-extrabold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5 text-primary" />
              MD
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={exporting || filtered.length === 0}
              aria-label={t("nhl.exportCsv")}
              className="flex h-9 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[10.5px] font-extrabold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
              CSV
            </button>
          </div>
        }
      />

      {/* count + subtitle */}
      <p className="mb-2 mt-1 px-1 text-[12px] font-semibold text-muted-foreground">
        {filtered.length === 1 ? t("nhl.countOne") : t("nhl.count", { n: num(filtered.length) })}
        {highlights.length !== filtered.length && ` · ${t("nhl.allWorks")} ${num(highlights.length)}`}
      </p>

      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("nhl.search")}
          aria-label={t("nhl.search")}
          dir="auto"
          className="h-11 w-full rounded-2xl border border-border bg-card ps-10 pe-10 text-[13px] font-bold outline-none transition-colors placeholder:font-semibold placeholder:text-muted-foreground focus:border-primary/60"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("common.close")}
            className="absolute end-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* work chips */}
      {hlWorks.length > 0 && (
        <div className="thin-scrollbar -mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5 pb-0.5">
          <button
            type="button"
            onClick={() => setWorkFilter("all")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all",
              workFilter === "all"
                ? "bg-coral-gradient text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)]"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            )}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {t("nhl.allWorks")}
          </button>
          {hlWorks.map(({ work, count }) => (
            <button
              key={work.id}
              type="button"
              onClick={() => setWorkFilter(work.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all",
                workFilter === work.id
                  ? "bg-coral-gradient text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)]"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
              )}
            >
              {work.title.length > 22 ? `${work.title.slice(0, 22)}…` : work.title}
              <span className={cn("rounded-full px-1.5 text-[10px] font-black", workFilter === work.id ? "bg-white/25" : "bg-background/60")}>
                {num(count)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* color + noted filters */}
      <div className="mt-2.5 flex items-center gap-2">
        {(["all", ...COLORS] as ("all" | HighlightColor)[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColorFilter(c)}
            aria-label={c === "all" ? t("nhl.allColors") : t("hl.color", { c })}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full border transition-all active:scale-95",
              colorFilter === c
                ? "border-primary shadow-[0_0_0_2px_rgba(248,105,76,0.35)]"
                : "border-border hover:border-muted-foreground/40"
            )}
          >
            {c === "all" ? (
              <span className="text-[10px] font-black text-muted-foreground">
                {fa ? "همه" : "ALL"}
              </span>
            ) : (
              <span
                className="h-4 w-4 rounded-full"
                style={{ background: HL_COLORS[c], boxShadow: `0 3px 8px -2px ${HL_COLORS[c]}aa` }}
              />
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setNotedOnly((v) => !v)}
          aria-pressed={notedOnly}
          className={cn(
            "ms-auto flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-extrabold transition-all",
            notedOnly
              ? "border-amber-300/50 bg-amber-300/15 text-amber-500 dark:text-amber-300"
              : "border-border text-muted-foreground hover:bg-secondary"
          )}
        >
          <PenLine className="h-3.5 w-3.5" />
          {t("nhl.notedOnly")}
        </button>
      </div>

      {/* list */}
      {filtered.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-2.5 px-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-coral-soft text-primary">
            <NotebookPen className="h-8 w-8" />
          </span>
          <p className="text-[15px] font-extrabold">{t("nhl.empty")}</p>
          <p className="text-[12px] font-semibold leading-relaxed text-muted-foreground">{t("nhl.emptyHint")}</p>
        </div>
      ) : (
        <div className="mt-3.5 space-y-2.5">
          {filtered.map((h) => {
            const w = works.find((x) => x.id === h.workId);
            const ch = w?.chapters.find((c) => c.id === h.chapterId);
            return (
              <article
                key={h.id}
                className="oni-hl-card group relative overflow-hidden rounded-3xl border border-border bg-card"
              >
                {/* color stripe */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 start-0 w-1.5"
                  style={{ background: `linear-gradient(180deg, ${HL_COLORS[h.color]}, ${HL_COLORS[h.color]}66)` }}
                />
                <div className="p-4 ps-5">
                  {/* text */}
                  <button
                    type="button"
                    onClick={() => jump(h)}
                    className="block w-full text-start"
                    aria-label={`${t("nhl.open")}: ${w?.title ?? ""}`}
                  >
                    <p dir="auto" className="line-clamp-3 text-[13.5px] font-semibold leading-relaxed text-foreground">
                      “{h.text}”
                    </p>
                  </button>

                  {/* note */}
                  {h.note && (
                    <p
                      dir="auto"
                      className="mt-2 flex items-start gap-1.5 rounded-xl bg-amber-300/[0.08] px-2.5 py-1.5 text-[12px] font-medium leading-snug text-amber-600 dark:text-amber-300/90"
                    >
                      <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {h.note}
                    </p>
                  )}

                  {/* meta + actions */}
                  <div className="mt-2.5 flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: HL_COLORS[h.color] }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-muted-foreground">
                      {workFilter === "all" && (
                        <>
                          {w?.title ?? "—"}
                          <span className="mx-1 opacity-40">·</span>
                        </>
                      )}
                      {h.page
                        ? t("pdf.jumpPage", { n: num(h.page) })
                        : ch
                          ? `${t("common.chapter")} ${num(ch.number)}`
                          : ""}
                      <span className="mx-1 opacity-40">·</span>
                      {timeAgo(h.createdAt, lang)}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyText(h)}
                      aria-label={t("nhl.copy")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(h.id)}
                      aria-label={t("nhl.editTitle")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <PenLine className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => jump(h)}
                      aria-label={t("nhl.open")}
                      className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-coral-soft px-3 text-[11px] font-extrabold text-primary transition-transform active:scale-95"
                    >
                      {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                      {t("nhl.open")}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* edit dialog */}
      {editingHl && <EditDialog hl={editingHl} onDone={() => setEditing(null)} />}

      {/* leave the overlay when the list emptied after a delete from a work-scoped view */}
      {editing === null && highlights.length === 0 && workId && (
        <button type="button" onClick={pop} className="sr-only">
          {t("common.back")}
        </button>
      )}
    </div>
  );
}
