import { describe, expect, it } from "vitest";
import { FsrsState } from "@/lib/schema/progress";
import { gradeCard, isDue, isMastered, newCardState } from "./index";

const now = new Date("2026-11-02T09:00:00+09:00");

describe("newCardState", () => {
  it("is a valid new card that is due right away", () => {
    const card = newCardState(now);
    expect(FsrsState.safeParse(card).success).toBe(true);
    expect(card.state).toBe("New");
    expect(isDue(card, now)).toBe(true);
  });
});

describe("gradeCard", () => {
  it("schedules 'again' sooner than 'easy' and keeps the stored shape", () => {
    const again = gradeCard(newCardState(now), "again", now);
    const easy = gradeCard(newCardState(now), "easy", now);
    expect(FsrsState.safeParse(again).success).toBe(true);
    expect(Date.parse(again.due)).toBeLessThan(Date.parse(easy.due));
    expect(easy.reps).toBe(1);
    expect(easy.last_review).toBe(now.toISOString());
  });

  it("is deterministic for the same input", () => {
    const card = newCardState(now);
    expect(gradeCard(card, "good", now)).toEqual(gradeCard(card, "good", now));
  });

  it("leaves the card it was given unchanged", () => {
    const card = newCardState(now);
    const copy = structuredClone(card);
    gradeCard(card, "hard", now);
    expect(card).toEqual(copy);
  });
});

describe("isDue", () => {
  it("is false before the due time and true from it", () => {
    const card = gradeCard(newCardState(now), "easy", now);
    expect(isDue(card, new Date(Date.parse(card.due) - 1))).toBe(false);
    expect(isDue(card, new Date(card.due))).toBe(true);
  });
});

describe("isMastered", () => {
  const review = { ...newCardState(now), state: "Review" as const };
  it("needs the Review state and at least 21 days of stability", () => {
    expect(isMastered({ ...review, stability: 20.9 })).toBe(false);
    expect(isMastered({ ...review, stability: 21 })).toBe(true);
    expect(isMastered({ ...review, state: "Learning", stability: 30 })).toBe(false);
  });
});
