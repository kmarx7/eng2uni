// One self-rating on a word card, applied to the stored progress. New words get
// a card and count as learned today; words with a card count as reviewed.
import type { LocalProgress } from "@/lib/schema/progress";
import { type Grade, gradeCard, newCardState } from "@/lib/srs";
import { localDayKey } from "./planToday";

export function applyGrade(progress: LocalProgress, itemId: string, grade: Grade, now: Date): LocalProgress {
  if (!progress.profile) throw new Error("cannot grade a card before the profile exists");
  const existing = progress.cards.find((c) => c.itemType === "word" && c.itemId === itemId);
  const fsrs = gradeCard(existing?.fsrs ?? newCardState(now), grade, now);
  const cards = existing
    ? progress.cards.map((c) => (c === existing ? { ...c, fsrs } : c))
    : [...progress.cards, { userId: progress.profile.anonId, itemType: "word" as const, itemId, fsrs }];
  const day = localDayKey(now);
  const counts = progress.days[day] ?? { reviewed: 0, learned: 0 };
  return {
    ...progress,
    cards,
    days: { ...progress.days, [day]: existing ? { ...counts, reviewed: counts.reviewed + 1 } : { ...counts, learned: counts.learned + 1 } },
  };
}
