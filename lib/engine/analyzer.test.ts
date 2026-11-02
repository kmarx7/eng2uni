import { describe, expect, it } from "vitest";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import { builderTokens, checkBuild, checkRoleTag, shuffled, targetSpans } from "./analyzer";

const sentence: AnnotatedSentence = {
  id: "FIXTURE-S-001",
  level: "L0",
  text: "The cat drinks milk.",
  tokens: ["The", "cat", "drinks", "milk", "."],
  spans: [
    { id: "subj", role: "SUBJECT", range: [0, 1], gloss: "고양이가" },
    { id: "head", role: "HEAD_NOUN", range: [1, 1], parent: "subj" },
    { id: "verb", role: "MAIN_VERB", range: [2, 2] },
    { id: "obj", role: "OBJECT", range: [3, 3] },
  ],
  translation: "고양이가 우유를 마신다.",
  skills: ["s"],
  reviewStatus: "approved",
};

describe("role tagging", () => {
  it("finds the S, V and O spans", () => {
    const spans = targetSpans(sentence);
    expect([spans.S?.id, spans.V?.id, spans.O?.id]).toEqual(["subj", "verb", "obj"]);
  });

  it("accepts the whole subject or just its head noun, returning the subject span", () => {
    expect(checkRoleTag(sentence, "S", [0, 1])).toEqual({ correct: true, span: sentence.spans[0] });
    expect(checkRoleTag(sentence, "S", [1, 1])).toEqual({ correct: true, span: sentence.spans[0] });
  });

  it("rejects a wrong range or a role the sentence lacks", () => {
    expect(checkRoleTag(sentence, "V", [1, 2]).correct).toBe(false);
    expect(checkRoleTag(sentence, "O", [2, 2]).correct).toBe(false);
    expect(checkRoleTag({ ...sentence, spans: sentence.spans.slice(0, 3) }, "O", [3, 3]).correct).toBe(false);
  });
});

describe("sentence building", () => {
  it("leaves punctuation out of the chips", () => {
    expect(builderTokens(sentence)).toEqual(["The", "cat", "drinks", "milk"]);
  });

  it("shuffles the same way for the same seed and never returns the original order", () => {
    const tokens = ["The", "cat", "drinks", "milk"];
    expect(shuffled(tokens, "a")).toEqual(shuffled(tokens, "a"));
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      expect(shuffled(tokens, seed)).not.toEqual(tokens);
      expect([...shuffled(tokens, seed)].sort()).toEqual([...tokens].sort());
    }
  });

  it("marks each position right or wrong", () => {
    expect(checkBuild(["The", "cat", "drinks"], ["cat", "The", "drinks"])).toEqual([false, false, true]);
  });
});
