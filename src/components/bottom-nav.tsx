"use client";

import { Home, LibraryBig, Compass, Bell, Download, Ellipsis } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, useNav, type Tab } from "@/lib/store";
import { useT } from "@/lib/use-app";
import type { TranslationKey } from "@/lib/i18n";

const LABELS: Record<string, { key: TranslationKey; Icon: typeof Home }> = {
  home: { key: "nav.home", Icon: Home },
  library: { key: "nav.library", Icon: LibraryBig },
  discover: { key: "nav.discover", Icon: Compass },
  updates: { key: "nav.updates", Icon: Bell },
  downloads: { key: "nav.downloads", Icon: Download },
  more: { key: "nav.more", Icon: Ellipsis },
};

export function BottomNav() {
  const navItems = useApp((s) => s.settings.navItems);
  const unread = useApp((s) => s.notifications.filter((n) => !n.read).length);
  const activeDl = useApp((s) => s.downloads.filter((d) => d.status === "ACTIVE").length);
  const { tab, setTab } = useNav();
  const { t } = useT();

  return (
    <nav
      aria-label={t("a11y.primaryNav")}
      className="relative z-30 border-t border-border/70 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5 pb-1">
        {navItems.map((id) => {
          const meta = LABELS[id];
          if (!meta) return null;
          const { Icon } = meta;
          const label = t(meta.key);
          const active = tab === id;
          const badge = id === "updates" ? unread : id === "downloads" ? activeDl : 0;
          return (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className={cn(
                "relative flex min-w-[52px] flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 transition-all active:scale-90",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.9} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral-gradient px-1 text-[9px] font-black text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className={cn("text-[10px]", active ? "font-extrabold" : "font-semibold")}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
