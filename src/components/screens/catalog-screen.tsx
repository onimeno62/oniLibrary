"use client";

/**
 * CatalogScreen (v1.2.2) — browse a REAL configured OPDS/Komga catalog.
 * Replaces the old fake SourceScreen (TITLE_POOL mockup): the feed, covers,
 * entries and acquisition imports are all live, and the search box uses the
 * catalog's OpenSearch endpoint when it exposes one.
 */

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, Globe, RefreshCw, Search, X } from "lucide-react";
import { OverlayHeader, EmptyState } from "@/components/shared";
import { OpdsBrowser } from "@/components/opds/opds-browser";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { toast } from "@/hooks/use-toast";
import { opdsSearchTemplate } from "@/lib/opds";

export function CatalogScreen({ serverId }: { serverId: string }) {
  const { t } = useT();
  const server = useApp((s) => s.servers.find((x) => x.id === serverId));
  const [query, setQuery] = useState("");
  const [searchUrl, setSearchUrl] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const host = useMemo(() => {
    try {
      return new URL(server?.url ?? "").host;
    } catch {
      return server?.url ?? "";
    }
  }, [server?.url]);

  if (!server) {
    return <EmptyState icon={<Globe className="h-6 w-6" />} title={t("common.unknown")} />;
  }

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const template = await opdsSearchTemplate(server);
      if (!template) {
        toast({ title: t("srch.catalogNoSearch"), description: server.name });
        return;
      }
      // swap the browser onto the resolved query URL — OpdsBrowser fetches it
      setSearchUrl(
        template
          .replace(/\{searchTerms\}/g, encodeURIComponent(q))
          .replace(/\{startIndex\}|\{startPage\}/g, "1")
          .replace(/\{count\}/g, "24")
      );
      setResetKey((k) => k + 1);
    } catch {
      toast({ title: t("srv.fail"), description: server.name, variant: "destructive" });
    } finally {
      setSearching(false);
    }
  };

  const backToRoot = () => {
    setSearchUrl(null);
    setQuery("");
    setResetKey((k) => k + 1);
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar px-5 pb-8">
      <OverlayHeader
        right={
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-soft text-primary">
            <Globe className="h-5 w-5" />
          </span>
        }
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[22px] font-black tracking-tight">{server.name}</h1>
          <p className="mt-0.5 truncate text-[12px] font-semibold text-muted-foreground" dir="ltr">
            {host}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-coral-soft px-2.5 py-1 text-[10px] font-black text-primary">
          {server.kind}
        </span>
      </div>

      {/* search (OpenSearch when the catalog exposes it) */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-card px-4 shadow-[0_6px_18px_-12px_rgba(43,36,29,0.35)]">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder={`${t("common.search")} ${server.name}...`}
            className="w-full bg-transparent text-[14px] font-semibold outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label={t("srch.clear")}
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <button
          onClick={() => void runSearch()}
          disabled={searching || !query.trim()}
          aria-label={t("common.search")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-coral-gradient text-white shadow-[0_8px_20px_-10px_rgba(248,105,76,0.7)] transition-transform active:scale-95 disabled:opacity-50"
        >
          {searching ? <RefreshCw className="h-4.5 w-4.5 animate-spin" /> : <Search className="h-4.5 w-4.5" />}
        </button>
      </div>

      {searchUrl && (
        <button
          onClick={backToRoot}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-[12px] font-bold text-secondary-foreground transition-colors hover:bg-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" />
          {t("srch.backToRoot")}
        </button>
      )}

      <div className="mt-2">
        <OpdsBrowser
          key={`${server.id}-${searchUrl ?? "root"}`}
          server={server}
          startUrl={searchUrl ?? server.url}
          resetKey={String(resetKey)}
        />
      </div>
    </div>
  );
}
