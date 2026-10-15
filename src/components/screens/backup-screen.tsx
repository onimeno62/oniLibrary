"use client";

import { useRef, useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Info,
  Database,
  Download,
  FileSpreadsheet,
  History,
  Upload,
} from "lucide-react";
import { OverlayHeader } from "@/components/shared";
import { useApp } from "@/lib/store";
import { timeAgo } from "@/lib/store";
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
import type { TranslationKey } from "@/lib/i18n";

/* ============================================================
   BackupScreen — export / restore library as .onibackup
   ============================================================ */

const INCLUDED: TranslationKey[] = [
  "bkp.inc.library",
  "bkp.inc.progress",
  "bkp.inc.categories",
  "bkp.inc.settings",
  "bkp.inc.bookmarks",
  "bkp.inc.stats",
];

const EXCLUDED: TranslationKey[] = ["bkp.exc.files", "bkp.exc.vaultFiles", "bkp.exc.extensions"];

type Preview = {
  data: Record<string, unknown>;
  works: number;
  categories: number;
  settingsKeys: number;
};

export function BackupScreen() {
  const { t, lang } = useT();
  const works = useApp((s) => s.works);
  const categories = useApp((s) => s.categories);
  const workCategories = useApp((s) => s.workCategories);
  const settings = useApp((s) => s.settings);
  const sessions = useApp((s) => s.sessions);
  const bookmarks = useApp((s) => s.bookmarks);
  const lastBackup = useApp((s) => s.lastBackup);
  const setLastBackup = useApp((s) => s.setLastBackup);
  const importBackup = useApp((s) => s.importBackup);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const fa = lang === "fa";
  const num = (n: number | string) =>
    fa ? String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : String(n);

  const ymd = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  };

  /* UTF-8 → base64 (chunked to avoid stack overflow on big backups) */
  const toBase64 = (bytes: Uint8Array) => {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  };

  /* round 9: inside the APK the WebView can't download anchors — hand the
     payload to the native bridge (MediaStore Downloads / share sheet) */
  const nativeExport = (name: string, mime: string, bytes: Uint8Array): boolean => {
    const bridge = (window as { OniAndroid?: { exportFile?: (b64: string, n: string, m: string) => string } })
      .OniAndroid;
    if (!bridge?.exportFile) return false;
    try {
      return bridge.exportFile(toBase64(bytes), name, mime.split(";")[0]) !== "error";
    } catch {
      return false;
    }
  };

  const downloadFile = (name: string, mime: string, content: string) => {
    const bytes = new TextEncoder().encode(content);
    if (nativeExport(name, mime, bytes)) return;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /* CSV quoting: wrap when the value contains comma, quote or newline */
  const csvEscape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const toCsv = (rows: (string | number)[][]) =>
    "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\n");

  const exportLibraryCsv = () => {
    const rows: (string | number)[][] = [
      [
        "Title",
        "AltTitle",
        "Author",
        "Type",
        "WorkStatus",
        "ReadingStatus",
        "YourRating",
        "CommunityRating",
        "ChaptersRead",
        "ChaptersTotal",
        "ProgressPct",
        "Favorite",
        "InVault",
        "Tags",
        "Categories",
        "AddedAt",
        "LastReadAt",
      ],
      ...works.map((w) => {
        const read = w.chapters.filter((c) => c.isRead).length;
        const ratio =
          w.chapters.length > 0
            ? w.chapters.reduce((a, c) => a + (typeof c.lastPage === "number" ? c.lastPage : 0), 0) /
              w.chapters.length
            : 0;
        const cats = (workCategories[w.id] ?? [])
          .map((cid) => categories.find((c) => c.id === cid)?.name ?? "")
          .filter(Boolean);
        return [
          w.title,
          w.altTitle ?? "",
          w.author,
          w.type,
          w.workStatus,
          w.readingStatus,
          w.userRating ?? 0,
          w.rating,
          read,
          w.chapters.length,
          Math.round(ratio * 100),
          w.isFavorite ? "yes" : "no",
          w.inVault ? "yes" : "no",
          w.tags.join("; "),
          cats.join("; "),
          w.addedAt,
          w.lastReadAt ?? "",
        ];
      }),
    ];
    downloadFile(`onilibrary-library-${ymd()}.csv`, "text/csv;charset=utf-8", toCsv(rows));
    toast({ title: t("bkp.csvDone"), description: `onilibrary-library-${ymd()}.csv` });
  };

  const exportHistoryCsv = () => {
    const rows: (string | number)[][] = [
      ["Date", "Minutes", "Chapters"],
      ...[...sessions]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => [s.date, s.minutes, s.chapters]),
    ];
    downloadFile(`onilibrary-history-${ymd()}.csv`, "text/csv;charset=utf-8", toCsv(rows));
    toast({ title: t("bkp.csvDone"), description: `onilibrary-history-${ymd()}.csv` });
  };

  const createBackup = () => {
    const payload = {
      app: "oniLibrary",
      version: 1,
      exportedAt: new Date().toISOString(),
      works,
      categories,
      workCategories,
      settings,
      sessions,
      bookmarks,
    };
    const name = `onilibrary-backup-${ymd()}.onibackup`;
    const content = JSON.stringify(payload, null, 2);
    if (nativeExport(name, "application/json", new TextEncoder().encode(content))) {
      setLastBackup(new Date().toISOString());
      toast({ title: t("bkp.success"), description: name });
      return;
    }
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setLastBackup(new Date().toISOString());
    toast({ title: t("bkp.success"), description: name });
  };

  const onFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as Record<string, unknown>;
      if (!data || data.app !== "oniLibrary") {
        toast({ title: t("bkp.invalidFile"), variant: "destructive" });
        return;
      }
      const works = Array.isArray(data.works) ? (data.works as unknown[]).length : 0;
      const categories = Array.isArray(data.categories) ? (data.categories as unknown[]).length : 0;
      const settingsKeys =
        data.settings && typeof data.settings === "object" ? Object.keys(data.settings).length : 0;
      setPreview({ data, works, categories, settingsKeys });
    } catch {
      toast({ title: t("bkp.invalidFile"), variant: "destructive" });
    }
  };

  const confirmRestore = () => {
    if (!preview) return;
    const ok = importBackup(preview.data);
    if (ok) {
      toast({ title: t("bkp.restoreSuccess") });
    } else {
      toast({ title: t("bkp.invalidFile"), variant: "destructive" });
    }
    setPreview(null);
  };

  return (
    <div className="min-h-full px-5 pb-8">
      <OverlayHeader title={t("bkp.title")} />

      {/* create card */}
      <section className="mt-2 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-coral-soft text-primary">
            <Download className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold">{t("bkp.create")}</p>
            <p className="text-[11px] font-semibold leading-snug text-muted-foreground">
              {t("bkp.createHint")}
            </p>
          </div>
        </div>

        {/* included */}
        <p className="mt-3 text-[12px] font-bold text-muted-foreground">{t("bkp.includes")}</p>
        <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
          {INCLUDED.map((key) => (
            <li key={key} className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              {t(key)}
            </li>
          ))}
        </ul>

        {/* excluded */}
        <p className="mt-3 text-[12px] font-bold text-muted-foreground">{t("bkp.excluded")}</p>
        <ul className="mt-1.5 space-y-1.5">
          {EXCLUDED.map((key) => (
            <li key={key} className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {t(key)}
            </li>
          ))}
        </ul>

        <button
          onClick={createBackup}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-coral-gradient py-3 text-[14px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)] transition-transform active:scale-[0.98]"
        >
          <Database className="h-4.5 w-4.5" />
          {t("bkp.create")}
        </button>

        {/* last backup */}
        <div className="mt-3 flex items-center justify-between rounded-2xl bg-secondary/50 px-3.5 py-2.5">
          <span className="text-[12px] font-bold text-secondary-foreground">{t("bkp.lastBackup")}</span>
          <span className="text-[12px] font-extrabold text-foreground">
            {lastBackup ? timeAgo(lastBackup, lang) : t("bkp.never")}
          </span>
        </div>
      </section>

      {/* restore card */}
      <section className="mt-3 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Upload className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold">{t("bkp.restore")}</p>
            <p className="text-[11px] font-semibold leading-snug text-muted-foreground">
              {t("bkp.restoreHint")}
            </p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".onibackup,.json"
          className="hidden"
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background py-3 text-[14px] font-extrabold text-foreground transition-colors hover:bg-secondary"
        >
          <Upload className="h-4.5 w-4.5 text-primary" />
          {t("bkp.restore")}
        </button>
      </section>

      {/* spreadsheet export card (TRK-006) */}
      <section className="mt-3 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <FileSpreadsheet className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold">{t("bkp.csvTitle")}</p>
            <p className="text-[11px] font-semibold leading-snug text-muted-foreground">{t("bkp.csvHint")}</p>
          </div>
        </div>
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <button
            onClick={exportLibraryCsv}
            className="flex items-center justify-center gap-2 rounded-full bg-coral-gradient py-3 text-[13px] font-extrabold text-white shadow-[0_10px_24px_-12px_rgba(248,105,76,0.65)] transition-transform active:scale-[0.98]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {t("bkp.csvLibrary")}
          </button>
          <button
            onClick={exportHistoryCsv}
            className="flex items-center justify-center gap-2 rounded-full border border-border bg-background py-3 text-[13px] font-extrabold text-foreground transition-colors hover:bg-secondary"
          >
            <History className="h-4 w-4 text-primary" />
            {t("bkp.csvHistory")}
          </button>
        </div>
      </section>

      {/* encrypted note */}
      <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-secondary/50 p-4 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-[12px] font-semibold leading-relaxed">{t("bkp.encryptedNote")}</p>
      </div>

      {/* restore preview dialog */}
      <Dialog open={preview !== null} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-[360px] rounded-3xl border-border bg-card p-5" style={{ maxWidth: 360 }}>
          <DialogHeader>
            <DialogTitle className="text-[17px] font-extrabold">{t("bkp.preview")}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-1.5 rounded-2xl bg-secondary/50 p-3.5">
              <p className="flex items-center justify-between text-[13px] font-bold">
                <span className="text-secondary-foreground">{t("bkp.inc.library")}</span>
                <span>{num(preview.works)}</span>
              </p>
              <p className="flex items-center justify-between text-[13px] font-bold">
                <span className="text-secondary-foreground">{t("bkp.inc.categories")}</span>
                <span>{num(preview.categories)}</span>
              </p>
              <p className="flex items-center justify-between text-[13px] font-bold">
                <span className="text-secondary-foreground">{t("bkp.inc.settings")}</span>
                <span>{num(preview.settingsKeys)}</span>
              </p>
            </div>
          )}
          <p className="text-[13px] font-semibold leading-relaxed text-muted-foreground">
            {t("bkp.restoreConfirm")}
          </p>
          <DialogFooter className="gap-2">
            <Button variant="secondary" className="flex-1 rounded-full font-bold" onClick={() => setPreview(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1 rounded-full bg-coral-gradient font-bold text-white hover:opacity-90"
              onClick={confirmRestore}
            >
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
