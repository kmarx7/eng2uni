import { describe, expect, it } from "vitest";
import type { UnitSpec } from "@/lib/schema/spec";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildGroupPrompt } from "./prompts";

// Rules added after the first L0-U05 trial run, where the pre-review flagged
// answer hints in most question prompts, and the second trial, where it flagged
// capitalized answers, hint ranges equal to the answer and "-s means verb" (2026-11-03),
// and the third, where it flagged general claims in explanations, options that
// match two places and hint text that disagrees with its range (2026-11-05).
describe("generation prompt", () => {
  it("is a new version so cached v4 outputs are not reused", () => {
    expect(PROMPT_VERSION).toBe("content-v5");
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
    ["explanations about this sentence only, no general claims", /Explain each option for this sentence only/],
    ["options that point to one place", /Each option must match exactly one place in the sentence/],
    ["hint text and range describe the same place", /hints.direction and hints.range must describe the same place/],
    ["consistent, natural translations", /Translate articles the same way/],
    ["the group note wins over these general rules", /When the group note .* follow the note/],
  ])("tells the model: %s", (_, rule) => {
    expect(SYSTEM_PROMPT).toMatch(rule);
  });
});

describe("buildGroupPrompt", () => {
  const group = (sentenceUse: string) =>
    ({ id: "VG", skillId: "svo_word_order", misconceptionIds: [], questionType: "multiple_choice", count: 2, sentenceUse, note: "n" }) as never;
  const spec = { unitId: "L0-U05", levelId: "L0", title: "t", objectives: [], catalog: { misconceptions: [] }, generation: { difficulty: 1, vocabRankMax: 6000 } } as unknown as UnitSpec;

  it("tells the model that students do not see the sentence of a building question", () => {
    expect(JSON.parse(buildGroupPrompt(spec, group("building"))).output).toMatch(/students do not see the sentence/);
    expect(JSON.parse(buildGroupPrompt(spec, group("question"))).output).not.toMatch(/students do not see the sentence/);
  });
});
