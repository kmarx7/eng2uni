import { describe, expect, it } from "vitest";
import cases from "./coverage.cases.json";
import { coverage, coverageCurve, coverageWeights, masteredCoverage, masteredShare, normalizeLemma, type CoverageEntry } from "./coverage";

describe("normalizeLemma", () => {
  it.each(cases.normalize)("%j -> %j", (input, expected) => {
    expect(normalizeLemma(input)).toBe(expected);
  });
});

describe("coverage", () => {
  it.each(cases.coverage)("$name", ({ known, entries, expected }) => {
    expect(coverage(new Set(known), entries as CoverageEntry[])).toBeCloseTo(expected, 10);
  });
});

describe("coverageCurve", () => {
  it("reports coverage of the top N countable lemmas by frequency", () => {
    const entries: CoverageEntry[] = [
      { lemma: "b", kind: "content", totalCount: 2 },
      { lemma: "a", kind: "function", totalCount: 6 },
      { lemma: "x", kind: "proper", totalCount: 50 },
      { lemma: "c", kind: "content", totalCount: 2 },
    ];
    expect(coverageCurve(entries, [1, 2, 10])).toEqual([
      { topN: 1, coverage: 0.6 },
      { topN: 2, coverage: 0.8 },
      { topN: 10, coverage: 1 },
    ]);
  });
});

describe("masteredCoverage", () => {
  const card = (itemId: string, state: "Review" | "Learning", stability: number) => ({
    userId: "u", itemType: "word" as const, itemId,
    fsrs: { due: "2026-11-02T00:00:00.000Z", stability, difficulty: 5, scheduled_days: 0, learning_steps: 0, reps: 3, lapses: 0, state },
  });
  it("counts only mastered word cards, by their lemma", () => {
    const entries: CoverageEntry[] = [
      { lemma: "cat", kind: "content", totalCount: 3 },
      { lemma: "dog", kind: "content", totalCount: 1 },
    ];
    const cards = [card("V1", "Review", 30), card("V2", "Learning", 30)];
    expect(masteredCoverage(cards, { V1: "Cat", V2: "dog" }, entries)).toBe(0.75);
  });
});

describe("coverageWeights", () => {
  const entries: CoverageEntry[] = [
    { lemma: "cat", kind: "content", totalCount: 3 },
    { lemma: "Dog", kind: "content", totalCount: 1 },
    { lemma: "the", kind: "function", totalCount: 4 },
    { lemma: "Seoul", kind: "proper", totalCount: 9 },
  ];

  it("keeps the counted total and only the counts of the given lemmas", () => {
    expect(coverageWeights(entries, ["cat", "dog", "bird", "seoul"])).toEqual({ total: 8, countByLemma: { cat: 3, dog: 1 } });
  });

  it("gives the same share as masteredCoverage", () => {
    const card = (itemId: string) => ({
      userId: "u", itemType: "word" as const, itemId,
      fsrs: { due: "2026-11-02T00:00:00.000Z", stability: 30, difficulty: 5, scheduled_days: 0, learning_steps: 0, reps: 3, lapses: 0, state: "Review" as const },
    });
    const cards = [card("V1"), card("V2")];
    const lemmaById = { V1: "cat", V2: "dog", V3: "the" };
    expect(masteredShare(cards, lemmaById, coverageWeights(entries, Object.values(lemmaById)))).toBe(masteredCoverage(cards, lemmaById, entries));
    expect(masteredShare([], lemmaById, { total: 0, countByLemma: {} })).toBe(0);
  });
});
