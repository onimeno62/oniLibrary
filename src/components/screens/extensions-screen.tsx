"use client";

import { useMemo, useState } from "react";
import {
  GitBranch,
  ShieldCheck,
  Users,
  AlertTriangle,
  BadgeCheck,
  ShieldQuestion,
  MoreVertical,
  Trash2,
  Puzzle,
} from "lucide-react";
import { OverlayHeader, EmptyState, SourceIcon, Chip } from "@/components/shared";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Extension } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

/* ============================================================
   ExtensionsScreen — installed / available / updatable
   ============================================================ */

type ExtTab = Extension["status"];

const TABS: [ExtTab, TranslationKey][] = [
  ["INSTALLED", "ext.installed"],
  ["AVAILABLE", "ext.available"],
  ["UPDATE", "ext.updatable"],
];

const ICON_BG = ["#f8694c", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#14b8a6"];

function extBg(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return ICON_BG[Math.abs(h) % ICON_BG.length];
}

function TrustBadge({ trust }: { trust: Extension["trust"] }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        trust === "OFFICIAL" && "bg-emerald-100 text-emerald-700",
        trust === "COMMUNITY" && "bg-amber-100 text-amber-700",
        trust === "UNKNOWN" && "bg-red-100 text-red-700"
      )}
    >
      {trust === "OFFICIAL" && <ShieldCheck className="h-3 w-3" />}
      {trust === "COMMUNITY" && <Users className="h-3 w-3" />}
      {trust === "UNKNOWN" && <AlertTriangle className="h-3 w-3" />}
      {trust === "OFFICIAL" ? t("ext.official") : trust === "COMMUNITY" ? t("ext.community") : t("ext.unknownRepo")}
    </span>
  );
}

function CompatBadge({ compat }: { compat: Extension["compatibility"] }) {
  const { t } = useT();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        compat === "VERIFIED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      )}
    >
      {compat === "VERIFIED" ? <BadgeCheck className="h-3 w-3" /> : <ShieldQuestion className="h-3 w-3" />}
      {compat === "VERIFIED" ? t("ext.verified") : t("ext.unverified")}
    </span>
  );
}

function ExtensionCard({
  ext,
  onInstallClick,
}: {
  ext: Extension;
  onInstallClick: (e: Extension) => void;
}) {
  const { t } = useT();
  const sources = useApp((s) => s.sources);
  const setExtensionStatus = useApp((s) => s.setExtensionStatus);

  const provided = useMemo(
    () => sources.filter((s) => ext.provides.includes(s.id)),
    [sources, ext.provides]
  );

  const disabledInstalled = ext.status === "INSTALLED" && !ext.enabled;

  return (
    <article
      className={cn(
        "rounded-3xl border border-border bg-card p-4 transition-opacity",
        disabledInstalled && "opacity-60"
      )}
    >
      {/* head */}
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[18px] font-black text-white"
          style={{ backgroundColor: extBg(ext.name) }}
          aria-hidden
        >
          {ext.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[15px] font-extrabold">{ext.name}</p>
            <span className="shrink-0 text-[11px] font-bold text-muted-foreground">
              {t("ext.version", { v: ext.version })}
            </span>
          </div>
          {/* repo row */}
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="shrink-0">{t("ext.origin")}:</span>
            <span className="truncate">{ext.repo}</span>
          </p>
        </div>
        {ext.status === "INSTALLED" && (
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
                  setExtensionStatus(ext.id, "AVAILABLE", false);
                  toast({ title: t("ext.uninstall"), description: ext.name });
                }}
                className="gap-2 rounded-xl text-[13px] font-semibold text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                {t("ext.uninstall")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* badges */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <TrustBadge trust={ext.trust} />
        <CompatBadge compat={ext.compatibility} />
      </div>

      {/* languages */}
      <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        <span className="me-0.5">{t("ext.lang")}:</span>
        {ext.languages.map((l) => (
          <span key={l} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">
            {l}
          </span>
        ))}
      </p>

      {/* provided sources */}
      {provided.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {provided.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <SourceIcon bg={s.iconBg} text={s.iconText} img={s.iconImg} size={22} className="rounded-lg" />
              <span className="text-[11px] font-bold text-secondary-foreground">{s.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* disabled note */}
      {disabledInstalled && (
        <p className="mt-2.5 rounded-xl bg-secondary/60 px-3 py-2 text-[11px] font-bold text-secondary-foreground">
          {t("common.disabled")}
        </p>
      )}

      {/* actions */}
      <div className="mt-3 flex items-center justify-between gap-3">
        {ext.status === "INSTALLED" ? (
          <>
            <span className="text-[12px] font-bold text-secondary-foreground">
              {ext.enabled ? t("common.enabled") : t("common.disabled")}
            </span>
            <Switch
              checked={ext.enabled}
              onCheckedChange={(v) => setExtensionStatus(ext.id, "INSTALLED", v)}
              className="data-[state=checked]:bg-primary"
              aria-label={ext.name}
            />
          </>
        ) : ext.status === "UPDATE" ? (
          <>
            <span className="text-[11px] font-bold text-muted-foreground">
              {t("ext.version", { v: ext.version })}
            </span>
            <button
              onClick={() => {
                setExtensionStatus(ext.id, "INSTALLED", true);
                toast({ title: t("common.done"), description: `${ext.name} ${t("ext.version", { v: ext.version })}` });
              }}
              className="rounded-full bg-coral-gradient px-5 py-2 text-[13px] font-extrabold text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)] transition-transform active:scale-95"
            >
              {t("ext.update")}
            </button>
          </>
        ) : (
          <>
            <span className="text-[11px] font-bold text-muted-foreground">
              {t("ext.version", { v: ext.version })}
            </span>
            <button
              onClick={() => onInstallClick(ext)}
              className="rounded-full border border-border bg-background px-5 py-2 text-[13px] font-extrabold text-foreground transition-colors hover:bg-secondary"
            >
              {t("ext.install")}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function RiskDialog({
  ext,
  onClose,
}: {
  ext: Extension | null;
  onClose: () => void;
}) {
  const { t } = useT();
  const setExtensionStatus = useApp((s) => s.setExtensionStatus);
  const [accepted, setAccepted] = useState(false);

  const close = () => {
    setAccepted(false);
    onClose();
  };

  return (
    <Dialog open={ext !== null} onOpenChange={(v) => !v && close()}>
      <DialogContent className="max-w-[360px] rounded-3xl border-border bg-card p-5" style={{ maxWidth: 360 }}>
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold">{t("ext.riskTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("ext.riskBody")}</p>
        {ext && (
          <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2.5">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-secondary-foreground">
              {ext.name} · {ext.repo}
            </span>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-border px-3 py-2.5">
          <Checkbox
            checked={accepted}
            onCheckedChange={(v) => setAccepted(v === true)}
            className="data-[state=checked]:border-primary data-[state=checked]:bg-primary"
          />
          <span className="text-[12px] font-bold text-foreground">{t("ext.trustWarningAccepted")}</span>
        </label>
        <DialogFooter className="gap-2">
          <Button variant="secondary" className="flex-1 rounded-full font-bold" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1 rounded-full bg-coral-gradient font-bold text-white hover:opacity-90"
            disabled={!accepted}
            onClick={() => {
              if (!ext) return;
              setExtensionStatus(ext.id, "INSTALLED", true);
              toast({ title: t("ext.installed"), description: ext.name });
              close();
            }}
          >
            {t("ext.install")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExtensionsScreen() {
  const { t } = useT();
  const extensions = useApp((s) => s.extensions);
  const [tab, setTab] = useState<ExtTab>("INSTALLED");
  const [riskExt, setRiskExt] = useState<Extension | null>(null);

  const list = useMemo(() => extensions.filter((e) => e.status === tab), [extensions, tab]);

  return (
    <div className="min-h-full px-5 pb-8">
      <OverlayHeader title={t("ext.title")} />

      {/* tabs */}
      <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 no-scrollbar">
        {TABS.map(([id, label]) => (
          <Chip key={id} active={tab === id} onClick={() => setTab(id)}>
            {t(label)}
          </Chip>
        ))}
      </div>

      {/* list */}
      <section className="mt-5 space-y-3">
        {list.length === 0 ? (
          <EmptyState icon={<Puzzle className="h-6 w-6" />} title={t("ext.empty")} />
        ) : (
          list.map((e) => <ExtensionCard key={e.id} ext={e} onInstallClick={setRiskExt} />)
        )}
      </section>

      <RiskDialog ext={riskExt} onClose={() => setRiskExt(null)} />
    </div>
  );
}
