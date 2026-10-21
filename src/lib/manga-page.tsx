/* ============================================================
   oniLibrary — procedural manga page generator (client-safe)
   ------------------------------------------------------------
   Renders a deterministic black & white manga page as a pure
   inline SVG (viewBox 0 0 800 1200). Same (seed, pageNumber)
   always produces the exact same page — a hash (FNV-1a) feeds
   a mulberry32 LCG; Math.random is never used.

   Content vocabulary: panel grids, action/speed lines, radial
   burst lines, ink silhouettes (city, mountains, figures),
   screentone dot patterns, impact flashes and quiet blanks,
   plus 0–2 speech bubbles with jagged tails. No SVG filters.
   ============================================================ */

import type { JSX, ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* deterministic RNG                                                   */
/* ------------------------------------------------------------------ */

/** FNV-1a string hash → uint32. Exported for the reader (page seed). */
export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Rng = () => number;

/** mulberry32 — tiny deterministic LCG PRNG. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* speech bubble pool                                                  */
/* ------------------------------------------------------------------ */

const BUBBLE_POOL = [
  "IT'S ALREADY STARTED...",
  "THE RUMBLING.",
  "RUN!!",
  "NOT YET...",
  "I CAN STILL FIGHT.",
  "BEHIND YOU!",
  "THIS IS THE END.",
  "GO!",
  "WAIT...",
  "UNBELIEVABLE.",
] as const;

/* ------------------------------------------------------------------ */
/* layout templates (fractions of the drawable area)                   */
/* ------------------------------------------------------------------ */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAGE_W = 800;
const PAGE_H = 1200;
const MARGIN = 26;
const FOOTER_H = 46; // reserved strip at the bottom
const GUTTER = 6;

const LAYOUTS: number[][][] = [
  // splash panel + two bottom panels
  [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]],
  // wide top, split middle, wide bottom
  [[0, 0, 1, 0.32], [0, 0.32, 0.53, 0.34], [0.53, 0.32, 0.47, 0.34], [0, 0.66, 1, 0.34]],
  // three cinematic rows
  [[0, 0, 1, 0.36], [0, 0.36, 1, 0.3], [0, 0.66, 1, 0.34]],
  // tall right column + stacked left + wide bottom
  [[0, 0, 0.56, 0.44], [0.56, 0, 0.44, 0.44], [0, 0.44, 0.56, 0.26], [0.56, 0.44, 0.44, 0.26], [0, 0.7, 1, 0.3]],
  // classic 2x2
  [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  // tall left strip + three right panels
  [[0, 0, 0.44, 1], [0.44, 0, 0.56, 0.31], [0.44, 0.31, 0.56, 0.35], [0.44, 0.66, 0.56, 0.34]],
  // five panel montage
  [[0, 0, 0.6, 0.4], [0.6, 0, 0.4, 0.4], [0, 0.4, 1, 0.28], [0, 0.68, 0.5, 0.32], [0.5, 0.68, 0.5, 0.32]],
  // six panel grid
  [[0, 0, 1 / 3, 0.5], [1 / 3, 0, 1 / 3, 0.5], [2 / 3, 0, 1 / 3, 0.5], [0, 0.5, 1 / 3, 0.5], [1 / 3, 0.5, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]],
];

/* ------------------------------------------------------------------ */
/* ink building blocks                                                 */
/* ------------------------------------------------------------------ */

/** standing character silhouette (head + coat body + arms + legs) */
function Figure({ x, y, s, flip }: { x: number; y: number; s: number; flip?: boolean }) {
  return (
    <g
      transform={`${flip ? `translate(${2 * x},0) scale(-1,1) ` : ""}translate(${x},${y}) scale(${s})`}
      fill="#111"
    >
      <circle cx={0} cy={-46} r={11} />
      <path d="M -13,-33 Q 0,-41 13,-33 L 19,6 L 10,52 L 3,52 L 4,8 L -4,8 L -3,52 L -10,52 L -19,6 Z" />
      <path d="M -13,-31 L -29,4 L -23,9 L -10,-16 Z" />
      <path d="M 13,-31 L 29,4 L 23,9 L 10,-16 Z" />
    </g>
  );
}

/** head + shoulders crowd silhouette */
function Bust({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x},${y}) scale(${s})`} fill="#111">
      <circle cx={0} cy={-18} r={14} />
      <path d="M -26,14 Q -20,-8 0,-8 Q 20,-8 26,14 L 26,16 L -26,16 Z" />
    </g>
  );
}

/** diagonal / horizontal / vertical action speed lines */
function sceneSpeed(r: Rect, rng: Rng): ReactNode {
  const dir = Math.floor(rng() * 3);
  const lines: ReactNode[] = [];
  if (dir === 0) {
    const slope = 0.25 + rng() * 0.45;
    const step = 24 + rng() * 10;
    for (let i = -2; i < r.w / step + 2; i++) {
      const x = r.x + i * step + rng() * 8;
      lines.push(
        <line
          key={i}
          x1={x}
          y1={r.y - 24}
          x2={x - r.h * slope}
          y2={r.y + r.h + 24}
          stroke="#111"
          strokeWidth={rng() < 0.28 ? 4.5 : 2}
        />
      );
    }
  } else if (dir === 1) {
    const step = 20 + rng() * 8;
    for (let i = -1; i < r.h / step + 1; i++) {
      const y = r.y + i * step + rng() * 6;
      const len = r.w * (0.35 + rng() * 0.62);
      const fromLeft = rng() < 0.5;
      lines.push(
        <line
          key={i}
          x1={fromLeft ? r.x - 12 : r.x + r.w + 12 - len}
          y1={y}
          x2={fromLeft ? r.x - 12 + len : r.x + r.w + 12}
          y2={y}
          stroke="#111"
          strokeWidth={rng() < 0.28 ? 4.5 : 2}
        />
      );
    }
  } else {
    const step = 22 + rng() * 8;
    for (let i = -1; i < r.w / step + 1; i++) {
      const x = r.x + i * step + rng() * 6;
      const len = r.h * (0.3 + rng() * 0.6);
      const fromTop = rng() < 0.5;
      lines.push(
        <line
          key={i}
          x1={x}
          y1={fromTop ? r.y - 12 : r.y + r.h + 12 - len}
          x2={x}
          y2={fromTop ? r.y - 12 + len : r.y + r.h + 12}
          stroke="#111"
          strokeWidth={rng() < 0.28 ? 4 : 2}
        />
      );
    }
  }
  const fig = rng() < 0.6;
  return (
    <>
      {lines}
      {fig && <Figure x={r.x + r.w * (0.3 + rng() * 0.4)} y={r.y + r.h * 0.72} s={(r.h / 240) * (0.8 + rng() * 0.5)} flip={rng() < 0.5} />}
    </>
  );
}

/** radial burst lines converging on a focal figure */
function sceneBurst(r: Rect, rng: Rng): ReactNode {
  const cx = r.x + r.w * (0.32 + rng() * 0.36);
  const cy = r.y + r.h * (0.34 + rng() * 0.3);
  const n = 24 + Math.floor(rng() * 12);
  const outer = Math.max(r.w, r.h) * 1.4;
  const rays: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.06;
    const inner = 30 + rng() * 44;
    rays.push(
      <line
        key={i}
        x1={cx + Math.cos(a) * inner}
        y1={cy + Math.sin(a) * inner}
        x2={cx + Math.cos(a) * outer}
        y2={cy + Math.sin(a) * outer}
        stroke="#111"
        strokeWidth={i % 3 === 0 ? 6 : 2.4}
      />
    );
  }
  return (
    <>
      {rays}
      <Figure x={cx} y={cy} s={r.h / 210} flip={rng() < 0.5} />
    </>
  );
}

/** city skyline with lit windows + moon */
function sceneSkyline(r: Rect, rng: Rng): ReactNode {
  const els: ReactNode[] = [];
  const base = r.y + r.h;
  // moon
  const mx = r.x + r.w * (0.16 + rng() * 0.68);
  const my = r.y + r.h * (0.16 + rng() * 0.2);
  const mr = 22 + rng() * 30;
  els.push(<circle key="moon" cx={mx} cy={my} r={mr} fill="#fff" stroke="#111" strokeWidth={3} />);
  els.push(<circle key="mc1" cx={mx - mr * 0.3} cy={my - mr * 0.2} r={mr * 0.16} fill="#111" opacity={0.7} />);
  els.push(<circle key="mc2" cx={mx + mr * 0.25} cy={my + mr * 0.28} r={mr * 0.1} fill="#111" opacity={0.5} />);
  // buildings
  let x = r.x - 12;
  let k = 0;
  while (x < r.x + r.w + 8) {
    const bw = 42 + rng() * 92;
    const bh = r.h * (0.22 + rng() * 0.52);
    els.push(<rect key={`b${k}`} x={x} y={base - bh} width={bw} height={bh + 8} fill="#111" />);
    const cols = Math.max(1, Math.floor(bw / 26));
    const rows = Math.max(1, Math.floor(bh / 36));
    for (let c = 0; c < cols; c++) {
      for (let ro = 0; ro < rows; ro++) {
        if (rng() < 0.42) {
          els.push(
            <rect
              key={`w${k}-${c}-${ro}`}
              x={x + 9 + c * 24}
              y={base - bh + 12 + ro * 32}
              width={8}
              height={13}
              fill="#fff"
            />
          );
        }
      }
    }
    x += bw + 5 + rng() * 16;
    k++;
  }
  return <>{els}</>;
}

/** mountain ridge + sun + wind lines */
function sceneMountains(r: Rect, rng: Rng): ReactNode {
  const base = r.y + r.h;
  const els: ReactNode[] = [];
  // sun disc
  els.push(
    <circle key="sun" cx={r.x + r.w * (0.2 + rng() * 0.6)} cy={r.y + r.h * (0.2 + rng() * 0.22)} r={26 + rng() * 22} fill="none" stroke="#111" strokeWidth={4} />
  );
  // wind lines
  const wl = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < wl; i++) {
    const y = r.y + r.h * (0.3 + rng() * 0.3);
    const len = r.w * (0.2 + rng() * 0.4);
    const x0 = r.x + rng() * (r.w - len);
    els.push(<line key={`wl${i}`} x1={x0} y1={y} x2={x0 + len} y2={y} stroke="#111" strokeWidth={2.4} strokeLinecap="round" />);
  }
  // ridges (back → front)
  const ridges = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < ridges; i++) {
    const peakH = r.h * (0.34 + rng() * 0.4) * (1 - i * 0.16);
    const px = r.x + r.w * (0.2 + rng() * 0.6);
    const spread = r.w * (0.4 + rng() * 0.45);
    const d = `M ${r.x - 10},${base + 6} L ${px},${base - peakH} L ${px + spread},${base + 6} Z`;
    els.push(<path key={`r${i}`} d={d} fill="#111" />);
    // snow cap
    els.push(
      <path
        key={`s${i}`}
        d={`M ${px - spread * 0.12},${base - peakH * 0.78} L ${px},${base - peakH} L ${px + spread * 0.12},${base - peakH * 0.78} L ${px + spread * 0.05},${base - peakH * 0.7} L ${px - spread * 0.04},${base - peakH * 0.74} Z`}
        fill="#fff"
      />
    );
  }
  return <>{els}</>;
}

/** screentone field with a bold ink shape + white slash */
function sceneTone(r: Rect, rng: Rng, pid: string): ReactNode {
  const tone = rng() < 0.5 ? `${pid}-tone-md` : `${pid}-tone-dark`;
  const bx = r.x + r.w * (0.2 + rng() * 0.35);
  const by = r.y + r.h * (0.24 + rng() * 0.3);
  const bs = Math.min(r.w, r.h) * (0.3 + rng() * 0.25);
  return (
    <>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${tone})`} />
      <path
        d={`M ${bx},${by - bs} L ${bx + bs * 0.9},${by - bs * 0.2} L ${bx + bs * 0.6},${by + bs} L ${bx - bs * 0.5},${by + bs * 0.7} L ${bx - bs * 0.8},${by - bs * 0.1} Z`}
        fill="#111"
      />
      <path
        d={`M ${r.x + r.w * 0.1},${r.y + r.h * 0.85} L ${r.x + r.w * 0.9},${r.y + r.h * 0.35} L ${r.x + r.w * 0.92},${r.y + r.h * 0.42} L ${r.x + r.w * 0.14},${r.y + r.h * 0.92} Z`}
        fill="#fff"
        opacity={0.95}
      />
    </>
  );
}

/** quiet beat — large blank area, horizon, tiny birds */
function sceneQuiet(r: Rect, rng: Rng): ReactNode {
  const els: ReactNode[] = [];
  const horizon = r.y + r.h * (0.55 + rng() * 0.15);
  els.push(<line key="hz" x1={r.x} y1={horizon} x2={r.x + r.w} y2={horizon} stroke="#111" strokeWidth={2.6} />);
  els.push(
    <circle key="sun" cx={r.x + r.w * (0.62 + rng() * 0.25)} cy={r.y + r.h * (0.2 + rng() * 0.18)} r={20 + rng() * 16} fill="none" stroke="#111" strokeWidth={3} />
  );
  const birds = 2 + Math.floor(rng() * 4);
  for (let i = 0; i < birds; i++) {
    const bx = r.x + r.w * (0.15 + rng() * 0.7);
    const by = r.y + r.h * (0.12 + rng() * 0.3);
    const s = 7 + rng() * 8;
    els.push(
      <path key={`bd${i}`} d={`M ${bx - s},${by} Q ${bx - s * 0.4},${by - s * 0.7} ${bx},${by} Q ${bx + s * 0.4},${by - s * 0.7} ${bx + s},${by}`} fill="none" stroke="#111" strokeWidth={2.4} strokeLinecap="round" />
    );
  }
  // grass ticks on the horizon
  const ticks = 6 + Math.floor(rng() * 8);
  for (let i = 0; i < ticks; i++) {
    const tx = r.x + rng() * r.w;
    els.push(<line key={`g${i}`} x1={tx} y1={horizon} x2={tx - 4 - rng() * 4} y2={horizon - 9 - rng() * 6} stroke="#111" strokeWidth={2} />);
  }
  return <>{els}</>;
}

/** crowd of onlookers over a tone field */
function sceneCrowd(r: Rect, rng: Rng, pid: string): ReactNode {
  const busts: ReactNode[] = [];
  const n = 4 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    busts.push(
      <Bust
        key={i}
        x={r.x + (r.w / n) * i + rng() * 30 + 10}
        y={r.y + r.h + 6}
        s={0.9 + rng() * 1.4}
      />
    );
  }
  return (
    <>
      <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={`url(#${pid}-tone-sm)`} />
      {busts}
    </>
  );
}

/** impact flash — jagged black starburst */
function sceneFlash(r: Rect, rng: Rng): ReactNode {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * (0.42 + rng() * 0.16);
  const R = Math.min(r.w, r.h) * (0.42 + rng() * 0.12);
  const pts: string[] = [];
  const spikes = 9 + Math.floor(rng() * 5);
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? R * (0.85 + rng() * 0.3) : R * (0.4 + rng() * 0.18);
    pts.push(`${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`);
  }
  const inner: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 + 0.12;
    const rad = i % 2 === 0 ? R * 0.52 : R * 0.2;
    inner.push(`${cx + Math.cos(a) * rad},${cy + Math.sin(a) * rad}`);
  }
  return (
    <>
      <polygon points={pts.join(" ")} fill="#111" />
      <polygon points={inner.join(" ")} fill="#fff" />
      <Figure x={cx} y={cy + R * 0.42} s={R / 130} />
    </>
  );
}

/** interior — window with tone light, floor line, hanging lamp */
function sceneInterior(r: Rect, rng: Rng, pid: string): ReactNode {
  const els: ReactNode[] = [];
  const floor = r.y + r.h * (0.68 + rng() * 0.1);
  els.push(<line key="fl" x1={r.x} y1={floor} x2={r.x + r.w} y2={floor} stroke="#111" strokeWidth={3} />);
  // window
  const ww = r.w * (0.3 + rng() * 0.24);
  const wh = r.h * (0.3 + rng() * 0.16);
  const wx = r.x + r.w * (0.1 + rng() * 0.2);
  const wy = r.y + r.h * 0.12;
  els.push(<rect key="wf" x={wx} y={wy} width={ww} height={wh} fill={`url(#${pid}-tone-sm)`} stroke="#111" strokeWidth={6} />);
  els.push(<line key="wb" x1={wx + ww / 2} y1={wy} x2={wx + ww / 2} y2={wy + wh} stroke="#111" strokeWidth={5} />);
  els.push(<line key="wc" x1={wx} y1={wy + wh / 2} x2={wx + ww} y2={wy + wh / 2} stroke="#111" strokeWidth={5} />);
  // hanging lamp
  const lx = r.x + r.w * (0.62 + rng() * 0.2);
  els.push(<line key="lc" x1={lx} y1={r.y} x2={lx} y2={r.y + r.h * 0.16} stroke="#111" strokeWidth={3} />);
  els.push(<path key="ls" d={`M ${lx - 22},${r.y + r.h * 0.16} L ${lx + 22},${r.y + r.h * 0.16} L ${lx + 12},${r.y + r.h * 0.22} L ${lx - 12},${r.y + r.h * 0.22} Z`} fill="#111" />);
  // lone figure on the floor
  els.push(<Figure key="fig" x={r.x + r.w * (0.52 + rng() * 0.3)} y={floor} s={r.h / 260} flip={rng() < 0.5} />);
  return <>{els}</>;
}

const SCENES = ["speed", "burst", "skyline", "mountains", "tone", "quiet", "crowd", "flash", "interior"] as const;
type SceneName = (typeof SCENES)[number];

function renderScene(name: SceneName, r: Rect, rng: Rng, pid: string): ReactNode {
  switch (name) {
    case "speed":
      return sceneSpeed(r, rng);
    case "burst":
      return sceneBurst(r, rng);
    case "skyline":
      return sceneSkyline(r, rng);
    case "mountains":
      return sceneMountains(r, rng);
    case "tone":
      return sceneTone(r, rng, pid);
    case "quiet":
      return sceneQuiet(r, rng);
    case "crowd":
      return sceneCrowd(r, rng, pid);
    case "flash":
      return sceneFlash(r, rng);
    case "interior":
      return sceneInterior(r, rng, pid);
  }
}

/* ------------------------------------------------------------------ */
/* speech bubbles                                                      */
/* ------------------------------------------------------------------ */

function wrapText(s: string, maxChars: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function SpeechBubble({
  r,
  rng,
  text,
}: {
  r: Rect;
  rng: Rng;
  text: string;
}) {
  const lines = wrapText(text, 13);
  const longest = Math.max(...lines.map((l) => l.length));
  const rx = Math.min(150, Math.max(64, longest * 8.6 + 22));
  const ry = Math.min(64, Math.max(30, lines.length * 13 + 16));
  const bx = Math.min(r.x + r.w - rx - 12, Math.max(r.x + rx + 12, r.x + r.w * (0.3 + rng() * 0.4)));
  const by = Math.min(r.y + r.h - ry - 34, Math.max(r.y + ry + 12, r.y + r.h * (0.2 + rng() * 0.18)));
  const tailDir = rng() < 0.5 ? -1 : 1;
  const fontSize = 19;
  const lineH = 24;
  const y0 = by - ((lines.length - 1) * lineH) / 2;
  // jagged tail polygon (drawn first so the ellipse overlaps the joint)
  const tailTop = by + ry - 10;
  const tipX = bx + tailDir * (rx * 0.55);
  const tipY = by + ry + 30 + rng() * 10;
  const tail = [
    `${bx - 16},${tailTop}`,
    `${bx - 5},${tailTop + 12}`,
    `${bx - 13},${tailTop + 14}`,
    `${tipX},${tipY}`,
    `${bx + 8},${tailTop + 12}`,
    `${bx + 18},${tailTop}`,
  ].join(" ");
  return (
    <g>
      <polygon points={tail} fill="#fff" stroke="#111" strokeWidth={3} strokeLinejoin="miter" />
      <ellipse cx={bx} cy={by} rx={rx} ry={ry} fill="#fff" stroke="#111" strokeWidth={3.6} />
      <text
        x={bx}
        y={y0}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={800}
        fill="#111"
        style={{ letterSpacing: "0.06em" }}
      >
        {lines.map((l, i) => (
          <tspan key={i} x={bx} dy={i === 0 ? 0 : lineH}>
            {l}
          </tspan>
        ))}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* MangaPage                                                           */
/* ------------------------------------------------------------------ */

export function MangaPage({
  seed,
  pageNumber,
  totalPages,
  workTitle,
  chapterTitle,
  className,
}: {
  seed: number;
  pageNumber: number;
  totalPages: number;
  workTitle?: string;
  chapterTitle: string;
  className?: string;
}): JSX.Element {
  const pid = `mp${hashStr(`${seed}#${pageNumber}`).toString(36)}`;
  const rng = mulberry32(hashStr(`${seed}#${pageNumber}`));

  // drawable area above the footer
  const area: Rect = { x: MARGIN, y: MARGIN, w: PAGE_W - MARGIN * 2, h: PAGE_H - MARGIN * 2 - FOOTER_H };

  // 1. panel layout
  const layout = LAYOUTS[Math.floor(rng() * LAYOUTS.length)];
  const rects: Rect[] = layout.map(([fx, fy, fw, fh]) => ({
    x: area.x + fx * area.w + GUTTER / 2,
    y: area.y + fy * area.h + GUTTER / 2,
    w: Math.max(40, fw * area.w - GUTTER / 2),
    h: Math.max(40, fh * area.h - GUTTER / 2),
  }));

  // 2. scene per panel (first panel favours bold scenes)
  const scenes: ReactNode[] = rects.map((r, i) => {
    let name: SceneName;
    if (i === 0 && rng() < 0.55) {
      name = rng() < 0.5 ? "burst" : "flash";
    } else {
      name = SCENES[Math.floor(rng() * SCENES.length)];
    }
    return <g key={i}>{renderScene(name, r, rng, pid)}</g>;
  });

  // 3. speech bubbles (0–2 per page, deterministic pick from the pool)
  const bubbleRoll = rng();
  const bubbleCount = bubbleRoll < 0.28 ? 0 : bubbleRoll < 0.78 ? 1 : 2;
  const bubbles: ReactNode[] = [];
  for (let b = 0; b < bubbleCount; b++) {
    const panel = rects[Math.floor(rng() * rects.length)];
    const text = BUBBLE_POOL[hashStr(`${seed}#${pageNumber}#b${b}`) % BUBBLE_POOL.length];
    bubbles.push(<SpeechBubble key={b} r={panel} rng={rng} text={text} />);
  }

  return (
    <svg
      viewBox="0 0 800 1200"
      // intrinsic size: the generated page's "natural" dimensions — needed
      // so fit=ORIGINAL (audit D9: no forced box) has a real 1x size
      width={800}
      height={1200}
      role="img"
      aria-label={`${chapterTitle} — page ${pageNumber} of ${totalPages}`}
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* screentones */}
        <pattern id={`${pid}-tone-sm`} patternUnits="userSpaceOnUse" width={7} height={7}>
          <circle cx={3.5} cy={3.5} r={1.05} fill="#111" />
        </pattern>
        <pattern id={`${pid}-tone-md`} patternUnits="userSpaceOnUse" width={9} height={9}>
          <circle cx={4.5} cy={4.5} r={2} fill="#111" />
        </pattern>
        <pattern id={`${pid}-tone-dark`} patternUnits="userSpaceOnUse" width={9} height={9}>
          <circle cx={4.5} cy={4.5} r={3.1} fill="#111" />
        </pattern>
        <pattern id={`${pid}-tone-hz`} patternUnits="userSpaceOnUse" width={10} height={10}>
          <line x1={0} y1={5} x2={10} y2={5} stroke="#111" strokeWidth={1.6} />
        </pattern>
        {/* panel clips */}
        {rects.map((r, i) => (
          <clipPath key={i} id={`${pid}-clip-${i}`}>
            <rect x={r.x + 2} y={r.y + 2} width={Math.max(8, r.w - 4)} height={Math.max(8, r.h - 4)} />
          </clipPath>
        ))}
      </defs>

      {/* page */}
      <rect x={0} y={0} width={PAGE_W} height={PAGE_H} fill="#ffffff" />

      {/* panels + inked content (stroke drawn last for crisp 6px borders) */}
      {rects.map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#fff" />
          <g clipPath={`url(#${pid}-clip-${i})`}>{scenes[i]}</g>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke="#111" strokeWidth={GUTTER} />
        </g>
      ))}

      {/* speech bubbles */}
      {bubbles}

      {/* vertical series title on the outer margin */}
      {workTitle ? (
        <text
          transform={`rotate(90 ${PAGE_W - 12} ${MARGIN + 4})`}
          x={PAGE_W - 12}
          y={MARGIN + 4}
          fontSize={12}
          fontWeight={700}
          fill="#d8d0c4"
          style={{ letterSpacing: "0.2em" }}
        >
          {workTitle.toUpperCase()}
        </text>
      ) : null}

      {/* subtle footer */}
      <text
        x={PAGE_W / 2}
        y={PAGE_H - 20}
        textAnchor="middle"
        fontSize={15}
        fontWeight={700}
        fill="#b3a898"
      >
        {chapterTitle} — {pageNumber}/{totalPages}
      </text>
    </svg>
  );
}
