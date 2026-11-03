import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, SYSTEM_PROMPT } from "./prompts";

// Rules added after the first L0-U05 trial run, where the pre-review flagged
// answer hints in most question prompts (2026-11-03).
describe("generation prompt", () => {
  it("is a new version so cached v1 outputs are not reused", () => {
    expect(PROMPT_VERSION).toBe("content-v2");
  });

  it.each([
    ["no answer hints in the prompt", /Never hint at the answer in the question prompt/],
    ["no meaning-based definition of roles", /Do not define a grammatical role by meaning/],
    ["neutral translations", /neutral Korean word/],
    ["span ids per sentence", /Span ids are short role names/],
    ["common nouns over personal names", /common nouns .* instead of personal names/],
  ])("tells the model: %s", (_, rule) => {
    expect(SYSTEM_PROMPT).toMatch(rule);
  });
});
