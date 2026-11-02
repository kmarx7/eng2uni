// Scoring rules shared by lessons and skill reviews (DESIGN 5-2, 5-4, 13-3).
import type { Grade } from "@/lib/srs";

// An answer slower than this is graded "hard" on its skill card.
export const SLOW_ANSWER_MS = 30_000;

export interface ScoredAnswer {
  correct: boolean;
  hintLevel: number;
}

// The level-3 hint shows the answer, so an answer made after it is not credited.
export function countsAsCorrect(answer: ScoredAnswer): boolean {
  return answer.correct && answer.hintLevel < 3;
}

// A question result turned into an FSRS grade for the skill card.
export function skillGrade(answer: ScoredAnswer & { durationMs: number }): Grade {
  if (!countsAsCorrect(answer)) return "again";
  if (answer.hintLevel > 0 || answer.durationMs > SLOW_ANSWER_MS) return "hard";
  return "good";
}
