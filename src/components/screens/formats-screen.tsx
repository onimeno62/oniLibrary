"use client";

import { FileText, BookOpen, FileArchive, Image, FolderOpen } from "lucide-react";
import { OverlayHeader } from "@/components/shared";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

/* ============================================================
   FormatsScreen — per-format support status in this build
   ============================================================ */

type BadgeKind = "full" | "demo" | "no";

const ROWS: { key: TranslationKey; Icon: typeof FileText; badge: BadgeKind }[] = [
  { key: "fmt.PDF", Icon: FileText, badge: "full" },
  { key: "fmt.EPUB", Icon: BookOpen, badge: "full" },
  { key: "fmt.CBZ", Icon: FileArchive, badge: "full" },
  { key: "fmt.CBR", Icon: FileArchive, badge: "no" },
  { key: "fmt.images", Icon: Image, badge: "full" },
  { key: "fmt.folder", Icon: FolderOpen, badge: "demo" },
];

function StatusBadge({ kind, label }: { kind: BadgeKind; label: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
        kind === "full" && "bg-emerald-100 text-emerald-700",
        kind === "demo" && "bg-amber-100 text-amber-700",
        kind === "no" && "bg-secondary text-secondary-foreground"
      )}
    >
      {label}
    </span>
  );
}

export function FormatsScreen() {
  const { t } = useT();

  return (
    <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
      <OverlayHeader title={t("fmt.title")} subtitle={t("more.formatsHint")} />

      <div className="mt-2 space-y-2.5">
        {ROWS.map(({ key, Icon, badge }) => (
          <article
            key={key}
            className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-primary">
              <Icon className="h-5.5 w-5.5" />
            </span>
            <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold">{t(key)}</p>
            <StatusBadge
              kind={badge}
              label={badge === "full" ? t("fmt.full") : badge === "demo" ? t("fmt.demo") : t("fmt.no")}
            />
          </article>
        ))}
      </div>
    </div>
  );
}
