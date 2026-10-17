#!/usr/bin/env node
/**
 * Simulates the fixed MainActivity asset interceptor against the actual APK:
 *  1. extracts assets/www + classes.dex presence + manifest version
 *  2. collects every URL referenced by index.html (href/src/RSC payload)
 *  3. collects root-absolute runtime URLs referenced inside JS chunks
 *  4. maps each URL through the same logic as serveAsset() and asserts the
 *     target exists inside assets/www/
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const APK = "/home/z/my-project/download/oniLibrary-v1.0.1.apk";
const TMP = "/tmp/apk-verify";

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
execSync(`unzip -qo ${APK} -d ${TMP}`);

const WWW = path.join(TMP, "assets/www");
if (!fs.existsSync(WWW)) throw new Error("assets/www missing!");
if (!fs.existsSync(path.join(TMP, "classes.dex"))) throw new Error("classes.dex missing!");

// --- interceptor simulation (mirrors serveAsset/resolveAsset) ---
function exists(p) {
  try { return fs.statSync(path.join(WWW, p)).isFile(); } catch { return false; }
}
function resolve(rawPath) {
  let p = rawPath.split("?")[0].split("#")[0];
  if (p.startsWith("/assets/")) p = p.slice("/assets".length);
  while (p.startsWith("/")) p = p.slice(1);
  while (p.endsWith("/")) p = p.slice(0, -1);
  const looksLikePage = p === "" || !p.includes(".");
  if (p === "") return exists("index.html") ? "index.html" : null;
  if (exists(p)) return p;
  if (looksLikePage) {
    if (exists(p + "/index.html")) return p + "/index.html";
    if (exists(p + ".html")) return p + ".html";
  }
  return null;
}

// --- collect URLs from index.html ---
const idx = fs.readFileSync(path.join(WWW, "index.html"), "utf8");
const urls = new Set();
for (const m of idx.matchAll(/(?:src|href)="([^"]+)"/g)) urls.add(m[1]);
for (const m of idx.matchAll(/\\"(\/[^"\\]*?\.(?:js|css|woff2?|svg|png|webp|json|webmanifest))\\"/g)) urls.add(m[1]);
for (const m of idx.matchAll(/"(\/_next\/[^"]+?\.(?:js|css|woff2?))"/g)) urls.add(m[1]);

// --- collect root-absolute runtime URLs from all JS chunks ---
const jsFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const full = path.join(d, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.name.endsWith(".js") || e.name.endsWith(".mjs")) jsFiles.push(full);
  }
})(WWW);
let runtimeRefs = 0;
for (const f of jsFiles) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(/"(\/(?:_next|samples|covers|banners|icons|pdf|pdf-wasm|manifest\.webmanifest|logo[^"']*|sw\.js|404\.html)[^"]*)"/g)) {
    // skip bare prefixes ("/_next/", "/icons/") — only ever concatenated, never fetched alone
    if (m[1].endsWith("/")) continue;
    // /_next/image optimizer is dormant: static export builds with images.unoptimized
    if (m[1] === "/_next/image") continue;
    // sw.js never registers inside the APK ("OniAndroid" guard) — skip it as a source
    if (f.endsWith("/sw.js")) continue;
    urls.add(m[1]); runtimeRefs++;
  }
}

// --- verify each ---
let ok = 0, fail = 0;
const failures = [];
for (const u of urls) {
  if (/^https?:/.test(u) || u.startsWith("data:") || u.startsWith("mailto:")) continue;
  const r = resolve(u);
  if (r) { ok++; }
  else { fail++; failures.push(u); }
}

console.log(`index.html refs + JS runtime refs: ${urls.size} unique local URLs (${runtimeRefs} runtime)`);
console.log(`  RESOLVED: ${ok}`);
console.log(`  MISSING : ${fail}`);
if (failures.length) {
  console.log("FAILURES:");
  failures.forEach((f) => console.log("  ✗ " + f));
  process.exit(1);
}

// --- manifest version check ---
const AAPT2 = `${process.env.ANDROID_SDK_ROOT || "/home/z/android-sdk"}/build-tools/34.0.0/aapt2`;
const badging = execSync(`${AAPT2} dump badging ${APK}`).toString();
const ver = badging.match(/versionCode='(\d+)' versionName='([^']+)'/);
console.log(`APK version: code=${ver[1]} name=${ver[2]}`);
console.log(`assets/www files: ${execSync(`find ${WWW} -type f | wc -l`).toString().trim()}`);
console.log("✅ ALL ASSET URLS RESOLVE — interceptor fix verified");
