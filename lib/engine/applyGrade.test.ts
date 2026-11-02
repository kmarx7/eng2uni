import { describe, expect, it } from "vitest";
import { LocalProgress } from "@/lib/schema/progress";
import { emptyProgress } from "@/lib/repositories/progress";
import { applyGrade } from "./applyGrade";

const now = new Date("2026-11-02T09:00:00+09:00");
const profile = { anonId: "0b7e9c1e-2f4a-4c1d-9a8b-1c2d3e4f5a6b", nickname: "테스트", dailyMinutes: 15 as const, createdAt: now.toISOString() };
const start = (): LocalProgress => ({ ...emptyProgress(), profile });

describe("applyGrade", () => {
  it("adds a card for a new word and counts it as learned today", () => {
    const next = applyGrade(start(), "W1", "good", now);
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]).toMatchObject({ userId: profile.anonId, itemType: "word", itemId: "W1" });
    expect(next.cards[0].fsrs.reps).toBe(1);
    expect(next.days["2026-11-02"]).toEqual({ reviewed: 0, learned: 1 });
    expect(LocalProgress.safeParse(next).success).toBe(true);
  });

  it("updates an existing card in place and counts it as reviewed", () => {
    const once = applyGrade(start(), "W1", "good", now);
    const later = new Date(now.getTime() + 86_400_000);
    const twice = applyGrade(once, "W1", "easy", later);
    expect(twice.cards).toHaveLength(1);
    expect(twice.cards[0].fsrs.reps).toBe(2);
    expect(twice.days["2026-11-03"]).toEqual({ reviewed: 1, learned: 0 });
    expect(twice.days["2026-11-02"]).toEqual({ reviewed: 0, learned: 1 });
  });

  it("leaves the input untouched", () => {
    const before = start();
    applyGrade(before, "W1", "again", now);
    expect(before).toEqual(start());
  });

  it("refuses to grade without a profile", () => {
    expect(() => applyGrade(emptyProgress(), "W1", "good", now)).toThrow(/profile/);
  });
});
