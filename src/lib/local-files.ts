"use client";

/**
 * Binary file storage for imported works — an IndexedDB blob store.
 * localStorage can't hold multi-MB page images / PDFs / EPUBs, so all
 * imported content lives here instead.
 *
 * Key convention (namespaced per work):
 *   "<workId>::p0", "<workId>::p1", …   — page image blobs (CBZ / image batch)
 *   "<workId>::pdf"                     — the full PDF file of a PDF work
 *   "<workId>::epub"                    — parsed EPUB document (JSON blob)
 */

const DB_NAME = "onilibrary-files";
const DB_VERSION = 1;
const STORE = "files";

let dbPromise: Promise<IDBDatabase> | null = null;

function openFilesDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("idb-unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("idb-open-failed"));
      req.onblocked = () => reject(new Error("idb-blocked"));
    });
  }
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb-request-failed"));
  });
}

/** store a blob under a namespaced key */
export async function putFile(key: string, blob: Blob): Promise<void> {
  const d = await openFilesDb();
  const tx = d.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(blob, key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb-put-failed"));
    tx.onabort = () => reject(tx.error ?? new Error("idb-put-aborted"));
  });
}

/** fetch a stored blob (null when missing) */
export async function getFile(key: string): Promise<Blob | null> {
  const d = await openFilesDb();
  const tx = d.transaction(STORE, "readonly");
  const blob = await requestToPromise(tx.objectStore(STORE).get(key) as IDBRequest<Blob | undefined>);
  return blob ?? null;
}

/** remove a single stored blob */
export async function deleteFile(key: string): Promise<void> {
  const d = await openFilesDb();
  const tx = d.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb-delete-failed"));
  });
}

/**
 * delete every blob belonging to a work (pages + pdf + epub).
 * Fire-and-forget friendly: works never throw into the UI path.
 */
export async function deleteWorkFiles(workId: string): Promise<void> {
  try {
    const d = await openFilesDb();
    const tx = d.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const range = IDBKeyRange.bound(`${workId}::`, `${workId}::\uffff`, false, false);
    const cursorReq = store.openCursor(range);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // best-effort cleanup
      tx.onabort = () => resolve();
    });
  } catch {
    /* best-effort */
  }
}

/**
 * downscale an image blob into a small cover thumbnail data-URL
 * (used for imported CBZ / image-batch / EPUB covers).
 */
export async function blobToThumbDataUrl(blob: Blob, maxSize = 512): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas-unavailable");
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    bitmap.close?.();
  }
}
