import { describe, expect, it } from "vitest";
import { judgeMastery, topMisconception } from "./mastery";

type A = { correct: boolean; hintLevel: number; misconception?: string };
const right = (n: number, hintLevel = 0): A[] => Array.from({ length: n }, () => ({ correct: true, hintLevel }));
const wrong = (n: number, misconception?: string): A[] => Array.from({ length: n }, () => ({ correct: false, hintLevel: 0, misconception }));
const judge = (attempts: A[], analyzerPassed = true, delayedCheckPassed = false) => judgeMastery({ attempts, analyzerPassed, delayedCheckPassed });

describe("judgeMastery (DESIGN 5-2)", () => {
  it("holds the judgment below 8 questions", () => {
    expect(judge([...right(7)])).toEqual({ status: "learning", accuracy: null, evidenceCount: 7 });
  });

  it("lets a student progress at 7 of 8, pending the delayed check", () => {
    expect(judge([...right(7), ...wrong(1, "m1")])).toMatchObject({ status: "can_progress", accuracy: 0.875, evidenceCount: 8 });
  });

  it("marks mastery once the delayed check passed too", () => {
    expect(judge([...right(7), ...wrong(1)], true, true).status).toBe("mastered");
  });

  it("asks for the analyzer task before passing", () => {
    expect(judge(right(8), false)).toMatchObject({ status: "learning", accuracy: 1, needsAnalyzer: true });
  });

  it("sends 60–84% to remedial with the most frequent misconception (first seen wins a tie)", () => {
    expect(judge([...right(6), ...wrong(1, "m2"), ...wrong(1, "m1")])).toMatchObject({ status: "remedial", accuracy: 0.75, misconception: "m2" });
    expect(judge([...right(5), ...wrong(1, "m1"), ...wrong(2, "m2")])).toMatchObject({ status: "remedial", misconception: "m2" });
  });

  it("sends below 60% to the foundation check", () => {
    expect(judge([...right(4), ...wrong(4)]).status).toBe("foundation_check");
  });

  it("flags confusion when one misconception shows up 3 times", () => {
    expect(judge([...right(9), ...wrong(3, "m1")])).toMatchObject({ status: "confusion", misconception: "m1" });
  });

  it("does not count answers made with the level-3 hint as correct", () => {
    expect(judge([...right(6), ...right(2, 3)])).toMatchObject({ status: "remedial", accuracy: 0.75 });
  });
});

describe("topMisconception", () => {
  it("returns undefined when no wrong answer carried one", () => {
    expect(topMisconception([...right(2), ...wrong(1)])).toBeUndefined();
  });
});
