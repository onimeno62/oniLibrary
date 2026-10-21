"use client";

import { FileText, BookOpen, FileArchive, Image, FolderOpen, FileWarning } from "lucide-react";
import { OverlayHeader } from "@/components/shared";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";

/* ============================================================
   FormatsScreen — per-format support status in this build.
   Audit D5: this list MUST mirror the importer's real behavior
   (src/lib/importer.ts). CBR/RAR is genuinely supported via WASM
   unrar (unrar.ts) — the old "Planned" badge was wrong. Rows carry
   optional notes for honest caveats, and genuinely unsupported
   formats are listed as such instead of being omitted.
   ============================================================ */

type BadgeKind = "full" | "demo" | "no";

const ROWS: {
  key: TranslationKey;
  Icon: typeof FileText;
  badge: BadgeKind;
  note?: TranslationKey;
}[] = [
  { key: "fmt.PDF", Icon: FileText, badge: "full" },
  { key: "fmt.EPUB", Icon: BookOpen, badge: "full" },
  { key: "fmt.CBZ", Icon: FileArchive, badge: "full" },
  { key: "fmt.CBR", Icon: FileArchive, badge: "full", note: "fmt.cbrNote" },
  { key: "fmt.images", Icon: Image, badge: "full" },
  { key: "fmt.folder", Icon: FolderOpen, badge: "full" },
  { key: "fmt.unsupported7z", Icon: FileWarning, badge: "no", note: "fmt.unsupportedNote" },
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
        {ROWS.map(({ key, Icon, badge, note }) => (
          <article
            key={key}
            className="rounded-3xl border border-border bg-card p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-primary">
                <Icon className="h-5.5 w-5.5" />
              </span>
              <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold">{t(key)}</p>
              <StatusBadge
                kind={badge}
                label={badge === "full" ? t("fmt.full") : badge === "demo" ? t("fmt.demo") : t("fmt.unsupported")}
              />
            </div>
            {note && <p className="mt-2 ps-1 text-[12px] font-semibold leading-snug text-muted-foreground">{t(note)}</p>}
          </article>
        ))}
      </div>
    </div>
  );
}
