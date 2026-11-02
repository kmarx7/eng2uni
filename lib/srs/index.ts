// The only module that imports ts-fsrs (DESIGN 5-4). Cards are stored as
// FsrsState with ISO date strings; Date conversion stays in this file.
import { type Card, createEmptyCard, fsrs, Rating, State } from "ts-fsrs";
import type { FsrsState } from "@/lib/schema/progress";

// Self-rating buttons on a word card: 다시·어려움·보통·쉬움.
export type Grade = "again" | "hard" | "good" | "easy";

// A word counts as mastered once FSRS expects it to be remembered for three weeks.
export const MASTERED_STABILITY_DAYS = 21;

// No fuzz, so the same review always gives the same schedule.
const scheduler = fsrs({ enable_fuzz: false });

const GRADES = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;
const STATE_NAMES = ["New", "Learning", "Review", "Relearning"] as const satisfies readonly FsrsState["state"][];

function toState(card: Card): FsrsState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_NAMES[card.state],
    ...(card.last_review ? { last_review: card.last_review.toISOString() } : {}),
  };
}

function toCard(state: FsrsState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    scheduled_days: state.scheduled_days,
    learning_steps: state.learning_steps,
    reps: state.reps,
    lapses: state.lapses,
    state: State[state.state],
    ...(state.last_review ? { last_review: new Date(state.last_review) } : {}),
  };
}

export function newCardState(now: Date): FsrsState {
  return toState(createEmptyCard(now));
}

export function gradeCard(state: FsrsState, grade: Grade, now: Date): FsrsState {
  return toState(scheduler.next(toCard(state), now, GRADES[grade]).card);
}

export function isDue(state: FsrsState, now: Date): boolean {
  return Date.parse(state.due) <= now.getTime();
}

export function isMastered(state: FsrsState): boolean {
  return state.state === "Review" && state.stability >= MASTERED_STABILITY_DAYS;
}
