import { describe, expect, it } from "vitest";
import { countsAsCorrect, skillGrade } from "./grade";

describe("countsAsCorrect", () => {
  it.each([
    [true, 0, true],
    [true, 2, true],
    [true, 3, false],
    [false, 0, false],
  ])("correct=%s with hint %i counts as %s", (correct, hintLevel, expected) => {
    expect(countsAsCorrect({ correct, hintLevel })).toBe(expected);
  });
});

describe("skillGrade", () => {
  it.each([
    [{ correct: false, hintLevel: 0, durationMs: 5_000 }, "again"],
    [{ correct: true, hintLevel: 3, durationMs: 5_000 }, "again"],
    [{ correct: true, hintLevel: 1, durationMs: 5_000 }, "hard"],
    [{ correct: true, hintLevel: 0, durationMs: 30_001 }, "hard"],
    [{ correct: true, hintLevel: 0, durationMs: 30_000 }, "good"],
  ] as const)("%o → %s", (attempt, grade) => {
    expect(skillGrade(attempt)).toBe(grade);
  });
});
