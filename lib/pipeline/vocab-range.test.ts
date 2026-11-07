import { describe, expect, it } from "vitest";
import { allowedLemmas, outOfRange } from "./vocab-range";

const freq = {
  lemmas: [
    { lemma: "the", kind: "function" },
    { lemma: "cat", kind: "content" },
    { lemma: "drink", kind: "content" },
    { lemma: "study", kind: "content" },
    { lemma: "stop", kind: "content" },
    { lemma: "go", kind: "content" },
    { lemma: "of", kind: "function" },
  ],
};

describe("allowedLemmas", () => {
  it("keeps lemmas up to the rank cap and every function word", () => {
    expect([...allowedLemmas(freq, 2)].sort()).toEqual(["cat", "of", "the"]);
  });
});

describe("outOfRange", () => {
  const allowed = allowedLemmas(freq, 6);

  it.each([
    [["The", "cat", "drinks", "milk", "."], ["milk"]],
    [["Cats", "studied", "."], []],
    [["She", "stopped", "studies", "."], ["she"]],
    [["It", "went", "home", "at", "3", "."], ["it", "home", "at"]],
    [["The", "children", "studied", "."], ["children"]],
    [["The", "cat", "met", "Mina", "."], ["met"]],
    [["She", "is", "going", "."], ["she", "is"]],
  ])("%j → %j", (tokens, expected) => {
    expect(outOfRange(tokens, allowed)).toEqual(expected);
  });

  it("maps common irregular forms to their lemma", () => {
    expect(outOfRange(["men", "ate", "was", "taught"], new Set(["man", "eat", "be", "teach"]))).toEqual([]);
  });

  it("accepts an irregular form when that form itself is allowed", () => {
    expect(outOfRange(["went"], new Set(["went"]))).toEqual([]);
  });
});

// L0-U03: the frequency table lists object pronouns under the subject form
// (him → he), so "They like him." was flagged as off the word list.
describe("object pronouns", () => {
  it("count as their subject form", () => {
    const allowed = new Set(["i", "he", "we", "they", "like"]);
    expect(outOfRange(["They", "like", "him", "and", "me", "."], allowed)).toEqual(["and"]);
    expect(outOfRange(["We", "like", "them", "."], allowed)).toEqual([]);
    expect(outOfRange(["They", "like", "us", "."], allowed)).toEqual([]);
  });
});
