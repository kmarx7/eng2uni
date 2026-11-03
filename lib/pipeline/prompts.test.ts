import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompts";

// Rules added after the first L0-U05 trial run, where the pre-review flagged
// answer hints in most question prompts, and the second trial, where it flagged
// capitalized answers, hint ranges equal to the answer and "-s means verb" (2026-11-03).
describe("generation prompt", () => {
  it("is a new version so cached v1 outputs are not reused", () => {
    expect(PROMPT_VERSION).toBe("content-v3");
  });

  it.each([
    ["no answer hints in the prompt", /Never hint at the answer in the question prompt/],
    ["no meaning-based definition of roles", /Do not define a grammatical role by meaning/],
    ["neutral translations", /neutral Korean word/],
    ["span ids per sentence", /Span ids are short role names/],
    ["common nouns over personal names", /common nouns .* instead of personal names/],
    ["options copy the sentence's own spelling or are all lowercase", /Option text copies the words exactly as they appear in the sentence/],
    ["hint ranges wider than the answer", /hints.range must cover more than the answer/],
    ["roles explained by position, not word endings", /never by a word ending/],
  ])("tells the model: %s", (_, rule) => {
    expect(SYSTEM_PROMPT).toMatch(rule);
  });
});
