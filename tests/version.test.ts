/**
 * Audit D6 regression — the UI version constants can never drift from the
 * shipped Android manifest again. The old badges hardcoded "v1.1.1 (4)" and
 * "v1.0.0" while the manifest said 1.5.0 (14).
 *
 * Reads the actual AndroidManifest.xml at test time: bumping the manifest
 * without bumping src/lib/version.ts (or vice versa) fails this suite.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_VERSION, APP_VERSION_CODE, APP_REPO_URL } from "../src/lib/version";

const ROOT = join(import.meta.dir, "..");
const manifest = readFileSync(join(ROOT, "android/app/AndroidManifest.xml"), "utf8");

function manifestAttr(name: string): string {
  const m = manifest.match(new RegExp(`android:${name}="([^"]+)"`));
  if (!m) throw new Error(`manifest attribute ${name} not found`);
  return m[1];
}

describe("version single source of truth (audit D6)", () => {
  it("APP_VERSION matches the manifest versionName", () => {
    expect(APP_VERSION).toBe(manifestAttr("versionName"));
  });

  it("APP_VERSION_CODE matches the manifest versionCode", () => {
    expect(String(APP_VERSION_CODE)).toBe(manifestAttr("versionCode"));
  });

  it("no component hardcodes a version literal anymore", () => {
    // sweep the screens that used to hardcode versions (settings/more) —
    // any "vN.N.N" literal in rendered output is a regression (comments ok)
    const screens = ["settings-screen.tsx", "more-screen.tsx"];
    for (const f of screens) {
      const src = readFileSync(join(ROOT, "src/components/screens", f), "utf8");
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(code.match(/v\d+\.\d+\.\d+/)?.[0]).toBeUndefined();
    }
  });

  it("repo URL points at the renamed repository", () => {
    expect(APP_REPO_URL).toBe("https://github.com/onimeno62/oniLibrary");
    expect(APP_REPO_URL).not.toContain("_zai");
  });
});
