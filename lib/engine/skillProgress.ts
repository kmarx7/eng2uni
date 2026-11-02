// Skill review cards (DESIGN 5-4), the delayed check after a unit (5-2) and the
// unit order. Lesson answers and skill reviews update the stored progress here.
import type { LessonAttempt, LessonState, LocalProgress, ReviewCard } from "@/lib/schema/progress";
import { gradeCard, newCardState } from "@/lib/srs";
import { countsAsCorrect, skillGrade } from "./grade";
import { DELAYED_CHECK_DAYS } from "./mastery";

const DAY_MS = 86_400_000;

type SkillState = LocalProgress["skills"][string];
const freshSkill = (): SkillState => ({ delayedCheckPassed: false, misconceptionCounts: {} });

function userId(progress: LocalProgress): string {
  if (!progress.profile) throw new Error("cannot record learning before the profile exists");
  return progress.profile.anonId;
}

function findSkillCard(progress: LocalProgress, skillId: string): ReviewCard | undefined {
  return progress.cards.find((c) => c.itemType === "skill" && c.itemId === skillId);
}

function putCard(progress: LocalProgress, card: ReviewCard): LocalProgress {
  const existing = findSkillCard(progress, card.itemId);
  const cards = existing ? progress.cards.map((c) => (c === existing ? card : c)) : [...progress.cards, card];
  return { ...progress, cards };
}

// Wrong answers (and answers after the level-3 hint) start or update a card for
// each skill of the question; right answers only update cards that exist.
export function recordLessonAnswer(
  progress: LocalProgress,
  answer: { attempt: LessonAttempt; skills: string[]; durationMs: number },
  now: Date,
): LocalProgress {
  const user = userId(progress);
  const { attempt, skills, durationMs } = answer;
  const missed = !countsAsCorrect(attempt);
  const grade = skillGrade({ ...attempt, durationMs });
  let next = progress;
  for (const skillId of skills) {
    const existing = findSkillCard(next, skillId);
    if (existing || missed) {
      const fsrs = gradeCard(existing?.fsrs ?? newCardState(now), grade, now);
      next = putCard(next, { userId: user, itemType: "skill", itemId: skillId, fsrs });
    }
    if (missed && attempt.misconception) {
      const skill = next.skills[skillId] ?? freshSkill();
      const counts = { ...skill.misconceptionCounts, [attempt.misconception]: (skill.misconceptionCounts[attempt.misconception] ?? 0) + 1 };
      next = { ...next, skills: { ...next.skills, [skillId]: { ...skill, misconceptionCounts: counts } } };
    }
  }
  return next;
}

// After a unit passes, each of its skills comes back DELAYED_CHECK_DAYS later.
export function scheduleDelayedCheck(progress: LocalProgress, skillIds: string[], now: Date): LocalProgress {
  const user = userId(progress);
  const due = new Date(now.getTime() + DELAYED_CHECK_DAYS * DAY_MS).toISOString();
  let next = progress;
  for (const skillId of skillIds) {
    const fsrs = { ...(findSkillCard(next, skillId)?.fsrs ?? newCardState(now)), due };
    next = putCard(next, { userId: user, itemType: "skill", itemId: skillId, fsrs });
    next = { ...next, skills: { ...next.skills, [skillId]: { ...(next.skills[skillId] ?? freshSkill()), delayedCheckPassed: false } } };
  }
  return next;
}

// One skill review answer. A credited answer passes the skill's delayed check;
// a unit waiting on its check passes once all of its skills have.
export function recordSkillReview(
  progress: LocalProgress,
  answer: { skillId: string; correct: boolean; hintLevel: number; durationMs: number },
  units: { id: string; skills: string[] }[],
  now: Date,
): LocalProgress {
  const user = userId(progress);
  const fsrs = gradeCard(findSkillCard(progress, answer.skillId)?.fsrs ?? newCardState(now), skillGrade(answer), now);
  let next = putCard(progress, { userId: user, itemType: "skill", itemId: answer.skillId, fsrs });
  if (!countsAsCorrect(answer)) return next;
  next = { ...next, skills: { ...next.skills, [answer.skillId]: { ...(next.skills[answer.skillId] ?? freshSkill()), delayedCheckPassed: true } } };
  const lessons = { ...next.lessons };
  for (const unit of units) {
    const lesson = lessons[unit.id];
    if (lesson?.status === "awaiting_delayed_check" && unit.skills.every((s) => next.skills[s]?.delayedCheckPassed)) {
      lessons[unit.id] = { ...lesson, status: "passed", judgment: "mastered", updatedAt: now.toISOString() };
    }
  }
  return { ...next, lessons };
}

interface SkillQuestion {
  id: string;
  skills: string[];
  variantGroup?: string;
}

// Variant group of the most recent wrong lesson answer on this skill.
export function lastMissedGroup(progress: LocalProgress, skillId: string, questions: SkillQuestion[]): string | undefined {
  const missed = Object.values(progress.lessons)
    .flatMap((l) => l.attempts)
    .filter((a) => !countsAsCorrect(a))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (let i = missed.length - 1; i >= 0; i--) {
    const q = questions.find((x) => x.id === missed[i].questionId);
    if (q?.skills.includes(skillId)) return q.variantGroup;
  }
  return undefined;
}

// An unseen question of the skill, from the group missed last when one is left.
export function pickSkillReviewQuestion(skillId: string, questions: SkillQuestion[], seen: ReadonlySet<string>, lastWrongGroup?: string): string | null {
  const open = questions.filter((q) => q.skills.includes(skillId) && !seen.has(q.id));
  return (open.find((q) => lastWrongGroup !== undefined && q.variantGroup === lastWrongGroup) ?? open[0])?.id ?? null;
}

const DONE: LessonState["status"][] = ["awaiting_delayed_check", "passed"];

// Units open in order: the first always, the next once the previous waits for its check.
export function isUnlocked(unitId: string, units: { id: string }[], lessons: Record<string, LessonState>): boolean {
  const index = units.findIndex((u) => u.id === unitId);
  if (index < 0) return false;
  return index === 0 || DONE.includes(lessons[units[index - 1].id]?.status);
}

export function nextUnit<T extends { id: string }>(units: T[], lessons: Record<string, LessonState>): T | null {
  return units.find((u) => !DONE.includes(lessons[u.id]?.status) && isUnlocked(u.id, units, lessons)) ?? null;
}
