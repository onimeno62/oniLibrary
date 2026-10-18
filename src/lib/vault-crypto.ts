/**
 * Vault PIN cryptography — PBKDF2-SHA256 via WebCrypto.
 *
 * v1 of the app stored `hashPin(pin)` — an unsalted 32-bit multiplicative
 * hash. For a 4-digit PIN (10 000 combinations) that is trivially
 * enumerable by anyone who can read localStorage (device access, previously
 * also `adb backup` — now disabled manifest-wide). This module replaces it:
 *
 *  - records are stored as `v2:<saltB64>:<hashB64>` with a per-install
 *    random 128-bit salt and 120 000 PBKDF2-SHA256 iterations;
 *  - legacy `h…` records are still verified (migration path) and are
 *    transparently upgraded to a v2 record on the next successful unlock;
 *  - no plaintext PIN is ever persisted.
 */

const PBKDF2_ITERATIONS = 120_000;
const encoder = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** legacy v1 hash — kept ONLY to migrate existing PINs; do not use for new records */
export function legacyPinHash(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = (h * 31 + pin.charCodeAt(i)) | 0;
  }
  return "h" + Math.abs(h).toString(36);
}

async function pbkdf2(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const raw = new Uint8Array(encoder.encode(pin));
  const key = await crypto.subtle.importKey("raw", raw, "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256
  );
  return toB64(new Uint8Array(bits));
}

/** create a v2 PIN record (salted PBKDF2) for storage in settings.vaultPinHash */
export async function createPinRecord(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt);
  return `v2:${toB64(salt)}:${hash}`;
}

/** verify a PIN against a v2 or legacy record */
export async function verifyPinRecord(
  record: string | null | undefined,
  pin: string
): Promise<boolean> {
  if (!record) return false;
  if (record.startsWith("v2:")) {
    const [, saltB64, hashB64] = record.split(":");
    if (!saltB64 || !hashB64) return false;
    try {
      return (await pbkdf2(pin, fromB64(saltB64))) === hashB64;
    } catch {
      return false; // corrupted record — never unlock
    }
  }
  // legacy record — compare, caller upgrades on success
  return legacyPinHash(pin) === record;
}

/** true when the stored record is the weak legacy format (needs upgrade) */
export function isLegacyPinRecord(record: string | null | undefined): boolean {
  return Boolean(record) && !String(record).startsWith("v2:");
}
