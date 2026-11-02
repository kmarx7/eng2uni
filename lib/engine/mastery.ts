// Unit judgment from DESIGN 5-2. The numbers are first guesses for the pilot.
import type { MasteryStatus } from "@/lib/schema/progress";
import { countsAsCorrect, type ScoredAnswer } from "./grade";

export const MIN_EVIDENCE = 8;
export const PASS_ACCURACY = 0.85;
export const REMEDIAL_ACCURACY = 0.6;
export const CONFUSION_COUNT = 3;
export const DELAYED_CHECK_DAYS = 2;

export interface JudgedAnswer extends ScoredAnswer {
  misconception?: string;
}

export interface MasteryInput {
  attempts: JudgedAnswer[];
  analyzerPassed: boolean;
  delayedCheckPassed: boolean;
}

export interface MasteryJudgment {
  status: MasteryStatus;
  // null while there are too few questions to judge.
  accuracy: number | null;
  evidenceCount: number;
  misconception?: string;
  needsAnalyzer?: true;
}

function misconceptionCounts(attempts: JudgedAnswer[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of attempts) {
    if (!countsAsCorrect(a) && a.misconception) counts.set(a.misconception, (counts.get(a.misconception) ?? 0) + 1);
  }
  return counts;
}

// Most frequent misconception among wrong answers; the first seen wins a tie.
export function topMisconception(attempts: JudgedAnswer[]): string | undefined {
  let top: string | undefined;
  let topCount = 0;
  for (const [id, count] of misconceptionCounts(attempts)) {
    if (count > topCount) [top, topCount] = [id, count];
  }
  return top;
}

export function judgeMastery({ attempts, analyzerPassed, delayedCheckPassed }: MasteryInput): MasteryJudgment {
  const evidenceCount = attempts.length;
  if (evidenceCount < MIN_EVIDENCE) return { status: "learning", accuracy: null, evidenceCount };
  const accuracy = attempts.filter(countsAsCorrect).length / evidenceCount;
  if (accuracy >= PASS_ACCURACY) {
    if (!analyzerPassed) return { status: "learning", accuracy, evidenceCount, needsAnalyzer: true };
    return { status: delayedCheckPassed ? "mastered" : "can_progress", accuracy, evidenceCount };
  }
  const confused = [...misconceptionCounts(attempts)].find(([, count]) => count >= CONFUSION_COUNT);
  if (confused) return { status: "confusion", accuracy, evidenceCount, misconception: confused[0] };
  if (accuracy >= REMEDIAL_ACCURACY) return { status: "remedial", accuracy, evidenceCount, misconception: topMisconception(attempts) };
  return { status: "foundation_check", accuracy, evidenceCount };
}
