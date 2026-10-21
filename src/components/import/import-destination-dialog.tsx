"use client";

import { useMemo, useState } from "react";
import { Check, FolderInput, Import, Loader2, Plus, Search, X } from "lucide-react";
import { WorkCover } from "@/components/shared";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { importFilesAsWork, importFilesToWork, UNSUPPORTED_REASON_KEYS } from "@/lib/importer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

function defaultNewTitle(files: File[]): string {
  const first = files[0]?.name ?? "";
  return first.replace(/\.[^.]+$/, "").slice(0, 80) || "Import";
}

/**
 * "Where should these files go?" — every import (file picker, Android
 * Share/Open-With staging) asks for its destination: an existing work
 * (smart search box) or a brand-new work. This replaces the old
 * separate "Add to work…" menu entry (v1.2.1).
 */
export function ImportDestinationDialog({
  files,
  onClose,
}: {
  files: File[] | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [query, setQuery] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // smart search: title prefix > title includes > alt-title/author includes
  const candidates = useMemo(() => {
    const pool = works.filter((w) => !w.inVault);
    const q = query.trim().toLowerCase();
    if (!q) return pool.slice(0, 40);
    return pool
      .map((w) => {
        const title = w.title.toLowerCase();
        let score = -1;
        if (title.startsWith(q)) score = 3;
        else if (title.includes(q)) score = 2;
        else if ((w.altTitle ?? "").toLowerCase().includes(q) || w.author.toLowerCase().includes(q)) score = 1;
        return { w, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score || a.w.title.localeCompare(b.w.title))
      .map((x) => x.w)
      .slice(0, 40);
  }, [works, query]);

  // reset transient state whenever a new batch arrives
  const [stagedFor, setStagedFor] = useState<File[] | null>(null);
  if (files && files !== stagedFor) {
    setStagedFor(files);
    setQuery("");
    setTargetId(null);
    setBusy(false);
    setNewName(defaultNewTitle(files));
    setMode(works.length > 0 ? "existing" : "new");
  }

  const effectiveName = newName.trim() || defaultNewTitle(files ?? []);
  const canConfirm = mode === "new" ? true : !!targetId;

  const run = async () => {
    if (!files || busy) return;
    setBusy(true);
    try {
      const st = useApp.getState();
      if (mode === "new") {
        const res = await importFilesAsWork(files, effectiveName);
        if (res.work) st.addWork(res.work);
        for (const w of res.separate) st.addWork(w);
        const titles = [res.work?.title, ...res.separate.map((w) => w.title)].filter(Boolean).join(", ");
        if (titles) {
          toast({ title: t("imp.added", { n: files.length }), description: titles.slice(0, 90) });
        } else {
          toast({ title: t("imp.failed"), variant: "destructive" });
        }
        if (res.skipped.length) {
          toast({
            title: t("imp.unsupported", { names: res.skipped.slice(0, 2).map((s) => s.name).join(", ") }),
            description: res.skipped
              .slice(0, 2)
              .map((s) => `${s.name} — ${t(UNSUPPORTED_REASON_KEYS[s.reason] ?? "imp.reason.format")}`)
              .join("\n"),
            variant: "destructive",
          });
        }
        if (res.partial.length) {
          toast({
            title: t("imp.partialPages"),
            description: t("imp.partialChapters", { names: res.partial.slice(0, 3).join(", ") }),
          });
        }
      } else {
        const work = st.works.find((w) => w.id === targetId);
        if (!work) return;
        const startNumber = work.chapters.reduce((m, c) => Math.max(m, c.number), 0) + 1;
        const { added, created, skipped, batchMeta, partial } = await importFilesToWork(files, work.id, startNumber);
        if (added.length) st.appendChapters(work.id, added);
        for (const w of created) st.addWork(w);
        // grow the work's static import facts (details page block)
        const prev = work.sourceMeta;
        st.updateWork(work.id, {
          sourceMeta: {
            sizeBytes: (prev?.sizeBytes ?? 0) + batchMeta.sizeBytes,
            fileCount: (prev?.fileCount ?? 0) + batchMeta.fileCount,
            formats: Array.from(new Set([...(prev?.formats ?? []), ...batchMeta.formats])),
            pathLabel: prev?.pathLabel || batchMeta.pathLabel,
          },
        });
        if (added.length) {
          toast({
            title: t("imp.addedChapters", { n: added.length }),
            description: added.map((c) => `#${c.number} ${c.title}`).join(", ").slice(0, 90),
          });
        }
        if (created.length) {
          toast({
            title: t("imp.separateWorks", { n: created.length }),
            description: created.map((c) => c.title).join(", ").slice(0, 90),
          });
        }
        if (!added.length && !created.length) {
          toast({ title: t("imp.failed"), variant: "destructive" });
        }
        if (skipped.length) {
          toast({
            title: t("imp.unsupported", { names: skipped.slice(0, 2).map((s) => s.name).join(", ") }),
            description: skipped
              .slice(0, 2)
              .map((s) => `${s.name} — ${t(UNSUPPORTED_REASON_KEYS[s.reason] ?? "imp.reason.format")}`)
              .join("\n"),
            variant: "destructive",
          });
        }
        if (partial.length) {
          toast({
            title: t("imp.partialPages"),
            description: t("imp.partialChapters", { names: partial.slice(0, 3).join(", ") }),
          });
        }
      }
      onClose();
    } catch {
      toast({ title: t("imp.failed"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!files} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[76dvh] rounded-3xl p-0 max-w-[380px] mx-auto" style={{ maxWidth: 380 }}>
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-[16px] font-black">
            <FolderInput className="h-4.5 w-4.5 text-primary" /> {t("imp.destinationTitle")}
          </DialogTitle>
          <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
            {t("imp.destinationHint", { n: files?.length ?? 0 })}
          </p>
        </DialogHeader>

        <div className="px-5 pt-3">
          {/* destination mode toggle */}
          <div className="flex items-center rounded-full bg-secondary p-1">
            {(
              [
                ["existing", "imp.toExisting"],
                ["new", "imp.toNew"],
              ] as const
            ).map(([id, key]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                disabled={busy}
                className={cn(
                  "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full text-[12.5px] font-extrabold transition-all",
                  mode === id ? "bg-coral-gradient text-white shadow-[0_6px_14px_-6px_rgba(248,105,76,0.6)]" : "text-secondary-foreground"
                )}
              >
                {id === "new" ? <Plus className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                {t(key)}
              </button>
            ))}
          </div>
        </div>

        {mode === "existing" ? (
          <div className="px-5 pt-3">
            <div className="flex h-10 items-center gap-2 rounded-full bg-secondary px-3.5">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("imp.searchWork")}
                aria-label={t("imp.toExisting")}
                className="w-full bg-transparent text-[13px] font-semibold outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label={t("a11y.clear")} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("imp.toNew")}</p>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 80))}
              placeholder={defaultNewTitle(files ?? [])}
              aria-label={t("imp.toNew")}
              disabled={busy}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] font-extrabold outline-none transition-colors focus:border-primary"
            />
          </div>
        )}

        {mode === "existing" && (
          <div className="max-h-[34dvh] overflow-y-auto thin-scrollbar p-3">
            {candidates.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] font-semibold text-muted-foreground">
                {t("imp.noWorkFound")}
              </p>
            ) : (
              candidates.map((w) => {
                const selected = w.id === targetId;
                return (
                  <button
                    key={w.id}
                    onClick={() => setTargetId(selected ? null : w.id)}
                    disabled={busy}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-start transition-colors hover:bg-secondary disabled:opacity-60",
                      selected && "bg-coral-soft ring-1 ring-primary/40"
                    )}
                  >
                    <WorkCover src={w.cover} color={w.coverColor} title={w.title} className="h-11 w-8 shrink-0 rounded-lg" sizes="32px" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-extrabold">{w.title}</span>
                      <span className="block text-[11px] font-semibold text-muted-foreground">
                        {w.chapters.length} {t("common.chapters")}
                      </span>
                    </span>
                    {selected ? (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-coral-gradient text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}

        <div className="border-t border-border/60 p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="flex h-11 shrink-0 items-center justify-center rounded-full border border-border px-5 text-[13px] font-extrabold text-secondary-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={run}
              disabled={!canConfirm || busy}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-coral-gradient text-[14px] font-extrabold text-white shadow-[0_12px_26px_-10px_rgba(248,105,76,0.7)] transition-opacity hover:opacity-95 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <Import className="h-4.5 w-4.5" />}
              {busy ? t("imp.importing") : t("imp.importFiles")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
