"use client";

import { useState } from "react";
import { OniLogo } from "@/components/oni-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LANGS } from "@/lib/i18n";
import { Sun, Moon, Monitor } from "lucide-react";
import type { ThemeMode } from "@/lib/types";

export function Onboarding({
  onFinish,
}: {
  onFinish: (lang: "en" | "fa", theme: ThemeMode) => void;
}) {
  const detect = typeof navigator !== "undefined" && navigator.language.startsWith("fa") ? "fa" : "en";
  const [lang, setLang] = useState<"en" | "fa">(detect);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const labels = {
    en: {
      welcome: "Welcome to",
      chooseLang: "Choose your language",
      hint: "You can change this later in Settings.",
      start: "Get started",
      themeTitle: "Appearance",
      themeHint: "Light, Dark or follow the system.",
      light: "Light",
      dark: "Dark",
      system: "System",
      tagline: "Your stories. In one place.",
    },
    fa: {
      welcome: "خوش آمدید به",
      chooseLang: "زبان خود را انتخاب کنید",
      hint: "بعداً می‌توانید از تنظیمات تغییرش دهید.",
      start: "شروع کنید",
      themeTitle: "ظاهر برنامه",
      themeHint: "روشن، تاریک یا هماهنگ با سیستم.",
      light: "روشن",
      dark: "تاریک",
      system: "سیستم",
      tagline: "داستان‌های شما. همه در یک‌جا.",
    },
  }[lang];

  const sample: Record<"en" | "fa", { title: string; lines: string[] }> = {
    en: { title: "Home", lines: ["Continue Reading", "Latest Updates", "Your Reading Stats"] },
    fa: { title: "خانه", lines: ["ادامه مطالعه", "آخرین به‌روزرسانی‌ها", "آمار مطالعه شما"] },
  };

  return (
    <div dir={lang === "fa" ? "rtl" : "ltr"} className="flex h-full flex-col overflow-y-auto bg-background px-6 pb-8 pt-10 font-fa">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <OniLogo size={84} className="drop-shadow-[0_14px_28px_rgba(248,105,76,0.35)]" />
          <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-primary/40 blur-[6px]" />
        </div>
        <h1 className="mt-3 text-[34px] font-black tracking-tight text-foreground">
          oni<span className="text-primary">Library</span>
        </h1>
        <p className="mt-1 text-[15px] font-semibold text-muted-foreground">{labels.tagline}</p>
      </div>

      {/* language picker */}
      <div className="mt-9">
        <h2 className="text-center text-[17px] font-extrabold">{labels.chooseLang}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {LANGS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLang(l.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-3xl border-2 px-4 py-5 transition-all",
                lang === l.id
                  ? "border-primary bg-coral-soft shadow-[0_10px_24px_-12px_rgba(248,105,76,0.5)]"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              <span className="text-3xl">{l.flag}</span>
              <span className="text-[15px] font-extrabold">{l.native}</span>
              <span className="text-[11px] font-semibold text-muted-foreground">{l.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2.5 text-center text-[12px] text-muted-foreground">{labels.hint}</p>
      </div>

      {/* theme picker */}
      <div className="mt-7">
        <h2 className="text-center text-[17px] font-extrabold">{labels.themeTitle}</h2>
        <p className="mt-0.5 text-center text-[12px] text-muted-foreground">{labels.themeHint}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {(
            [
              { id: "light", Icon: Sun },
              { id: "dark", Icon: Moon },
              { id: "system", Icon: Monitor },
            ] as const
          ).map(({ id, Icon }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-3xl border-2 px-2 py-4 transition-all",
                theme === id
                  ? "border-primary bg-coral-soft text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[12px] font-bold">{labels[id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* mini preview */}
      <div className="mx-auto mt-7 w-full max-w-[300px] rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <OniLogo size={20} />
          <span className="text-[12px] font-extrabold">oniLibrary</span>
          <span className="ms-auto text-[10px] font-bold text-muted-foreground">{sample[lang].title}</span>
        </div>
        <div className="mt-3 space-y-2">
          {sample[lang].lines.map((line, i) => (
            <div key={line} className="flex items-center gap-2">
              <div className={cn("h-8 w-8 rounded-xl", ["bg-coral-gradient", "bg-secondary", "bg-secondary"][i])} />
              <div className="flex-1">
                <div className="h-2 w-3/4 rounded-full bg-secondary" />
                <div className="mt-1.5 h-2 w-1/2 rounded-full bg-secondary/70" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto pt-8">
        <Button
          onClick={() => onFinish(lang, theme)}
          className="h-13 w-full rounded-full bg-coral-gradient py-4 text-[16px] font-extrabold text-white shadow-[0_14px_30px_-10px_rgba(248,105,76,0.6)] hover:opacity-95"
        >
          {labels.start}
        </Button>
      </div>
    </div>
  );
}
