import { describe, expect, it } from "vitest";
import { newCardState } from "@/lib/srs";
import { cardMode, findWord } from "./cardMode";

const now = new Date("2026-11-02T09:00:00+09:00");
const example = { en: "The dog runs fast.", ko: "개가 빨리 달린다." };
const reviewed = (reps: number) => ({ ...newCardState(now), state: "Review" as const, reps });

describe("findWord", () => {
  it("finds the lemma or an inflected form starting with it, ignoring case", () => {
    expect(findWord("The dog runs fast.", "run")).toEqual({ start: 8, end: 12 });
    expect(findWord("Apples are red.", "apple")).toEqual({ start: 0, end: 6 });
  });

  it("does not match inside another word, and returns null when absent", () => {
    expect(findWord("A pineapple.", "apple")).toBeNull();
    expect(findWord("She ran home.", "run")).toBeNull();
  });

  it("treats regex characters in the lemma literally", () => {
    expect(findWord("a.b c", "a.b")).toEqual({ start: 0, end: 3 });
    expect(findWord("axb c", "a.b")).toBeNull();
  });
});

describe("cardMode", () => {
  it("shows the meaning card for a new word", () => {
    expect(cardMode({ lemma: "run", example }, undefined)).toBe("meaning");
    expect(cardMode({ lemma: "run", example }, reviewed(0))).toBe("meaning");
  });

  it("moves to the example blank, then the context card, as reviews add up", () => {
    expect(cardMode({ lemma: "run", example }, reviewed(1))).toBe("cloze");
    expect(cardMode({ lemma: "run", example }, reviewed(2))).toBe("context");
    expect(cardMode({ lemma: "run", example }, reviewed(9))).toBe("context");
  });

  it("stays on the meaning card without an example, or when the example lacks the word", () => {
    expect(cardMode({ lemma: "run" }, reviewed(5))).toBe("meaning");
    expect(cardMode({ lemma: "run", example: { en: "She ran home.", ko: "그녀는 집에 달려갔다." } }, reviewed(5))).toBe("meaning");
  });
});
