/**
 * Reader contract tests (Phase B) — end-of-chapter decisions (audit D8) and
 * the pinch-zoom state machine (RDR-004), both pure.
 */
import { describe, it, expect } from "bun:test";
import {
  chapterEndAction,
  isScrolledToEnd,
  startPinch,
  zoomForPinch,
  commitPinch,
  clampZoom,
  PINCH_MAX,
  PINCH_SNAP,
} from "../src/lib/reader-contract";

describe("chapterEndAction (audit D8: scroll modes must not dead-end)", () => {
  it("advances when autoNext is on and a next chapter exists (no forced press)", () => {
    expect(chapterEndAction({ hasNextChapter: true, autoNext: true })).toBe("advance");
  });

  it("advances on an explicit next/skip even when autoNext is off", () => {
    expect(chapterEndAction({ hasNextChapter: true, autoNext: false, forced: true })).toBe("advance");
  });

  it("shows the end card when autoNext is off and the press was not forced", () => {
    expect(chapterEndAction({ hasNextChapter: true, autoNext: false })).toBe("endcard");
  });

  it("shows the end card on the final chapter regardless of autoNext", () => {
    expect(chapterEndAction({ hasNextChapter: false, autoNext: true })).toBe("endcard");
    expect(chapterEndAction({ hasNextChapter: false, autoNext: true, forced: true })).toBe("endcard");
  });
});

describe("isScrolledToEnd (scroll modes reach-the-bottom trigger)", () => {
  it("is true within the threshold of the bottom", () => {
    expect(isScrolledToEnd(952, 100, 1000)).toBe(true); // 48px from bottom
    expect(isScrolledToEnd(1000, 100, 1000)).toBe(true);
  });

  it("is false before the threshold", () => {
    expect(isScrolledToEnd(850, 100, 1000)).toBe(false); // 950 < 952 — 50px short
  });

  it("never fires on empty/zero-sized containers", () => {
    expect(isScrolledToEnd(0, 0, 0)).toBe(false);
    expect(isScrolledToEnd(100, 0, 0)).toBe(false);
  });
});

describe("pinch-zoom state machine (RDR-004)", () => {
  it("startPinch rejects degenerate gestures", () => {
    expect(startPinch(0, 1)).toBeNull();
    expect(startPinch(-5, 1)).toBeNull();
    expect(startPinch(100, 0.5)).toBeNull();
    expect(startPinch(120, 1)).toEqual({ startDist: 120, startZoom: 1 });
  });

  it("zoom scales multiplicatively from the gesture start", () => {
    const g = startPinch(100, 1)!;
    expect(zoomForPinch(g, 200)).toBe(2); // fingers doubled apart
    expect(zoomForPinch(g, 150)).toBe(1.5);
    expect(zoomForPinch(g, 50)).toBe(1); // 0.5 → clamped to PINCH_MIN
  });

  it("clamps to [1, 4] and rounds to 2 decimals", () => {
    const g = startPinch(100, 2)!;
    expect(zoomForPinch(g, 400)).toBe(PINCH_MAX); // 2×4 → clamped 4
    expect(clampZoom(1.23456)).toBe(1.23);
    expect(clampZoom(99)).toBe(PINCH_MAX);
    expect(clampZoom(0.1)).toBe(1);
  });

  it("commit snaps near-1 zooms back to exactly 1", () => {
    expect(commitPinch(1.05)).toBe(1);
    expect(commitPinch(PINCH_SNAP - 0.01)).toBe(1);
    expect(commitPinch(1.08)).toBe(1.08);
    expect(commitPinch(2)).toBe(2);
  });

  it("non-finite move distances keep the start zoom", () => {
    const g = startPinch(100, 1.5)!;
    expect(zoomForPinch(g, Number.NaN)).toBe(1.5);
  });
});
