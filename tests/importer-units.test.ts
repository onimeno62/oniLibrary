/**
 * IMPORT — pure-function regression tests: archive magic-byte sniffing,
 * folder numbering hints, and the import size ceiling.
 */
import { describe, it, expect } from "bun:test";
import { sniffArchive, numberHintOf, isTooBig, MAX_IMPORT_BYTES } from "../src/lib/importer";

function bytes(...vals: number[]): Uint8Array {
  return new Uint8Array(vals);
}

describe("sniffArchive: magic bytes", () => {
  it("detects ZIP (PK\\x03\\x04) — real .cbz containers", () => {
    expect(sniffArchive(bytes(0x50, 0x4b, 0x03, 0x04, 0x00, 0x00))).toBe("zip");
    expect(sniffArchive(bytes(0x50, 0x4b, 0x05, 0x06))).toBe("zip"); // empty zip
  });

  it("detects RAR4 (Rar!\\x1a\\x07\\x00) — renamed .cbr files", () => {
    expect(sniffArchive(bytes(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00))).toBe("rar");
  });

  it("detects RAR5 (Rar!\\x1a\\x07\\x01\\x00)", () => {
    expect(sniffArchive(bytes(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00))).toBe("rar5");
  });

  it("detects 7z archives", () => {
    expect(sniffArchive(bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c))).toBe("7z");
  });

  it("returns null for unknown / short payloads — never guesses", () => {
    expect(sniffArchive(bytes(0x00, 0x01, 0x02, 0x03))).toBe(null);
    expect(sniffArchive(bytes(0x50))).toBe(null); // too short
    expect(sniffArchive(new Uint8Array(0))).toBe(null);
    expect(sniffArchive(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(null); // JPEG, not an archive
  });
});

describe("numberHintOf: folder/chapter numbering", () => {
  it("parses vol/ch/chapter/episode prefixes with separators", () => {
    expect(numberHintOf("vol 03")).toBe(3);
    expect(numberHintOf("v12")).toBe(12);
    expect(numberHintOf("Chapter 12.5")).toBe(12.5);
    expect(numberHintOf("ch04")).toBe(4);
    expect(numberHintOf("EP.7")).toBe(7);
    expect(numberHintOf("episode_99")).toBe(99);
  });

  it("rejects non-numbered names", () => {
    expect(numberHintOf("One Shot")).toBe(null);
    expect(numberHintOf("extras")).toBe(null);
    expect(numberHintOf("")).toBe(null);
  });
});

describe("import size ceiling", () => {
  it("MAX_IMPORT_BYTES is 600 MB and isTooBig enforces it", () => {
    expect(MAX_IMPORT_BYTES).toBe(600 * 1_048_576);
    const big = { size: MAX_IMPORT_BYTES + 1 } as File;
    const edge = { size: MAX_IMPORT_BYTES } as File;
    expect(isTooBig(big)).toBe(true);
    expect(isTooBig(edge)).toBe(false);
  });
});
