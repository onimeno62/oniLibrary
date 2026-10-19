/**
 * SEC — Vault PIN cryptography regression tests.
 * Proves: v2 records are salted PBKDF2 (format + uniqueness), legacy
 * records still verify (migration path), corrupted/absent records never
 * unlock, and no plaintext PIN is persisted.
 */
import { describe, it, expect } from "bun:test";
import {
  legacyPinHash,
  createPinRecord,
  verifyPinRecord,
  isLegacyPinRecord,
} from "../src/lib/vault-crypto";

describe("vault-crypto: v2 PBKDF2 records", () => {
  it("creates a v2:salt:hash record with base64 parts", async () => {
    const rec = await createPinRecord("1234");
    const parts = rec.split(":");
    expect(rec.startsWith("v2:")).toBe(true);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("v2");
    // 128-bit salt → 22-24 b64 chars; 256-bit hash → 44 b64 chars
    expect(parts[1].length).toBeGreaterThanOrEqual(22);
    expect(parts[2].length).toBe(44);
  });

  it("verifies the correct PIN and rejects a wrong PIN", async () => {
    const rec = await createPinRecord("9876");
    expect(await verifyPinRecord(rec, "9876")).toBe(true);
    expect(await verifyPinRecord(rec, "9877")).toBe(false);
  });

  it("uses a random salt — same PIN yields two different records", async () => {
    const a = await createPinRecord("0000");
    const b = await createPinRecord("0000");
    expect(a).not.toBe(b);
    // both still verify the same PIN
    expect(await verifyPinRecord(a, "0000")).toBe(true);
    expect(await verifyPinRecord(b, "0000")).toBe(true);
  });

  it("never stores the plaintext PIN", async () => {
    const pin = "4321";
    const rec = await createPinRecord(pin);
    expect(rec.includes(pin)).toBe(false);
  });
});

describe("vault-crypto: legacy record migration path", () => {
  it("still verifies legacy h… records (unsalted v1 format)", async () => {
    const legacy = legacyPinHash("1111");
    expect(legacy.startsWith("h")).toBe(true);
    expect(await verifyPinRecord(legacy, "1111")).toBe(true);
    expect(await verifyPinRecord(legacy, "1112")).toBe(false);
  });

  it("flags legacy records for upgrade, v2 records not", () => {
    expect(isLegacyPinRecord(legacyPinHash("2222"))).toBe(true);
    expect(isLegacyPinRecord("v2:AAAA:BBBB")).toBe(false);
    expect(isLegacyPinRecord(null)).toBe(false);
    expect(isLegacyPinRecord(undefined)).toBe(false);
  });
});

describe("vault-crypto: hostile / corrupt input", () => {
  it("absent record never unlocks", async () => {
    expect(await verifyPinRecord(null, "1234")).toBe(false);
    expect(await verifyPinRecord(undefined, "1234")).toBe(false);
    expect(await verifyPinRecord("", "1234")).toBe(false);
  });

  it("corrupted v2 record never unlocks (fail closed)", async () => {
    expect(await verifyPinRecord("v2:not-base64!@#", "1234")).toBe(false);
    expect(await verifyPinRecord("v2:only-salt", "1234")).toBe(false);
  });
});
