import { describe, expect, it } from "vitest";
import type { ReviewCard } from "@/lib/schema/progress";
import { newCardState } from "@/lib/srs";
import { localDayKey, planToday } from "./planToday";

const now = new Date("2026-11-02T09:00:00+09:00");
const user = "0b7e9c1e-2f4a-4c1d-9a8b-1c2d3e4f5a6b";

function card(id: string, dueOffsetMs: number): ReviewCard {
  return { userId: user, itemType: "word", itemId: id, fsrs: { ...newCardState(now), state: "Review", due: new Date(now.getTime() + dueOffsetMs).toISOString() } };
}
const words = (n: number, prefix = "W") => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const dueCards = (n: number) => words(n, "R").map((id, i) => card(id, -(i + 1) * 1000));

describe("planToday", () => {
  it("gives 10, 15 or 20 new words for 15, 30 or 60 minutes", () => {
    for (const [minutes, count] of [[15, 10], [30, 15], [60, 20]] as const) {
      expect(planToday({ dailyMinutes: minutes, now, cards: [], wordOrder: words(30), learnedToday: 0 }).newWords).toHaveLength(count);
    }
  });

  it("takes new words in list order, skipping words that already have a card", () => {
    const plan = planToday({ dailyMinutes: 15, now, cards: [card("W2", 86_400_000)], wordOrder: words(12), learnedToday: 0 });
    expect(plan.newWords).toEqual(["W1", "W3", "W4", "W5", "W6", "W7", "W8", "W9", "W10", "W11"]);
  });

  it("reviews only due cards, oldest due first", () => {
    const cards = [card("late", -1000), card("future", 1000), card("early", -5000)];
    expect(planToday({ dailyMinutes: 15, now, cards, wordOrder: [], learnedToday: 0 }).reviews).toEqual(["early", "late"]);
  });

  it("counts words already learned today against the daily new-word limit", () => {
    expect(planToday({ dailyMinutes: 15, now, cards: [], wordOrder: words(30), learnedToday: 4 }).newWords).toHaveLength(6);
    expect(planToday({ dailyMinutes: 15, now, cards: [], wordOrder: words(30), learnedToday: 12 }).newWords).toHaveLength(0);
  });

  it("shrinks new words when reviews fill the vocabulary time (15 min -> 450 s)", () => {
    const plan = (due: number) => planToday({ dailyMinutes: 15, now, cards: dueCards(due), wordOrder: words(30), learnedToday: 0 });
    expect(plan(42).newWords).toHaveLength(1); // 420 s of reviews + one 30 s word = exactly 450 s
    expect(plan(43).newWords).toHaveLength(0);
    expect(plan(60).reviews).toHaveLength(60); // reviews are never dropped
  });

  it("uses what is left when the list runs short, and rounds the estimate up", () => {
    const plan = planToday({ dailyMinutes: 30, now, cards: dueCards(1), wordOrder: words(3), learnedToday: 0 });
    expect(plan.newWords).toHaveLength(3);
    expect(plan.estimatedMinutes).toBe(2); // 10 s + 90 s = 100 s
  });
});

describe("localDayKey", () => {
  it("uses the device's local calendar date", () => {
    expect(localDayKey(new Date(2026, 10, 2, 23, 59))).toBe("2026-11-02");
    expect(localDayKey(new Date(2026, 10, 3, 0, 0))).toBe("2026-11-03");
  });
});
