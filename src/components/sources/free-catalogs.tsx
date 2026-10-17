"use client";

/**
 * Shared pieces for the built-in FREE catalogs (v1.3.0):
 *  - SeAuthDialog — Standard Ebooks OPDS needs a free-account email as the
 *    Basic-auth username (their 401 realm: "Enter your Patrons Circle email
 *    address and leave the password empty"). Token field kept optional for
 *    future schemes.
 *  - FreeCatalogCard — one-tap add/open card used by Discover + Extensions.
 *  - MangaDexCard — entry to the native MangaDex source screen.
 */

import { useState } from "react";
import { Globe, BookOpen, Plus, ChevronRight, RefreshCw, Sparkles, KeyRound, Trash2 } from "lucide-react";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { testOpdsCatalog, pingServer } from "@/lib/opds";
import {
  FREE_CATALOGS,
  MANGADEX_ID,
  builtinAsServerEntry,
  findAddedServer,
  type BuiltinCatalog,
} from "@/lib/builtin-sources";
import type { TranslationKey } from "@/lib/i18n";

/* ---------------- Standard Ebooks credentials dialog ---------------- */

export function SeAuthDialog({
  open,
  initial,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial?: { user: string; pass: string } | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (auth: { user: string; pass: string }) => void;
}) {
  const { t } = useT();
  const [user, setUser] = useState(initial?.user ?? "");
  const [pass, setPass] = useState(initial?.pass ?? "");

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" role="dialog" aria-modal>
      <div className="w-full max-w-[360px] rounded-3xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-coral-soft text-primary">
            <KeyRound className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold">{t("src.seAuthTitle")}</p>
            <p className="text-[11px] font-semibold text-muted-foreground">standardebooks.org</p>
          </div>
        </div>
        <p className="mt-3 text-[12px] font-semibold leading-relaxed text-muted-foreground">{t("src.seAuthBody")}</p>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder={t("src.seEmail")}
          type="email"
          dir="ltr"
          className="mt-3 h-11 w-full rounded-2xl border border-border bg-background px-4 text-[14px] font-semibold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder={t("src.seToken")}
          type="password"
          dir="ltr"
          className="mt-2 h-11 w-full rounded-2xl border border-border bg-background px-4 text-[14px] font-semibold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
        />
        <p className="mt-2 text-[10.5px] font-semibold text-muted-foreground">{t("src.seAuthHint")}</p>
        <div className="mt-4 flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border bg-background py-2.5 text-[13px] font-extrabold transition-colors hover:bg-secondary"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => onSubmit({ user: user.trim(), pass })}
            disabled={!user.trim() || busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral-gradient py-2.5 text-[13px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)] disabled:opacity-50"
          >
            {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {t("src.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- one free OPDS catalog card ---------------- */

export function FreeCatalogCard({ cat }: { cat: BuiltinCatalog }) {
  const { t } = useT();
  const servers = useApp((s) => s.servers);
  const addServer = useApp((s) => s.addServer);
  const removeServer = useApp((s) => s.removeServer);
  const setServerStatus = useApp((s) => s.setServerStatus);
  const setServerAuth = useApp((s) => s.setServerAuth);
  const push = useNav((s) => s.push);

  const [busy, setBusy] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const added = findAddedServer(servers, cat);

  const addWith = async (auth?: { user: string; pass: string }) => {
    if (busy) return;
    setBusy(true);
    const probe = builtinAsServerEntry(cat, auth ?? null);
    let ok = false;
    try {
      await testOpdsCatalog(probe);
      ok = true;
    } catch {
      ok = false;
    }
    setBusy(false);
    setAuthOpen(false);
    if (!ok) {
      if (cat.needsAuth && !auth) {
        setAuthOpen(true); // 401 → ask for the free-account credentials
      } else {
        toast({ title: t("srv.fail"), description: cat.name, variant: "destructive" });
      }
      return;
    }
    addServer({ name: cat.name, url: cat.url, kind: cat.kind, auth: auth ?? null });
    toast({ title: t("src.addedCatalog"), description: cat.name });
    // persist the verified status on the freshly-added row
    setTimeout(() => {
      const s = useApp.getState().servers;
      const row = [...s].reverse().find((x) => x.url.replace(/\/$/, "") === cat.url.replace(/\/$/, ""));
      if (row) setServerStatus(row.id, "OK");
    }, 0);
  };

  const saveAuth = async (auth: { user: string; pass: string }) => {
    if (!added) {
      await addWith(auth);
      return;
    }
    setBusy(true);
    setServerAuth(added.id, auth);
    const ok = await pingServer({ ...added, auth });
    setServerStatus(added.id, ok ? "OK" : "FAIL");
    setBusy(false);
    setAuthOpen(false);
    toast({
      title: ok ? t("srv.ok") : t("srv.fail"),
      description: cat.name,
      variant: ok ? "default" : "destructive",
    });
  };

  return (
    <>
      <div className="flex items-center gap-3.5 rounded-3xl border border-border/60 bg-card p-3 shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)]">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral-soft text-primary">
          <BookOpen className="h-5.5 w-5.5" />
        </span>
        <button
          onClick={() => {
            if (added) push({ kind: "catalog", serverId: added.id });
            else if (cat.needsAuth) setAuthOpen(true);
            else void addWith();
          }}
          className="min-w-0 flex-1 text-start"
        >
          <span className="flex items-center gap-2 text-[15px] font-extrabold">
            <span className="truncate">{cat.name}</span>
            <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[9.5px] font-black text-primary">
              {cat.kind}
            </span>
          </span>
          <span className="mt-0.5 block line-clamp-2 text-[11.5px] font-semibold leading-snug text-muted-foreground">
            {t(cat.blurbKey as TranslationKey)}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[10.5px] font-bold text-muted-foreground">
            <Globe className="h-3 w-3" />
            <span dir="ltr">{new URL(cat.url).host}</span>
            <span>· {cat.langLabel}</span>
          </span>
        </button>
        {added ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {cat.needsAuth && (
              <button
                onClick={() => setAuthOpen(true)}
                aria-label={t("src.editAuth")}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent"
              >
                <KeyRound className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => {
                removeServer(added.id);
                toast({ title: t("common.delete"), description: cat.name });
              }}
              aria-label={t("common.delete")}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors hover:bg-accent"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => push({ kind: "catalog", serverId: added.id })}
              className="flex h-9 items-center gap-1.5 rounded-full bg-coral-soft px-3.5 text-[12px] font-extrabold text-primary transition-opacity hover:opacity-85"
            >
              {t("src.open")}
              <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              if (cat.needsAuth) setAuthOpen(true);
              else void addWith();
            }}
            disabled={busy}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-coral-gradient px-3.5 text-[12px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.7)] disabled:opacity-60"
          >
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t("src.add")}
          </button>
        )}
      </div>

      <SeAuthDialog
        key={authOpen ? "open" : "closed"}
        open={authOpen}
        busy={busy}
        initial={added?.auth}
        onClose={() => setAuthOpen(false)}
        onSubmit={(auth) => void saveAuth(auth)}
      />
    </>
  );
}

/* ---------------- MangaDex entry card ---------------- */

export function MangaDexCard({ compact }: { compact?: boolean }) {
  const { t } = useT();
  const disabled = useApp((s) => s.builtinDisabled.includes(MANGADEX_ID));
  const works = useApp((s) => s.works);
  const push = useNav((s) => s.push);
  if (disabled) return null;

  const mdWorks = works.filter((w) => w.sourceRef?.sourceId === "mangadex").length;

  return (
    <button
      onClick={() => push({ kind: "source", sourceId: MANGADEX_ID })}
      className="flex w-full items-center gap-3.5 rounded-3xl border border-border/60 bg-card p-3 text-start shadow-[0_8px_20px_-16px_rgba(43,36,29,0.4)] transition-all hover:shadow-[0_12px_26px_-16px_rgba(43,36,29,0.5)]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-coral-gradient text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.7)]">
        <Sparkles className="h-5.5 w-5.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-extrabold">
          <span className="truncate">MangaDex</span>
          <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[9.5px] font-black text-primary">
            JSON API
          </span>
        </span>
        {!compact && (
          <span className="mt-0.5 block line-clamp-2 text-[11.5px] font-semibold leading-snug text-muted-foreground">
            {t("src.mdBlurb")}
          </span>
        )}
        <span className="mt-1 flex items-center gap-1.5 text-[10.5px] font-bold text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span dir="ltr">api.mangadex.org</span>
          <span>· EN</span>
          {mdWorks > 0 && <span>· {t("src.inLibraryCount", { n: mdWorks })}</span>}
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
    </button>
  );
}

/* ---------------- both OPDS catalogs (Discover/Extensions reuse) ---------------- */

export function FreeCatalogList() {
  return (
    <div className="space-y-2.5">
      {FREE_CATALOGS.map((cat) => (
        <FreeCatalogCard key={cat.id} cat={cat} />
      ))}
    </div>
  );
}
