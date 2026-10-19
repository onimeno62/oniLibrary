"use client";

/**
 * ExtensionsScreen — v1.3.0 HONEST rework.
 *
 * The previous screen was a mockup: a seeded list of fake extensions
 * ("Crunchyroll Manga", "ComiXology" — installed from a non-existent
 * "oniRepo") with fake VERIFIED compatibility badges. The PRD forbids that
 * explicitly:
 *   [EXT-002] "do not claim unverified compatibility"
 *   [NONS-003] "Compatibility with every Mihon extension … is not guaranteed
 *              without verification" — status must be explicit
 *   [EXT-004] "Explain the permissions and risks … in plain language"
 *   [RSK-001] "… may require … a decision not to support them"
 *
 * Mihon/Tachiyomi extension .apk files contain Android dex bytecode bound to
 * those apps' internal APIs — they cannot execute inside oniLibrary's web
 * runtime, so they are NOT supported and the screen says so in plain
 * language. What the app really ships is a set of first-party built-in
 * sources (MangaDex, Project Gutenberg, Standard Ebooks) + user catalogs
 * (OPDS/Komga), all real.
 */

import { Puzzle, Globe, BookOpen, Settings2, ShieldAlert, ExternalLink, Sparkles } from "lucide-react";
import { OverlayHeader, EmptyState } from "@/components/shared";
import { MangaDexCard, FreeCatalogList } from "@/components/sources/free-catalogs";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { MANGADEX_ID } from "@/lib/builtin-sources";
import { Switch } from "@/components/ui/switch";
import { ChevronRight } from "lucide-react";

export function ExtensionsScreen() {
  const { t } = useT();
  const servers = useApp((s) => s.servers);
  const builtinDisabled = useApp((s) => s.builtinDisabled);
  const toggleBuiltin = useApp((s) => s.toggleBuiltin);
  const push = useNav((s) => s.push);

  const mdEnabled = !builtinDisabled.includes(MANGADEX_ID);

  return (
    <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
      <OverlayHeader title={t("ext.title")} subtitle={t("ext.subtitleNew")} />

      {/* ============ built-in sources (real) ============ */}
      <section className="mt-3">
        <h2 className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
          {t("ext.builtin")}
        </h2>

        <div className="mt-2.5 space-y-2.5">
          {/* MangaDex — the native JSON source */}
          <article className="rounded-3xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-coral-gradient text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[15px] font-extrabold">
                  <span className="truncate">MangaDex</span>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {t("ext.verified")}
                  </span>
                </p>
                <p className="truncate text-[11px] font-semibold text-muted-foreground" dir="ltr">
                  JSON API · api.mangadex.org · EN
                </p>
              </div>
              <Switch
                checked={mdEnabled}
                onCheckedChange={() => toggleBuiltin(MANGADEX_ID)}
                aria-label="MangaDex"
                className="data-[state=checked]:bg-primary"
              />
            </div>
            <p className="mt-2 text-[11.5px] font-semibold leading-snug text-muted-foreground">
              {t("src.mdBlurb")}
            </p>
            {mdEnabled && (
              <button
                onClick={() => push({ kind: "source", sourceId: MANGADEX_ID })}
                className="mt-2.5 flex h-9 items-center gap-1.5 rounded-full bg-coral-soft px-3.5 text-[12px] font-extrabold text-primary transition-opacity hover:opacity-85"
              >
                <BookOpen className="h-4 w-4" />
                {t("srv.browse")}
                <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
              </button>
            )}
          </article>

          {/* Gutenberg + Standard Ebooks — one-tap OPDS catalogs */}
          <FreeCatalogList />
        </div>
      </section>

      {/* ============ your own catalogs ============ */}
      <section className="mt-6">
        <h2 className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
          {t("ext.yourCatalogs")}
        </h2>
        <button
          onClick={() => push({ kind: "servers" })}
          className="mt-2.5 flex w-full items-center gap-3.5 rounded-3xl border border-border/60 bg-card p-4 text-start transition-all hover:shadow-[0_12px_26px_-16px_rgba(43,36,29,0.5)]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground">
            <Globe className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-extrabold">{t("srv.title")}</span>
            <span className="block truncate text-[11.5px] font-semibold text-muted-foreground">
              {t("ext.catalogCount", { n: servers.length })} · {t("ext.catalogHint")}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
        </button>
      </section>

      {/* ============ Mihon & third-party extensions — the honest answer ============ */}
      <section className="mt-6">
        <h2 className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground">
          {t("ext.thirdParty")}
        </h2>

        <article className="mt-2.5 rounded-3xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-400">
              <ShieldAlert className="h-5.5 w-5.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14.5px] font-extrabold">{t("ext.mihonTitle")}</p>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black text-red-700 dark:bg-red-950 dark:text-red-400">
                {t("ext.mihonBadge")}
              </span>
            </div>
          </div>
          <p className="mt-3 text-[12px] font-semibold leading-relaxed text-foreground/85">{t("ext.mihonBody")}</p>
          <p className="mt-2 text-[12px] font-semibold leading-relaxed text-foreground/85">{t("ext.mihonInstead")}</p>
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-background/70 px-3 py-2.5 dark:bg-black/20">
            <Puzzle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <p className="text-[10.5px] font-semibold leading-snug text-muted-foreground">{t("ext.mihonWhy")}</p>
          </div>
        </article>

        <button
          onClick={() => push({ kind: "formats" })}
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-[12px] font-extrabold text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          <Settings2 className="h-4 w-4" />
          {t("ext.formatsLink")}
          <ExternalLink className="h-3.5 w-3.5 rtl:rotate-180" />
        </button>
      </section>

      {/* empty-state safety net (never expected now) */}
      {servers.length === 0 && !mdEnabled && (
        <div className="mt-8">
          <EmptyState icon={<Puzzle className="h-6 w-6" />} title={t("ext.empty")} />
        </div>
      )}
    </div>
  );
}
