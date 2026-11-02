import { describe, expect, it } from "vitest";
import { emptyProgress } from "@/lib/repositories/progress";
import type { LessonAttempt, LessonState, LocalProgress } from "@/lib/schema/progress";
import {
  isUnlocked,
  lastMissedGroup,
  nextUnit,
  pickSkillReviewQuestion,
  recordLessonAnswer,
  recordSkillReview,
  scheduleDelayedCheck,
} from "./skillProgress";

const now = new Date("2026-11-02T09:00:00+09:00");
const profile = { anonId: "0b7e9c1e-2f4a-4c1d-9a8b-1c2d3e4f5a6b", nickname: "학생", dailyMinutes: 15 as const, createdAt: now.toISOString() };
const start = (): LocalProgress => ({ ...emptyProgress(), profile });
const attempt = (correct: boolean, extra: Partial<LessonAttempt> = {}): LessonAttempt => ({
  questionId: "Q1",
  correct,
  hintLevel: 0,
  phase: "main",
  round: 0,
  at: now.toISOString(),
  ...extra,
});
const lesson = (unitId: string, status: LessonState["status"]): LessonState => ({
  unitId,
  status,
  phase: "result",
  blockIndex: 0,
  queue: [],
  round: 0,
  attempts: [],
  analyzerPassed: true,
  updatedAt: now.toISOString(),
});
const skillCard = (p: LocalProgress, id: string) => p.cards.find((c) => c.itemType === "skill" && c.itemId === id);

describe("recordLessonAnswer", () => {
  it("adds a skill card and counts the misconception on a wrong answer", () => {
    const p = recordLessonAnswer(start(), { attempt: attempt(false, { misconception: "m1" }), skills: ["s1"], durationMs: 5000 }, now);
    expect(skillCard(p, "s1")?.fsrs.reps).toBe(1);
    expect(p.skills.s1).toEqual({ delayedCheckPassed: false, misconceptionCounts: { m1: 1 } });
  });

  it("treats a level-3 hint answer as wrong", () => {
    const p = recordLessonAnswer(start(), { attempt: attempt(true, { hintLevel: 3 }), skills: ["s1"], durationMs: 5000 }, now);
    expect(skillCard(p, "s1")).toBeDefined();
  });

  it("creates no card for a right answer, but updates an existing one", () => {
    expect(recordLessonAnswer(start(), { attempt: attempt(true), skills: ["s1"], durationMs: 5000 }, now).cards).toEqual([]);
    const wrong = recordLessonAnswer(start(), { attempt: attempt(false), skills: ["s1"], durationMs: 5000 }, now);
    const later = new Date(now.getTime() + 3_600_000);
    const right = recordLessonAnswer(wrong, { attempt: attempt(true), skills: ["s1"], durationMs: 5000 }, later);
    expect(skillCard(right, "s1")?.fsrs.reps).toBe(2);
  });

  it("needs a profile", () => {
    expect(() => recordLessonAnswer(emptyProgress(), { attempt: attempt(false), skills: ["s1"], durationMs: 0 }, now)).toThrow(/profile/);
  });
});

describe("delayed check", () => {
  it("schedules each skill 2 days out and clears an earlier pass", () => {
    const p = scheduleDelayedCheck({ ...start(), skills: { s1: { delayedCheckPassed: true, misconceptionCounts: {} } } }, ["s1", "s2"], now);
    for (const id of ["s1", "s2"]) expect(skillCard(p, id)?.fsrs.due).toBe(new Date(now.getTime() + 2 * 86_400_000).toISOString());
    expect(p.skills.s1.delayedCheckPassed).toBe(false);
  });

  it("passes the unit once every skill passed its check", () => {
    const units = [{ id: "U1", skills: ["s1", "s2"] }];
    let p = scheduleDelayedCheck({ ...start(), lessons: { U1: lesson("U1", "awaiting_delayed_check") } }, ["s1", "s2"], now);
    const later = new Date(now.getTime() + 2 * 86_400_000);
    p = recordSkillReview(p, { skillId: "s1", correct: true, hintLevel: 0, durationMs: 4000 }, units, later);
    expect(p.lessons.U1.status).toBe("awaiting_delayed_check");
    p = recordSkillReview(p, { skillId: "s2", correct: true, hintLevel: 3, durationMs: 4000 }, units, later);
    expect(p.lessons.U1.status).toBe("awaiting_delayed_check");
    p = recordSkillReview(p, { skillId: "s2", correct: true, hintLevel: 0, durationMs: 4000 }, units, later);
    expect(p.lessons.U1).toMatchObject({ status: "passed", judgment: "mastered" });
  });
});

describe("pickSkillReviewQuestion", () => {
  const questions = [
    { id: "A1", skills: ["s1"], variantGroup: "GA" },
    { id: "B1", skills: ["s1"], variantGroup: "GB" },
    { id: "B2", skills: ["s1"], variantGroup: "GB" },
    { id: "C1", skills: ["s2"] },
  ];

  it("prefers the group missed last, then any unseen question of the skill", () => {
    expect(pickSkillReviewQuestion("s1", questions, new Set(["B1"]), "GB")).toBe("B2");
    expect(pickSkillReviewQuestion("s1", questions, new Set(["B1", "B2"]), "GB")).toBe("A1");
    expect(pickSkillReviewQuestion("s1", questions, new Set(["A1", "B1", "B2"]))).toBeNull();
  });

  it("finds the variant group of the last missed question of a skill", () => {
    const p = { ...start(), lessons: { U1: { ...lesson("U1", "in_progress"), attempts: [attempt(false, { questionId: "A1" }), attempt(false, { questionId: "B1" }), attempt(true, { questionId: "A1" })] } } };
    expect(lastMissedGroup(p, "s1", questions)).toBe("GB");
    expect(lastMissedGroup(p, "s2", questions)).toBeUndefined();
  });
});

describe("unit order", () => {
  const units = [
    { id: "U1", title: "하나" },
    { id: "U2", title: "둘" },
  ];

  it("opens the first unit and the next one once the previous is waiting for its check", () => {
    expect(nextUnit(units, {})).toEqual(units[0]);
    expect(isUnlocked("U2", units, {})).toBe(false);
    const waiting = { U1: lesson("U1", "awaiting_delayed_check") };
    expect(isUnlocked("U2", units, waiting)).toBe(true);
    expect(nextUnit(units, waiting)).toEqual(units[1]);
    expect(nextUnit(units, { ...waiting, U2: lesson("U2", "passed") })).toBeNull();
    expect(isUnlocked("U9", units, {})).toBe(false);
  });
});
