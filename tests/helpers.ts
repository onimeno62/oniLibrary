/**
 * Shared fixtures for the oniLibrary regression suite.
 * Minimal but type-shaped Work/Chapter builders so each test file
 * only overrides the fields it exercises.
 */
import type { Work, Chapter, DownloadState } from "../src/lib/types";

export function makeChapter(p: Partial<Chapter> & { id: string; number: number }): Chapter {
  return {
    title: `Ch. ${p.number}`,
    pages: 20,
    releaseDate: "2025-01-01T00:00:00.000Z",
    isRead: false,
    download: "NONE" as DownloadState,
    sizeMb: 12,
    ...p,
  };
}

export function makeWork(p: Partial<Work> & { id: string }): Work {
  return {
    title: p.id,
    author: "Tester",
    cover: "",
    type: "MANGA",
    description: "",
    workStatus: "ONGOING",
    readingStatus: "READING",
    isFavorite: false,
    inVault: false,
    tags: [],
    rating: 0,
    ratingCount: 0,
    direction: "LTR",
    readerMode: "PAGED",
    fitMode: "WIDTH",
    chapters: [],
    addedAt: "2025-01-01T00:00:00.000Z",
    language: "EN",
    ...p,
  };
}
