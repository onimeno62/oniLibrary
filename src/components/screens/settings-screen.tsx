"use client";

import { useState } from "react";
import {
  Sun,
  Moon,
  Monitor,
  Minus,
  Plus,
  ChevronRight,
  Lock,
  Palette,
  LayoutGrid,
  BookOpen,
  Download,
  Bell,
  WifiOff,
  ShieldCheck,
  Eraser,
  Info,
  Github,
  User,
  RefreshCw,
  Link2,
  Radio,
  FolderTree,
} from "lucide-react";
import { OverlayHeader } from "@/components/shared";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { APP_REPO_URL, APP_VERSION, APP_VERSION_CODE } from "@/lib/version";
import { anilistWhoAmI, syncAllToTracker } from "@/lib/tracker";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { LANGS, type TranslationKey } from "@/lib/i18n";import type {
  ThemeMode,
  ReadingDirection,
  ReaderMode,
  FitMode,
  Settings,
} from "@/lib/types";

/* ============================================================
   SettingsScreen
   ============================================================ */

type BgKey = Settings["readerDefaults"]["bg"];

function Section({
  Icon,
  title,
  children,
}: {
  Icon?: typeof Palette;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-3xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        <p className="text-[15px] font-extrabold tracking-tight">{title}</p>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold leading-snug">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="data-[state=checked]:bg-primary"
        aria-label={label}
      />
    </div>
  );
}

function ChipSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, TranslationKey][];
  onChange: (v: T) => void;
}) {
  const { t } = useT();
  return (
    <div className="py-2.5">
      <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all",
              value === id
                ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                : "bg-secondary text-secondary-foreground hover:bg-accent"
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>
    </div>
  );
}

const THEME_OPTIONS: [ThemeMode, TranslationKey, typeof Sun][] = [
  ["light", "more.theme.light", Sun],
  ["dark", "more.theme.dark", Moon],
  ["system", "more.theme.system", Monitor],
];

const NAV_ORDER = ["home", "library", "discover", "updates", "downloads"] as const;
const NAV_LABELS: Record<string, TranslationKey> = {
  home: "nav.home",
  library: "nav.library",
  discover: "nav.discover",
  updates: "nav.updates",
  downloads: "nav.downloads",
  more: "nav.more",
};

const DIR_OPTIONS: [ReadingDirection, TranslationKey][] = [
  ["RTL", "rdr.dir.rtl"],
  ["LTR", "rdr.dir.ltr"],
];

const MODE_OPTIONS: [ReaderMode, TranslationKey][] = [
  ["PAGED", "rdr.mode.paged"],
  ["DOUBLE", "rdr.mode.double"],
  ["CONTINUOUS", "rdr.mode.continuous"],
  ["WEBTOON", "rdr.mode.webtoon"],
];

const DENSITY_OPTIONS: ["compact" | "cozy" | "large", TranslationKey][] = [
  ["compact", "set.density.compact"],
  ["cozy", "set.density.cozy"],
  ["large", "set.density.large"],
];

const FIT_OPTIONS: [FitMode, TranslationKey][] = [
  ["WIDTH", "rdr.fit.WIDTH"],
  ["HEIGHT", "rdr.fit.HEIGHT"],
  ["SCREEN", "rdr.fit.SCREEN"],
  ["ORIGINAL", "rdr.fit.ORIGINAL"],
];

const BG_OPTIONS: [BgKey, TranslationKey, string][] = [
  ["black", "rdr.bg.black", "#171412"],
  ["gray", "rdr.bg.gray", "#8a8580"],
  ["white", "rdr.bg.white", "#ffffff"],
  ["sepia", "rdr.bg.sepia", "#f0e2cc"],
];

export function SettingsScreen() {
  const { t, lang } = useT();
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const setReaderDefaults = useApp((s) => s.setReaderDefaults);
  const clearHistory = useApp((s) => s.clearHistory);
  const setTracker = useApp((s) => s.setTracker);
  const [navHintBump, setNavHintBump] = useState(0);

  /* tracker state (v1.2.0) */
  const tracker = settings.tracker;
  const [tokenInput, setTokenInput] = useState("");
  const [trkChecking, setTrkChecking] = useState(false);
  const [trkSyncing, setTrkSyncing] = useState(false);
  const [trkName, setTrkName] = useState<string>("");

  const connectTracker = async () => {
    const token = tokenInput.trim();
    if (!token || trkChecking) return;
    setTrkChecking(true);
    try {
      const name = await anilistWhoAmI(token);
      setTracker({ provider: "anilist", token });
      setTrkName(name);
      setTokenInput("");
      toast({ title: t("trk.connected"), description: `AniList · ${name}` });
    } catch (e) {
      toast({ title: t("trk.connectFail"), description: (e as Error).message?.slice(0, 60), variant: "destructive" });
    } finally {
      setTrkChecking(false);
    }
  };

  const syncNow = async () => {
    if (trkSyncing) return;
    setTrkSyncing(true);
    try {
      const report = await syncAllToTracker();
      toast({
        title: t("trk.syncDone"),
        description: t("trk.syncSummary", { p: report.pushed, m: report.matched, f: report.failed }),
      });
    } catch (e) {
      toast({ title: t("trk.syncFail"), description: (e as Error).message?.slice(0, 60), variant: "destructive" });
    } finally {
      setTrkSyncing(false);
    }
  };

  const rd = settings.readerDefaults;
  const fa = lang === "fa";
  const num = (n: number | string) => (fa ? String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]) : String(n));

  /* nav items: max 4 selectable besides always-on "more", keep DEFAULT order */
  const selectedNav = NAV_ORDER.filter((id) => settings.navItems.includes(id));
  const toggleNav = (id: (typeof NAV_ORDER)[number]) => {
    if (selectedNav.includes(id)) {
      if (selectedNav.length === 1) return; // keep at least one shortcut
      setSettings({ navItems: [...NAV_ORDER.filter((x) => x !== id && selectedNav.includes(x)), "more"] });
    } else {
      if (selectedNav.length >= 4) {
        setNavHintBump((b) => b + 1);
        return;
      }
      setSettings({ navItems: [...NAV_ORDER.filter((x) => selectedNav.includes(x) || x === id), "more"] });
    }
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
      <OverlayHeader title={t("more.settings")} />

      {/* ---- Profile ---- */}
      <Section Icon={User} title={t("set.profileSection")}>
        <p className="text-[11px] leading-snug text-muted-foreground">{t("set.nameHint")}</p>
        <div className="mt-2 flex h-11 items-center gap-2.5 rounded-full border border-border bg-background px-4 transition-colors focus-within:border-primary">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={settings.userName}
            onChange={(e) => setSettings({ userName: e.target.value.slice(0, 24) })}
            placeholder={t("set.namePlaceholder")}
            aria-label={t("set.profileSection")}
            className="w-full bg-transparent text-[14px] font-bold outline-none placeholder:font-semibold placeholder:text-muted-foreground"
          />
        </div>
      </Section>

      {/* ---- Appearance ---- */}
      <Section Icon={Palette} title={t("more.appearance")}>
        {/* theme segmented */}
        <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">{t("more.theme")}</p>
        <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
          {THEME_OPTIONS.map(([id, key, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSettings({ theme: id })}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[12px] font-bold transition-all",
                settings.theme === id
                  ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                  : "text-secondary-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t(key)}
            </button>
          ))}
        </div>

        {/* language */}
        <div className="mt-3 flex items-center gap-3 border-t border-border pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">{t("more.language")}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  if (settings.lang === l.id) return;
                  setSettings({ lang: l.id });
                  toast({ title: t("common.done"), description: l.native });
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13px] font-bold transition-all",
                  settings.lang === l.id
                    ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                )}
              >
                {l.native}
              </button>
            ))}
          </div>
        </div>

        {/* UX-003: library grid density */}
        <div className="mt-1 border-t border-border pt-1">
          <ChipSelect
            label={t("set.density")}
            value={settings.libraryDensity}
            options={DENSITY_OPTIONS}
            onChange={(v) => setSettings({ libraryDensity: v })}
          />
        </div>
      </Section>

      {/* ---- Bottom navigation ---- */}
      <Section Icon={LayoutGrid} title={t("more.navCustom")}>
        <p className="text-[11px] leading-snug text-muted-foreground" key={navHintBump}>
          {t("set.navHint")} · {t("more.navCustomHint")}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {NAV_ORDER.map((id) => {
            const active = selectedNav.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleNav(id)}
                aria-pressed={active}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[13px] font-bold transition-all",
                  active
                    ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                )}
              >
                {t(NAV_LABELS[id])}
              </button>
            );
          })}
          <span
            className="cursor-default rounded-full bg-coral-soft px-4 py-1.5 text-[13px] font-bold text-primary"
            title={t("common.enabled")}
          >
            {t(NAV_LABELS.more)}
          </span>
        </div>
      </Section>

      {/* ---- Reader defaults ---- */}
      <Section Icon={BookOpen} title={t("more.readerDefaults")}>
        <ChipSelect
          label={t("rdr.direction")}
          value={rd.direction === "VERTICAL" ? "RTL" : rd.direction}
          options={DIR_OPTIONS}
          onChange={(v) => setReaderDefaults({ direction: v })}
        />
        <ChipSelect
          label={t("rdr.readingMode")}
          value={rd.mode}
          options={MODE_OPTIONS}
          onChange={(v) => setReaderDefaults({ mode: v })}
        />
        <ChipSelect
          label={t("rdr.fit")}
          value={rd.fit}
          options={FIT_OPTIONS}
          onChange={(v) => setReaderDefaults({ fit: v })}
        />

        {/* background swatches */}
        <div className="py-2.5">
          <p className="mb-1.5 text-[12px] font-bold text-muted-foreground">{t("rdr.background")}</p>
          <div className="flex items-center gap-3">
            {BG_OPTIONS.map(([id, key, color]) => (
              <button
                key={id}
                type="button"
                onClick={() => setReaderDefaults({ bg: id })}
                className="flex flex-col items-center gap-1"
                aria-label={t(key)}
                aria-pressed={rd.bg === id}
              >
                <span
                  className={cn(
                    "h-8 w-8 rounded-full border border-border transition-all",
                    rd.bg === id && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                  )}
                  style={{ backgroundColor: color }}
                />
                <span className="text-[9px] font-bold text-muted-foreground">{t(key)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* brightness */}
        <div className="border-t border-border py-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-bold text-muted-foreground">{t("rdr.brightnessLabel")}</p>
            <span className="text-[12px] font-black text-primary">{num(rd.brightness)}%</span>
          </div>
          <Slider
            value={[rd.brightness]}
            min={30}
            max={100}
            step={1}
            onValueChange={(v) => setReaderDefaults({ brightness: v[0] ?? rd.brightness })}
            aria-label={t("rdr.brightnessLabel")}
            className="data-[state=checked]:bg-primary"
          />
        </div>

        {/* behaviour toggles (RDR-010/011 etc.) */}
        <div className="border-t border-border pt-1">
          <SwitchRow
            label={t("rdr.autoNext")}
            checked={rd.autoNext}
            onChange={(v) => setReaderDefaults({ autoNext: v })}
          />
          <div className="h-px bg-border" />
          <SwitchRow
            label={t("rdr.cropBorders")}
            checked={rd.cropBorders}
            onChange={(v) => setReaderDefaults({ cropBorders: v })}
          />
          <div className="h-px bg-border" />
          <SwitchRow
            label={t("rdr.keepAwake")}
            checked={rd.keepAwake}
            onChange={(v) => setReaderDefaults({ keepAwake: v })}
          />
          <div className="h-px bg-border" />
          <SwitchRow
            label={t("set.volumeKeys")}
            hint={t("set.volumeKeysHint")}
            checked={settings.volumeKeyPaging}
            onChange={(v) => setSettings({ volumeKeyPaging: v })}
          />
        </div>
      </Section>

      {/* ---- Download rules ---- */}
      <Section Icon={Download} title={t("more.dlRules")}>
        <SwitchRow
          label={t("dl.wifiOnly")}
          hint={t("dl.wifiOnlyHint")}
          checked={settings.wifiOnly}
          onChange={(v) => setSettings({ wifiOnly: v })}
        />
        <div className="flex items-center justify-between border-t border-border py-2.5">
          <p className="text-[14px] font-bold">{t("dl.concurrent")}</p>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSettings({ maxConcurrent: Math.max(1, settings.maxConcurrent - 1) })}
              disabled={settings.maxConcurrent <= 1}
              aria-label="-"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-transform active:scale-90 disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center text-[15px] font-black">{num(settings.maxConcurrent)}</span>
            <button
              type="button"
              onClick={() => setSettings({ maxConcurrent: Math.min(5, settings.maxConcurrent + 1) })}
              disabled={settings.maxConcurrent >= 5}
              aria-label="+"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-coral-gradient text-white transition-transform active:scale-90 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Section>

      {/* ---- Tracker sync (v1.2.0) ---- */}
      <Section Icon={Radio} title={t("trk.title")}>
        {tracker.provider === "anilist" && tracker.token ? (
          <>
            <div className="flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-extrabold">AniList{trkName ? ` · ${trkName}` : ""}</span>
                <span className="block text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">✓ {t("trk.connected")}</span>
              </span>
              <button
                onClick={() => {
                  setTracker({ provider: "none", token: "", lastSyncAt: null });
                  setTrkName("");
                  toast({ title: t("trk.disconnected") });
                }}
                className="rounded-full px-3 py-1.5 text-[11.5px] font-extrabold text-destructive transition-colors hover:bg-destructive/10"
              >
                {t("trk.disconnect")}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[13px] font-bold">{t("trk.autoSync")}</span>
                <span className="block text-[10.5px] font-semibold text-muted-foreground">{t("trk.autoSyncHint")}</span>
              </span>
              <Switch checked={tracker.autoSync} onCheckedChange={(v) => setTracker({ autoSync: v })} className="data-[state=checked]:bg-primary" />
            </div>
            <button
              onClick={() => void syncNow()}
              disabled={trkSyncing}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-full bg-coral-soft text-[13px] font-extrabold text-primary transition-opacity hover:opacity-85 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-4 w-4", trkSyncing && "animate-spin")} />
              {trkSyncing ? t("trk.syncing") : t("trk.syncNow")}
            </button>
            {tracker.lastSyncAt && (
              <p className="mt-1.5 text-center text-[10.5px] font-semibold text-muted-foreground">
                {t("trk.lastSync")}: {new Date(tracker.lastSyncAt).toLocaleString()}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-[11px] leading-snug text-muted-foreground">{t("trk.hint")}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-border bg-background px-3.5 transition-colors focus-within:border-primary">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={t("trk.tokenPlaceholder")}
                  type="password"
                  dir="ltr"
                  aria-label={t("trk.title")}
                  className="w-full bg-transparent text-[12.5px] font-semibold outline-none placeholder:text-muted-foreground"
                />
              </div>
              <button
                onClick={() => void connectTracker()}
                disabled={!tokenInput.trim() || trkChecking}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-coral-gradient px-4 text-[12.5px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.7)] disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", trkChecking && "animate-spin")} />
                {t("trk.connect")}
              </button>
            </div>
            <a
              href="https://anilist.co/settings/developer"
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 block text-center text-[10.5px] font-bold text-primary underline-offset-2 hover:underline"
            >
              anilist.co/settings/developer → {t("trk.tokenWhere")}
            </a>
          </>
        )}
      </Section>

      {/* ---- Notifications ---- */}
      <Section Icon={Bell} title={t("more.notifications")}>
        <SwitchRow
          label={t("more.ntf.chapters")}
          checked={settings.ntfChapters}
          onChange={(v) => setSettings({ ntfChapters: v })}
        />
        <div className="h-px bg-border" />
        <SwitchRow
          label={t("more.ntf.downloads")}
          checked={settings.ntfDownloads}
          onChange={(v) => setSettings({ ntfDownloads: v })}
        />
        <div className="h-px bg-border" />
        <SwitchRow
          label={t("more.ntf.errors")}
          checked={settings.ntfErrors}
          onChange={(v) => setSettings({ ntfErrors: v })}
        />
        <div className="h-px bg-border" />
        <SwitchRow
          label={t("more.ntf.hideSensitive")}
          checked={settings.hideSensitiveNtf}
          onChange={(v) => setSettings({ hideSensitiveNtf: v })}
        />
      </Section>

      {/* ---- Offline ---- */}
      <Section Icon={WifiOff} title={t("more.offlineMode")}>
        <SwitchRow
          label={t("more.offlineMode")}
          hint={t("more.offlineModeHint")}
          checked={settings.offlineMode}
          onChange={(v) => setSettings({ offlineMode: v })}
        />
      </Section>

      {/* ---- Privacy ---- */}
      <Section Icon={ShieldCheck} title={t("more.privacy")}>
        <button
          type="button"
          onClick={() => {
            if (!window.confirm(t("more.clearHistoryConfirm"))) return;
            clearHistory();
            toast({ title: t("more.historyCleared") });
          }}
          className="flex w-full items-center gap-3 py-2 text-start"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Eraser className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1 text-[14px] font-bold">{t("more.clearHistory")}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
        </button>
      </Section>

      {/* ---- Account note ---- */}
      <div className="mt-3 flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
          <Lock className="h-4.5 w-4.5" />
        </span>
        <p className="text-[12px] font-semibold leading-snug text-muted-foreground">
          {t("more.account")}
        </p>
      </div>

      {/* ---- About ---- */}
      <Section Icon={Info} title={t("more.about")}>
        <div className="flex items-center gap-3 py-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-coral-soft text-primary">
            <Info className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-bold">oniLibrary</p>
            <p className="text-[11px] font-semibold text-muted-foreground">{t("about.tagline")}</p>
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-black text-primary" dir="ltr">
            v{APP_VERSION} ({APP_VERSION_CODE})
          </span>
        </div>
        <a
          href={APP_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-1 flex items-center gap-3 border-t border-border py-2.5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
            <Github className="h-4.5 w-4.5" />
          </span>
          <span className="min-w-0 flex-1 text-[14px] font-bold">GitHub</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
        </a>
      </Section>
    </div>
  );
}
