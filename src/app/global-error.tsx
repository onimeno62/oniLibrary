"use client";

/* ============================================================
   oniLibrary — global error screen (replaces the stock Next.js
   "Application error: a client-side exception has occurred"
   dead end reported from the APK).

   Goals:
   1. Give the user a way OUT (reload / clear corrupted state)
      instead of a frozen white page.
   2. Make the underlying exception visible + copyable so bug
      reports contain something actionable.
   3. Stay dependency-free (inline styles only — the stylesheet
      chunks themselves may be what failed to load).
   ============================================================ */

import { useEffect, useState } from "react";

const C = {
  bg: "#f3ebdf",
  card: "#ffffff",
  ink: "#2b241d",
  sub: "#8a7a68",
  coral: "#f8694c",
  coralDark: "#e4522f",
  border: "#e8ddcc",
};

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // surface the digest in the console for WebView remote debugging
    console.error("[oniLibrary] global error", error);
  }, [error]);

  const reload = () => {
    try {
      window.location.reload();
    } catch {
      /* last resort */
      reset();
    }
  };

  const clearAndReload = () => {
    try {
      window.localStorage.removeItem("onilibrary-store-v1");
      window.localStorage.removeItem("theme");
    } catch {
      /* storage unavailable */
    }
    const idb = (window.indexedDB || (window as unknown as { webkitIndexedDB?: IDBFactory }).webkitIndexedDB) as IDBFactory | undefined;
    try {
      if (idb) {
        const req = idb.deleteDatabase("onilibrary-files");
        req.onsuccess = reload;
        req.onerror = reload;
        req.onblocked = reload;
        // if deletion hangs, still get out
        window.setTimeout(reload, 1500);
        return;
      }
    } catch {
      /* fall through to plain reload */
    }
    reload();
  };

  const details = [
    error?.message || "(no message)",
    error?.digest ? `digest: ${error.digest}` : null,
    error?.stack || "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — details are visible anyway */
    }
  };

  return (
    <html lang="en">
      <body style={{ margin: 0, background: C.bg, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 28,
              padding: "28px 24px 24px",
              boxShadow: "0 30px 70px -30px rgba(43,36,29,0.4)",
              textAlign: "center",
            }}
          >
            {/* oni mark (inline so no asset request can fail) */}
            <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden style={{ display: "block", margin: "0 auto 14px" }}>
              <path
                d="M32 6c3 4 4.5 7.5 4.5 11 0 1.8-.3 3.4-.9 4.9C42 24.6 47 30.8 47 38.5 47 49 40.5 56 32 56s-15-7-15-17.5c0-7.7 5-13.9 11.4-16.6-.6-1.5-.9-3.1-.9-4.9 0-3.5 1.5-7 4.5-11Z"
                fill={C.coral}
              />
              <path d="M17 12l9 7M47 12l-9 7" stroke={C.coral} strokeWidth="5" strokeLinecap="round" />
              <circle cx="26" cy="38" r="3" fill="#fff" />
              <circle cx="38" cy="38" r="3" fill="#fff" />
            </svg>

            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: C.ink }}>
              oniLibrary hit an unexpected error
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: 13.5, lineHeight: 1.55, fontWeight: 600, color: C.sub }}>
              Don&apos;t worry — your library is safe. Reload the app to continue
              reading. If this keeps happening, clear the app state below.
            </p>

            <button
              onClick={reload}
              style={{
                marginTop: 20,
                width: "100%",
                height: 48,
                border: "none",
                borderRadius: 999,
                background: `linear-gradient(135deg, ${C.coral}, ${C.coralDark})`,
                color: "#fff",
                fontSize: 14.5,
                fontWeight: 800,
                cursor: "pointer",
                boxShadow: "0 12px 26px -12px rgba(248,105,76,0.8)",
              }}
            >
              Reload oniLibrary
            </button>

            <button
              onClick={clearAndReload}
              style={{
                marginTop: 10,
                width: "100%",
                height: 46,
                border: `1.5px solid ${C.border}`,
                borderRadius: 999,
                background: "#fff",
                color: C.ink,
                fontSize: 13.5,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Clear app state &amp; reload
            </button>

            <button
              onClick={() => setShowDetails((v) => !v)}
              style={{
                marginTop: 16,
                border: "none",
                background: "none",
                color: C.sub,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.04em",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {showDetails ? "Hide error details" : "Show error details"}
            </button>

            {showDetails && (
              <div style={{ marginTop: 10, textAlign: "left" }}>
                <pre
                  style={{
                    margin: 0,
                    maxHeight: 150,
                    overflow: "auto",
                    background: "#fbf7f0",
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    padding: 12,
                    fontSize: 10.5,
                    lineHeight: 1.5,
                    color: C.ink,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {details || "(empty)"}
                </pre>
                <button
                  onClick={copy}
                  style={{
                    marginTop: 8,
                    border: "none",
                    background: "none",
                    color: C.coralDark,
                    fontSize: 11.5,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {copied ? "Copied ✓" : "Copy details for a bug report"}
                </button>
              </div>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
