/**
 * SEC/DATA — backup restore semantics, credential stripping, orphan purge.
 * Proves: strict validation refuses malformed backups, invalid work rows are
 * dropped not fatal, stored catalog credentials never come back in, the
 * device-local Vault PIN cannot be replaced through a backup file, and
 * deleting works leaves no orphaned traces behind.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { useApp } from "../src/lib/store";
import { sanitizeSettingsForBackup } from "../src/lib/backup-contract";
import { makeChapter, makeWork } from "./helpers";

const S = () => useApp.getState();

function resetWorks(works: ReturnType<typeof makeWork>[]) {
  useApp.setState({
    works,
    downloads: [],
    notifications: [],
    history: [],
    bookmarks: [],
    highlights: [],
    workCategories: {},
  });
}

beforeEach(() => {
  resetWorks([makeWork({ id: "w-a", title: "Alpha", chapters: [makeChapter({ id: "w-a-1", number: 1 })] })]);
});

describe("importBackup: strict validation", () => {
  it("rejects null / non-object / wrong app marker", () => {
    expect(S().importBackup(null as never)).toBe(false);
    expect(S().importBackup("garbage" as never)).toBe(false);
    expect(S().importBackup({ app: "other-app" } as never)).toBe(false);
    expect(S().importBackup({} as never)).toBe(false); // missing app field
  });

  it("accepts a valid payload and replaces the library", () => {
    const beta = makeWork({ id: "w-b", title: "Beta", chapters: [makeChapter({ id: "w-b-1", number: 1 })] });
    const ok = S().importBackup({
      app: "oniLibrary",
      works: [beta],
      settings: { userName: "Restorer" },
    });
    expect(ok).toBe(true);
    expect(S().works.map((w) => w.id)).toEqual(["w-b"]);
    // settings merge on top of current — new keys land, rest survives
    expect(S().settings.userName).toBe("Restorer");
  });

  it("drops invalid work rows but keeps valid ones", () => {
    const good = makeWork({ id: "w-good", title: "Good", chapters: [] });
    S().importBackup({
      app: "oniLibrary",
      works: [
        good,
        null,
        { id: 42 }, // id not a string
        { id: "w-nochapters", title: "NoChapters" }, // missing chapters array
        "string row",
      ] as never,
    });
    expect(S().works.map((w) => w.id)).toEqual(["w-good"]);
  });

  it("refuses the whole restore when works has the wrong type", () => {
    const before = S().works;
    const ok = S().importBackup({ app: "oniLibrary", works: { id: "w-x" } as never });
    expect(ok).toBe(false);
    expect(S().works).toEqual(before); // untouched
  });
});

describe("importBackup: privacy semantics", () => {
  it("strips stored catalog credentials (servers[].auth) on import", () => {
    S().importBackup({
      app: "oniLibrary",
      servers: [
        { id: "srv-1", name: "Catalog", url: "https://example.com", auth: { username: "u", password: "p" } } as never,
      ],
    });
    const srv = S().servers.find((x) => x.id === "srv-1");
    expect(srv).toBeDefined();
    expect((srv as unknown as Record<string, unknown>).auth).toBeUndefined();
  });

  it("never lets a backup file replace the device-local Vault PIN", () => {
    useApp.setState({ settings: { ...S().settings, vaultPinHash: "h-device-local" } });
    S().importBackup({
      app: "oniLibrary",
      settings: { vaultPinHash: "h-attacker-chosen" } as never,
    });
    expect(S().settings.vaultPinHash).toBe("h-device-local");
  });
});

describe("importBackup: source flags merge", () => {
  it("merges enabled/pinned per source id onto the current set", () => {
    S().importBackup({
      app: "oniLibrary",
      sources: [{ id: "src-mangadex", enabled: false, pinned: false }],
    });
    const md = S().sources.find((s) => s.id === "src-mangadex");
    expect(md?.enabled).toBe(false);
    expect(md?.pinned).toBe(false);
    // other seeded sources untouched
    const other = S().sources.find((s) => s.id === "src-crunchyroll");
    expect(other?.enabled).toBe(true);
  });
});

describe("deleteWorks: orphan purge", () => {
  it("removes every trace of the deleted work but keeps global notifications", () => {
    resetWorks([
      makeWork({ id: "w-keep", title: "Keep", chapters: [] }),
      makeWork({ id: "w-kill", title: "Kill", chapters: [] }),
    ]);
    useApp.setState({
      downloads: [{ id: "dl-1", workId: "w-kill", chapterId: "w-kill-1", status: "DONE", progress: 100, downloadedMb: 1, totalMb: 1, speedMbps: 0, startedAt: "2025-01-01T00:00:00.000Z" } as never],
      notifications: [
        { id: "n-1", type: "CHAPTER", workId: "w-kill", chapterLabel: "Ch. 1", title: "Kill", body: "b", createdAt: "2025-01-01T00:00:00.000Z", read: false } as never,
        { id: "n-2", type: "SYSTEM", workId: "", chapterLabel: "", title: "Welcome", body: "b", createdAt: "2025-01-01T00:00:00.000Z", read: false } as never,
      ],
      history: [{ id: "h-1", workId: "w-kill", chapterId: "w-kill-1", page: 0, at: "2025-01-01T00:00:00.000Z" } as never],
      bookmarks: [{ id: "bm-1", workId: "w-kill", chapterId: "w-kill-1", page: 0, createdAt: "2025-01-01T00:00:00.000Z" } as never],
      highlights: [{ id: "hl-1", workId: "w-kill", chapterId: "w-kill-1", page: 0, text: "t", createdAt: "2025-01-01T00:00:00.000Z" } as never],
      workCategories: { "w-kill": ["cat-1"], "w-keep": ["cat-1"] },
    });

    S().deleteWorks(["w-kill"]);

    expect(S().works.map((w) => w.id)).toEqual(["w-keep"]);
    expect(S().downloads).toHaveLength(0);
    expect(S().history).toHaveLength(0);
    expect(S().bookmarks).toHaveLength(0);
    expect(S().highlights).toHaveLength(0);
    expect(S().workCategories).toHaveProperty("w-keep");
    expect(S().workCategories).not.toHaveProperty("w-kill");
    // the deleted work's notification is purged; the global one survives
    expect(S().notifications.map((n) => n.id)).toEqual(["n-2"]);
  });
});

describe("backup credential stripping (audit D3)", () => {
  it("sanitizeSettingsForBackup removes the PIN record and the tracker token", () => {
    const settings = {
      ...S().settings,
      vaultPinHash: "v2:salt:hash",
      tracker: { provider: "anilist" as const, token: "ani-secret-token", autoSync: true, lastSyncAt: null },
    };
    const out = sanitizeSettingsForBackup(settings);
    // the PIN record is fully absent from the exported shape (not just empty)
    expect("vaultPinHash" in out).toBe(false);
    expect(out.tracker.token).toBe("");
    expect(out.tracker.provider).toBe("anilist");
    expect(out.tracker.autoSync).toBe(true);
    // the input object is not mutated
    expect(settings.tracker.token).toBe("ani-secret-token");
  });

  it("importBackup refuses to inject a tracker token from a (hostile or legacy) payload", () => {
    useApp.setState({
      settings: {
        ...S().settings,
        tracker: { provider: "none", token: "", autoSync: false, lastSyncAt: null },
      },
    });
    const ok = S().importBackup({
      app: "oniLibrary",
      settings: {
        tracker: { provider: "anilist", token: "injected-token", autoSync: true, lastSyncAt: null },
      },
    } as never);
    expect(ok).toBe(true);
    expect(S().settings.tracker.token).toBe("");
    expect(S().settings.tracker.provider).toBe("anilist"); // harmless prefs still merge
    expect(S().settings.tracker.autoSync).toBe(true);
  });

  it("importBackup keeps the device-local PIN and strips tokens even when settings are absent", () => {
    useApp.setState({
      settings: {
        ...S().settings,
        vaultPinHash: "v2:device:hash",
        tracker: { provider: "none", token: "", autoSync: false, lastSyncAt: null },
      },
    });
    const ok = S().importBackup({ app: "oniLibrary", settings: { userName: "Restored" } } as never);
    expect(ok).toBe(true);
    expect(S().settings.userName).toBe("Restored");
    expect(S().settings.vaultPinHash).toBe("v2:device:hash");
    expect(S().settings.tracker.token).toBe("");
  });
});
