/**
 * Restore contract (Phase C, audit D11) — pure helpers for what happens to
 * blobs and download rows during `importBackup`.
 *
 * Two honesty rules:
 *  1. Works removed by a restore must not leave orphaned page blobs in
 *     IndexedDB (the old import replaced the works array and leaked).
 *  2. Restored DONE download rows reference page blobs that were NEVER in
 *     the backup payload — they must be re-audited against the real store
 *     and demoted to an honest ERROR/missing state instead of showing
 *     hollow "Downloaded" rows with missing-page panels in the reader.
 */

/** ids present in `currentIds` but absent from `incomingIds` */
export function orphanedWorkIds(currentIds: readonly string[], incomingIds: readonly string[]): string[] {
  const incoming = new Set(incomingIds);
  return currentIds.filter((id) => !incoming.has(id));
}

interface AuditableWork {
  id: string;
  chapters: { id: string; localPages?: readonly string[] | null }[];
}

interface AuditableRow {
  id: string;
  workId: string;
  chapterId: string;
  status: string;
}

/**
 * Classify restored DONE rows by whether their first stored page blob
 * actually exists. `blobExists` is injectable (IndexedDB in the app, a fake
 * in tests). Rows whose work/chapter/localPages are gone are also broken —
 * they could never render.
 */
export async function auditRestoredDownloadRows(
  rows: readonly AuditableRow[],
  works: readonly AuditableWork[],
  blobExists: (key: string) => Promise<boolean>
): Promise<{ ok: string[]; broken: string[] }> {
  const ok: string[] = [];
  const broken: string[] = [];
  for (const r of rows) {
    if (r.status !== "DONE") continue;
    const work = works.find((w) => w.id === r.workId);
    const chapter = work?.chapters.find((c) => c.id === r.chapterId);
    const key = chapter?.localPages?.[0];
    let exists = false;
    if (key) {
      try {
        exists = !!(await blobExists(key));
      } catch {
        exists = false; // a failing blob store must fail CLOSED (honest), never assume success
      }
    }
    if (!key || !exists) broken.push(r.id);
    else ok.push(r.id);
  }
  return { ok, broken };
}
