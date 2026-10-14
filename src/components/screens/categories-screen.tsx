"use client";

import { useMemo, useState } from "react";
import { Bookmark, MoreVertical, Trash2, Pencil, Plus } from "lucide-react";
import { OverlayHeader, WorkCover } from "@/components/shared";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Category } from "@/lib/types";

/* ============================================================
   CategoriesScreen — manage categories + cover previews
   ============================================================ */

export function CategoriesScreen() {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const categories = useApp((s) => s.categories);
  const workCategories = useApp((s) => s.workCategories);
  const createCategory = useApp((s) => s.createCategory);
  const renameCategory = useApp((s) => s.renameCategory);
  const deleteCategory = useApp((s) => s.deleteCategory);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<Category | null>(null);
  const [renameName, setRenameName] = useState("");

  const visibleWorks = useMemo(() => works.filter((w) => !w.inVault), [works]);

  const rows = useMemo(
    () =>
      categories.map((c) => {
        const members = visibleWorks.filter((w) => (workCategories[w.id] ?? []).includes(c.id));
        return { ...c, count: members.length, thumbs: members.slice(0, 3) };
      }),
    [categories, visibleWorks, workCategories]
  );

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    createCategory(name);
    toast({ title: t("lib.newCategory"), description: name });
    setNewName("");
    setNewOpen(false);
  };

  const submitRename = () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) return;
    renameCategory(renameTarget.id, name);
    toast({ title: t("lib.rename"), description: name });
    setRenameTarget(null);
  };

  const submitDelete = (c: Category) => {
    if (!window.confirm(t("lib.deleteCategoryConfirm"))) return;
    deleteCategory(c.id);
    toast({ title: t("common.delete"), description: c.name });
  };

  return (
    <div className="flex min-h-full flex-col px-5 pb-8">
      <OverlayHeader title={t("more.categories")} />

      {/* category rows */}
      <div className="mt-2 space-y-2.5">
        {rows.map((c) => (
          <article key={c.id} className="rounded-3xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-soft text-primary">
                <Bookmark className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-extrabold">{c.name}</p>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {c.count} {t("common.works")}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("common.more")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem
                    onClick={() => {
                      setRenameTarget(c);
                      setRenameName(c.name);
                    }}
                    className="gap-2 rounded-xl text-[13px] font-semibold"
                  >
                    <Pencil className="h-4 w-4 text-primary" />
                    {t("lib.rename")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => submitDelete(c)}
                    className="gap-2 rounded-xl text-[13px] font-semibold text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("common.delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* cover previews */}
            <div className="mt-3 flex gap-1.5">
              {c.thumbs.length === 0
                ? (
                  <div className="flex h-14 w-11 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Bookmark className="h-4 w-4" />
                  </div>
                )
                : c.thumbs.map((w) => (
                    <WorkCover
                      key={w.id}
                      src={w.cover}
                      color={w.coverColor}
                      title={w.title}
                      className="h-14 w-11 rounded-lg"
                      sizes="44px"
                    />
                  ))}
            </div>
          </article>
        ))}
      </div>

      {/* new category */}
      <button
        onClick={() => setNewOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-coral-gradient py-3 text-[14px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)] transition-transform active:scale-[0.98]"
      >
        <Plus className="h-4.5 w-4.5" />
        {t("lib.newCategory")}
      </button>

      {/* create dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-[340px] rounded-3xl border-border bg-card p-5" style={{ maxWidth: 340 }}>
          <DialogHeader>
            <DialogTitle className="text-[17px] font-extrabold">{t("lib.newCategory")}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("lib.categoryName")}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
          />
          <DialogFooter className="gap-2">
            <Button variant="secondary" className="flex-1 rounded-full font-bold" onClick={() => setNewOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1 rounded-full bg-coral-gradient font-bold text-white hover:opacity-90"
              onClick={submitNew}
            >
              {t("lib.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* rename dialog */}
      <Dialog open={renameTarget !== null} onOpenChange={(v) => !v && setRenameTarget(null)}>
        <DialogContent className="max-w-[340px] rounded-3xl border-border bg-card p-5" style={{ maxWidth: 340 }}>
          <DialogHeader>
            <DialogTitle className="text-[17px] font-extrabold">{t("lib.rename")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder={t("lib.categoryName")}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
          />
          <DialogFooter className="gap-2">
            <Button variant="secondary" className="flex-1 rounded-full font-bold" onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1 rounded-full bg-coral-gradient font-bold text-white hover:opacity-90"
              onClick={submitRename}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
