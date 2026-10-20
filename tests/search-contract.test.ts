/**
 * SOURCE/SEARCH CONTRACT — Phase 2 gate of
 * docs/DISCOVER_TECHNICAL_IMPLEMENTATION_PLAN.md (§12 Phase 2, §13).
 *
 * Proves:
 *  - latest-wins run guard → old requests must not overwrite newer results
 *  - clearing a query cannot resurrect old results (stale commits dropped)
 *  - appended/paginated lists never duplicate entries (shifting feeds)
 *  - one source failing does not erase other sources' results
 *  - repeated add-to-library is idempotent (same sourceRef → same work)
 *  - every transport failure is typed and every read has a deadline
 *  - a short/interrupted binary transfer is NEVER returned as success
 */
import { describe, it, expect, afterEach } from "bun:test";
import {
  makeRunGuard,
  dedupeBy,
  aggregateSources,
  resolveAddTarget,
} from "../src/lib/search-contract";
import { withDeadline, opdsFetchText, opdsFetchBinary, SourceError } from "../src/lib/opds";

/* ---------------- run guard (stale-response races T1/S1-family) ---------------- */

describe("makeRunGuard: latest-wins request identity", () => {
  it("the newest run is current, all older runs are stale", () => {
    const g = makeRunGuard();
    const a = g.start();
    expect(g.isCurrent(a)).toBe(true);
    const b = g.start();
    expect(g.isCurrent(b)).toBe(true);
    expect(g.isCurrent(a)).toBe(false); // tab switched / new query → old run dropped
    expect(g.current()).toBe(b);
  });

  it("interleaved late responses cannot commit: the classic load-more + tab-switch race", () => {
    const g = makeRunGuard();
    // user taps "Load more" (page 1), then switches tab which starts a page-0 load
    const loadMore = g.start();
    const tabSwitch = g.start();
    expect(g.isCurrent(tabSwitch)).toBe(true);
    // …the stale page-1 response arrives first
    expect(g.isCurrent(loadMore)).toBe(false); // must be dropped, not appended
  });

  it("is monotonic across many runs", () => {
    const g = makeRunGuard();
    let prev = 0;
    for (let i = 0; i < 5; i++) {
      const id = g.start();
      expect(id).toBeGreaterThan(prev);
      prev = id;
    }
  });
});

/* ---------------- pagination dedup (T2) ---------------- */

describe("dedupeBy: duplicate pages do not duplicate results", () => {
  const key = (m: { id: string }) => m.id;

  it("keeps order and first occurrences within one page", () => {
    const page = [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "c" }];
    expect(dedupeBy(page, key)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("drops items already shown on earlier pages when appending", () => {
    const prev = [{ id: "a" }, { id: "b" }];
    const shiftedPage = [{ id: "b" }, { id: "c" }, { id: "d" }]; // feed shifted: b re-appears
    expect(dedupeBy([...prev, ...shiftedPage], key)).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }]);
  });

  it("an exact-24 final page stays exactly 24 (no phantom repeats)", () => {
    const full = Array.from({ length: 24 }, (_, i) => ({ id: `m${i}` }));
    expect(dedupeBy(full, key)).toHaveLength(24);
  });

  it("never keeps unidentifiable rows (empty key)", () => {
    expect(dedupeBy([{ id: "" }, { id: "x" }], key)).toEqual([{ id: "x" }]);
  });
});

/* ---------------- partial source failure (S3, plan §7) ---------------- */

describe("aggregateSources: one source failing does not erase other results", () => {
  it("keeps successful hits alongside a failed source", () => {
    const agg = aggregateSources<string>([
      { id: "md", label: "MangaDex", outcome: { status: "ok", data: ["Title A"] } },
      { id: "srv1", label: "Server One", outcome: { status: "failed", error: "HTTP 500" } },
      { id: "srv2", label: "Server Two", outcome: { status: "ok", data: ["Book B"] } },
    ]);
    expect(agg.hits.map((h) => h.id)).toEqual(["md", "srv2"]);
    expect(agg.failed).toEqual([{ id: "srv1", label: "Server One", error: "HTTP 500" }]);
  });

  it("all sources failing yields empty hits but a complete failure list", () => {
    const agg = aggregateSources<string>([
      { id: "a", label: "A", outcome: { status: "failed", error: "timeout" } },
      { id: "b", label: "B", outcome: { status: "failed", error: "HTTP 403" } },
    ]);
    expect(agg.hits).toEqual([]);
    expect(agg.failed.map((f) => f.id)).toEqual(["a", "b"]);
  });

  it("sources without search support land in `unsupported`, not `failed`", () => {
    const agg = aggregateSources<string>([
      { id: "a", label: "A", outcome: { status: "unsupported" } },
      { id: "b", label: "B", outcome: { status: "ok", data: [] } }, // ok but empty → no fake hits
    ]);
    expect(agg.unsupported.map((u) => u.id)).toEqual(["a"]);
    expect(agg.hits).toEqual([]);
    expect(agg.failed).toEqual([]);
  });
});

/* ---------------- idempotent add-to-library (T6, plan §8) ---------------- */

describe("resolveAddTarget: repeated adds are idempotent", () => {
  type W = { id: string; title: string; sourceRef?: { sourceId: string; itemId: string } | null };
  const works: W[] = [
    { id: "w-local", title: "Local import" },
    { id: "w-md-1", title: "Solo Leveling", sourceRef: { sourceId: "mangadex", itemId: "uuid-1" } },
    { id: "w-md-2", title: "Other", sourceRef: { sourceId: "mangadex", itemId: "uuid-2" } },
  ];

  it("re-adding a known source title resolves to the existing work", () => {
    const hit = resolveAddTarget(works, { sourceId: "mangadex", itemId: "uuid-1" });
    expect(hit?.id).toBe("w-md-1");
  });

  it("a different remote item does not collide", () => {
    expect(resolveAddTarget(works, { sourceId: "mangadex", itemId: "uuid-99" })).toBeNull();
  });

  it("a different source never matches the same remote id", () => {
    expect(resolveAddTarget(works, { sourceId: "opds", itemId: "uuid-1" })).toBeNull();
  });

  it("local imports without a sourceRef are never matched", () => {
    expect(resolveAddTarget(works, { sourceId: "", itemId: "" })).toBeNull();
  });
});

/* ---------------- transport deadlines & typed errors (O1/O2/O4) ---------------- */

const realFetch = globalThis.fetch;
const realWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  globalThis.fetch = realFetch;
  (globalThis as { window?: unknown }).window = realWindow;
});

describe("withDeadline", () => {
  it("passes the value through when the promise settles in time", async () => {
    expect(await withDeadline(Promise.resolve(7), 1000)).toBe(7);
  });

  it("rejects with a typed timeout when the deadline passes first", async () => {
    const never = new Promise<string>(() => {});
    await expect(withDeadline(never, 15, "feed")).rejects.toMatchObject({
      name: "SourceError",
      kind: "timeout",
    });
  });
});

describe("opdsFetchText: typed errors on the browser path (no bridge)", () => {
  it("HTTP failures become SourceError(kind=http) with the status", async () => {
    globalThis.fetch = (async () => ({ ok: false, status: 403 })) as unknown as typeof fetch;
    (globalThis as { window?: unknown }).window = undefined;
    const err = await opdsFetchText("https://example.invalid/feed.xml").catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect((err as SourceError).kind).toBe("http");
    expect((err as SourceError).status).toBe(403);
  });

  it("connection failures become SourceError(kind=network) with the reason", async () => {
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    (globalThis as { window?: unknown }).window = undefined;
    const err = await opdsFetchText("https://example.invalid/feed.xml").catch((e) => e);
    expect((err as SourceError).kind).toBe("network");
    expect((err as SourceError).message).toContain("Failed to fetch");
  });

  it("an aborted read becomes SourceError(kind=timeout)", async () => {
    globalThis.fetch = (async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    }) as unknown as typeof fetch;
    (globalThis as { window?: unknown }).window = undefined;
    const err = await opdsFetchText("https://example.invalid/feed.xml").catch((e) => e);
    expect((err as SourceError).kind).toBe("timeout");
  });
});

describe("opdsFetchText: the bridge is authoritative (no doomed double fetch, O4)", () => {
  it("a failed native call throws the native reason and never touches window.fetch", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return { ok: true, text: async () => "" };
    }) as unknown as typeof fetch;
    (globalThis as { window?: unknown }).window = {
      OniAndroid: {
        httpGetString: () => null,
        lastHttpError: () => "TLS handshake failed",
      },
    };
    const err = await opdsFetchText("https://example.invalid/feed.xml").catch((e) => e);
    expect(fetchCalled).toBe(false); // the browser fetch always CORS-fails in the APK
    expect(err).toBeInstanceOf(SourceError);
    expect((err as SourceError).message).toContain("TLS handshake failed");
  });

  it("a successful native call returns the body directly", async () => {
    (globalThis as { window?: unknown }).window = {
      OniAndroid: { httpGetString: () => "<feed/>", lastHttpError: () => null },
    };
    expect(await opdsFetchText("https://example.invalid/feed.xml")).toBe("<feed/>");
  });
});

/* ---------------- verify-before-complete (O3, plan §8) ---------------- */

describe("opdsFetchBinary: short transfers are never dressed as success", () => {
  function withBridge(manifest: unknown, chunks: Array<string | null>) {
    let call = 0;
    (globalThis as { window?: unknown }).window = {
      OniAndroid: {
        fetchToCache: () => (manifest === undefined ? null : JSON.stringify(manifest)),
        readImportChunk: () => chunks[Math.min(call++, chunks.length - 1)] ?? "",
        clearPendingImport: () => {},
      },
    };
  }

  it("a complete staged file is returned as a File", async () => {
    withBridge({ name: "book.epub", mime: "application/epub+zip", size: 4 }, [btoa("abcd")]);
    const f = await opdsFetchBinary("https://x/book.epub", "book.epub");
    expect(f).toBeInstanceOf(File);
    expect(f?.size).toBe(4);
  });

  it("a short read returns null instead of a truncated file", async () => {
    // manifest promises 200 bytes, the staged file only delivers 100
    withBridge({ name: "book.epub", mime: "application/epub+zip", size: 200 }, [btoa("x".repeat(100)), ""]);
    const f = await opdsFetchBinary("https://x/book.epub", "book.epub");
    expect(f).toBeNull();
  });

  it("a failed staging (no manifest) returns null", async () => {
    withBridge(undefined, []);
    expect(await opdsFetchBinary("https://x/book.epub", "book.epub")).toBeNull();
  });
});
