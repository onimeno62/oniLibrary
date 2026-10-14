"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useApp } from "./store";
import { translate, type TranslationKey } from "./i18n";

/** Returns t() bound to current language + lang + dir flag */
export function useT() {
  const lang = useApp((s) => s.settings.lang);
  const t = useMemo(
    () => (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang]
  );
  return { t, lang, rtl: lang === "fa" };
}

const noopSubscribe = () => () => undefined;

/** media query helper (external-store based — lint-safe) */
export function useMedia(query: string): boolean {
  const subscribe = useMemo(
    () => (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** resolved theme: light | dark (system-aware) */
export function useResolvedTheme(): "light" | "dark" {
  const theme = useApp((s) => s.settings.theme);
  const systemDark = useMedia("(prefers-color-scheme: dark)");
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

/** mount guard against hydration mismatch (always false on server/first render) */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
