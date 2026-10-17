"use client";

import { useCallback, useState } from "react";
import { Server, MoreVertical, Trash2, RefreshCw, PlugZap, BookOpen, ChevronLeft, Check, Globe } from "lucide-react";
import { OverlayHeader, EmptyState, WorkCover } from "@/components/shared";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  testOpdsCatalog,
  opdsFetchText,
  opdsFetchBinary,
  parseOpdsFeed,
  type OpdsFeed,
  type OpdsEntry,
} from "@/lib/opds";
import { extractArchiveImages, importPdf, importEpub } from "@/lib/importer";
import type { ServerEntry, Work } from "@/lib/types";

/* ============================================================
   ServersScreen — personal servers (v1.2.0: OPDS browse + import)
   ============================================================ */

type Kind = ServerEntry["kind"];

function StatusDot({ status }: { status: ServerEntry["status"] }) {
  return (
    <span
      className={cn(
        "h-2 w-2 shrink-0 rounded-full",
        status === "OK" && "bg-emerald-500",
        status === "FAIL" && "bg-red-500",
        status === "UNKNOWN" && "bg-muted-foreground/40"
      )}
      aria-hidden
    />
  );
}

export function ServersScreen() {
  const { t } = useT();
  const servers = useApp((s) => s.servers);
  const addServer = useApp((s) => s.addServer);
  const removeServer = useApp((s) => s.removeServer);
  const setServerStatus = useApp((s) => s.setServerStatus);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<Kind>("OPDS");
  const [testing, setTesting] = useState(false);
  const [draftResult, setDraftResult] = useState<"OK" | "FAIL" | null>(null);

  /* browse state */
  const [browseFor, setBrowseFor] = useState<ServerEntry | null>(null);
  const [feed, setFeed] = useState<OpdsFeed | null>(null);
  const [feedUrl, setFeedUrl] = useState("");
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);

  const canAdd = name.trim().length > 0 && url.trim().length > 0;

  const runDraftTest = async () => {
    if (testing || !url.trim()) return;
    setTesting(true);
    setDraftResult(null);
    let ok = false;
    try {
      if (kind === "OPDS") {
        await testOpdsCatalog({ id: "draft", name: name.trim(), url: url.trim(), kind, status: "UNKNOWN" });
        ok = true;
      } else {
        // Komga: plain reachability probe
        await opdsFetchText(url.trim().replace(/\/$/, "").concat("/api/v1/libraries?page=0"));
        ok = true;
      }
    } catch {
      ok = false;
    }
    setTesting(false);
    setDraftResult(ok ? "OK" : "FAIL");
    if (ok && kind === "OPDS") {
      // pre-fill a human name from the feed title
      try {
        const feed = parseOpdsFeed(await opdsFetchText(url.trim()), url.trim());
        if (!name.trim() && feed.title) setName(feed.title.slice(0, 40));
      } catch {
        /* name stays */
      }
    }
  };

  const submitAdd = () => {
    if (!canAdd) return;
    addServer({ name: name.trim(), url: url.trim().replace(/\/$/, ""), kind });
    toast({ title: t("srv.add"), description: name.trim() });
    if (draftResult) {
      setTimeout(() => {
        const s = useApp.getState().servers;
        const added = [...s].reverse().find((x) => x.name === name.trim() && x.url === url.trim());
        if (added) setServerStatus(added.id, draftResult);
      }, 0);
    }
    setName("");
    setUrl("");
    setDraftResult(null);
  };

  const testExisting = async (srv: ServerEntry) => {
    toast({ title: t("srv.testing"), description: srv.name });
    let ok = false;
    try {
      if (srv.kind === "OPDS") {
        await testOpdsCatalog(srv);
        ok = true;
      } else {
        await opdsFetchText(srv.url.replace(/\/$/, "").concat("/api/v1/libraries?page=0"));
        ok = true;
      }
    } catch {
      ok = false;
    }
    setServerStatus(srv.id, ok ? "OK" : "FAIL");
    toast({
      title: ok ? t("srv.ok") : t("srv.fail"),
      description: srv.name,
      variant: ok ? "default" : "destructive",
    });
  };

  /* ---------------- OPDS browser ---------------- */

  const loadFeed = useCallback(
    async (srv: ServerEntry, feedAt: string) => {
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const xml = await opdsFetchText(feedAt);
        const parsed = parseOpdsFeed(xml, feedAt);
        setFeed(parsed);
        setFeedUrl(feedAt);
        // lazy covers (small, parallel; failure is cosmetic)
        parsed.entries.slice(0, 18).forEach(async (e) => {
          if (!e.coverUrl) return;
          const f = await opdsFetchBinary(e.coverUrl, "cover");
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
        setBrowseError(t("srv.fail"));
        setServerStatus(srv.id, "FAIL");
      } finally {
        setBrowseLoading(false);
      }
    },
    [t, setServerStatus]
  );

  const openBrowser = (srv: ServerEntry) => {
    setBrowseFor(srv);
    setFeed(null);
    setAddedIds([]);
    void loadFeed(srv, srv.url);
  };

  /** acquisition → work (cbz/cbr → chapter; pdf/epub → document work) */
  const addEntry = async (srv: ServerEntry, entry: OpdsEntry) => {
    if (addingId || !entry.acquisitionUrl) return;
    setAddingId(entry.id);
    try {
      let work: Work | null = null;
      const lower = entry.acquisitionUrl.toLowerCase();
      const isPdf = /\.pdf(\?|$)/.test(lower) || entry.acquisitionMime === "application/pdf";
      const isEpub = /\.epub(\?|$)/.test(lower) || entry.acquisitionMime === "application/epub+zip";

      if (isPdf || isEpub) {
        const f = await opdsFetchBinary(entry.acquisitionUrl, `${entry.title}.${isPdf ? "pdf" : "epub"}`);
        if (!f) throw new Error("download failed");
        work = isPdf ? await importPdf(f) : await importEpub(f);
        if (work) {
          // document metadata yields to the OPDS entry
          work = {
            ...work,
            title: entry.title.slice(0, 120) || work.title,
            author: entry.author || work.author,
            description: entry.summary || work.description,
            tags: Array.from(new Set([...work.tags, "OPDS", srv.name])),
            sourceUrl: entry.acquisitionUrl,
          };
        }
      } else {
        const f = await opdsFetchBinary(entry.acquisitionUrl, `${entry.title}.cbz`);
        if (!f) throw new Error("download failed");
        const res = await extractArchiveImages(f);
        if (!res.ok) throw new Error(res.reason);
        const { putFile } = await import("@/lib/local-files");
        const id = "w-opds-" + Date.now().toString(36);
        const keys: string[] = [];
        let firstCover = "";
        let sizeMb = 0;
        for (let i = 0; i < res.images.length; i++) {
          const key = `${id}::p${i}`;
          try {
            await putFile(key, res.images[i].blob);
          } catch {
            continue;
          }
          sizeMb += res.images[i].blob.size / 1_048_576;
          keys.push(key);
        }
        const { blobToThumbDataUrl } = await import("@/lib/local-files");
        const coverFile = covers[entry.id]
          ? null
          : entry.coverUrl
            ? await opdsFetchBinary(entry.coverUrl, "cover")
            : null;
        firstCover = coverFile
          ? await blobToThumbDataUrl(coverFile).catch(() => "")
          : (covers[entry.id] ?? "");
        if (!firstCover && keys.length > 0) {
          firstCover = await blobToThumbDataUrl(res.images[0].blob).catch(() => "");
        }
        work = {
          id,
          title: entry.title.slice(0, 120),
          author: entry.author || srv.name,
          cover: firstCover,
          type: "MANGA",
          description: entry.summary || `${entry.title} — imported from ${srv.name} (OPDS)`,
          workStatus: "COMPLETED",
          readingStatus: "PLANNED",
          isFavorite: false,
          inVault: false,
          tags: ["OPDS", srv.name],
          rating: 0,
          ratingCount: 0,
          direction: "RTL",
          readerMode: "PAGED",
          fitMode: "WIDTH",
          chapters: [
            {
              id: `${id}-c1`,
              number: 1,
              title: "Pages",
              pages: keys.length,
              releaseDate: new Date().toISOString(),
              isRead: false,
              download: "DONE",
              sizeMb: Math.round(sizeMb * 10) / 10,
            },
          ],
          addedAt: new Date().toISOString(),
          language: "—",
          isLocal: true,
          localPages: keys,
          sourceUrl: entry.acquisitionUrl,
        };
      }

      if (!work) throw new Error("parse failed");
      useApp.getState().addWork(work);
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

  /* ---------------- browser view ---------------- */

  if (browseFor) {
    return (
      <div className="min-h-full px-5 pb-8">
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={() => setBrowseFor(null)}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-extrabold tracking-tight">{browseFor.name}</h1>
            <p className="truncate text-[11px] font-semibold text-muted-foreground" dir="ltr">
              {feedUrl || browseFor.url}
            </p>
          </div>
          <Globe className="h-5 w-5 shrink-0 text-primary" />
        </div>

        {browseLoading && (
          <p className="mt-10 flex items-center justify-center gap-2 text-[13px] font-bold text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" /> {t("srv.browsing")}
          </p>
        )}

        {!browseLoading && browseError && (
          <EmptyState icon={<PlugZap className="h-6 w-6" />} title={browseError} hint={browseFor.url} />
        )}

        {!browseLoading && feed && (
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
                        {e.summary && <p className="mt-0.5 line-clamp-2 text-[10.5px] font-medium leading-snug text-muted-foreground">{e.summary}</p>}
                      </div>
                      <button
                        onClick={() => void addEntry(browseFor, e)}
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
                onClick={() => void loadFeed(browseFor, feed.nextUrl!)}
                disabled={browseLoading}
                className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-border px-5 py-2 text-[12.5px] font-extrabold transition-colors hover:bg-secondary disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3.5 w-3.5 text-primary", browseLoading && "animate-spin")} />
                {t("srv.loadMore")}
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  /* ---------------- main server list ---------------- */

  return (
    <div className="min-h-full px-5 pb-8">
      <OverlayHeader title={t("srv.title")} subtitle={t("srv.subtitle")} />

      {/* info banner */}
      <div className="mt-2 flex items-start gap-2.5 rounded-2xl bg-coral-soft p-4 text-primary">
        <Server className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-[12px] font-semibold leading-relaxed">{t("srv.info")}</p>
      </div>

      {/* add form */}
      <section className="mt-3 rounded-3xl border border-border bg-card p-4">
        <p className="text-[15px] font-extrabold tracking-tight">{t("srv.add")}</p>
        <div className="mt-3 space-y-2.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("srv.name")}
            className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-[14px] font-semibold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("srv.url")}
            type="url"
            dir="ltr"
            className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-[14px] font-semibold outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40"
          />

          {/* kind chips */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-muted-foreground">{t("srv.kind")}:</span>
            {(["OPDS", "KOMGA"] as Kind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-[12px] font-bold transition-all",
                  kind === k
                    ? "bg-coral-gradient text-white shadow-[0_6px_16px_-6px_rgba(248,105,76,0.55)]"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                )}
              >
                {k}
              </button>
            ))}
          </div>

          {/* test result */}
          {testing && (
            <p className="flex items-center gap-1.5 text-[12px] font-bold text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              {t("srv.testing")}
            </p>
          )}
          {!testing && draftResult === "OK" && (
            <p className="text-[12px] font-bold text-emerald-600">✓ {t("srv.ok")}</p>
          )}
          {!testing && draftResult === "FAIL" && (
            <p className="text-[12px] font-bold text-red-600">✕ {t("srv.fail")}</p>
          )}

          {/* actions */}
          <div className="flex gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void runDraftTest()}
              disabled={testing || !url.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background py-2.5 text-[13px] font-extrabold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <PlugZap className="h-4 w-4 text-primary" />
              {t("srv.test")}
            </button>
            <button
              type="button"
              onClick={submitAdd}
              disabled={!canAdd}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-coral-gradient py-2.5 text-[13px] font-extrabold text-white shadow-[0_10px_24px_-10px_rgba(248,105,76,0.6)] transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <Server className="h-4 w-4" />
              {t("srv.add")}
            </button>
          </div>
        </div>
      </section>

      {/* server list */}
      <section className="mt-4">
        {servers.length === 0 ? (
          <EmptyState
            icon={<Server className="h-6 w-6" />}
            title={t("srv.empty")}
            hint={t("srv.emptyHint")}
          />
        ) : (
          <div className="space-y-2.5">
            {servers.map((srv) => (
              <article key={srv.id} className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                  <Server className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[14px] font-extrabold">
                    <span className="truncate">{srv.name}</span>
                    <StatusDot status={srv.status} />
                  </p>
                  <p className="truncate text-[11px] font-semibold text-muted-foreground" dir="ltr">
                    {srv.url}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-coral-soft px-2.5 py-1 text-[10px] font-black text-primary">
                  {srv.kind}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label={t("common.more")}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl">
                    {srv.kind === "OPDS" && (
                      <DropdownMenuItem
                        onClick={() => openBrowser(srv)}
                        className="gap-2 rounded-xl text-[13px] font-semibold"
                      >
                        <BookOpen className="h-4 w-4 text-primary" />
                        {t("srv.browse")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => void testExisting(srv)}
                      className="gap-2 rounded-xl text-[13px] font-semibold"
                    >
                      <PlugZap className="h-4 w-4 text-primary" />
                      {t("srv.test")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        removeServer(srv.id);
                        toast({ title: t("common.delete"), description: srv.name });
                      }}
                      className="gap-2 rounded-xl text-[13px] font-semibold text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("common.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {srv.kind === "OPDS" && (
                  <button
                    onClick={() => openBrowser(srv)}
                    aria-label={t("srv.browse")}
                    className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-coral-soft px-3.5 text-[12px] font-extrabold text-primary transition-opacity hover:opacity-85"
                  >
                    <BookOpen className="h-4 w-4" />
                    {t("srv.browse")}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
