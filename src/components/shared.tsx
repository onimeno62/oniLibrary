"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/use-app";
import { useNav } from "@/lib/store";

/* ---------- cover with gradient fallback ---------- */

const coverGradients = [
  "from-orange-400 via-rose-500 to-rose-900",
  "from-amber-400 via-orange-500 to-red-800",
  "from-emerald-500 via-teal-700 to-slate-900",
  "from-sky-500 via-indigo-700 to-slate-900",
  "from-fuchsia-500 via-purple-700 to-slate-900",
  "from-lime-500 via-emerald-700 to-slate-900",
];

export function WorkCover({
  src,
  title,
  color,
  className,
  sizes = "80px",
  eager,
}: {
  src?: string;
  title: string;
  color?: string;
  className?: string;
  sizes?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const seed = title.charCodeAt(0) + title.length;
  const grad = color
    ? color.replace("from-", "bg-gradient-to-br from-")
    : `bg-gradient-to-br ${coverGradients[seed % coverGradients.length]}`;
  if (src && !failed) {
    return (
      <div className={cn("relative overflow-hidden bg-secondary", className)}>
        <Image
          src={src}
          alt={title}
          fill
          sizes={sizes}
          className="object-cover"
          priority={eager}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-gradient-to-br text-white",
        grad,
        className
      )}
    >
      <span className="text-center font-black tracking-tight" style={{ fontSize: "38%" }}>
        {title.slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

/* ---------- progress bar ---------- */

export function ProgressBar({
  value,
  className,
  barClassName,
}: {
  value: number;
  className?: string;
  barClassName?: string;
}) {
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div
        className={cn("h-full rounded-full bg-coral-gradient transition-all duration-500", barClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ---------- chip ---------- */

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition-all",
        active
          ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
          : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        className
      )}
    >
      {children}
    </button>
  );
}

/* ---------- section header ---------- */

export function SectionHeader({
  title,
  onSeeAll,
  right,
}: {
  title: string;
  onSeeAll?: () => void;
  right?: React.ReactNode;
}) {
  const { t } = useT();
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[17px] font-extrabold tracking-tight text-foreground">{title}</h2>
      {right ??
        (onSeeAll ? (
          <button
            onClick={onSeeAll}
            className="text-[13px] font-bold text-primary hover:underline"
          >
            {t("common.seeAll")}
          </button>
        ) : null)}
    </div>
  );
}

/* ---------- source icon ---------- */

export function SourceIcon({
  bg,
  text,
  img,
  size = 44,
  className,
}: {
  bg: string;
  text: string;
  img?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-black text-white", className)}
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      {img ? (
        <Image src={img} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span style={{ fontSize: size * 0.34 }}>{text}</span>
      )}
    </div>
  );
}

/* ---------- empty state ---------- */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
        {icon}
      </div>
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      {hint && <p className="max-w-[240px] text-[13px] leading-relaxed text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ---------- overlay screen header ---------- */

export function OverlayHeader({
  title,
  subtitle,
  right,
  onBack,
  className,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
  className?: string;
}) {
  const { rtl } = useT();
  const pop = useNav((s) => s.pop);
  const Back = rtl ? ChevronRight : ChevronLeft;
  return (
    <div className={cn("flex items-center gap-2 px-4 pt-3 pb-2", className)}>
      <button
        onClick={onBack ?? pop}
        aria-label="Back"
        className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
      >
        <Back className="h-6 w-6" />
      </button>
      <div className="min-w-0 flex-1">
        {title && <h1 className="truncate text-[19px] font-extrabold tracking-tight">{title}</h1>}
        {subtitle && <p className="truncate text-[12px] text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/* ---------- status badge (library cards) ---------- */

export function StatusBadge({ kind, label }: { kind: "done" | "percent" | "paused" | "planned"; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        kind === "done" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
        kind === "percent" && "bg-coral-soft text-primary",
        kind === "paused" && "bg-secondary text-secondary-foreground",
        kind === "planned" && "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400"
      )}
    >
      {label}
    </span>
  );
}
