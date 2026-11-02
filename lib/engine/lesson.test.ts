import { describe, expect, it } from "vitest";
import type { LessonAttempt, LessonState } from "@/lib/schema/progress";
import type { Unit } from "@/lib/schema/curriculum";
import { currentStep, reconcileLesson, roundScore, type LessonAction, type LessonContext, lessonReducer, startLesson } from "./lesson";

const now = new Date("2026-11-02T09:00:00+09:00");
const A = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"];

const unit: Unit = {
  id: "U",
  levelId: "L0",
  order: 1,
  title: "데모",
  skills: ["s"],
  blocks: [
    { id: "C", type: "concept", body: "개념" },
    { id: "T", type: "sentence_task", interaction: "role_tagging", instruction: "표시", sentenceIds: ["S1"] },
    { id: "P", type: "practice", questionIds: ["P1"] },
    { id: "A", type: "assessment", questionIds: A },
    { id: "R", type: "remedial", misconceptionId: "m1", body: "보충", questionIds: ["R1"] },
    { id: "K", type: "contrast", misconceptionIds: ["m1", "m2"], body: "대조" },
  ],
  reviewStatus: "approved",
  version: 1,
};

const g = (ids: string[], group: string) => ids.map((id) => ({ id, skills: ["s"], variantGroup: group }));
const fullPool = [
  ...g(["P1", "A1", "A2", "A3", "A4", "R1", "V1", "V2", "V3", "V4", "V5", "V6", "V7"], "G1"),
  ...g(["A5", "A6", "A7", "A8", "W1", "W2", "W3", "W4", "W5"], "G2"),
  ...g(["F1", "F2", "F3"], "PRE"),
];

function ctx(overrides: Partial<LessonContext> = {}): LessonContext {
  return {
    unit,
    questions: fullPool,
    misconceptions: [{ id: "m1" }, { id: "m2" }],
    prerequisiteQuestionIds: ["F1", "F2", "F3"],
    seen: new Set(),
    ...overrides,
  };
}

// Drives the reducer, collecting shortages. Answers go to whatever question is current.
function drive(c: LessonContext, actions: (LessonAction | ((s: LessonState) => LessonAction))[], start = startLesson(c, now)) {
  let state = start;
  const shortages = [];
  for (const action of actions) {
    const result = lessonReducer(state, typeof action === "function" ? action(state) : action, c, now);
    state = result.state;
    shortages.push(...result.shortages);
  }
  return { state, shortages };
}

const answer =
  (correct: boolean, misconception?: string, hintLevel = 0) =>
  (s: LessonState): LessonAction => ({
    type: "answered",
    attempt: { questionId: s.queue[0], correct, hintLevel, misconception, phase: s.phase as LessonAttempt["phase"], round: s.round, at: now.toISOString() },
  });
const done: LessonAction = { type: "blockDone" };
const toAssessment = [done, { type: "analyzerDone", passed: true } as const, answer(true)];

describe("lesson flow", () => {
  it("walks concept → tagging → practice → assessment and passes at 7 of 8", () => {
    const c = ctx();
    let { state } = drive(c, []);
    expect(currentStep(state, unit)).toEqual({ kind: "block", block: unit.blocks[0] });
    ({ state } = drive(c, [done], state));
    expect(currentStep(state, unit)).toEqual({ kind: "block", block: unit.blocks[1] });
    ({ state } = drive(c, [{ type: "analyzerDone", passed: true }], state));
    expect(currentStep(state, unit)).toEqual({ kind: "question", questionId: "P1", block: unit.blocks[2] });
    ({ state } = drive(c, [answer(true)], state));
    expect(currentStep(state, unit)).toMatchObject({ kind: "question", questionId: "A1" });
    ({ state } = drive(c, [...Array(7).fill(answer(true)), answer(false, "m1")], state));
    expect(currentStep(state, unit)).toEqual({ kind: "result" });
    expect(state).toMatchObject({ phase: "result", judgment: "can_progress", status: "awaiting_delayed_check" });
  });

  it("puts a variant first after a wrong practice answer, never an assessment question", () => {
    const { state } = drive(ctx(), [done, { type: "analyzerDone", passed: true }, answer(false, "m1")]);
    expect(state.queue[0]).toBe("R1");
  });

  it("records a shortage and moves on when no practice variant is left", () => {
    const c = ctx({ questions: [...g(["P1", ...A.slice(0, 4)], "G1"), ...g(A.slice(4), "G2")] });
    const { state, shortages } = drive(c, [done, { type: "analyzerDone", passed: true }, answer(false)]);
    expect(shortages).toEqual([{ at: now.toISOString(), unitId: "U", variantGroup: "G1" }]);
    expect(currentStep(state, unit)).toMatchObject({ kind: "question", questionId: "A1" });
  });

  it("ignores the same answer dispatched twice", () => {
    const c = ctx();
    const { state } = drive(c, [done, { type: "analyzerDone", passed: true }]);
    const twice = answer(true)(state);
    const once = lessonReducer(state, twice, c, now).state;
    expect(lessonReducer(once, twice, c, now).state).toEqual(once);
  });

  it("skips assessment questions the student has already seen", () => {
    const { state } = drive(ctx({ seen: new Set(["A1"]) }), toAssessment);
    expect(state.queue).toEqual(A.slice(1));
  });

  it("runs remedial: block, up to 4 questions, then a new round of variants", () => {
    const c = ctx();
    let { state } = drive(c, [...toAssessment, answer(false, "m1"), answer(false, "m1"), ...Array(6).fill(answer(true))]);
    expect(state).toMatchObject({ judgment: "remedial", focusMisconception: "m1", status: "in_progress" });
    ({ state } = drive(c, [done], state));
    expect(currentStep(state, unit)).toEqual({ kind: "block", block: unit.blocks[4] });
    ({ state } = drive(c, [done], state));
    expect(state.phase).toBe("remedial");
    expect(state.queue).toEqual(["R1", "V1", "V2", "V3"]);
    ({ state } = drive(c, Array(4).fill(answer(true)), state));
    expect(state).toMatchObject({ phase: "reassessment", round: 1 });
    expect(state.queue).toEqual(["V4", "V5", "V6", "V7", "W1", "W2", "W3", "W4"]);
  });

  it("holds the judgment when the new round runs short of variants", () => {
    const c = ctx({ questions: fullPool.filter((q) => !["V4", "V5", "V6", "V7"].includes(q.id)) });
    let { state } = drive(c, [...toAssessment, answer(false, "m1"), answer(false, "m1"), ...Array(6).fill(answer(true)), done, done]);
    const remedial = drive(c, Array(state.queue.length).fill(answer(true)), state);
    state = remedial.state;
    expect(remedial.shortages.length).toBeGreaterThan(0);
    expect(state.queue.length).toBeLessThan(8);
    ({ state } = drive(c, Array(state.queue.length).fill(answer(true)), state));
    expect(state).toMatchObject({ phase: "result", judgment: "learning", round: 1 });
  });

  it("shows the contrast block first when a misconception repeats 3 times", () => {
    const c = ctx({ unit: { ...unit, blocks: unit.blocks.map((b) => (b.id === "A" ? { ...b, questionIds: [...A, "V1", "V2", "V3", "V4"] } : b)) } });
    const u = c.unit;
    let { state } = drive(c, [...toAssessment, ...Array(9).fill(answer(true)), ...Array(3).fill(answer(false, "m1"))]);
    expect(state.judgment).toBe("confusion");
    ({ state } = drive(c, [done], state));
    expect(currentStep(state, u)).toEqual({ kind: "block", block: unit.blocks[5] });
    ({ state } = drive(c, [done], state));
    expect(currentStep(state, u)).toEqual({ kind: "block", block: unit.blocks[4] });
  });

  it("checks prerequisites below 60%: 2 of 3 goes on to remedial, fewer stays on the result", () => {
    const c = ctx();
    const low = drive(c, [...toAssessment, ...Array(4).fill(answer(true)), ...Array(4).fill(answer(false)), done]).state;
    expect(low).toMatchObject({ phase: "foundation", queue: ["F1", "F2", "F3"] });
    expect(drive(c, [answer(true), answer(true), answer(false)], low).state.phase).toBe("remedial");
    expect(drive(c, [answer(true), answer(false), answer(false)], low).state).toMatchObject({ phase: "result", judgment: "foundation_check" });
  });

  it("sends the student back to tagging when only the analyzer task is missing", () => {
    const c = ctx();
    const { state } = drive(c, [done, { type: "analyzerDone", passed: false }, answer(true), ...Array(8).fill(answer(true)), done]);
    expect(currentStep(state, unit)).toEqual({ kind: "block", block: unit.blocks[1] });
  });
});

describe("roundScore", () => {
  it("counts credited answers of the judged round only", () => {
    const { state } = drive(ctx(), [...toAssessment, answer(true, undefined, 3), ...Array(6).fill(answer(true)), answer(false)]);
    expect(roundScore(state, unit)).toEqual({ correct: 6, total: 8 });
  });
});

describe("review fixes", () => {
  it("treats a unit with no tagging task as having passed the analyzer task", () => {
    const noTagging = { ...unit, blocks: unit.blocks.filter((b) => b.id !== "T") };
    const c = ctx({ unit: noTagging });
    const { state } = drive(c, [done, answer(true), ...Array(8).fill(answer(true))]);
    expect(state).toMatchObject({ judgment: "can_progress", status: "awaiting_delayed_check" });
  });

  it("retries a held judgment with a new round of variants", () => {
    const c = ctx({ questions: fullPool.filter((q) => !["V4", "V5", "V6", "V7"].includes(q.id)) });
    let { state } = drive(c, [...toAssessment, answer(false, "m1"), answer(false, "m1"), ...Array(6).fill(answer(true)), done, done]);
    ({ state } = drive(c, [...Array(state.queue.length).fill(answer(true))], state));
    ({ state } = drive(c, Array(state.queue.length).fill(answer(true)), state));
    expect(state.judgment).toBe("learning");
    const more = ctx({ questions: [...c.questions, ...g(["X1", "X2", "X3", "X4"], "G1"), ...g(["Y1", "Y2", "Y3", "Y4"], "G2")] });
    const retried = drive(more, [{ type: "retry" }], state).state;
    expect(retried).toMatchObject({ phase: "reassessment", round: 2, queue: ["X1", "X2", "X3", "X4", "W5", "Y1", "Y2", "Y3"] });
  });

  it("retries a failed foundation check instead of looping to the previous unit", () => {
    const c = ctx();
    const low = drive(c, [...toAssessment, ...Array(4).fill(answer(true)), ...Array(4).fill(answer(false)), done, answer(false), answer(false), answer(false)]).state;
    expect(low).toMatchObject({ phase: "result", judgment: "foundation_check" });
    expect(drive(c, [{ type: "retry" }], low).state).toMatchObject({ phase: "reassessment", round: 1 });
  });

  it("drops saved questions that are no longer in the unit and moves on", () => {
    const c = ctx();
    const { state } = drive(c, toAssessment);
    const stale = { ...state, queue: ["GONE", ...state.queue.slice(0, 1)] };
    expect(reconcileLesson(stale, c, now)?.queue).toEqual(["A1"]);
    expect(reconcileLesson(state, c, now)).toBeNull();
    const pastEnd = { ...state, blockIndex: 9, queue: [] };
    expect(reconcileLesson(pastEnd, c, now)).toMatchObject({ phase: "result" });
    const emptied = { ...state, queue: ["GONE"] };
    expect(reconcileLesson(emptied, c, now)).toMatchObject({ phase: "result" });
  });
});
