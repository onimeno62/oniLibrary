"use client";

/* ============================================================
   oniLibrary — safe Android JS-bridge access (single choke point)
   ============================================================
   Some Android System WebView builds throw when a Java-bridge
   method is invoked (argument unmarshaling failures, GC races on
   the injected object, old Chromium dispatch quirks). A thrown
   bridge error must never crash a whole screen, so every native
   call goes through callBridge(), which:
     1. feature-detects the method,
     2. swallows any synchronous exception,
     3. returns undefined when the call is unavailable or failed.
   ============================================================ */

interface OniBridge {
  [name: string]: ((...args: unknown[]) => unknown) | undefined;
}

export function oniBridge(): OniBridge | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { OniAndroid?: OniBridge }).OniAndroid;
  return b && typeof b === "object" ? b : null;
}

export function hasBridgeMethod(name: string): boolean {
  const b = oniBridge();
  return typeof b?.[name] === "function";
}

/** invoke a bridge method safely; returns undefined when unavailable/failed */
export function callBridge<T = unknown>(name: string, ...args: unknown[]): T | undefined {
  try {
    const b = oniBridge();
    const fn = b?.[name];
    if (typeof fn !== "function") return undefined;
    return fn.apply(b, args) as T;
  } catch {
    return undefined;
  }
}
