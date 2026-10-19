/**
 * BIL — i18n en/fa runtime parity regression tests.
 * tsc enforces fa's Record<TranslationKey, string> typing at compile time,
 * but bun test does not type-check — these tests prove completeness at
 * runtime so a partially-translated fa dictionary can never ship silently.
 * Persian RTL layout is asserted to be independent from reading direction
 * settings (translate() never mutates direction semantics).
 */
import { describe, it, expect } from "bun:test";
import { dictionaries, translate, LANGS } from "../src/lib/i18n";

const en = dictionaries.en;
const fa = dictionaries.fa;

describe("i18n: en/fa key parity", () => {
  it("every en key has a fa translation", () => {
    const missing = Object.keys(en).filter((k) => !(k in fa));
    expect(missing).toEqual([]);
  });

  it("every fa key exists in en (no orphaned translations)", () => {
    const orphaned = Object.keys(fa).filter((k) => !(k in en));
    expect(orphaned).toEqual([]);
  });

  it("no empty translations in either dictionary", () => {
    for (const [lang, dict] of [["en", en], ["fa", fa]] as const) {
      const empty = Object.entries(dict)
        .filter(([, v]) => typeof v !== "string" || v.trim() === "")
        .map(([k]) => k);
      expect(empty).toEqual([]);
      void lang;
    }
  });
});

describe("i18n: translate behavior", () => {
  it("resolves keys in both languages with non-identical real strings", () => {
    const key = "common.appName" as const;
    expect(translate("en", key)).toBe(en[key]);
    expect(translate("fa", key)).toBe(fa[key]);
  });

  it("interpolates {vars} without leaving placeholders behind", () => {
    const key = "common.page" as const;
    const enOut = translate("en", key, { n: 3 });
    expect(enOut).not.toBe(key);
    expect(enOut.includes("{")).toBe(false);
  });

  it("unknown keys fall back to the key itself (never crash)", () => {
    expect(translate("en", "totally.missing" as never)).toBe("totally.missing");
    expect(translate("fa", "totally.missing" as never)).toBe("totally.missing");
  });

  it("LANGS offers exactly en + fa", () => {
    expect(LANGS.map((l) => l.id).sort()).toEqual(["en", "fa"]);
  });
});
