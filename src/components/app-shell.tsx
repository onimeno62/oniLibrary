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
import { SearchScreen } from "@/components/screens/search-screen";
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
import { useApp, useNav, type Overlay } from "@/lib/store";
import { useT, useResolvedTheme, useMounted } from "@/lib/use-app";
import { useClientEngine } from "@/lib/engine";
import { cn } from "@/lib/utils";
import { BookOpen, Compass, Download, LibraryBig, ShieldCheck, BarChart3 } from "lucide-react";

/* status bar (matches mockups) */
function StatusBar({ dark }: { dark: boolean }) {
  return (
    <div
      className={cn(
        "pointer-events-none relative z-40 flex h-9 items-center justify-between px-6 pt-1 text-[13px] font-bold",
        dark ? "text-white" : "text-foreground"
      )}
    >
      <span>9:41</span>
      <span className="absolute left-1/2 top-1.5 h-5 w-20 -translate-x-1/2 rounded-full bg-black/90 max-lg:hidden" />
      <span className="flex items-center gap-1.5">
        {/* wifi / signal / battery */}
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 9.2a1.4 1.4 0 1 0 0 2.0 1.4 1.4 0 0 0 0-2.0Z" transform="translate(0,-2)"/><path d="M7.5 5.6c1.3 0 2.5.5 3.4 1.4l-1 1a3.4 3.4 0 0 0-4.8 0l-1-1a4.8 4.8 0 0 1 3.4-1.4Z"/><path d="M7.5 2.2c2.2 0 4.2.9 5.7 2.3l-1 1a6.6 6.6 0 0 0-9.4 0l-1-1A8 8 0 0 1 7.5 2.2Z"/></svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="0.8"/><rect x="4.3" y="5" width="3" height="6" rx="0.8"/><rect x="8.6" y="2.5" width="3" height="8.5" rx="0.8"/><rect x="12.9" y="0" width="3" height="11" rx="0.8" opacity="0.35"/></svg>
        <svg width="23" height="11" viewBox="0 0 23 11"><rect x="0.5" y="0.5" width="19" height="10" rx="3" fill="none" stroke="currentColor" opacity="0.4"/><rect x="2" y="2" width="14" height="7" rx="1.6" fill="currentColor"/><rect x="21" y="3.5" width="1.6" height="4" rx="0.8" fill="currentColor" opacity="0.5"/></svg>
      </span>
    </div>
  );
}

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
      return <ReaderScreen workId={overlay.workId} chapterId={overlay.chapterId} startPage={overlay.page} />;
    case "search":
      return <SearchScreen />;
    case "source":
      return <SourceScreen sourceId={overlay.sourceId} />;
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
  const { t } = useT();

  const overlay = stack[stack.length - 1];
  const readerOpen = overlay?.kind === "reader";
  useClientEngine(readerOpen);

  // ESC to go back
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape" && stack.length > 0) pop();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [stack.length, pop]);

  // persist language on <html> for a11y + expose overlay depth for Android back button
  useEffect(() => {
    document.documentElement.lang = lang;
    const bridge = (window as unknown as { __oniOverlayDepth?: number; OniAndroid?: { setOverlayDepth: (d: number) => void } });
    bridge.__oniOverlayDepth = stack.length;
    bridge.OniAndroid?.setOverlayDepth?.(stack.length);
  }, [lang, stack.length]);

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
          <StatusBar dark={dark} />

          {!hydrated ? (
            <div className="flex flex-1 items-center justify-center">
              <OniLogo size={56} className="animate-pulse" />
            </div>
          ) : !onboarded ? (
            <Onboarding
              onFinish={(l, th) => finishOnboarding({ lang: l, theme: th })}
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

                {/* overlay stack */}
                {overlay && (
                  <div className="animate-overlay-in absolute inset-0 z-20 flex flex-col overflow-hidden bg-background">
                    {overlay.kind === "vault" ? (
                      <VaultGate />
                    ) : (
                      <OverlayRenderer overlay={overlay} />
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
    </div>
  );
}
