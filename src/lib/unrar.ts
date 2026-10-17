"use client";

/**
 * CBR (RAR) extraction — WASM unrar (official unrar C++ via node-unrar-js).
 *
 * Browser notes (verified in the v1.2.0 spike against real RAR4/RAR5 files):
 *  - the .wasm asset is fetched from /wasm/unrar.wasm and passed explicitly
 *    as `wasmBinary` (must be an ArrayBuffer, not a view);
 *  - the returned iterators MUST be fully consumed or the underlying C++
 *    archive object leaks;
 *  - `arcHeader.flags.volume` marks multi-volume sets, which we reject with a
 *    clear reason instead of silently extracting only the first part.
 */

export type CbrEntry = { name: string; bytes: Uint8Array };

export type CbrError =
  | { kind: "password" } // encrypted (header or file) — no/!correct password
  | { kind: "multivolume" } // part1/part2 sets — not supported
  | { kind: "corrupt" };

type UnrarErrorLike = { reason?: string | number };

let wasmPromise: Promise<ArrayBuffer> | null = null;

function loadWasm(): Promise<ArrayBuffer> {
  wasmPromise ??= fetch("/wasm/unrar.wasm")
    .then((r) => {
      if (!r.ok) throw new Error("unrar.wasm missing");
      return r.arrayBuffer();
    })
    .catch((e) => {
      wasmPromise = null; // allow retry on transient failure
      throw e;
    });
  return wasmPromise;
}

function mapError(e: unknown): CbrError {
  const reason = (e as UnrarErrorLike)?.reason;
  const rs = String(reason ?? "");
  if (rs.includes("PASSWORD")) return { kind: "password" };
  return { kind: "corrupt" };
}

/** extract every file of a RAR/CBR archive; throws mapped CbrError on failure */
export async function extractCbr(file: File): Promise<CbrEntry[]> {
  const { createExtractorFromData } = await import("node-unrar-js");
  const [wasmBinary, data] = await Promise.all([loadWasm(), file.arrayBuffer()]);
  const extractor = await createExtractorFromData({ data, wasmBinary });

  // header-encrypted archives reject the listing without a password first —
  // surface that as a password problem before attempting extraction
  try {
    const list = extractor.getFileList();
    const headers = [...list.fileHeaders]; // must consume fully (C++ cleanup)
    const arcHeader = list.arcHeader;
    if (arcHeader?.flags?.volume) throw { kind: "multivolume" } satisfies CbrError;
    if (headers.length === 0) return [];
  } catch (e) {
    if ((e as CbrError).kind === "multivolume") throw e;
    throw mapError(e);
  }

  try {
    const extracted = extractor.extract({});
    const out: CbrEntry[] = [];
    for (const f of extracted.files) {
      // must iterate to the end (C++ cleanup); extraction is undefined for dirs
      if (f.extraction) out.push({ name: f.fileHeader.name, bytes: f.extraction });
    }
    return out;
  } catch (e) {
    throw mapError(e);
  }
}
