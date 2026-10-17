"use client";

/**
 * OpdsBrowser — shared OPDS feed browser (v1.2.2).
 * Extracted from the Servers screen so the Discover catalog screen and the
 * Servers screen render the exact same real feed UI: lazy covers, entry
 * rows, "Load more" (rel=next), one-tap acquisition → library import.
 * Rendering chrome (header/back) belongs to the parent screen.
 */

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Check, RefreshCw } from "lucide-react";
import { WorkCover, EmptyState } from "@/components/shared";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { opdsFetchText, opdsFetchBinary, parseOpdsFeed, authHeaders, type OpdsFeed, type OpdsEntry } from "@/lib/opds";
import { importOpdsEntry } from "@/lib/opds-import";
import type { ServerEntry } from "@/lib/types";

export function OpdsBrowser({
  server,
  startUrl,
  resetKey = "",
}: {
  server: ServerEntry;
  startUrl: string;
  resetKey?: string;
}) {
  const { t } = useT();
  const setServerStatus = useApp((s) => s.setServerStatus);
  const addWork = useApp((s) => s.addWork);

  const [feed, setFeed] = useState<OpdsFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const loadFeed = useCallback(
    async (srv: ServerEntry, feedAt: string) => {
      setLoading(true);
      setError(null);
      try {
        const xml = await opdsFetchText(feedAt, authHeaders(srv.auth));
        const parsed = parseOpdsFeed(xml, feedAt);
        setFeed(parsed);
        // lazy covers (small, parallel; failure is cosmetic)
        parsed.entries.slice(0, 18).forEach(async (e) => {
          if (!e.coverUrl) return;
          const f = await opdsFetchBinary(e.coverUrl, "cover", authHeaders(srv.auth));
          if (!f) return;
          try {
            const { blobToThumbDataUrl } = await import("@/lib/local-files");
            const url = await blobToThumbDataUrl(f);
            if (url) setCovers((c) => ({ ...c, [e.id]: url }));
          } catch {
            /* cosmetic only */
          }
        });
        setServerStatus(srv.id, "OK");
      } catch {
        setFeed(null);
        setError(t("srv.fail"));
        setServerStatus(srv.id, "FAIL");
      } finally {
        setLoading(false);
      }
    },
    [t, setServerStatus]
  );

  /* (re)load when mounted or when the parent swaps the start URL (search).
     Keyed by server.id + startUrl — NOT the server object itself, because
     loadFeed writes the server status back to the store (new object ref). */
  useEffect(() => {
    setFeed(null);
    setAddedIds([]);
    setCovers({});
    void loadFeed(server, startUrl);
  }, [startUrl, resetKey, server.id, loadFeed]);

  const addEntry = async (entry: OpdsEntry) => {
    if (addingId) return;
    setAddingId(entry.id);
    try {
      const work = await importOpdsEntry(server, entry, covers[entry.id]);
      addWork(work);
      setAddedIds((a) => [...a, entry.id]);
      toast({ title: t("imp.added", { n: 1 }), description: entry.title });
    } catch (e) {
      toast({
        title: t("srv.importFail"),
        description: (e as Error).message?.slice(0, 80),
        variant: "destructive",
      });
    } finally {
      setAddingId(null);
    }
  };

  if (loading && !feed) {
    return (
      <p className="mt-10 flex items-center justify-center gap-2 text-[13px] font-bold text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> {t("srv.browsing")}
      </p>
    );
  }

  if (error) {
    return <EmptyState icon={<BookOpen className="h-6 w-6" />} title={error} hint={server.url} />;
  }

  if (!feed) return null;

  return (
    <>
      {feed.entries.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-6 w-6" />} title={t("srv.emptyFeed")} />
      ) : (
        <div className="mt-3 space-y-2.5">
          {feed.entries.map((e) => {
            const added = addedIds.includes(e.id);
            return (
              <article key={e.id} className="flex items-center gap-3 rounded-3xl border border-border bg-card p-3">
                <WorkCover
                  src={covers[e.id] ?? ""}
                  color="from-orange-500 to-rose-900"
                  title={e.title}
                  className="h-[64px] w-[46px] shrink-0 rounded-xl"
                  sizes="46px"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-extrabold">{e.title}</p>
                  {e.author && <p className="truncate text-[11px] font-semibold text-muted-foreground">{e.author}</p>}
                  {e.summary && (
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] font-medium leading-snug text-muted-foreground">{e.summary}</p>
                  )}
                </div>
                <button
                  onClick={() => void addEntry(e)}
                  disabled={addingId === e.id || added || !e.acquisitionUrl}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-extrabold transition-all",
                    added
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                      : "bg-coral-gradient text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.7)] disabled:opacity-60"
                  )}
                >
                  {added ? (
                    <>
                      <Check className="h-3.5 w-3.5" strokeWidth={3} /> {t("srv.added")}
                    </>
                  ) : addingId === e.id ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    t("srv.browseAdd")
                  )}
                </button>
              </article>
            );
          })}
        </div>
      )}
      {feed.nextUrl && (
        <button
          onClick={() => void loadFeed(server, feed.nextUrl!)}
          disabled={loading}
          className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-border px-5 py-2 text-[12.5px] font-extrabold transition-colors hover:bg-secondary disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5 text-primary", loading && "animate-spin")} />
          {t("srv.loadMore")}
        </button>
      )}
    </>
  );
}
