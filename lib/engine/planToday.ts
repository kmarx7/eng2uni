// Today's vocabulary plan (DESIGN 3-3, 5-4, 9-2): due reviews first, then new
// words within the time goal. The current unit joins the plan in stage 7.
import type { DailyMinutes, ReviewCard } from "@/lib/schema/progress";
import { isDue } from "@/lib/srs";

// Assumptions, to be tuned with pilot data.
export const NEW_WORDS: Record<DailyMinutes, number> = { 15: 10, 30: 15, 60: 20 };
export const REVIEW_SECONDS = 10;
export const NEW_WORD_SECONDS = 30;
// Share of the daily goal spent on vocabulary; the rest is for the unit.
export const VOCAB_SHARE = 0.5;

export interface TodayPlan {
  reviews: string[];
  newWords: string[];
  estimatedMinutes: number;
}

export function planToday(input: {
  dailyMinutes: DailyMinutes;
  now: Date;
  cards: readonly ReviewCard[];
  wordOrder: readonly string[];
  learnedToday: number;
}): TodayPlan {
  const words = input.cards.filter((c) => c.itemType === "word");
  const reviews = words
    .filter((c) => isDue(c.fsrs, input.now))
    .sort((a, b) => Date.parse(a.fsrs.due) - Date.parse(b.fsrs.due))
    .map((c) => c.itemId);

  const budget = input.dailyMinutes * 60 * VOCAB_SHARE;
  const reviewSeconds = reviews.length * REVIEW_SECONDS;
  const byTime = Math.max(0, Math.floor((budget - reviewSeconds) / NEW_WORD_SECONDS));
  const byGoal = Math.max(0, NEW_WORDS[input.dailyMinutes] - input.learnedToday);
  const known = new Set(words.map((c) => c.itemId));
  const newWords = input.wordOrder.filter((id) => !known.has(id)).slice(0, Math.min(byTime, byGoal));

  return {
    reviews,
    newWords,
    estimatedMinutes: Math.ceil((reviewSeconds + newWords.length * NEW_WORD_SECONDS) / 60),
  };
}

// "YYYY-MM-DD" in the device's local time zone; a new day starts at local midnight.
export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
