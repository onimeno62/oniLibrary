"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  EyeOff,
  Lock,
  Info,
  Check,
  X,
  ShieldAlert,
  MoreVertical,
  Trash2,
  Fingerprint,
  Delete,
  KeyRound,
} from "lucide-react";
import { WorkCover, ProgressBar, EmptyState } from "@/components/shared";
import { OniLogo } from "@/components/oni-logo";
import { useApp, useNav, hashPin, workProgress } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
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
import type { Work } from "@/lib/types";

/* ============================================================
   VaultScreen — private & protected space (light theme)
   ============================================================ */

function ProtectionRow({
  Icon,
  label,
  state,
}: {
  Icon: typeof Lock;
  label: string;
  state: "ok" | "off" | "info";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <p className="flex-1 text-[13px] font-semibold leading-snug text-foreground">{label}</p>
      {state === "ok" && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
      {state === "off" && <X className="h-4 w-4 shrink-0 text-muted-foreground" />}
      {state === "info" && <Info className="h-4 w-4 shrink-0 text-muted-foreground" />}
    </div>
  );
}

function VaultWorkCell({ work }: { work: Work }) {
  const { t } = useT();
  const openWork = useNav((s) => s.openWork);
  const setVaultFlag = useApp((s) => s.setVaultFlag);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => openWork(work.id)}
        className="block w-full text-start"
        aria-label={work.title}
      >
        <WorkCover
          src={work.cover}
          color={work.coverColor}
          title={work.title}
          className="aspect-[2/3] w-full rounded-2xl shadow-[0_10px_22px_-12px_rgba(43,36,29,0.45)]"
          sizes="120px"
        />
        <ProgressBar value={workProgress(work)} className="mt-1.5" />
        <p className="mt-1 truncate text-[12px] font-bold text-foreground">{work.title}</p>
      </button>
      <WorkOverflowMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onRemove={() => {
          setVaultFlag(work.id, false);
          toast({ title: t("vlt.removeFromVault"), description: work.title });
        }}
        className="absolute end-1 top-1 z-10"
      />
    </div>
  );
}

function WorkOverflowMenu({
  onRemove,
  className,
  open,
  onOpenChange,
}: {
  onRemove: () => void;
  className?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const { t } = useT();
  return (
    <DropdownMenuSimple
      open={open}
      onOpenChange={onOpenChange}
      className={className}
      renderItem={(props) => (
        <button
          {...props}
          aria-label={t("common.more")}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-transform hover:scale-105"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}
      items={[
        {
          icon: <Trash2 className="h-4 w-4 text-destructive" />,
          label: t("vlt.removeFromVault"),
          destructive: true,
          onSelect: onRemove,
        },
      ]}
    />
  );
}

/* small wrapper around DropdownMenu to share the pattern */
function DropdownMenuSimple({
  renderItem,
  items,
  className,
  open,
  onOpenChange,
}: {
  renderItem: (props: Record<string, unknown>) => React.ReactNode;
  items: { icon: React.ReactNode; label: string; destructive?: boolean; onSelect: () => void }[];
  className?: string;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        {renderItem({ className, "aria-haspopup": "menu" }) as React.ReactElement}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-2xl">
        {items.map((it) => (
          <DropdownMenuItem
            key={it.label}
            onClick={it.onSelect}
            className={cn(
              "gap-2 rounded-xl text-[13px] font-semibold",
              it.destructive && "text-destructive"
            )}
          >
            {it.icon}
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ---------- shared keypad ---------- */

function Keypad({
  onDigit,
  onDelete,
  disabled,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="grid w-[248px] grid-cols-3 gap-2.5">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => onDigit(k)}
          className="flex h-14 items-center justify-center rounded-2xl bg-secondary text-xl font-bold text-foreground transition-transform active:scale-90 disabled:opacity-40"
        >
          {k}
        </button>
      ))}
      <span aria-hidden />
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDigit("0")}
        className="flex h-14 items-center justify-center rounded-2xl bg-secondary text-xl font-bold text-foreground transition-transform active:scale-90 disabled:opacity-40"
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        aria-label="Delete"
        className="flex h-14 items-center justify-center rounded-2xl text-muted-foreground transition-transform active:scale-90 disabled:opacity-40"
      >
        <Delete className="h-5 w-5" />
      </button>
    </div>
  );
}

function PinDots({ filled }: { filled: number }) {
  return (
    <div className="flex items-center justify-center gap-3.5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "h-3 w-3 rounded-full transition-colors",
            i < filled ? "bg-primary" : "bg-secondary"
          )}
        />
      ))}
    </div>
  );
}

/* PIN setup dialog (enter → confirm), used by "Change PIN" */
function PinSetupDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const setVaultPin = useApp((s) => s.setVaultPin);
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [first, setFirst] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const reset = () => {
    setStage("enter");
    setFirst("");
    setPin("");
    setError(false);
  };

  const handleDigit = (d: string) => {
    if (error) return;
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length < 4) return;
    if (stage === "enter") {
      setTimeout(() => {
        setFirst(next);
        setPin("");
        setStage("confirm");
      }, 140);
    } else if (next === first) {
      setTimeout(() => {
        setVaultPin(hashPin(next));
        toast({ title: t("vlt.pinChanged") });
        onOpenChange(false);
        reset();
        onDone();
      }, 140);
    } else {
      setError(true);
      setTimeout(() => {
        setPin("");
        setStage("enter");
        setFirst("");
        setError(false);
      }, 700);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-[340px] rounded-3xl border-border bg-card p-5" style={{ maxWidth: 340 }}>
        <DialogHeader>
          <DialogTitle className="text-center text-[17px] font-extrabold">
            {error
              ? t("vlt.pinsDontMatch")
              : stage === "enter"
                ? t("vlt.setupPin")
                : t("vlt.confirmPin")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-5 py-2">
          <PinDots filled={error ? 4 : pin.length} />
          <Keypad onDigit={handleDigit} onDelete={() => setPin((p) => p.slice(0, -1))} disabled={error} />
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            className="w-full rounded-full font-bold"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
   VaultScreen
   ============================================================ */

export function VaultScreen() {
  const { t } = useT();
  const works = useApp((s) => s.works);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const setVaultUnlocked = useApp((s) => s.setVaultUnlocked);
  const pop = useNav((s) => s.pop);
  const [pinOpen, setPinOpen] = useState(false);

  const vaultWorks = works.filter((w) => w.inVault);
  const hasPin = Boolean(settings.vaultPinHash);

  return (
    <div className="min-h-full px-5 pb-8">
      {/* header */}
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-soft text-primary">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[24px] font-black leading-tight tracking-tight">{t("vlt.title")}</h1>
            <p className="text-[12px] font-semibold text-muted-foreground">{t("vlt.subtitle")}</p>
          </div>
        </div>
      </header>

      {/* lock now / change pin */}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button
          onClick={() => {
            setVaultUnlocked(false);
            pop();
          }}
          className="flex items-center justify-center gap-2 rounded-full bg-secondary py-2.5 text-[13px] font-extrabold text-secondary-foreground transition-colors hover:bg-accent"
        >
          <Lock className="h-4 w-4" />
          {t("vlt.lockNow")}
        </button>
        <button
          onClick={() => setPinOpen(true)}
          className="flex items-center justify-center gap-2 rounded-full bg-coral-soft py-2.5 text-[13px] font-extrabold text-primary transition-opacity hover:opacity-85"
        >
          <KeyRound className="h-4 w-4" />
          {t("vlt.setupPin")}
        </button>
      </div>

      {/* protection level */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-4">
        <p className="text-[15px] font-extrabold tracking-tight">{t("vlt.protectionLevel")}</p>
        <div className="mt-3 space-y-3">
          <ProtectionRow Icon={EyeOff} label={t("vlt.level.hidden")} state="ok" />
          <ProtectionRow Icon={Lock} label={t("vlt.level.locked")} state={hasPin ? "ok" : "off"} />
          <ProtectionRow Icon={Info} label={t("vlt.level.enc")} state="info" />
        </div>
      </section>

      {/* privacy note */}
      <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-coral-soft p-4 text-primary">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-[12px] font-semibold leading-relaxed">{t("vlt.privacyNote")}</p>
      </div>

      {/* vault works */}
      <section className="mt-6">
        {vaultWorks.length === 0 ? (
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title={t("vlt.empty")}
            hint={t("vlt.emptyHint")}
          />
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {vaultWorks.map((w) => (
              <VaultWorkCell key={w.id} work={w} />
            ))}
          </div>
        )}
      </section>

      {/* toggles */}
      <section className="mt-6 rounded-3xl border border-border bg-card p-4">
        <div className="flex items-center gap-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">{t("vlt.biometric")}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {t("vlt.biometricHint")}
            </p>
          </div>
          <Switch
            checked={settings.vaultBiometric}
            onCheckedChange={(v) => setSettings({ vaultBiometric: v })}
            className="data-[state=checked]:bg-primary"
            aria-label={t("vlt.biometric")}
          />
        </div>
        <div className="my-1 h-px bg-border" />
        <div className="flex items-center gap-3 py-1.5">
          <p className="min-w-0 flex-1 text-[14px] font-bold">{t("vlt.autoLock")}</p>
          <Switch
            checked={settings.vaultAutoLock}
            onCheckedChange={(v) => setSettings({ vaultAutoLock: v })}
            className="data-[state=checked]:bg-primary"
            aria-label={t("vlt.autoLock")}
          />
        </div>
      </section>

      <PinSetupDialog open={pinOpen} onOpenChange={setPinOpen} onDone={() => undefined} />
    </div>
  );
}

/* ============================================================
   VaultLockScreen — dark full-screen PIN / biometric gate
   ============================================================ */

const MAX_ATTEMPTS = 5;

export function VaultLockScreen({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const vaultPinHash = useApp((s) => s.settings.vaultPinHash);
  const biometric = useApp((s) => s.settings.vaultBiometric);
  const setVaultUnlocked = useApp((s) => s.setVaultUnlocked);

  const [pin, setPin] = useState("");
  const [wrong, setWrong] = useState(0);
  const [shake, setShake] = useState(false);
  const [scanning, setScanning] = useState(false);

  const unlock = () => {
    setVaultUnlocked(true);
    onSuccess();
  };

  const handleDigit = (d: string) => {
    if (shake || scanning) return;
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    if (next.length < 4) return;
    if (hashPin(next) === vaultPinHash) {
      setTimeout(unlock, 160);
    } else {
      const used = wrong + 1;
      setWrong(used);
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setPin("");
        if (used >= MAX_ATTEMPTS) setWrong(0);
      }, 500);
    }
  };

  const handleBiometric = () => {
    if (scanning) return;
    const b = window as unknown as {
      OniAndroid?: { vaultBiometric?: () => number };
      OniNativeVaultAuth?: { done: (ok: boolean) => void };
    };
    if (b.OniAndroid?.vaultBiometric) {
      // VLT-002: real platform BiometricPrompt — result arrives on
      // window.OniNativeVaultAuth.done(ok) from the native shell
      let started = 0;
      try {
        started = b.OniAndroid.vaultBiometric();
      } catch {
        started = 0; // bridge quirk — fall through to PIN entry
      }
      if (!started) return; // prompt unavailable — stay on PIN entry
      setScanning(true);
      b.OniNativeVaultAuth = {
        done: (ok: boolean) => {
          setScanning(false);
          if (ok) {
            unlock();
          } else {
            setShake(true);
            setTimeout(() => setShake(false), 500);
          }
        },
      };
      return;
    }
    // web fallback: simulated scan
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      unlock();
    }, 800);
  };

  const left = Math.max(0, MAX_ATTEMPTS - wrong);

  return (
    <div className="dark flex h-full flex-col items-center justify-center bg-background text-foreground">
      <motion.div
        animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : { x: 0 }}
        transition={{ duration: 0.45 }}
        className="flex flex-col items-center"
      >
        <OniLogo size={56} className="drop-shadow-[0_14px_30px_rgba(248,105,76,0.35)]" />
        <h1 className="mt-4 text-[20px] font-black tracking-tight">{t("vlt.locked")}</h1>
        <p className="mt-1 text-[13px] font-semibold text-muted-foreground">{t("vlt.enterPin")}</p>

        <div className="mt-6">
          <PinDots filled={shake ? 4 : pin.length} />
        </div>

        {wrong > 0 && (
          <p className="mt-3 text-[12px] font-bold text-destructive">
            {t("vlt.wrongPin", { n: left })}
          </p>
        )}

        <div className="mt-7">
          <Keypad onDigit={handleDigit} onDelete={() => setPin((p) => p.slice(0, -1))} disabled={shake} />
        </div>

        {biometric && (
          <button
            onClick={handleBiometric}
            aria-label={t("vlt.biometric")}
            className={cn(
              "mt-7 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-white/5 text-foreground transition-all active:scale-90",
              scanning && "animate-pulse border-primary text-primary"
            )}
          >
            <Fingerprint className={cn("h-7 w-7", scanning && "text-primary")} />
          </button>
        )}

        <button
          onClick={onCancel}
          className="mt-8 text-[13px] font-extrabold tracking-widest text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("common.cancel")}
        </button>
      </motion.div>
    </div>
  );
}
