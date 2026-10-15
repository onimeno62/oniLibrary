"use client";

/* ============================================================
   oniLibrary — read-aloud engine
   Two backends behind one chunk queue:
   1. Web Speech API (browser)
   2. Android native TTS via the OniAndroid JS bridge (APK) —
      the shell exposes ttsSpeak/ttsStop and reports progress
      through window.OniNativeTts.done() from
      UtteranceProgressListener.
   Small singleton that speaks a queue of text chunks with
   play/pause/stop + adjustable rate. Used by the book (EPUB)
   reader. Gracefully reports "unsupported" when neither
   backend exists.
   ============================================================ */

import { useSyncExternalStore } from "react";

export type TtsStatus = "idle" | "playing" | "paused";

export interface TtsSnapshot {
  status: TtsStatus;
  idx: number; // current chunk index
  total: number; // chunk count
}

let status: TtsStatus = "idle";
let paras: string[] = [];
let idx = 0;
let rate = 1;
let lang: string | undefined;
let gen = 0; // generation token — invalidates stale utterance callbacks
let snapshot: TtsSnapshot = { status: "idle", idx: 0, total: 0 };

const listeners = new Set<() => void>();

function emit() {
  snapshot = { status, idx, total: paras.length };
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): TtsSnapshot {
  return snapshot;
}

/* ------------------------------------------------------------------ */
/* Android native bridge (window.OniAndroid, injected by the shell)    */
/* ------------------------------------------------------------------ */

interface NativeTts {
  ttsAvailable: () => number;
  ttsSpeak: (text: string, lang: string, rate: number) => void;
  ttsStop: () => void;
}

function nativeTts(): NativeTts | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { OniAndroid?: Partial<NativeTts> }).OniAndroid;
  if (
    b &&
    typeof b.ttsAvailable === "function" &&
    typeof b.ttsSpeak === "function" &&
    typeof b.ttsStop === "function" &&
    b.ttsAvailable() === 1
  ) {
    return b as NativeTts;
  }
  return null;
}

/** hook the native progress callbacks (installed once, first use) */
let nativeHooked = false;
function ensureNativeHook() {
  if (nativeHooked || typeof window === "undefined") return;
  nativeHooked = true;
  const w = window as unknown as { OniNativeTts?: { done: () => void } };
  w.OniNativeTts = {
    // native chunk finished (or errored) → advance the queue
    done: () => {
      if (status === "playing") speakFrom(idx + 1);
    },
  };
}

export function ttsSupported(): boolean {
  if (nativeTts()) return true;
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

/** split one paragraph into speakable chunks (sentence-ish, ≤ 260 chars) */
function chunkPara(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= 260) return [clean];
  const sentences = clean.split(/(?<=[.!?…。！？؟])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + " " + s).trim().length > 260 && cur) {
      out.push(cur.trim());
      cur = s;
    } else {
      cur = (cur + " " + s).trim();
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [clean.slice(0, 260)];
}

function speakFrom(i: number) {
  const g = ++gen;
  idx = i;
  if (i >= paras.length) {
    status = "idle";
    emit();
    return;
  }
  emit();

  const native = nativeTts();
  if (native) {
    ensureNativeHook();
    // the shell flushes the queue per call → one chunk in flight;
    // UtteranceProgressListener calls OniNativeTts.done() when finished
    native.ttsSpeak(paras[i], lang ?? "", rate);
    return;
  }

  const u = new SpeechSynthesisUtterance(paras[i]);
  u.rate = rate;
  u.pitch = 1;
  if (lang) u.lang = lang;
  u.onend = () => {
    if (g !== gen || status === "idle") return;
    speakFrom(i + 1);
  };
  u.onerror = () => {
    if (g !== gen || status === "idle") return;
    // treat as end-of-chunk and continue (or finish)
    speakFrom(i + 1);
  };
  window.speechSynthesis.speak(u);
}

/** start reading a fresh list of paragraphs (cancels anything in flight) */
export function ttsStart(chunks: string[], opts?: { lang?: string; rate?: number }): boolean {
  if (!ttsSupported()) return false;
  const list = chunks.flatMap(chunkPara).filter(Boolean);
  if (!list.length) return false;
  const native = nativeTts();
  if (!native) window.speechSynthesis.cancel();
  paras = list;
  lang = opts?.lang;
  rate = opts?.rate ?? 1;
  status = "playing";
  speakFrom(0);
  return true;
}

export function ttsPause() {
  if (status !== "playing") return;
  const native = nativeTts();
  if (native) {
    // Android TTS has no pause — halt the chunk; resume re-speaks it
    native.ttsStop();
    status = "paused";
    emit();
    return;
  }
  if (!ttsSupported()) return;
  window.speechSynthesis.pause();
  status = "paused";
  emit();
}

export function ttsResume() {
  if (status !== "paused") return;
  const native = nativeTts();
  if (native) {
    status = "playing";
    speakFrom(idx);
    return;
  }
  if (!ttsSupported()) return;
  window.speechSynthesis.resume();
  status = "playing";
  emit();
}

export function ttsStop() {
  gen++;
  const native = nativeTts();
  if (native) {
    native.ttsStop();
  } else if (ttsSupported()) {
    window.speechSynthesis.cancel();
  }
  paras = [];
  idx = 0;
  status = "idle";
  emit();
}

/** change speed — restarts the current chunk with the new rate */
export function ttsSetRate(r: number) {
  rate = Math.min(2, Math.max(0.5, r));
  if (status === "playing") {
    const native = nativeTts();
    if (native) {
      speakFrom(idx); // restart current chunk at the new rate
    } else if (ttsSupported()) {
      window.speechSynthesis.cancel();
      speakFrom(idx);
    }
  } else if (status === "paused") {
    // resuming later would keep the old rate — restart chunk silently
    const native = nativeTts();
    if (native) native.ttsStop();
    else if (ttsSupported()) window.speechSynthesis.cancel();
    status = "idle";
    emit();
  }
}

export function useTts(): TtsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
