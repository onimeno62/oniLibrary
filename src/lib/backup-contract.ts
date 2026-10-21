/**
 * Backup contract (BKP-001/SEC-003) — pure helpers for what may leave the
 * device in a `.onibackup` payload and what may come back in through one.
 *
 * Credentials that must NEVER travel in a backup file:
 * - the Vault PIN record (`vaultPinHash`) — device-local by design (VLT-002)
 * - stored catalog credentials (`ServerEntry.auth`) — stripped separately in
 *   the backup screen / import path
 * - the AniList tracker token (`settings.tracker.token`) — D3: this was
 *   previously exported in plaintext, contradicting the on-screen privacy
 *   claim; it is now stripped on export and refused on import.
 */
import type { Settings } from "./types";

/** Produce the settings object that is safe to embed in a backup payload.
 *  `vaultPinHash` is intentionally ABSENT from the exported shape — it must
 *  never leave the device (VLT-002). */
export function sanitizeSettingsForBackup(settings: Settings): Omit<Settings, "vaultPinHash"> {
  const { vaultPinHash: _pin, ...rest } = settings;
  return {
    ...rest,
    tracker: { ...rest.tracker, token: "" },
  };
}

/**
 * Sanitize settings arriving from a backup file. The device-local PIN is kept
 * (the caller preserves it anyway — known-hash attack guard) and any tracker
 * token in the payload is dropped: a backup file must never be able to inject
 * a credential. Users re-paste their token after a restore.
 */
export function sanitizeSettingsForImport(
  incoming: Partial<Settings> | undefined,
  current: Settings
): Settings {
  const merged: Settings = { ...current, ...(incoming ?? {}) };
  return {
    ...merged,
    vaultPinHash: current.vaultPinHash,
    tracker: { ...merged.tracker, token: "" },
  };
}
