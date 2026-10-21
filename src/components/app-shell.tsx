"use client";

import { useEffect, useMemo } from "react";
import { OniLogo } from "@/components/oni-logo";
import { BottomNav } from "@/components/bottom-nav";
import { Onboarding } from "@/components/onboarding";
import { HomeScreen } from "@/components/screens/home-screen";
import { LibraryScreen } from "@/components/screens/library-screen";
import { DiscoverScreen } from "@/components/screens/discover-screen";
import { UpdatesScreen } from "@/components/screens/updates-screen";
import { DownloadsScreen } from "@/components/screens/downloads-screen";
import { MoreScreen } from "@/components/screens/more-screen";
import { DetailsScreen } from "@/components/screens/details-screen";
import { ReaderScreen } from "@/components/screens/reader-screen";
import { OverlayErrorBoundary } from "@/components/error-boundary";
import { SearchScreen } from "@/components/screens/search-screen";
import { CatalogScreen } from "@/components/screens/catalog-screen";
import { SourceScreen } from "@/components/screens/source-screen";
import { VaultScreen, VaultLockScreen } from "@/components/screens/vault-screen";
import { ExtensionsScreen } from "@/components/screens/extensions-screen";
import { StatisticsScreen } from "@/components/screens/statistics-screen";
import { HistoryScreen } from "@/components/screens/history-screen";
import { SettingsScreen } from "@/components/screens/settings-screen";
import { CategoriesScreen } from "@/components/screens/categories-screen";
import { BackupScreen } from "@/components/screens/backup-screen";
import { ServersScreen } from "@/components/screens/servers-screen";
import { FormatsScreen } from "@/components/screens/formats-screen";
import { NotificationsScreen } from "@/components/screens/notifications-screen";
import { DuplicatesScreen } from "@/components/screens/duplicates-screen";
import { HighlightsScreen } from "@/components/screens/highlights-screen";
import { useApp, useNav, type Overlay } from "@/lib/store";
import { useT, useResolvedTheme, useMounted } from "@/lib/use-app";
import { useClientEngine } from "@/lib/engine";
import { ImportDestinationDialog } from "@/components/import/import-destination-dialog";
import { cn } from "@/lib/utils";
import { BookOpen, Compass, Download, LibraryBig, ShieldCheck, BarChart3 } from "lucide-react";
import { useState } from "react";

/* desktop side branding — mirrors the reference key visuals */
function SideBranding() {
  const { t } = useT();
  const items = [
    { Icon: BookOpen, en: "Manga · Manhwa · Webtoons", fa: "مانگا · مانهوا · وبتون" },
    { Icon: LibraryBig, en: "Comics · Books · PDF", fa: "کمیک · کتاب · PDF" },
    { Icon: Download, en: "Offline downloads", fa: "دانلود آفلاین" },
    { Icon: ShieldCheck, en: "Private Vault", fa: "گاوصندوق خصوصی" },
    { Icon: BarChart3, en: "Reading statistics", fa: "آمار مطالعه" },
    { Icon: Compass, en: "Extensible sources", fa: "منبع‌های توسعه‌پذیر" },
  ];
  const lang = useApp((s) => s.settings.lang);
  return (
    <aside className="relative z-10 me-14 hidden w-[340px] shrink-0 select-none flex-col justify-center xl:flex">
      <Petals />
      <div className="flex items-center gap-4">
        <OniLogo size={72} className="drop-shadow-[0_18px_36px_rgba(248,105,76,0.4)]" />
        <div>
          <p className="text-[40px] font-black leading-none tracking-tight text-[#2b241d] dark:text-[#f3efe9]">
            oni<span className="text-primary">Library</span>
          </p>
          <p className="mt-2 text-[17px] font-semibold text-[#8a7a68] dark:text-[#a19077]">
            {lang === "fa" ? "داستان‌های شما. همه در یک‌جا." : "Your stories.\nIn one place."}
          </p>
        </div>
      </div>
      <ul className="mt-12 space-y-5">
        {items.map(({ Icon, en, fa }) => (
          <li key={en} className="flex items-center gap-4 text-[#6d5f50] dark:text-[#c8bca9]">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/70 shadow-[0_8px_20px_-10px_rgba(43,36,29,0.25)] dark:bg-white/[0.07] dark:shadow-none">
              <Icon className="h-5 w-5 text-primary" />
            </span>
            <span className="text-[16px] font-bold">{lang === "fa" ? fa : en}</span>
          </li>
        ))}
      </ul>
      <p className="mt-14 text-[13px] font-bold text-[#a59784] dark:text-[#857867]">
        {lang === "fa" ? "بیشتر فقط یک خواننده." : "More than just a reader."}
      </p>
    </aside>
  );
}

function Petals() {
  const petals = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        left: `${4 + i * 11}%`,
        size: 6 + ((i * 7) % 8),
        dur: 11 + ((i * 3) % 9),
        delay: -((i * 2.7) % 12),
        opacity: 0.35 + ((i % 3) * 0.2),
      })),
    []
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      {petals.map((p, i) => (
        <span
          key={i}
          className="petal"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            opacity: p.opacity,
          }}
        />
      ))}
    </div>
  );
}

function OverlayRenderer({ overlay }: { overlay: Overlay }) {
  switch (overlay.kind) {
    case "details":
      return <DetailsScreen workId={overlay.workId} />;
    case "reader":
      return <ReaderScreen workId={overlay.workId} chapterId={overlay.chapterId} startPage={overlay.page} highlightId={overlay.highlightId} />;
    case "highlights":
      return <HighlightsScreen workId={overlay.workId} />;
    case "search":
      return <SearchScreen />;
    case "catalog":
      return <CatalogScreen serverId={overlay.serverId} />;
    case "source":
      return <SourceScreen sourceId={overlay.sourceId} focusMangaId={overlay.focusMangaId} initialFilters={overlay.filters} />;
    case "vault":
      return <VaultScreen />;
    case "extensions":
      return <ExtensionsScreen />;
    case "statistics":
      return <StatisticsScreen />;
    case "history":
      return <HistoryScreen />;
    case "settings":
      return <SettingsScreen />;
    case "categories":
      return <CategoriesScreen />;
    case "backup":
      return <BackupScreen />;
    case "servers":
      return <ServersScreen />;
    case "formats":
      return <FormatsScreen />;
    case "notifications":
      return <NotificationsScreen />;
    case "duplicates":
      return <DuplicatesScreen />;
    default:
      return null;
  }
}

/* vault gate: if vault is protected and locked, show lock first */
function VaultGate() {
  const pinHash = useApp((s) => s.settings.vaultPinHash);
  const unlocked = useApp((s) => s.vaultUnlocked);
  const pop = useNav((s) => s.pop);
  if (!pinHash || unlocked) return <VaultScreen />;
  return <VaultLockScreen onSuccess={() => undefined} onCancel={pop} />;
}

export function AppShell() {
  const mounted = useMounted();
  const onboarded = useApp((s) => s.onboarded);
  const hydrated = useApp((s) => s.hydrated);
  const finishOnboarding = useApp((s) => s.finishOnboarding);
  const lang = useApp((s) => s.settings.lang);
  const navItems = useApp((s) => s.settings.navItems);
  const { tab, stack, pop } = useNav();
  const resolved = useResolvedTheme();

  // Android Share/Open-With staging (v1.2.1): the pulled file is handed to the
  // shared destination dialog — existing work (smart search) or new work
  const [stagedFiles, setStagedFiles] = useState<File[] | null>(null);

  const overlay = stack[stack.length - 1];
  const readerOpen = overlay?.kind === "reader";
  useClientEngine(readerOpen);

  // ESC to go back — but let open dialogs/sheets consume Escape first
  // (radix closes them itself; previously sheet + reader popped together)
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[role=dialog]")) return;
      if (stack.length > 0) pop();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [stack.length, pop]);

  // persist language + direction on <html> for a11y (BIL-004/ACC) + expose overlay depth for Android back button
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    const bridge = (window as unknown as { __oniOverlayDepth?: number; OniAndroid?: { setOverlayDepth: (d: number) => void } });
    bridge.__oniOverlayDepth = stack.length;
    try {
      bridge.OniAndroid?.setOverlayDepth?.(stack.length);
    } catch {
      /* WebView bridge quirk — depth tracking stays JS-side only */
    }
  }, [lang, stack.length]);

  // Phase 4 (B1): durable download queue — re-queue rows whose worker died
  // with the previous page load and start the fresh pump exactly once
  useEffect(() => {
    void import("@/lib/bg-downloads").then(({ initBgDownloads }) => initBgDownloads());
  }, []);

  // PWA service worker — web only (never inside the APK WebView wrapper),
  // production only so dev HMR stays untouched
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if ("OniAndroid" in window) return;
    if (!("serviceWorker" in navigator)) return;
    const id = window.setTimeout(() => {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }, 2500);
    return () => window.clearTimeout(id);
  }, []);

  // Android Share / Open-With import (LOC-001): the native shell stages a
  // received file in its cache — pull it over the chunked bridge and hand it
  // to the destination dialog (existing work via smart search, or new work)
  useEffect(() => {
    const pull = async () => {
      const b = window as unknown as {
        OniAndroid?: {
          pendingImportInfo?: () => string | null;
          readImportChunk?: (offset: number, length: number) => string;
          clearPendingImport?: () => void;
        };
      };
      const bridge = b.OniAndroid;
      if (!bridge?.pendingImportInfo) return;
      let infoRaw: string | null = null;
      try {
        infoRaw = bridge.pendingImportInfo();
      } catch {
        return; // bridge hiccup — a retry re-pulls
      }
      if (!infoRaw || infoRaw === "null") return;
      try {
        // wait for the persisted store to hydrate before mutating it
        for (let i = 0; i < 20 && !useApp.getState().hydrated; i++) {
          await new Promise((r) => setTimeout(r, 250));
        }
        if (!useApp.getState().hydrated) return;
        const info = JSON.parse(infoRaw) as { name: string; mime: string; size: number };
        const CHUNK = 96 * 1024;
        const chunks: Uint8Array[] = [];
        for (let off = 0; off < info.size; off += CHUNK) {
          const b64 = bridge.readImportChunk?.(off, CHUNK) ?? "";
          if (!b64) break;
          const bin = atob(b64);
          const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          chunks.push(arr);
          if (chunks.reduce((a, c) => a + c.length, 0) > 512 * 1024 * 1024) break; // sane cap
        }
        const total = chunks.reduce((a, c) => a + c.length, 0);
        // release the native staging slot right away — the bytes now live in JS
        bridge.clearPendingImport?.();
        if (total > 0) {
          const file = new File(chunks as unknown as BlobPart[], info.name || "import", {
            type: info.mime || "application/octet-stream",
          });
          setStagedFiles([file]);
        }
      } catch {
        /* malformed transfer — leave it; a retry re-pulls */
      }
    };
    void pull();
    window.addEventListener("oni-android-import", pull);
    return () => window.removeEventListener("oni-android-import", pull);
     
  }, []);

  const dark = resolved === "dark";
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3ebdf]">
        <div className="flex flex-col items-center gap-3">
          <OniLogo className="animate-pulse" size={64} />
          <p className="text-[13px] font-bold text-[#a59784]">oniLibrary</p>
        </div>
      </div>
    );
  }

  const showChrome = !overlay || overlay.kind === "details" || overlay.kind === "vault";

  return (
    <div className={cn("relative min-h-dvh", dark && "dark")}>
      <div className="relative flex min-h-dvh items-center justify-center bg-[#f3ebdf] dark:bg-[#0f0d0b] lg:gap-6 lg:p-8">
        <SideBranding />

      {/* phone */}
      <div className={cn(
        "relative h-dvh w-full overflow-hidden bg-background shadow-[0_40px_90px_-30px_rgba(43,36,29,0.45)] max-lg:shadow-none lg:h-[860px] lg:max-h-[92dvh] lg:w-[412px] lg:rounded-[3rem] lg:border-[10px] lg:border-black lg:ring-1 lg:ring-black/60",
        dark && "dark"
      )}>
        <Petals />
        <div
          dir={lang === "fa" ? "rtl" : "ltr"}
          lang={lang}
          className={cn(
            "relative z-10 flex h-full flex-col font-fa text-foreground"
          )}
        >
          {!hydrated ? (
            <div className="flex flex-1 items-center justify-center">
              <OniLogo size={56} className="animate-pulse" />
            </div>
          ) : !onboarded ? (
            <Onboarding
              onFinish={(l, th, nm) => {
                if (nm) useApp.getState().setSettings({ userName: nm.slice(0, 24) });
                finishOnboarding({ lang: l, theme: th });
              }}
            />
          ) : (
            <>
              <main className="relative flex-1 overflow-hidden">
                {/* tab screens (kept mounted lazily by switch) */}
                <div key={tab} className="animate-screen-in h-full overflow-y-auto no-scrollbar pb-2">
                  {tab === "home" && <HomeScreen />}
                  {tab === "library" && <LibraryScreen />}
                  {tab === "discover" && <DiscoverScreen />}
                  {tab === "updates" && <UpdatesScreen />}
                  {tab === "downloads" && <DownloadsScreen />}
                  {tab === "more" && <MoreScreen />}
                </div>

                {/* overlay stack — boundary keeps a screen crash recoverable
                    instead of killing the whole app (v1.1.1 hardening) */}
                {overlay && (
                  <div className="animate-overlay-in absolute inset-0 z-20 flex flex-col overflow-hidden bg-background">
                    {overlay.kind === "vault" ? (
                      <VaultGate />
                    ) : (
                      <OverlayErrorBoundary>
                        <OverlayRenderer overlay={overlay} />
                      </OverlayErrorBoundary>
                    )}
                  </div>
                )}
              </main>

              {showChrome && navItems.length > 0 && (
                <BottomNav />
              )}
            </>
          )}
        </div>
      </div>
      </div>

      {/* Android staged import → destination dialog (v1.2.1) */}
      <ImportDestinationDialog files={stagedFiles} onClose={() => setStagedFiles(null)} />
    </div>
  );
}
