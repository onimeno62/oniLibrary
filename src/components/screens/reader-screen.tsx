"use client";

/* ============================================================
   oniLibrary — READER SCREEN (Task 2-a)
   Paged / double / continuous / webtoon engine (PRD §8):
   RDR-001 modes · RDR-002 direction · RDR-003 fit · RDR-004
   zoom · RDR-005 jump + chapter list · RDR-006 progress
   persistence · RDR-007 per-series settings · RDR-009
   brightness/background/keep-awake · RDR-011 chapter end card ·
   RDR-013 bookmarks · RDR-014 presets.
   ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ALargeSmall,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  CirclePlay,
  Download,
  Ellipsis,
  ImageOff,
  List,
  Loader2,
  MoreVertical,
  MoveHorizontal,
  RotateCw,
  Settings,
  SkipBack,
  SkipForward,
  Sun,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { MangaPage, hashStr } from "@/lib/manga-page";
import { PdfCanvas } from "@/components/pdf-view";
import { useApp, useNav } from "@/lib/store";
import { useT } from "@/lib/use-app";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";
import { EpubBookView } from "@/components/screens/epub-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FitMode, ReaderMode, ReadingDirection } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

type BgName = "black" | "gray" | "white" | "sepia";

const BG_HEX: Record<BgName, string> = {
  black: "#000000",
  gray: "#2e2c2a",
  white: "#ffffff",
  sepia: "#f4ead3",
};

/** how the page element sizes itself inside a slide (RDR-003) */
const FIT_CLASS: Record<FitMode, string> = {
  WIDTH: "block w-full h-auto",
  HEIGHT: "block h-full w-auto",
  SCREEN: "block h-full w-full object-contain",
  ORIGINAL: "block h-[1200px] w-[800px] max-w-none",
};

interface ChapterLite {
  id: string;
  number: number;
  title: string;
  isRead: boolean;
}

/* ------------------------------------------------------------------ */
/* small UI atoms                                                      */
/* ------------------------------------------------------------------ */

function CtrlBtn({
  icon: Icon,
  label,
  active,
  ...props
}: { icon: LucideIcon; label: string; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={cn("flex flex-col items-center gap-1 py-0.5", props.className)}>
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
          active ? "bg-coral-gradient text-white shadow-[0_8px_20px_-8px_rgba(248,105,76,0.9)]" : "bg-white/8 text-white/90 hover:bg-white/15"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="max-w-[76px] truncate text-[10px] font-semibold text-white/60">{label}</span>
    </button>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  active,
  ...props
}: { icon: LucideIcon; label: string; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...props} className={cn("flex flex-col items-center gap-1.5", props.className)}>
      <span
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
          active ? "bg-coral-gradient text-white" : "bg-white/8 text-white/90 hover:bg-white/15"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="max-w-[64px] truncate text-[10px] font-semibold text-white/60">{label}</span>
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all",
        active
          ? "bg-coral-gradient text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)]"
          : "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      {children}
    </button>
  );
}

function SheetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-bold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* local page (IndexedDB object URLs)                                  */
/* ------------------------------------------------------------------ */

function LocalPageImage({ storageKey, className }: { storageKey: string; className?: string }) {
  const { t } = useT();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    setFailed(false);
    (async () => {
      try {
        const { loadPageUrl } = await import("@/lib/importer");
        const u = await loadPageUrl(storageKey);
        if (!alive) {
          if (u) URL.revokeObjectURL(u);
          return;
        }
        if (u) {
          made = u;
          setUrl(u);
        } else {
          setFailed(true);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [storageKey]);

  if (failed) {
    return (
      <div className={cn("flex w-full flex-col items-center justify-center gap-2 bg-[#151312] p-6 text-center", className)}>
        <ImageOff className="h-8 w-8 text-white/25" />
        <p className="text-[13px] font-bold text-white/70">{t("rdr.localMissing")}</p>
        <p className="text-[11px] font-semibold text-white/40">{t("rdr.localMissingHint")}</p>
      </div>
    );
  }
  if (!url) {
    return (
      <div className={cn("flex w-full items-center justify-center bg-[#151312]", className)}>
        <Loader2 className="h-7 w-7 animate-spin text-white/35" />
      </div>
    );
  }
  return (
    <img src={url} alt="" draggable={false} className={className} />
  );
}

/* ------------------------------------------------------------------ */
/* ReaderScreen                                                        */
/* ------------------------------------------------------------------ */

export function ReaderScreen({
  workId,
  chapterId,
  startPage,
}: {
  workId: string;
  chapterId: string;
  startPage?: number;
}) {
  const { t } = useT();

  /* ----- store ----- */
  const work = useApp((s) => s.works.find((w) => w.id === workId));
  const chapter = useApp((s) =>
    s.works.find((w) => w.id === workId)?.chapters.find((c) => c.id === chapterId)
  );
  const readerDefaults = useApp((s) => s.settings.readerDefaults);
  const bookmarks = useApp((s) => s.bookmarks);
  const pop = useNav((s) => s.pop);
  const updateWork = useApp((s) => s.updateWork);
  const setReaderDefaults = useApp((s) => s.setReaderDefaults);
  const markChapterRead = useApp((s) => s.markChapterRead);
  const addBookmark = useApp((s) => s.addBookmark);
  const removeBookmark = useApp((s) => s.removeBookmark);
  const startDownload = useApp((s) => s.startDownload);

  /** restored page index for the initially opened chapter (RDR-006) */
  const initial = useMemo(() => {
    const ch = useApp
      .getState()
      .works.find((x) => x.id === workId)
      ?.chapters.find((c) => c.id === chapterId);
    const t = ch?.pages ?? 0;
    let p = 0;
    if (typeof ch?.lastPage === "number" && ch.lastPage > 0) {
      p = ch.lastPage <= 1 ? Math.round(ch.lastPage * t) : Math.round(ch.lastPage);
    }
    return Math.max(0, Math.min(Math.max(0, t - 1), p));
  }, []);

  /* ----- local ui state ----- */
  const [page, setPage] = useState(initial);
  // commanded scroll target (slider / nav / chapter restore) — vs. user scrolling
  const [scrollCmd, setScrollCmd] = useState<{ page: number } | null>(
    initial > 0 ? { page: initial } : null
  );
  const [controlsVisible, setControlsVisible] = useState(true);
  const [endCard, setEndCard] = useState(false);
  const [zoom, setZoom] = useState(1); // 1 → 1.5 → 2 (RDR-004)
  const [rotate, setRotate] = useState(0); // 0/90/180/270
  const [autoPlay, setAutoPlay] = useState(false);
  const [chapterSheet, setChapterSheet] = useState(false);
  const [settingsSheet, setSettingsSheet] = useState(false);
  const [brightOpen, setBrightOpen] = useState(false);

  /* ----- refs ----- */
  const contentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef(0);
  const lastTapRef = useRef(0);
  const pendingNavRef = useRef(0);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  /* ----- derived ----- */
  const total = Math.max(0, chapter?.pages ?? 0);
  const direction: ReadingDirection = work?.direction ?? "LTR";
  const rtl = direction === "RTL";
  const vertical = direction === "VERTICAL";
  const requestedMode: ReaderMode = work?.readerMode ?? readerDefaults.mode;
  const isEpub = work?.type === "EPUB" && work?.localPages?.[0] === "epub";
  const isPdf = work?.type === "PDF" && work?.localPages?.[0] === "pdf";
  const epubFontSize = readerDefaults.epubFontSize ?? 16;

  const [landscape, setLandscape] = useState(false);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const update = () => setLandscape(el.clientWidth > el.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // DOUBLE falls back to PAGED on portrait containers
  const mode: ReaderMode = requestedMode === "DOUBLE" && !landscape ? "PAGED" : requestedMode;
  const paged = mode === "PAGED" || mode === "DOUBLE";
  const scrollable = mode === "CONTINUOUS" || mode === "WEBTOON";
  const isLocal = Boolean(work?.isLocal && work.localPages?.length);

  const chaptersAsc = useMemo<ChapterLite[]>(
    () =>
      work
        ? [...work.chapters]
            .sort((a, b) => a.number - b.number)
            .map((c) => ({ id: c.id, number: c.number, title: c.title, isRead: c.isRead }))
        : [],
    [work]
  );
  const chaptersDesc = useMemo(() => [...chaptersAsc].reverse(), [chaptersAsc]);
  const curIdx = chaptersAsc.findIndex((c) => c.id === chapterId);
  const prevChapter = curIdx > 0 ? chaptersAsc[curIdx - 1] : undefined;
  const nextChapter = curIdx >= 0 && curIdx < chaptersAsc.length - 1 ? chaptersAsc[curIdx + 1] : undefined;

  const currentBookmark = bookmarks.find(
    (b) => b.workId === workId && b.chapterId === chapterId && b.page === page
  );

  /* ----- reset per-chapter state when the chapter changes -----
     (React "adjust state when props change" pattern — runs during render) */
  const navKey = `${workId}#${chapterId}${typeof startPage === "number" ? `#p${startPage}` : ""}`;
  const [stateKey, setStateKey] = useState(navKey);
  if (stateKey !== navKey) {
    setStateKey(navKey);
    const t = chapter?.pages ?? 0;
    let p = 0;
    if (typeof startPage === "number" && startPage > 0) {
      p = startPage;
    } else if (typeof chapter?.lastPage === "number" && chapter.lastPage > 0) {
      p = chapter.lastPage <= 1 ? Math.round(chapter.lastPage * t) : Math.round(chapter.lastPage);
    }
    p = Math.max(0, Math.min(Math.max(0, t - 1), p));
    setPage(p);
    setEndCard(false);
    setControlsVisible(true);
    setZoom(1);
    setRotate(0);
    setAutoPlay(false);
    setScrollCmd({ page: p });
  }

  /* ----- progress persistence: page ratio on every page change (manga modes) ----- */
  useEffect(() => {
    if (total <= 0 || isEpub) return; // epub view manages its own scroll-ratio progress
    useApp.getState().setChapterProgress(workId, chapterId, Math.min(1, page / total));
  }, [page, total, workId, chapterId, isEpub]);

  /* ----- history entry per opened chapter ----- */
  useEffect(() => {
    useApp.getState().pushHistory(workId, chapterId, page);
  }, [workId, chapterId]);

  /* ----- reading-time log every 60s while open ----- */
  useEffect(() => {
    const id = window.setInterval(() => useApp.getState().logReading(workId, 1, 0), 60_000);
    return () => window.clearInterval(id);
  }, [workId]);

  /* ----- mark chapter read when it was fully seen and we leave it -----
     (the persisted lastPage ratio reaching the final page counts as "seen all") */
  useEffect(() => {
    const wid = workId;
    const cid = chapterId;
    return () => {
      const st = useApp.getState();
      const ch = st.works.find((x) => x.id === wid)?.chapters.find((c) => c.id === cid);
      if (!ch || ch.pages <= 0) return;
      const seenAll = typeof ch.lastPage === "number" && ch.lastPage >= (ch.pages - 1) / ch.pages - 1e-6;
      if (seenAll) st.markChapterRead(wid, cid, true);
    };
  }, [workId, chapterId]);

  /* ----- controls auto-hide (UX-005) ----- */
  useEffect(() => {
    if (!controlsVisible || endCard || chapterSheet || settingsSheet || brightOpen) return;
    const id = window.setTimeout(() => setControlsVisible(false), 4200);
    return () => window.clearTimeout(id);
  }, [controlsVisible, endCard, chapterSheet, settingsSheet, brightOpen, page]);

  /* ----- navigation ----- */
  const goToPage = (p: number) => {
    if (total <= 0) return;
    const c = Math.max(0, Math.min(total - 1, p));
    setEndCard(false);
    setPage(c);
  };

  const openChapter = (targetId: string, atEnd = false) => {
    setChapterSheet(false);
    setEndCard(false);
    setAutoPlay(false);
    if (atEnd) {
      // resume the previous chapter at its final page
      const st = useApp.getState();
      const ch = st.works.find((x) => x.id === workId)?.chapters.find((c) => c.id === targetId);
      if (ch) st.setChapterProgress(workId, targetId, 1);
    }
    // replace the top of the nav stack (details stays underneath)
    useNav.setState((st) => ({
      stack: [...st.stack.slice(0, -1), { kind: "reader" as const, workId, chapterId: targetId }],
    }));
  };

  const next = (forced = false) => {
    if (total <= 0) return;
    if (scrollable) {
      const p = Math.min(total - 1, page + 1);
      goToPage(p);
      setScrollCmd({ page: p });
      return;
    }
    const step = mode === "DOUBLE" ? 2 : 1;
    if (page + step <= total - 1) {
      goToPage(page + step);
      return;
    }
    if (nextChapter && (forced || readerDefaults.autoNext)) {
      openChapter(nextChapter.id); // RDR-011 auto-advance
    } else {
      setEndCard(true);
    }
  };

  const prev = () => {
    if (total <= 0) return;
    if (scrollable) {
      const p = Math.max(0, page - 1);
      goToPage(p);
      setScrollCmd({ page: p });
      return;
    }
    const step = mode === "DOUBLE" ? 2 : 1;
    if (page - step >= 0) {
      goToPage(page - step);
    } else if (prevChapter) {
      openChapter(prevChapter.id, true);
    }
  };

  const nextRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    nextRef.current = () => next(false);
  });

  useEffect(() => {
    if (!autoPlay) return;
    const id = window.setInterval(() => nextRef.current(), 3200);
    return () => window.clearInterval(id);
  }, [autoPlay]);

  /* ----- keyboard: direction-aware arrows (Escape handled by app shell) ----- */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight") {
        if (rtl) prev();
        else next();
      } else if (e.key === "ArrowLeft") {
        if (rtl) next();
        else prev();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  });

  /* ----- continuous scroll → current page (rAF throttled) ----- */
  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      const sc = scrollRef.current;
      if (!sc) return;
      const mid = sc.scrollTop + sc.clientHeight / 2;
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      anchorsRef.current.forEach((a, i) => {
        if (!a) return;
        const d = Math.abs(a.offsetTop + a.offsetHeight / 2 - mid);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setPage((cur) => (cur === best ? cur : best));
    });
  };
  useEffect(
    () => () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    },
    []
  );

  // commanded scrolling (slider / chapter restore / next-prev in scrollable modes);
  // fires once per command object identity — user scrolling never sets scrollCmd
  useEffect(() => {
    if (!scrollable || !scrollCmd) return;
    const el = anchorsRef.current[scrollCmd.page];
    const sc = scrollRef.current;
    if (el && sc) sc.scrollTo({ top: Math.max(0, el.offsetTop - 8) });
  }, [scrollCmd, scrollable]);

  /* ----- zoom (double-tap + button) ----- */
  const cycleZoom = () => {
    setZoom((z) => (z === 1 ? 1.5 : z === 1.5 ? 2 : 1));
    setControlsVisible(true);
  };

  /* ----- tap zones: center toggles chrome, sides flip pages (UX-005) ----- */
  const handleZone = (zone: "start" | "center" | "end") => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      // double tap → zoom toggle (RDR-004)
      lastTapRef.current = 0;
      if (pendingNavRef.current) {
        window.clearTimeout(pendingNavRef.current);
        pendingNavRef.current = 0;
      }
      cycleZoom();
      return;
    }
    lastTapRef.current = now;
    if (pendingNavRef.current) window.clearTimeout(pendingNavRef.current);
    pendingNavRef.current = window.setTimeout(() => {
      pendingNavRef.current = 0;
      if (zone === "center") {
        setControlsVisible((v) => !v);
        return;
      }
      if (vertical || scrollable) return;
      const forward = rtl ? zone === "start" : zone === "end";
      if (forward) next();
      else prev();
    }, 280);
  };

  /* ----- bookmarks (RDR-013) ----- */
  const toggleBookmark = () => {
    const st = useApp.getState();
    const bm = st.bookmarks.find(
      (b) => b.workId === workId && b.chapterId === chapterId && b.page === page
    );
    if (bm) {
      st.removeBookmark(bm.id);
      toast({ title: t("rdr.bookmarkRemoved") });
    } else {
      st.addBookmark(workId, chapterId, page);
      toast({ title: t("rdr.bookmarkAdded") });
    }
  };

  /* ----- keep awake (RDR-009) ----- */
  const applyKeepAwake = (v: boolean) => {
    setReaderDefaults({ keepAwake: v });
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: string) => Promise<{ release: () => Promise<void> }> };
      };
      if (v) {
        nav.wakeLock
          ?.request("screen")
          .then((s) => {
            wakeLockRef.current = s;
          })
          .catch(() => undefined);
      } else {
        void wakeLockRef.current?.release().catch(() => undefined);
        wakeLockRef.current = null;
      }
    } catch {
      /* wakeLock unsupported — ignore */
    }
  };

  /* ----- presets (RDR-014): documented combos ----- */
  const PRESETS: { key: TranslationKey; apply: () => void }[] = [
    {
      // Manga: RTL paged, black bg
      key: "rdr.preset.manga",
      apply: () => {
        updateWork(workId, { readerMode: "PAGED", direction: "RTL", fitMode: "WIDTH" });
        setReaderDefaults({ bg: "black", brightness: 100, autoNext: false, cropBorders: false });
      },
    },
    {
      // Western comics: LTR paged, white bg
      key: "rdr.preset.comics",
      apply: () => {
        updateWork(workId, { readerMode: "PAGED", direction: "LTR", fitMode: "WIDTH" });
        setReaderDefaults({ bg: "white", brightness: 100, autoNext: false, cropBorders: false });
      },
    },
    {
      // Webtoon: vertical continuous, no gaps
      key: "rdr.preset.webtoon",
      apply: () => {
        updateWork(workId, { readerMode: "WEBTOON", direction: "VERTICAL", fitMode: "WIDTH" });
        setReaderDefaults({ bg: "black", brightness: 100, autoNext: true, cropBorders: false });
      },
    },
    {
      // One-handed: larger pages, fewer taps, auto-advance on
      key: "rdr.preset.oneHand",
      apply: () => {
        updateWork(workId, { readerMode: "PAGED", direction: "RTL", fitMode: "SCREEN" });
        setReaderDefaults({ bg: "gray", brightness: 85, autoNext: true, cropBorders: true });
      },
    },
  ];

  /* ------------------------------------------------------------------ */
  /* guards                                                              */
  /* ------------------------------------------------------------------ */
  if (!work || !chapter) {
    return (
      <div className="dark relative flex h-full flex-col overflow-hidden bg-background text-foreground">
        <div className="flex items-center p-4">
          <button
            onClick={pop}
            aria-label={t("common.back")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
          >
            <ChevronLeft className="h-6 w-6 rtl:rotate-180" />
          </button>
        </div>
        <p className="mt-24 text-center text-sm font-semibold text-muted-foreground">{t("common.unknown")}</p>
      </div>
    );
  }

  const crop = readerDefaults.cropBorders;
  const dim = ((100 - readerDefaults.brightness) / 100) * 0.7;
  const fit = work.fitMode;

  /* ----- single page element (generated SVG, local image or pdf canvas) ----- */
  const renderPageEl = (i: number, fitOverride?: string) => {
    const cls = fitOverride ?? FIT_CLASS[fit];
    if (isPdf) {
      return <PdfCanvas workId={work.id} page={i + 1} className={cls} />;
    }
    if (isLocal && work.localPages?.[i]) {
      return <LocalPageImage storageKey={work.localPages[i]} className={cls} />;
    }
    return (
      <MangaPage
        seed={hashStr(work.id)}
        pageNumber={i + 1}
        totalPages={total}
        workTitle={work.title}
        chapterTitle={chapter.title}
        className={cls}
      />
    );
  };

  /* ----- one slide of the paged track ----- */
  const renderSlide = (i: number) => {
    const pageTf = `rotate(${rotate}deg)${crop ? " scale(1.04)" : ""}`;
    if (zoom > 1 || fit === "ORIGINAL") {
      // zoomed / original: layout-sized child inside an overflow-auto container so it can be panned
      return (
        <div
          className="absolute inset-0 overflow-auto no-scrollbar"
          onDoubleClick={cycleZoom}
        >
          <div
            className={cn("mx-auto", fit === "ORIGINAL" && zoom === 1 && "w-max py-4")}
            style={fit === "ORIGINAL" && zoom === 1 ? undefined : { width: `${zoom * 100}%` }}
          >
            <div className="origin-center" style={{ transform: pageTf }}>
              {renderPageEl(i, zoom > 1 ? "block w-full h-auto" : undefined)}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className={cn("origin-center transition-transform duration-200", FIT_CLASS[fit])} style={{ transform: pageTf }}>
          {renderPageEl(i)}
        </div>
      </div>
    );
  };

  /* ----- paged track (RDR-001/002: snap + direction aware) ----- */
  const slideIndex = mode === "DOUBLE" ? Math.floor(page / 2) : page;
  const slideCount = mode === "DOUBLE" ? Math.ceil(total / 2) : total;

  const pagedView = (
    <div key={`${chapterId}-${mode}`} className="absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${(rtl ? slideIndex : -slideIndex) * 100}%)` }}
      >
        {Array.from({ length: slideCount }, (_, i) => (
          <div key={i} className="absolute inset-y-0 w-full" style={{ left: `${(rtl ? -i : i) * 100}%` }}>
            {Math.abs(i - slideIndex) <= 2 ? ( // preload ±2 (RDR-012)
              mode === "DOUBLE" ? (
                <div className={cn("flex h-full w-full", rtl && "flex-row-reverse")}>
                  <div className="relative h-full w-1/2">{i * 2 < total ? renderSlide(i * 2) : null}</div>
                  <div className="relative h-full w-1/2">{i * 2 + 1 < total ? renderSlide(i * 2 + 1) : null}</div>
                </div>
              ) : (
                renderSlide(i)
              )
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );

  /* ----- continuous / webtoon vertical scroll ----- */
  const scrollView = (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={cn(
        "absolute inset-0 overflow-y-auto no-scrollbar",
        mode === "CONTINUOUS" && "space-y-2.5 py-2.5"
      )}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            anchorsRef.current[i] = el;
          }}
        >
          {/* vertical modes always width-fit so anchors have real height */}
          {renderPageEl(i, "block w-full h-auto")}
        </div>
      ))}
    </div>
  );

  const barPos = controlsVisible ? "translate-y-0 opacity-100" : "pointer-events-none opacity-0";
  const sliderMax = Math.max(0, total - 1);
  // when the page can be panned, side tap zones must not eat the gestures
  const panBlock = zoom > 1 || fit === "ORIGINAL";

  return (
    <div className="dark relative flex h-full flex-col overflow-hidden bg-background text-foreground">
      {/* ============ content area (full bleed) ============ */}
      <div
        ref={contentRef}
        className="relative flex-1 overflow-hidden"
        style={{ backgroundColor: BG_HEX[readerDefaults.bg] }}
      >
        {/* ============ content ============ */}
        {isEpub ? (
          <EpubBookView
            work={work!}
            chapterId={chapterId}
            fontSize={epubFontSize}
            font={readerDefaults.epubFont ?? "serif"}
            theme={readerDefaults.epubTheme ?? "dark"}
          />
        ) : scrollable && !isPdf ? (
          scrollView
        ) : scrollable && isPdf ? (
          /* PDF vertical scroll: same anchors but sized canvases */
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className={cn("absolute inset-0 overflow-y-auto no-scrollbar", mode === "CONTINUOUS" && "space-y-2.5 bg-[#151312] py-2.5")}
          >
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                ref={(el) => {
                  anchorsRef.current[i] = el;
                }}
              >
                <PdfCanvas workId={work.id} page={i + 1} className="block w-full" />
              </div>
            ))}
          </div>
        ) : (
          pagedView
        )}

        {/* epub: top strip toggles chrome without blocking text scrolling */}
        {isEpub && (
          <button
            type="button"
            aria-label={t("common.more")}
            className="absolute inset-x-0 top-0 z-10 h-[16%]"
            onClick={() => setControlsVisible((v) => !v)}
          />
        )}
        {/* tap zones (none in webtoon; sides disabled while panning) */}
        {!vertical && !scrollable && (
          <div className="absolute inset-0 z-10 flex">
            <button
              type="button"
              tabIndex={-1}
              aria-label={rtl ? t("rdr.next") : t("rdr.previous")}
              className={cn("h-full w-1/3", panBlock && "pointer-events-none")}
              onClick={() => handleZone("start")}
            />
            <button
              type="button"
              aria-label={t("common.close")}
              className="h-full flex-1"
              onClick={() => handleZone("center")}
            />
            <button
              type="button"
              tabIndex={-1}
              aria-label={rtl ? t("rdr.previous") : t("rdr.next")}
              className={cn("h-full w-1/3", panBlock && "pointer-events-none")}
              onClick={() => handleZone("end")}
            />
          </div>
        )}
        {scrollable && zoom === 1 && !isEpub && (
          <button
            type="button"
            aria-label={t("common.more")}
            className="absolute inset-x-0 top-0 z-10 h-[16%]"
            onClick={() => setControlsVisible((v) => !v)}
          />
        )}

        {/* brightness dim overlay (RDR-009) */}
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-black transition-opacity duration-200"
          style={{ opacity: dim }}
        />
      </div>

      {/* ============ offline badge ============ */}
      {chapter.download === "DONE" && (
        <div
          className={cn(
            "absolute right-3 top-14 z-30 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-bold text-white/85 backdrop-blur transition-opacity duration-300",
            controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <Download className="h-3 w-3" />
          {t("rdr.offlineReading")}
        </div>
      )}

      {/* ============ top bar (auto-hide) ============ */}
      <header
        className={cn(
          "absolute inset-x-0 top-0 z-40 flex items-center justify-between bg-gradient-to-b from-black/85 via-black/45 to-transparent px-2 pb-7 pt-2 transition-all duration-300",
          barPos,
          !controlsVisible && "-translate-y-full"
        )}
      >
        <button
          onClick={pop}
          aria-label={t("common.back")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
        >
          <ChevronLeft className="h-6 w-6 rtl:rotate-180" />
        </button>

        <div className="pointer-events-none absolute left-1/2 top-1.5 -translate-x-1/2 text-center">
          <p className="text-[15px] font-extrabold leading-tight text-white">
            {t("common.chapter")} {chapter.number}
          </p>
          <p className="max-w-[230px] truncate text-[11px] font-semibold text-white/55">{chapter.title}</p>
        </div>

        <div className="flex items-center">
          <button
            onClick={() => setSettingsSheet(true)}
            aria-label={t("rdr.readingMode")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={toggleBookmark}
            aria-label={t("rdr.bookmarkAdded")}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
          >
            <Bookmark className={cn("h-5 w-5", currentBookmark && "fill-primary text-primary")} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={t("common.more")}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/15"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="dark rounded-2xl border-border">
              <DropdownMenuItem
                onClick={() => markChapterRead(workId, chapterId, !chapter.isRead, true)}
                className="gap-2.5 rounded-xl text-[13px] font-semibold"
              >
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {chapter.isRead ? t("upd.markUnread") : t("upd.markRead")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  startDownload(workId, chapterId);
                  toast({ title: `${t("det.download")} · ${t("common.chapter")} ${chapter.number}` });
                }}
                className="gap-2.5 rounded-xl text-[13px] font-semibold"
              >
                <Download className="h-4 w-4 text-primary" />
                {t("det.download")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ============ bottom overlay (auto-hide) ============ */}
      <footer
        className={cn(
          "absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pt-10 transition-all duration-300",
          barPos,
          !controlsVisible && "translate-y-full"
        )}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        {/* slider row (EPUB: chapter navigation) */}
        <div className="flex items-center gap-3">
          {isEpub && work ? (
            <>
              <Slider
                value={[curIdx]}
                min={0}
                max={Math.max(0, chaptersAsc.length - 1)}
                step={1}
                aria-label={t("rdr.chapterList")}
                onValueChange={(v) => {
                  const idx = v[0] ?? 0;
                  const target = chaptersAsc[idx];
                  if (target && target.id !== chapterId) openChapter(target.id);
                }}
                className={cn(
                  "flex-1",
                  "[&_[data-slot=slider-track]]:bg-white/15",
                  "[&_[data-slot=slider-range]]:bg-[#f8694c]",
                  "[&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-[#f8694c] [&_[data-slot=slider-thumb]]:bg-[#f8694c]"
                )}
              />
              <span className="min-w-14 text-end text-[13px] font-extrabold text-white">
                {t("rdr.pageOf", { p: Math.max(1, curIdx + 1), t: chaptersAsc.length })}
              </span>
            </>
          ) : (
            <>
              {total > 0 && (
                <Slider
                  value={[Math.min(page, sliderMax)]}
                  min={0}
                  max={sliderMax}
                  step={1}
                  aria-label={t("rdr.slider")}
                  onValueChange={(v) => {
                    const p = v[0] ?? 0;
                    goToPage(p);
                    if (scrollable) setScrollCmd({ page: p });
                  }}
                  className={cn(
                    "flex-1",
                    "[&_[data-slot=slider-track]]:bg-white/15",
                    "[&_[data-slot=slider-range]]:bg-[#f8694c]",
                    "[&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-[#f8694c] [&_[data-slot=slider-thumb]]:bg-[#f8694c]"
                  )}
                />
              )}
              <span className="min-w-14 text-end text-[13px] font-extrabold text-white">
                {t("rdr.pageOf", { p: page + 1, t: total })}
              </span>
            </>
          )}
        </div>

        {/* controls row */}
        <div className="mt-2 grid grid-cols-4 justify-items-center">
          <CtrlBtn
            icon={SkipBack}
            label={t("rdr.previous")}
            onClick={() => (isEpub ? prevChapter && openChapter(prevChapter.id) : prev())}
            aria-label={t("rdr.previous")}
            disabled={isEpub && !prevChapter}
          />
          {!isEpub && (
            <CtrlBtn
              icon={CirclePlay}
              label={t("rdr.auto")}
              active={autoPlay}
              onClick={() => setAutoPlay((v) => !v)}
              aria-label={t("rdr.auto")}
            />
          )}
          {isEpub && (
            <CtrlBtn
              icon={ALargeSmall}
              label={t("rdr.textSize")}
              onClick={() => {
                const next = epubFontSize >= 22 ? 14 : epubFontSize + 2;
                useApp.getState().setReaderDefaults({ epubFontSize: next });
                toast({ title: `${t("rdr.textSize")}: ${next}px` });
              }}
              aria-label={t("rdr.textSize")}
            />
          )}
          <CtrlBtn
            icon={List}
            label={t("rdr.chapterList")}
            onClick={() => setChapterSheet(true)}
            aria-label={t("rdr.chapterList")}
          />
          <CtrlBtn
            icon={SkipForward}
            label={t("rdr.next")}
            onClick={() => (isEpub ? nextChapter && openChapter(nextChapter.id) : next(true))}
            aria-label={t("rdr.next")}
            disabled={isEpub && !nextChapter}
          />
        </div>

        {/* toolbar row */}
        <div className="mt-2 flex items-start justify-between px-1">
          <ToolbarBtn
            icon={MoveHorizontal}
            label={t(`rdr.fit.${fit}` as TranslationKey)}
            onClick={() => {
              const order: FitMode[] = ["WIDTH", "HEIGHT", "SCREEN", "ORIGINAL"];
              const nxt = order[(order.indexOf(fit) + 1) % order.length];
              updateWork(workId, { fitMode: nxt });
            }}
            aria-label={t("rdr.fit")}
          />
          <ToolbarBtn
            icon={ZoomIn}
            label={zoom > 1 ? `${zoom}×` : t("rdr.zoom")}
            active={zoom > 1}
            onClick={cycleZoom}
            aria-label={t("rdr.zoom")}
          />
          <ToolbarBtn
            icon={RotateCw}
            label={t("rdr.rotate")}
            onClick={() => setRotate((r) => (r + 90) % 360)}
            aria-label={t("rdr.rotate")}
          />
          <Popover open={brightOpen} onOpenChange={setBrightOpen}>
            <PopoverTrigger asChild>
              <ToolbarBtn icon={Sun} label={t("rdr.brightness")} active={brightOpen} aria-label={t("rdr.brightness")} />
            </PopoverTrigger>
            <PopoverContent side="top" align="center" className="dark w-[230px] rounded-2xl border-border bg-popover p-4">
              <p className="mb-3 flex items-center gap-1.5 text-[12px] font-bold text-foreground">
                <Sun className="h-3.5 w-3.5 text-primary" />
                {t("rdr.brightnessLabel")}
                <span className="ms-auto text-[11px] font-extrabold text-muted-foreground">{readerDefaults.brightness}%</span>
              </p>
              <Slider
                value={[readerDefaults.brightness]}
                min={30}
                max={100}
                step={1}
                aria-label={t("rdr.brightnessLabel")}
                onValueChange={(v) => setReaderDefaults({ brightness: v[0] ?? 100 })}
              />
            </PopoverContent>
          </Popover>
          <ToolbarBtn
            icon={Ellipsis}
            label={t("rdr.more")}
            onClick={() => setSettingsSheet(true)}
            aria-label={t("rdr.more")}
          />
        </div>
      </footer>

      {/* ============ end-of-chapter card (RDR-011) ============ */}
      {endCard && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/65 p-6"
          onClick={() => setEndCard(false)}
          role="dialog"
          aria-label={t("rdr.endOfChapter")}
        >
          <div
            className="w-full max-w-[300px] rounded-3xl border border-white/10 bg-[#1c1a18] p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </span>
            <h2 className="mt-3 text-[17px] font-extrabold text-white">
              {t("rdr.chapterComplete", { n: chapter.number })}
            </h2>
            <p className="mt-1 text-[12px] font-semibold text-white/55">{t("rdr.endOfChapter")}</p>
            {nextChapter && (
              <button
                onClick={() => openChapter(nextChapter.id)}
                className="mt-5 w-full rounded-full bg-coral-gradient py-3 text-[14px] font-extrabold text-white shadow-[0_14px_30px_-10px_rgba(248,105,76,0.8)] transition-transform hover:scale-[1.02]"
              >
                {t("rdr.nextChapterCta")}
              </button>
            )}
            <button
              onClick={pop}
              className="mt-2.5 w-full rounded-full border border-white/15 py-3 text-[13px] font-bold text-white/80 transition-colors hover:bg-white/10"
            >
              {t("rdr.backToDetails")}
            </button>
          </div>
        </div>
      )}

      {/* ============ chapter list sheet (RDR-005) ============ */}
      <Dialog open={chapterSheet} onOpenChange={setChapterSheet}>
        <DialogContent
          showCloseButton={false}
          className="dark top-auto bottom-0 left-1/2 w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9"
        >
          <DialogHeader>
            <DialogTitle className="text-start text-[16px] font-extrabold">
              {t("rdr.chapterList")} · {work.title}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("det.chapters")}</DialogDescription>
          </DialogHeader>
          <div className="thin-scrollbar max-h-[46vh] space-y-1.5 overflow-y-auto pe-1">
            {chaptersDesc.map((ch) => (
              <button
                key={ch.id}
                onClick={() => {
                  if (ch.id !== chapterId) openChapter(ch.id);
                  else setChapterSheet(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-colors",
                  ch.id === chapterId ? "bg-primary/10" : "hover:bg-secondary/60"
                )}
              >
                <span
                  className={cn(
                    "w-11 shrink-0 text-[15px] font-black",
                    ch.id === chapterId ? "text-primary" : "text-foreground/80"
                  )}
                >
                  {ch.number}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-[13px] font-extrabold",
                      ch.id === chapterId ? "text-primary" : "text-foreground"
                    )}
                  >
                    {t("common.chapter")} {ch.number}
                  </span>
                  <span className="block truncate text-[11px] font-semibold text-muted-foreground">{ch.title}</span>
                </span>
                {ch.isRead && <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ reader settings sheet (RDR-007/009/014) ============ */}
      <Dialog open={settingsSheet} onOpenChange={setSettingsSheet}>
        <DialogContent
          showCloseButton={false}
          className="dark top-auto bottom-0 left-1/2 max-h-[88%] w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 overflow-y-auto rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9 thin-scrollbar"
        >
          <DialogHeader>
            <DialogTitle className="text-start text-[16px] font-extrabold">{t("rdr.readingMode")}</DialogTitle>
            <DialogDescription className="text-[11px] font-semibold">{t("rdr.savePerSeries")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* book-only: font + page theme (FMT-002 typography) */}
            {isEpub && (
              <>
                <SheetRow label={t("rdr.bookFont")}>
                  {(
                    [
                      ["serif", "rdr.fontSerif"],
                      ["sans", "rdr.fontSans"],
                    ] as ["serif" | "sans", TranslationKey][]
                  ).map(([id, key]) => (
                    <Chip
                      key={id}
                      active={(readerDefaults.epubFont ?? "serif") === id}
                      onClick={() => setReaderDefaults({ epubFont: id })}
                    >
                      <span style={id === "serif" ? { fontFamily: "Georgia, serif" } : { fontFamily: "var(--font-nunito), sans-serif" }}>
                        {t(key)}
                      </span>
                    </Chip>
                  ))}
                </SheetRow>
                <SheetRow label={t("rdr.bookTheme")}>
                  <div className="flex items-start gap-3">
                    {(
                      [
                        ["dark", "#141414"],
                        ["sepia", "#f3e8d5"],
                        ["paper", "#faf7f0"],
                      ] as ["dark" | "sepia" | "paper", string][]
                    ).map(([b, hex]) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setReaderDefaults({ epubTheme: b })}
                        aria-label={t(`rdr.btheme.${b}` as TranslationKey)}
                        className="flex flex-col items-center gap-1"
                      >
                        <span
                          className={cn(
                            "h-8 w-8 rounded-full border border-white/15 transition-shadow",
                            (readerDefaults.epubTheme ?? "dark") === b && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                          )}
                          style={{ backgroundColor: hex }}
                        />
                        <span className="text-[9px] font-bold text-muted-foreground">{t(`rdr.btheme.${b}` as TranslationKey)}</span>
                      </button>
                    ))}
                  </div>
                </SheetRow>
              </>
            )}

            {/* presets */}
            <SheetRow label={t("rdr.preset")}>
              {PRESETS.map((p) => (
                <Chip key={p.key} active={false} onClick={p.apply}>
                  {t(p.key)}
                </Chip>
              ))}
            </SheetRow>

            {/* per-series mode */}
            <SheetRow label={t("rdr.readingMode")}>
              {(
                [
                  ["PAGED", "rdr.mode.paged"],
                  ["DOUBLE", "rdr.mode.double"],
                  ["CONTINUOUS", "rdr.mode.continuous"],
                  ["WEBTOON", "rdr.mode.webtoon"],
                ] as [ReaderMode, TranslationKey][]
              ).map(([id, key]) => (
                <Chip key={id} active={work.readerMode === id} onClick={() => updateWork(workId, { readerMode: id })}>
                  {t(key)}
                </Chip>
              ))}
            </SheetRow>

            {/* per-series direction */}
            <SheetRow label={t("rdr.direction")}>
              {(
                [
                  ["RTL", "rdr.dir.rtl"],
                  ["LTR", "rdr.dir.ltr"],
                  ["VERTICAL", "rdr.mode.webtoon"],
                ] as [ReadingDirection, TranslationKey][]
              ).map(([id, key]) => (
                <Chip key={id} active={work.direction === id} onClick={() => updateWork(workId, { direction: id })}>
                  {t(key)}
                </Chip>
              ))}
            </SheetRow>

            {/* per-series fit */}
            <SheetRow label={t("rdr.fit")}>
              {(
                [
                  ["WIDTH", "rdr.fit.WIDTH"],
                  ["HEIGHT", "rdr.fit.HEIGHT"],
                  ["SCREEN", "rdr.fit.SCREEN"],
                  ["ORIGINAL", "rdr.fit.ORIGINAL"],
                ] as [FitMode, TranslationKey][]
              ).map(([id, key]) => (
                <Chip key={id} active={work.fitMode === id} onClick={() => updateWork(workId, { fitMode: id })}>
                  {t(key)}
                </Chip>
              ))}
            </SheetRow>

            {/* app-level: background */}
            <SheetRow label={t("rdr.background")}>
              <div className="flex items-start gap-3">
                {(["black", "gray", "white", "sepia"] as BgName[]).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setReaderDefaults({ bg: b })}
                    aria-label={t(`rdr.bg.${b}` as TranslationKey)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      className={cn(
                        "h-8 w-8 rounded-full border border-white/15 transition-shadow",
                        readerDefaults.bg === b && "ring-2 ring-primary ring-offset-2 ring-offset-card"
                      )}
                      style={{ backgroundColor: BG_HEX[b] }}
                    />
                    <span className="text-[9px] font-bold text-muted-foreground">{t(`rdr.bg.${b}` as TranslationKey)}</span>
                  </button>
                ))}
              </div>
            </SheetRow>

            {/* app-level: brightness */}
            <div>
              <p className="mb-2 flex items-center justify-between text-[12px] font-bold text-muted-foreground">
                {t("rdr.brightnessLabel")}
                <span className="text-[11px] font-extrabold">{readerDefaults.brightness}%</span>
              </p>
              <Slider
                value={[readerDefaults.brightness]}
                min={30}
                max={100}
                step={1}
                aria-label={t("rdr.brightnessLabel")}
                onValueChange={(v) => setReaderDefaults({ brightness: v[0] ?? 100 })}
              />
            </div>

            {/* app-level switches */}
            <div className="space-y-3 rounded-2xl border border-border bg-white/[0.03] p-3.5">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-bold">{t("rdr.autoNext")}</span>
                <Switch
                  checked={readerDefaults.autoNext}
                  onCheckedChange={(v) => setReaderDefaults({ autoNext: v })}
                  aria-label={t("rdr.autoNext")}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-bold">{t("rdr.cropBorders")}</span>
                <Switch
                  checked={readerDefaults.cropBorders}
                  onCheckedChange={(v) => setReaderDefaults({ cropBorders: v })}
                  aria-label={t("rdr.cropBorders")}
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-bold">{t("rdr.keepAwake")}</span>
                <Switch
                  checked={readerDefaults.keepAwake}
                  onCheckedChange={applyKeepAwake}
                  aria-label={t("rdr.keepAwake")}
                />
              </label>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
