/**
 * Restore contract tests (Phase C, audit D11) — orphaned blob purge targets
 * and the honest re-audit of restored DONE download rows.
 */
import { describe, it, expect } from "bun:test";
import { orphanedWorkIds, auditRestoredDownloadRows } from "../src/lib/restore-contract";

describe("orphanedWorkIds", () => {
  it("returns current ids missing from the incoming restore", () => {
    expect(orphanedWorkIds(["a", "b", "c"], ["b", "c", "d"])).toEqual(["a"]);
  });

  it("returns [] when the restore covers everything (or order-insensitive sets)", () => {
    expect(orphanedWorkIds(["a", "b"], ["b", "a"])).toEqual([]);
    expect(orphanedWorkIds([], ["a"])).toEqual([]);
  });

  it("everything is orphaned when the restore brings no works", () => {
    expect(orphanedWorkIds(["a", "b"], [])).toEqual(["a", "b"]);
  });
});

describe("auditRestoredDownloadRows (honest DONE-row re-audit)", () => {
  const works = [
    {
      id: "w-1",
      chapters: [
        { id: "w-1-c1", localPages: ["w-1::c1::p1", "w-1::c1::p2"] },
        { id: "w-1-c2", localPages: [] },
      ],
    },
    { id: "w-2", chapters: [{ id: "w-2-c1", localPages: ["w-2::c1::p1"] }] },
  ];
  const rows = [
    { id: "r1", workId: "w-1", chapterId: "w-1-c1", status: "DONE" },
    { id: "r2", workId: "w-1", chapterId: "w-1-c2", status: "DONE" }, // chapter has no pages
    { id: "r3", workId: "w-2", chapterId: "w-2-c1", status: "DONE" },
    { id: "r4", workId: "w-x", chapterId: "w-x-c1", status: "DONE" }, // work gone
    { id: "r5", workId: "w-1", chapterId: "w-1-c1", status: "ERROR" }, // not DONE — ignored
  ];

  it("splits DONE rows by whether their first page blob exists", async () => {
    // blob store: w-1 chapter c1 missing, w-2 chapter c1 present
    const res = await auditRestoredDownloadRows(rows, works, async (key) => key.startsWith("w-2::"));
    expect(res.ok).toEqual(["r3"]);
    expect(res.broken.sort()).toEqual(["r1", "r2", "r4"]);
  });

  it("every row is broken when the blob store throws (fail closed)", async () => {
    const res = await auditRestoredDownloadRows(rows, works, async () => {
      throw new Error("idb gone");
    });
    expect(res.ok).toEqual([]);
    expect(res.broken.sort()).toEqual(["r1", "r2", "r3", "r4"]); // fail closed: EVERY DONE row
  });

  it("marks rows ok only when their chapter has stored keys — missing works/keys stay broken", async () => {
    const res = await auditRestoredDownloadRows(rows, works, async () => true);
    expect(res.ok.sort()).toEqual(["r1", "r3"]);
    expect(res.broken.sort()).toEqual(["r2", "r4"]); // r2: no keys · r4: work gone
  });

  it("non-DONE rows are never classified", async () => {
    const onlyQueued = [{ id: "q", workId: "w-1", chapterId: "w-1-c1", status: "QUEUED" }];
    const res = await auditRestoredDownloadRows(onlyQueued, works, async () => false);
    expect(res.ok).toEqual([]);
    expect(res.broken).toEqual([]);
  });
});
