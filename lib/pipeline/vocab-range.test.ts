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
    [["It", "went", "home", "at", "3", "."], ["it", "went", "home", "at"]],
    [["The", "cat", "met", "Mina", "."], ["met"]],
    [["She", "is", "going", "."], ["she", "is"]],
  ])("%j → %j", (tokens, expected) => {
    expect(outOfRange(tokens, allowed)).toEqual(expected);
  });

  it("accepts an irregular form when that form itself is allowed", () => {
    expect(outOfRange(["went"], new Set(["went"]))).toEqual([]);
  });
});
