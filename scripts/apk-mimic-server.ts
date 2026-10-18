/// <reference types="bun-types" />
/**
 * Mimics MainActivity's asset interceptor so the static export can be
 * exercised in a desktop browser EXACTLY like inside the APK:
 *   - start URL is /assets/index.html (same document.baseURI as the APK)
 *   - /assets/X  →  out/X        (legacy prefix mapping)
 *   - /X         →  out/X        (root-absolute asset refs like /_next/…)
 *   - page-ish paths fall back X/index.html → X.html → 404.html
 *   - missing non-page assets → empty 200 text/plain (keeps app alive)
 */
const outRoot = new URL("../out/", import.meta.url).pathname;

const MIME: Record<string, string> = {
  html: "text/html", js: "text/javascript", mjs: "text/javascript",
  css: "text/css", json: "application/json", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", ico: "image/x-icon",
  txt: "text/plain", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", map: "application/json", pdf: "application/pdf",
  wasm: "application/wasm", epub: "application/epub+zip",
  cbz: "application/vnd.comicbook+zip",
};

function resolve(raw: string): string | null {
  let p = raw.split("?")[0];
  if (p.startsWith("/assets/")) p = p.slice("/assets/".length);
  while (p.startsWith("/")) p = p.slice(1);
  while (p.endsWith("/")) p = p.slice(0, -1);
  const looksLikePage = p === "" || !p.includes(".");
  const tries = looksLikePage
    ? [p === "" ? "index.html" : `${p}/index.html`, `${p}.html`, "404.html"]
    : [p];
  for (const t of tries) {
    try {
      const f = Bun.file(outRoot + t);
      if (f.size >= 0) {
        // existence check
        const exists = Bun.file(outRoot + t).size > 0 || t.endsWith(".html");
        const stat = require("node:fs").existsSync(outRoot + t);
        if (stat) return t;
      }
    } catch { /* keep trying */ }
  }
  return null;
}

Bun.serve({
  port: 4444,
  async fetch(req) {
    const url = new URL(req.url);
    const resolved = resolve(url.pathname);
    if (!resolved) {
      const looksLikePage = !url.pathname.split("?")[0].split("/").pop()!.includes(".");
      return new Response(looksLikePage ? "not found" : "",
        { status: looksLikePage ? 404 : 200, headers: { "content-type": looksLikePage ? "text/html" : "text/plain" } });
    }
    const f = Bun.file(outRoot + resolved);
    const ext = resolved.slice(resolved.lastIndexOf(".") + 1).toLowerCase();
    const headers: Record<string, string> = {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "access-control-allow-origin": "*",
      "cache-control": resolved.startsWith("_next/") ? "max-age=31536000, immutable" : "no-cache",
    };
    return new Response(f, { headers });
  },
});

console.log("apk-mimic on http://localhost:4444/assets/index.html");
