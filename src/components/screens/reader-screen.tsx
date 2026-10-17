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
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CirclePause,
  CirclePlay,
  Download,
  Ellipsis,
  Flame,
  Highlighter,
  ImageOff,
  Keyboard,
  List,
  ListTree,
  Loader2,
  MoreVertical,
  MoveHorizontal,
  Pause,
  Play,
  RotateCw,
  Search,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Sun,
  Trophy,
  Volume2,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { MangaPage, hashStr } from "@/lib/manga-page";
import { PdfCanvas } from "@/components/pdf-view";
import { useApp, useNav, toFa } from "@/lib/store";
import { ttsStart, ttsPause, ttsResume, ttsStop, ttsSetRate, ttsSetEndListener, ttsSupported, useTts } from "@/lib/tts";
import type { PdfSearchHit, PdfTocItem } from "@/lib/pdf-engine";
import type { EpubSearchHit } from "@/lib/importer";
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

/** split a search snippet around the query and highlight matches */
function highlightSnippet(snippet: string, query: string): React.ReactNode[] {
  const q = query.trim();
  if (!q) return [snippet];
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = snippet.split(new RegExp(`(${esc})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded bg-coral-soft px-0.5 font-black text-primary">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
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

/* Live reading-session clock — self-contained leaf so its 1s tick never
   re-renders the (heavy) reader tree around it. Tap toggles pause/resume
   (focus timer); paused minutes are excluded from the reading log. */
function SessionPill({
  title,
  visible,
  paused,
  onToggle,
  pausedLabel,
}: {
  title: string;
  visible: boolean;
  paused: boolean;
  onToggle: () => void;
  pausedLabel: string;
}) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [paused]);
  const h = Math.floor(sec / 3600);
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  const label = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paused}
      title={paused ? `${title} · ${pausedLabel}` : title}
      className={cn(
        "absolute left-3 top-14 z-30 flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-bold text-white/85 backdrop-blur transition-all duration-300 hover:bg-black/70 active:scale-95",
        paused && "ring-1 ring-primary/70",
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      {paused ? (
        <CirclePause className="h-3 w-3 text-primary" />
      ) : (
        <CirclePlay className="h-3 w-3 text-primary" />
      )}
      <span dir="ltr" className={cn("tabular-nums", paused && "text-white/50")}>
        {label}
      </span>
      {paused && <span className="font-extrabold text-primary">{pausedLabel}</span>}
    </button>
  );
}

/* Daily-goal celebration (TRK-004/005): full-reader confetti burst shown
   once when the day's logged minutes cross the goal. Pure CSS pieces —
   pointer-events-none so reading continues underneath. Round 9: optional
   milestone chips (goal streak / weekly goal) pop in under the card. */
function GoalCelebration({
  title,
  body,
  streak,
  weekly,
}: {
  title: string;
  body: string;
  streak?: number;
  weekly?: boolean;
}) {
  const { t } = useT();
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        id: i,
        left: 4 + ((i * 37) % 92),
        size: 6 + ((i * 13) % 7),
        dur: 2.2 + ((i * 7) % 14) / 10,
        delay: ((i * 11) % 16) / 10,
        drift: ((i * 53) % 120) - 60,
        spin: ((i * 29) % 720) - 360,
        color: ["#f8694c", "#ffb199", "#ffd9a8", "#f7f1e8", "#ffffff"][i % 5],
        round: i % 3 === 0,
      })),
    []
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden" role="status">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="oni-confetti absolute top-[-4%] block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.color,
            borderRadius: p.round ? "9999px" : "2px",
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            "--drift": `${p.drift}px`,
            "--spin": `${p.spin}deg`,
          } as React.CSSProperties}
        />
      ))}
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-8">
        <div className="oni-goal-card flex flex-col items-center gap-2 rounded-[2rem] border border-border bg-black/80 px-8 py-6 text-center shadow-[0_24px_60px_-18px_rgba(0,0,0,0.85)] backdrop-blur-xl">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-coral-gradient shadow-[0_14px_30px_-10px_rgba(248,105,76,0.9)]">
            <Trophy className="h-7 w-7 text-white" />
          </span>
          <p className="text-[16px] font-black text-white">{title}</p>
          <p className="text-[12px] font-semibold text-white/65">{body}</p>
          {(streak !== undefined || weekly) && (
            <div className="mt-1 flex items-center justify-center gap-2">
              {streak !== undefined && (
                <span className="oni-milestone-chip flex items-center gap-1.5 rounded-full border border-[#f8694c]/40 bg-[#f8694c]/15 px-3 py-1.5 text-[11px] font-extrabold text-[#ffb199]">
                  <Flame className="h-3.5 w-3.5 text-[#f8694c]" />
                  {t("stats.streakChip", { n: streak })}
                </span>
              )}
              {weekly && (
                <span className="oni-milestone-chip oni-milestone-chip-2 flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-400/15 px-3 py-1.5 text-[11px] font-extrabold text-emerald-300">
                  <CalendarCheck className="h-3.5 w-3.5 text-emerald-400" />
                  {t("stats.weeklyChip")}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* Wrapper that resolves today's logged minutes + localized strings for the
   celebration card (kept separate so the reader body stays lean). */
function GoalCelebrationOverlay({
  lang,
  milestone,
}: {
  lang: string;
  milestone: { streak?: number; weekly?: boolean } | null;
}) {
  const { t } = useT();
  const minutes = useApp(
    (s) => s.sessions.find((x) => x.date === new Date().toISOString().slice(0, 10))?.minutes ?? 0
  );
  return (
    <GoalCelebration
      title={t("stats.goalReachedTitle")}
      body={t("stats.goalReachedBody", { min: lang === "fa" ? toFa(minutes) : minutes })}
      streak={milestone?.streak}
      weekly={milestone?.weekly}
    />
  );
}

/* Chrome-style find bar: floating glass pill with match counter + prev/next.
   Stays visible while a search query is active, even with the chrome hidden. */
function FindBar({
  cur,
  total,
  onPrev,
  onNext,
  onClose,
  labels,
}: {
  cur: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  labels: { prev: string; next: string; close: string; counter: string };
}) {
  return (
    <div className="oni-findbar absolute right-3 top-14 z-40 flex items-center gap-0.5 rounded-full border border-white/10 bg-black/70 p-1 shadow-[0_14px_34px_-12px_rgba(0,0,0,0.9)] backdrop-blur-md">
      <span
        dir="ltr"
        className="min-w-[52px] px-2 text-center text-[11px] font-extrabold tabular-nums text-white/85"
        aria-live="polite"
      >
        {labels.counter}
      </span>
      <button
        type="button"
        onClick={onPrev}
        aria-label={labels.prev}
        className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 active:scale-90"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onNext}
        aria-label={labels.next}
        className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 active:scale-90"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={labels.close}
        className="flex h-7 w-7 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-primary hover:text-white active:scale-90"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="sr-only">
        {cur} / {total}
      </span>
    </div>
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
  highlightId,
}: {
  workId: string;
  chapterId: string;
  startPage?: number;
  /** highlight opened from the notes & highlights manager (round 11) */
  highlightId?: string;
}) {
  const { t, lang } = useT();

  /* ----- store ----- */
  const work = useApp((s) => s.works.find((w) => w.id === workId));
  const chapter = useApp((s) =>
    s.works.find((w) => w.id === workId)?.chapters.find((c) => c.id === chapterId)
  );
  const readerDefaults = useApp((s) => s.settings.readerDefaults);
  const bookmarks = useApp((s) => s.bookmarks);
  const allHighlights = useApp((s) => s.highlights);
  /* PDF rect highlights for this work (stable selector + memo → getSnapshot safe) */
  const pdfHighlights = useMemo(
    () => allHighlights.filter((h) => h.workId === workId && h.page !== undefined),
    [allHighlights, workId]
  );
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
  const [ttsOpen, setTtsOpen] = useState(false);
  const [ttsRateDraft, setTtsRateDraft] = useState(1);
  const [pdfToc, setPdfToc] = useState<PdfTocItem[]>([]);
  const [pdfSearchOpen, setPdfSearchOpen] = useState(false);
  const [pdfQuery, setPdfQuery] = useState("");
  const [pdfHits, setPdfHits] = useState<PdfSearchHit[] | null>(null);
  const [pdfSearching, setPdfSearching] = useState(false);
  const [epubSearchOpen, setEpubSearchOpen] = useState(false);
  const [epubQuery, setEpubQuery] = useState("");
  const [epubHits, setEpubHits] = useState<EpubSearchHit[] | null>(null);
  const [epubSearching, setEpubSearching] = useState(false);
  const [epubJump, setEpubJump] = useState<{ chapterId: string; query: string; nonce: number; index?: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [finePointer, setFinePointer] = useState(false);
  /* find-in-page bar (round 8): index into the global match sequence */
  const [findIdx, setFindIdx] = useState<number | null>(null);
  /* PDF rect-highlight mode (round 11): drag on the page to select an area */
  const [pdfHlMode, setPdfHlMode] = useState(false);
  const pdfHlHintedRef = useRef(false);
  /* focused highlight (manager jump): epub scrolls/flashes the mark, pdf jumps pages */
  const [focusHlId, setFocusHlId] = useState<string | null>(null);
  /* matches marked in the CURRENT epub chapter (reported by EpubBookView) */
  const [epubMarks, setEpubMarks] = useState(0);
  /* focus timer: paused minutes don't tick the pill or the reading log */
  const [sessionPaused, setSessionPaused] = useState(false);
  /* daily-goal celebration overlay (fires once per reader mount when crossed);
     optional milestone chips (streak count / weekly goal) ride along (round 9) */
  const [goalCelebrate, setGoalCelebrate] = useState(false);
  const [celebrateMilestone, setCelebrateMilestone] = useState<{ streak?: number; weekly?: boolean } | null>(null);
  const sessionPausedRef = useRef(false);
  const goalCelebrateTimer = useRef<number | null>(null);
  const ttsRateTimer = useRef<number | null>(null);
  const tts = useTts();
  /* PDF read-aloud (round 10): armed while playing a PDF page; auto-advance
     flips pages as each one finishes speaking */
  const pdfTtsRef = useRef(false);
  const lastSpokenPageRef = useRef(-1);

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
    /* ResizeObserver is missing on very old WebViews — degrade gracefully */
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
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
    /* chapter-scoped find state: re-marked by the new chapter's jump effect */
    setEpubMarks(0);
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

  /* ----- reading-time log every 60s while open (paused minutes excluded) -----
     also fires the in-reader daily-goal celebration when the crossing happens;
     the crossing tick also evaluates streak + weekly milestones (round 9) */
  useEffect(() => {
    const id = window.setInterval(() => {
      if (sessionPausedRef.current) return;
      const st = useApp.getState();
      const today = new Date().toISOString().slice(0, 10);
      const before = st.sessions.find((x) => x.date === today)?.minutes ?? 0;
      const goal = st.settings.dailyGoalMin;
      st.logReading(workId, 1, 0);
      const after = useApp.getState().sessions.find((x) => x.date === today)?.minutes ?? 0;
      if (goal > 0 && before < goal && after >= goal) {
        /* goal streak: consecutive days (ending today) where the goal was reached */
        const minutesByDate = new Map(useApp.getState().sessions.map((s) => [s.date, s.minutes]));
        let streak = 0;
        for (let i = 0; i < 400; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const m = minutesByDate.get(key) ?? 0;
          if (m >= goal) streak++;
          else break;
        }
        /* weekly goal: rolling last-7-days total vs 7×daily — fires when the
           crossing tick completes the week (yesterday's rolling sum was short) */
        const weekKeys: string[] = [];
        for (let i = 0; i < 7; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          weekKeys.push(d.toISOString().slice(0, 10));
        }
        const sum = (keys: string[]) => keys.reduce((a, k) => a + (minutesByDate.get(k) ?? 0), 0);
        const weeklyGoal = goal * 7;
        const weeklyNow = sum(weekKeys) >= weeklyGoal;
        const weeklyBefore = sum(weekKeys.slice(1)) >= weeklyGoal;
        const weekly = weeklyNow && !weeklyBefore;
        setCelebrateMilestone({ streak: streak >= 2 ? streak : undefined, weekly });
        setGoalCelebrate(true);
        if (goalCelebrateTimer.current) window.clearTimeout(goalCelebrateTimer.current);
        goalCelebrateTimer.current = window.setTimeout(() => setGoalCelebrate(false), 5200);
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [workId]);

  /* jump straight to a highlight opened from the manager (round 11) */
  useEffect(() => {
    if (!highlightId) return;
    const hl = useApp.getState().highlights.find((h) => h.id === highlightId);
    if (!hl) return;
    setFocusHlId(highlightId);
    if (hl.page && isPdf) {
      const p = Math.max(0, Math.min(total - 1, hl.page - 1));
      goToPage(p);
      if (scrollable) setScrollCmd({ page: p });
    }
     
  }, [highlightId]);

  /* keep the pause ref in sync so the interval closure always sees it */
  useEffect(() => {
    sessionPausedRef.current = sessionPaused;
  }, [sessionPaused]);

  /* ----- read-aloud (books): stop when chapter or reader closes ----- */
  useEffect(
    () => () => {
      ttsStop();
      pdfTtsRef.current = false;
    },
    [workId, chapterId]
  );

  /* ----- pdf outline (TOC) — loaded when the chapter sheet opens ----- */
  useEffect(() => {
    if (!chapterSheet || !isPdf) return;
    let alive = true;
    setPdfToc([]);
    void (async () => {
      try {
        const { getPdfToc } = await import("@/lib/pdf-engine");
        const toc = await getPdfToc(workId);
        if (alive) setPdfToc(toc);
      } catch {
        /* outline unavailable */
      }
    })();
    return () => {
      alive = false;
    };
  }, [chapterSheet, isPdf, workId]);

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

  /* jump to a PDF outline entry (1-based page) */
  const jumpPdfToc = (item: PdfTocItem) => {
    setChapterSheet(false);
    const p = Math.max(0, Math.min(total - 1, item.page - 1));
    goToPage(p);
    if (scrollable) setScrollCmd({ page: p });
  };

  /* jump to a pdf search hit (1-based page) — tracks the global match index
     for the find bar (all matches on earlier pages + offset within this page) */
  const jumpPdfHit = (hit: PdfSearchHit) => {
    setPdfSearchOpen(false);
    const p = Math.max(0, Math.min(total - 1, hit.page - 1));
    goToPage(p);
    if (scrollable) setScrollCmd({ page: p });
    if (pdfHits) {
      let before = 0;
      for (const h of pdfHits) {
        if (h.page === hit.page) break;
        before += h.count;
      }
      setFindIdx(before);
    }
  };

  /* jump to a book (epub) search hit — switches chapter, then marks every
     in-chapter match and activates the first one (find bar follows along) */
  const jumpEpubHit = (hit: EpubSearchHit) => {
    setEpubSearchOpen(false);
    setEpubJump({ chapterId: hit.chapterId, query: epubQuery.trim(), nonce: Date.now(), index: 0 });
    if (hit.chapterId !== chapterId) openChapter(hit.chapterId);
    if (epubHits) {
      let before = 0;
      for (const h of epubHits) {
        if (h.chapterId === hit.chapterId) break;
        before += h.count;
      }
      setFindIdx(before);
    }
  };

  /* ----- find-in-page navigation (round 8) -----
     A global match sequence is flattened from the search hits:
     PDF → page repeated by its match count; EPUB → chapter × local matches.
     prev/next walk the sequence (wrapping), jumping pages/chapters. */
  const pdfSeq = useMemo<Array<{ page: number }>>(() => {
    if (!pdfHits?.length) return [];
    const seq: Array<{ page: number }> = [];
    for (const h of pdfHits) for (let i = 0; i < h.count && seq.length < 1000; i++) seq.push({ page: h.page });
    return seq;
  }, [pdfHits]);

  const epubSeq = useMemo<Array<{ chapterId: string; local: number }>>(() => {
    if (!epubHits?.length) return [];
    const seq: Array<{ chapterId: string; local: number }> = [];
    for (const h of epubHits)
      for (let i = 0; i < h.count && seq.length < 1000; i++) seq.push({ chapterId: h.chapterId, local: i });
    return seq;
  }, [epubHits]);

  const findTotal = isPdf ? pdfSeq.length : epubSeq.length;
  const findActive = findIdx !== null && findTotal > 0;

  /* exact-position highlight for the CURRENT page (round 9): the global
     findIdx maps to a local match index inside this page's block of the
     sequence → PdfCanvas renders textLayer-style marks with the active one */
  const pdfHighlightFor = (pageNum: number): { query: string; active: number } | null => {
    if (findIdx === null || !pdfHits?.length || !pdfQuery.trim()) return null;
    let base = -1;
    let count = 0;
    for (const h of pdfHits) {
      if (h.page === pageNum) {
        base = count;
        break;
      }
      count += h.count;
    }
    if (base < 0) return null;
    const local = findIdx - base;
    if (local < 0 || local >= (pdfHits.find((h) => h.page === pageNum)?.count ?? 0)) return null;
    return { query: pdfQuery.trim(), active: local };
  };

  const findStep = (dir: 1 | -1) => {
    if (isPdf) {
      if (!pdfSeq.length || findIdx === null) return;
      const next = (findIdx + dir + pdfSeq.length) % pdfSeq.length;
      setFindIdx(next);
      const p = Math.max(0, Math.min(total - 1, pdfSeq[next].page - 1));
      goToPage(p);
      if (scrollable) setScrollCmd({ page: p });
    } else {
      if (!epubSeq.length || findIdx === null) return;
      const next = (findIdx + dir + epubSeq.length) % epubSeq.length;
      setFindIdx(next);
      const m = epubSeq[next];
      setEpubJump({ chapterId: m.chapterId, query: epubQuery.trim(), nonce: Date.now(), index: m.local });
      if (m.chapterId !== chapterId) openChapter(m.chapterId);
    }
  };

  /* closing a search sheet with a live query keeps the matches active —
     the find bar stays on screen (clearing the query hides it) */
  const closePdfSheet = (open: boolean) => {
    setPdfSearchOpen(open);
    if (!open && pdfQuery.trim().length >= 2 && (pdfHits?.length ?? 0) > 0) {
      setFindIdx((cur) => (cur === null ? 0 : Math.min(cur, pdfSeq.length - 1)));
    }
  };
  const closeEpubSheet = (open: boolean) => {
    setEpubSearchOpen(open);
    if (!open && epubQuery.trim().length >= 2 && (epubHits?.length ?? 0) > 0) {
      setFindIdx((cur) => (cur === null ? 0 : Math.min(cur, epubSeq.length - 1)));
    }
  };
  const closeFindBar = () => {
    setFindIdx(null);
    setEpubJump(null);
  };

  /* open the full-text search sheet for the current content kind */
  const openSearch = () => {
    if (isPdf) {
      setPdfQuery("");
      setPdfHits(null);
      setPdfSearchOpen(true);
    } else if (isEpub) {
      setEpubQuery("");
      setEpubHits(null);
      setEpubSearchOpen(true);
    }
  };

  /* ----- read-aloud controls (books + PDF pages) ----- */
  /* speak one PDF page (1-based page = p + 1); false when the page has no text */
  const speakPdfPage = async (p: number): Promise<boolean> => {
    try {
      const { getPdfPageText } = await import("@/lib/pdf-engine");
      const text = await getPdfPageText(workId, p + 1);
      if (!text.trim()) return false;
      return ttsStart([text], { lang: work?.language, rate: readerDefaults.ttsRate ?? 1 });
    } catch {
      return false;
    }
  };

  const startTts = async () => {
    try {
      if (isPdf) {
        pdfTtsRef.current = true;
        lastSpokenPageRef.current = page;
        const ok = await speakPdfPage(page);
        if (!ok) {
          pdfTtsRef.current = false;
          toast({ title: t("tts.empty") });
        }
        return;
      }
      const { loadEpub } = await import("@/lib/importer");
      const doc = await loadEpub(workId);
      const ch = doc?.chapters.find((c) => c.id === chapterId);
      if (!ch?.html) {
        toast({ title: t("tts.empty") });
        return;
      }
      const dom = new DOMParser().parseFromString(ch.html, "text/html");
      dom.querySelectorAll("script,style").forEach((n) => n.remove());
      const sel = "h1,h2,h3,h4,h5,h6,p,li,blockquote,figcaption,dd,dt,pre";
      const nodes = [...dom.querySelectorAll(sel)];
      const blocks = nodes.filter((n) => !nodes.some((m) => m !== n && m.contains(n)));
      const chunks = blocks.map((b) => (b.textContent ?? "").trim()).filter(Boolean);
      const rate = readerDefaults.ttsRate ?? 1;
      const ok = ttsStart(chunks.length ? chunks : [dom.body?.textContent ?? ""], {
        lang: work?.language,
        rate,
      });
      if (!ok) toast({ title: t("tts.empty") });
    } catch {
      toast({ title: t("tts.empty") });
    }
  };

  /* PDF auto-advance: the tts engine fires the end listener when a page's
     queue finishes NATURALLY (never on stop/pause) — flip + speak the next
     page while auto-advance is on. A ref-indirection keeps the closure fresh
     without re-subscribing. */
  const pdfAdvanceRef = useRef<() => void>(() => undefined);
  pdfAdvanceRef.current = () => {
    if (!isPdf || !pdfTtsRef.current) return;
    if ((readerDefaults.ttsAutoAdvance ?? true) && page < total - 1) {
      const target = page + 1;
      lastSpokenPageRef.current = target;
      void speakPdfPage(target);
      goToPage(target);
    } else {
      pdfTtsRef.current = false; // end of document (or auto-advance off) — disarm
    }
  };
  useEffect(() => {
    ttsSetEndListener(() => pdfAdvanceRef.current());
    return () => ttsSetEndListener(null);
  }, []);

  /* page flipped while playing → keep reading on the new page */
  useEffect(() => {
    if (!isPdf || !pdfTtsRef.current || tts.status !== "playing") return;
    if (lastSpokenPageRef.current === page) return;
    lastSpokenPageRef.current = page;
    void speakPdfPage(page);
  }, [page, tts.status, isPdf]);

  const onTtsPrimary = () => {
    if (!ttsSupported()) {
      toast({ title: t("tts.unsupported") });
      return;
    }
    if (tts.status === "playing") {
      ttsPause();
      return;
    }
    if (tts.status === "paused") {
      ttsResume();
      return;
    }
    void startTts();
  };

  const applyTtsRate = (v: number) => {
    setTtsRateDraft(v);
    if (ttsRateTimer.current) window.clearTimeout(ttsRateTimer.current);
    ttsRateTimer.current = window.setTimeout(() => {
      ttsSetRate(v);
      useApp.getState().setReaderDefaults({ ttsRate: v });
    }, 250);
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

  /* ----- fine-pointer detection (desktop-only affordances) ----- */
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const upd = () => setFinePointer(mq.matches);
    upd();
    mq.addEventListener?.("change", upd);
    return () => mq.removeEventListener?.("change", upd);
  }, []);

  /* ----- keyboard: direction-aware arrows + shortcuts (Escape handled by app shell) ----- */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.isContentEditable)) return;
      if (e.key === "ArrowRight") {
        if (rtl) prev();
        else next();
      } else if (e.key === "ArrowLeft") {
        if (rtl) next();
        else prev();
      } else if (e.key === " ") {
        e.preventDefault();
        if (e.shiftKey) prev();
        else next();
      } else if (e.key === "b" || e.key === "B") {
        toggleBookmark();
      } else if (e.key === "z" || e.key === "Z") {
        cycleZoom();
      } else if (e.key === "c" || e.key === "C") {
        setChapterSheet(true);
      } else if (e.key === "s" || e.key === "S") {
        setSettingsSheet(true);
      } else if (e.key === "/") {
        e.preventDefault();
        openSearch();
      } else if (e.key === "?") {
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  });

  /* ----- Android volume keys → page turns (RDR-010): the native shell
     intercepts VOLUME_UP/DOWN while the reader is open and dispatches
     `oni-volume`; mapping follows the reader convention
     (Vol↓ = next, Vol↑ = previous), honouring the user setting ----- */
  useEffect(() => {
    const anyWin = window as unknown as {
      OniAndroid?: { setVolumeKeyMode?: (active: boolean) => void };
    };
    const setMode = anyWin.OniAndroid?.setVolumeKeyMode;
    if (!setMode) return;
    /* Some Android System WebView builds reject Java-bridge invocations whose
       argument isn't a strict primitive (and older builds can fail the call
       outright) — coerce to a real boolean and swallow any bridge error so a
       WebView quirk can never take the whole reader screen down. */
    const safeSetMode = (active: boolean) => {
      try {
        setMode.call(anyWin.OniAndroid, Boolean(active));
      } catch {
        /* bridge refused — volume-key paging stays off, reader keeps working */
      }
    };
    const enabled = Boolean(useApp.getState().settings.volumeKeyPaging);
    safeSetMode(enabled);
    if (!enabled) return;
    const fn = (e: Event) => {
      const dir = (e as CustomEvent<{ dir?: "up" | "down" }>).detail?.dir;
      if (dir === "up") prev();
      else next();
    };
    window.addEventListener("oni-volume", fn);
    return () => {
      window.removeEventListener("oni-volume", fn);
      safeSetMode(false);
    };
  });

  /* ----- pdf full-text search (RDR-015): debounced committed query ----- */
  useEffect(() => {
    if (!pdfSearchOpen || !isPdf) return;
    const q = pdfQuery.trim();
    if (q.length < 2) {
      setPdfHits(null);
      setPdfSearching(false);
      return;
    }
    setPdfSearching(true);
    let alive = true;
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const { searchPdfText } = await import("@/lib/pdf-engine");
          const hits = await searchPdfText(workId, q);
          if (alive) {
            setPdfHits(hits);
            setPdfSearching(false);
          }
        } catch {
          if (alive) {
            setPdfHits([]);
            setPdfSearching(false);
          }
        }
      })();
    }, 380);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [pdfQuery, pdfSearchOpen, isPdf, workId]);

  /* ----- book (epub) full-text search: debounced committed query ----- */
  useEffect(() => {
    if (!epubSearchOpen || !isEpub) return;
    const q = epubQuery.trim();
    if (q.length < 2) {
      setEpubHits(null);
      setEpubSearching(false);
      return;
    }
    setEpubSearching(true);
    let alive = true;
    const id = window.setTimeout(() => {
      void (async () => {
        try {
          const { searchEpubText } = await import("@/lib/importer");
          const hits = await searchEpubText(workId, q);
          if (alive) {
            setEpubHits(hits);
            setEpubSearching(false);
          }
        } catch {
          if (alive) {
            setEpubHits([]);
            setEpubSearching(false);
          }
        }
      })();
    }, 380);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [epubQuery, epubSearchOpen, isEpub, workId]);

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
      return (
        <PdfCanvas
          workId={work.id}
          chapterId={chapterId}
          page={i + 1}
          className={cls}
          highlight={pdfHighlightFor(i + 1)}
          highlights={pdfHighlights.filter((h) => h.page === i + 1)}
          highlightMode={pdfHlMode}
          focusHighlightId={focusHlId}
        />
      );
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
  // when the page can be panned (or lasso-highlighting), side tap zones must not eat the gestures
  const panBlock = zoom > 1 || fit === "ORIGINAL" || (isPdf && pdfHlMode);

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
            jumpTarget={
              epubJump && epubJump.chapterId === chapterId
                ? { query: epubJump.query, nonce: epubJump.nonce, index: epubJump.index }
                : null
            }
            focusHighlightId={isEpub ? focusHlId : null}
            onMarksFound={setEpubMarks}
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
                <PdfCanvas
                  workId={work.id}
                  chapterId={chapterId}
                  page={i + 1}
                  className="block w-full"
                  highlight={pdfHighlightFor(i + 1)}
                  highlights={pdfHighlights.filter((h) => h.page === i + 1)}
                  highlightMode={pdfHlMode}
                  focusHighlightId={focusHlId}
                />
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

      {/* ============ live session timer pill (tap = pause/resume) ============ */}
      <SessionPill
        title={t("rdr.session")}
        visible={controlsVisible}
        paused={sessionPaused}
        onToggle={() => setSessionPaused((v) => !v)}
        pausedLabel={t("rdr.sessionPaused")}
      />

      {/* ============ find-in-page bar (search matches active) ============ */}
      {findActive && (
        <FindBar
          cur={(findIdx ?? 0) + 1}
          total={findTotal}
          onPrev={() => findStep(-1)}
          onNext={() => findStep(1)}
          onClose={closeFindBar}
          labels={{
            prev: t("rdr.findPrev"),
            next: t("rdr.findNext"),
            close: t("rdr.findClose"),
            counter: t("rdr.matchOf", {
              cur: lang === "fa" ? toFa((findIdx ?? 0) + 1) : (findIdx ?? 0) + 1,
              total: lang === "fa" ? toFa(findTotal) : findTotal,
            }),
          }}
        />
      )}

      {/* ============ daily-goal celebration (TRK-004/005) ============ */}
      {goalCelebrate && <GoalCelebrationOverlay lang={lang} milestone={celebrateMilestone} />}

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
          {(isEpub || isPdf) && (
            <Popover
              open={ttsOpen}
              onOpenChange={(v) => {
                setTtsOpen(v);
                if (v) setTtsRateDraft(readerDefaults.ttsRate ?? 1);
              }}
            >
              <PopoverTrigger asChild>
                <ToolbarBtn
                  icon={Volume2}
                  label={t("tts.readAloud")}
                  active={ttsOpen || tts.status !== "idle"}
                  aria-label={t("tts.readAloud")}
                />
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="dark w-[252px] rounded-2xl border-border bg-popover p-4">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-foreground">
                  <Volume2 className={cn("h-3.5 w-3.5", tts.status === "playing" ? "animate-pulse text-primary" : "text-primary")} />
                  {t("tts.readAloud")}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                  {tts.status === "playing"
                    ? t("tts.playing")
                    : tts.status === "paused"
                      ? t("tts.paused")
                      : t("tts.idle")}
                  {isPdf && (
                    <span className="ms-1 font-extrabold text-primary">
                      · {t("tts.page", { n: lang === "fa" ? toFa(page + 1) : page + 1 })}
                    </span>
                  )}
                  {!isPdf && tts.status !== "idle" && tts.total > 0 && (
                    <span className="ms-1 font-extrabold text-primary">
                      · {t("tts.para", {
                        p: lang === "fa" ? toFa(tts.idx + 1) : tts.idx + 1,
                        t: lang === "fa" ? toFa(tts.total) : tts.total,
                      })}
                    </span>
                  )}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={onTtsPrimary}
                    aria-label={tts.status === "playing" ? t("tts.pause") : t("tts.play")}
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-coral-gradient text-[12px] font-extrabold text-white shadow-[0_8px_18px_-8px_rgba(248,105,76,0.8)] transition-transform active:scale-95"
                  >
                    {tts.status === "playing" ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                    {tts.status === "playing" ? t("tts.pause") : tts.status === "paused" ? t("tts.play") : t("tts.play")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      ttsStop();
                      pdfTtsRef.current = false;
                    }}
                    disabled={tts.status === "idle"}
                    aria-label={t("tts.stop")}
                    className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-border px-3 text-[12px] font-extrabold text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    {t("tts.stop")}
                  </button>
                </div>
                <div className="mt-3">
                  <p className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                    {t("tts.speed")}
                    <span className="text-[11px] font-extrabold text-foreground">{ttsRateDraft.toFixed(1)}×</span>
                  </p>
                  <Slider
                    value={[ttsRateDraft]}
                    min={0.6}
                    max={1.8}
                    step={0.1}
                    aria-label={t("tts.speed")}
                    onValueChange={(v) => applyTtsRate(v[0] ?? 1)}
                    className="[&_[data-slot=slider-track]]:bg-white/15 [&_[data-slot=slider-range]]:bg-[#f8694c] [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-[#f8694c] [&_[data-slot=slider-thumb]]:bg-[#f8694c]"
                  />
                </div>
                {/* PDF: keep reading across pages */}
                {isPdf && (
                  <label className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-bold text-foreground">
                      <BookOpenCheck className="h-3.5 w-3.5 text-primary" />
                      {t("tts.autoAdvance")}
                    </span>
                    <Switch
                      checked={readerDefaults.ttsAutoAdvance ?? true}
                      onCheckedChange={(v) => setReaderDefaults({ ttsAutoAdvance: v })}
                      aria-label={t("tts.autoAdvance")}
                      className="data-[state=checked]:bg-[#f8694c]"
                    />
                  </label>
                )}
              </PopoverContent>
            </Popover>
          )}
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
          {isPdf && (
            <ToolbarBtn
              icon={Search}
              label={t("rdr.pdfSearch")}
              active={pdfSearchOpen}
              onClick={openSearch}
              aria-label={t("rdr.pdfSearch")}
            />
          )}
          {isPdf && (
            <ToolbarBtn
              icon={Highlighter}
              label={t("pdfhl.mode")}
              active={pdfHlMode}
              onClick={() => {
                setPdfHlMode((v) => !v);
                if (!pdfHlMode && !pdfHlHintedRef.current) {
                  pdfHlHintedRef.current = true;
                  toast({ title: t("pdfhl.hint") });
                }
              }}
              aria-label={t("pdfhl.mode")}
            />
          )}
          {isEpub && (
            <ToolbarBtn
              icon={Search}
              label={t("rdr.bookSearch")}
              active={epubSearchOpen}
              onClick={openSearch}
              aria-label={t("rdr.bookSearch")}
            />
          )}
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

          {/* pdf outline (TOC) — shown when the document defines one */}
          {isPdf && pdfToc.length > 0 && (
            <div className="mb-3 rounded-2xl border border-border bg-white/[0.03] p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                <ListTree className="h-3.5 w-3.5 text-primary" />
                {t("pdf.outline")}
              </p>
              <div className="thin-scrollbar max-h-[24vh] space-y-0.5 overflow-y-auto">
                {pdfToc.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => jumpPdfToc(item)}
                    className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-secondary/60"
                    style={{ paddingInlineStart: 8 + item.depth * 14 }}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        item.depth === 0 ? "bg-primary" : "bg-muted-foreground/50"
                      )}
                    />
                    <span className={cn("min-w-0 flex-1 truncate text-[12.5px] font-bold", item.depth > 0 && "font-semibold text-muted-foreground")}>
                      {item.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-[10px] font-extrabold text-primary">
                      {t("pdf.jumpPage", { n: lang === "fa" ? toFa(item.page) : item.page })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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

      {/* ============ pdf full-text search sheet (RDR-015) ============ */}
      <Dialog open={pdfSearchOpen} onOpenChange={closePdfSheet}>
        <DialogContent
          showCloseButton={false}
          className="dark top-auto bottom-0 left-1/2 w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start text-[16px] font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-coral-soft text-primary">
                <Search className="h-4 w-4" />
              </span>
              {t("rdr.pdfSearch")}
            </DialogTitle>
            <DialogDescription className="text-[11px] font-semibold">{t("rdr.pdfSearchHint")}</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={pdfQuery}
              onChange={(e) => setPdfQuery(e.target.value)}
              placeholder={t("rdr.pdfSearchPlaceholder")}
              aria-label={t("rdr.pdfSearch")}
              autoFocus
              dir="auto"
              className="h-11 w-full rounded-2xl border border-border bg-secondary/60 ps-10 pe-4 text-[13px] font-bold outline-none transition-colors placeholder:font-semibold placeholder:text-muted-foreground focus:border-primary/60 focus:bg-secondary"
            />
          </div>

          {/* match summary (find bar continues after close) */}
          {!pdfSearching && pdfHits && pdfHits.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-coral-soft">
                <Search className="h-3 w-3 text-primary" />
              </span>
              <p className="text-[11px] font-extrabold text-foreground/80">
                {t(
                  pdfHits.length === 1 ? "rdr.pdfSummaryOne" : "rdr.pdfSummary",
                  {
                    n: lang === "fa" ? toFa(pdfSeq.length) : pdfSeq.length,
                    p: lang === "fa" ? toFa(pdfHits.length) : pdfHits.length,
                  }
                )}
              </p>
              <span className="ms-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">
                {t("rdr.findKept")}
              </span>
            </div>
          )}

          <div className="thin-scrollbar max-h-[42vh] space-y-1.5 overflow-y-auto pe-1">
            {pdfSearching && (
              <div className="flex items-center justify-center gap-2 py-8 text-[12px] font-bold text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {t("common.loading")}
              </div>
            )}
            {!pdfSearching && pdfHits && pdfHits.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <Search className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-[13px] font-bold text-muted-foreground">
                  {pdfQuery.trim().length < 2 ? t("rdr.pdfSearchHint") : t("rdr.pdfSearchEmpty")}
                </p>
              </div>
            )}
            {!pdfSearching &&
              pdfHits?.map((hit) => (
                <button
                  key={hit.page}
                  onClick={() => jumpPdfHit(hit)}
                  className="flex w-full items-start gap-3 rounded-2xl border border-border bg-white/[0.02] px-3 py-2.5 text-start transition-colors hover:bg-secondary/60"
                >
                  <span className="mt-0.5 shrink-0 rounded-full bg-coral-soft px-2.5 py-1 text-[10px] font-black text-primary">
                    {t("pdf.jumpPage", { n: lang === "fa" ? toFa(hit.page) : hit.page })}
                  </span>
                  <span className="min-w-0 flex-1 text-[12px] font-semibold leading-relaxed text-foreground/85" dir="auto">
                    {highlightSnippet(hit.snippet, pdfQuery.trim())}
                  </span>
                  {hit.count > 1 && (
                    <span className="mt-0.5 shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-black text-secondary-foreground">
                      ×{lang === "fa" ? toFa(hit.count) : hit.count}
                    </span>
                  )}
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ book (epub) full-text search sheet ============ */}
      <Dialog open={epubSearchOpen} onOpenChange={closeEpubSheet}>
        <DialogContent
          showCloseButton={false}
          className="dark top-auto bottom-0 left-1/2 w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-start text-[16px] font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-coral-soft text-primary">
                <Search className="h-4 w-4" />
              </span>
              {t("rdr.bookSearch")}
            </DialogTitle>
            <DialogDescription className="text-[11px] font-semibold">{t("rdr.bookSearchHint")}</DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={epubQuery}
              onChange={(e) => setEpubQuery(e.target.value)}
              placeholder={t("rdr.bookSearchPlaceholder")}
              aria-label={t("rdr.bookSearch")}
              autoFocus
              dir="auto"
              className="h-11 w-full rounded-2xl border border-border bg-secondary/60 ps-10 pe-4 text-[13px] font-bold outline-none transition-colors placeholder:font-semibold placeholder:text-muted-foreground focus:border-primary/60 focus:bg-secondary"
            />
          </div>

          {/* match summary (find bar continues after close) */}
          {!epubSearching && epubHits && epubHits.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-coral-soft">
                <Search className="h-3 w-3 text-primary" />
              </span>
              <p className="text-[11px] font-extrabold text-foreground/80">
                {t(
                  epubHits.length === 1 ? "rdr.epubSummaryOne" : "rdr.epubSummary",
                  {
                    n: lang === "fa" ? toFa(epubSeq.length) : epubSeq.length,
                    c: lang === "fa" ? toFa(epubHits.length) : epubHits.length,
                  }
                )}
              </p>
              <span className="ms-auto rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground">
                {t("rdr.findKept")}
              </span>
            </div>
          )}

          <div className="thin-scrollbar max-h-[42vh] space-y-1.5 overflow-y-auto pe-1">
            {epubSearching && (
              <div className="flex items-center justify-center gap-2 py-8 text-[12px] font-bold text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {t("common.loading")}
              </div>
            )}
            {!epubSearching && epubHits && epubHits.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <Search className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-[13px] font-bold text-muted-foreground">
                  {epubQuery.trim().length < 2 ? t("rdr.bookSearchHint") : t("rdr.pdfSearchEmpty")}
                </p>
              </div>
            )}
            {!epubSearching &&
              epubHits?.map((hit) => (
                <button
                  key={hit.chapterId}
                  onClick={() => jumpEpubHit(hit)}
                  className="w-full rounded-2xl border border-border bg-white/[0.02] px-3 py-2.5 text-start transition-colors hover:bg-secondary/60"
                >
                  <span className="mb-1 flex items-center gap-2">
                    <span className="shrink-0 rounded-full bg-coral-soft px-2.5 py-1 text-[10px] font-black text-primary">
                      {t("common.chapter")} {lang === "fa" ? toFa(hit.chapterIndex + 1) : hit.chapterIndex + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-extrabold text-foreground/90" dir="auto">
                      {hit.chapterTitle}
                    </span>
                    {hit.count > 1 && (
                      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-black text-secondary-foreground">
                        ×{lang === "fa" ? toFa(hit.count) : hit.count}
                      </span>
                    )}
                  </span>
                  <span className="block text-[12px] font-semibold leading-relaxed text-foreground/85" dir="auto">
                    {highlightSnippet(hit.snippet, epubQuery.trim())}
                  </span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ keyboard shortcuts help (desktop) ============ */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent
          showCloseButton={false}
          className="dark top-auto bottom-0 left-1/2 w-full max-w-[440px] sm:max-w-[440px] -translate-x-1/2 translate-y-0 rounded-b-none rounded-t-[2rem] border-border bg-card p-5 pb-9"
        >
          <DialogHeader>
            <DialogTitle className="text-start text-[16px] font-extrabold">{t("rdr.shortcuts")}</DialogTitle>
            <DialogDescription className="sr-only">{t("rdr.shortcuts")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {(
              [
                [["←", "→"], "rdr.sc.turn"],
                [["Space"], "rdr.sc.next"],
                [["⇧", "Space"], "rdr.sc.prev"],
                [["B"], "rdr.sc.bookmark"],
                [["Z"], "rdr.sc.zoom"],
                [["C"], "rdr.sc.chapters"],
                [["S"], "rdr.sc.settings"],
                [["/"], "rdr.sc.search"],
              ] as [string[], TranslationKey][]
            ).map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-2.5">
                <span className="text-[13px] font-bold text-foreground/90">{t(label)}</span>
                <span className="flex shrink-0 items-center gap-1" dir="ltr">
                  {keys.map((k, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-[10px] font-bold text-muted-foreground">+</span>}
                      <kbd className="min-w-7 rounded-lg border border-border bg-secondary px-2 py-1 text-center text-[11px] font-black text-secondary-foreground shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)]">
                        {k}
                      </kbd>
                    </span>
                  ))}
                </span>
              </div>
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

            {/* keyboard shortcuts (desktop only) */}
            {finePointer && (
              <button
                type="button"
                onClick={() => {
                  setSettingsSheet(false);
                  setHelpOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white/[0.03] px-4 py-3 text-start transition-colors hover:bg-secondary/60"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-soft text-primary">
                  <Keyboard className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-[13px] font-bold">{t("rdr.shortcuts")}</span>
                <kbd className="rounded-lg border border-border bg-secondary px-2 py-1 text-[11px] font-black text-secondary-foreground" dir="ltr">
                  ?
                </kbd>
              </button>
            )}

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
