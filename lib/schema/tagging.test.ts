import { describe, expect, it } from "vitest";
import { ItemTagging, TaggedItem, taggingJsonSchema } from "./tagging";

const tagging = {
  evidenceSentenceIndexes: [2, 5],
  distractorTraps: [
    { option: 1, trap: "keyword_reuse", note: "" },
    { option: 2, trap: "other", note: "fake reason" },
  ],
  grammarPoints: [],
  vocabTargets: [],
  blankRole: "topic_sentence",
  orderCues: [],
  insertionCues: [],
  topicDomain: "social_science",
};

describe("ItemTagging", () => {
  it("accepts a complete tagging", () => {
    expect(ItemTagging.safeParse(tagging).success).toBe(true);
  });

  it("requires a note when the trap is other", () => {
    const bad = { ...tagging, distractorTraps: [{ option: 2, trap: "other", note: " " }] };
    expect(ItemTagging.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown labels and zero-based sentence numbers", () => {
    expect(ItemTagging.safeParse({ ...tagging, blankRole: "middle" }).success).toBe(false);
    expect(ItemTagging.safeParse({ ...tagging, evidenceSentenceIndexes: [0] }).success).toBe(false);
    expect(ItemTagging.safeParse({ ...tagging, grammarPoints: [{ target: "1", point: "spelling" }] }).success).toBe(false);
  });
});

describe("TaggedItem", () => {
  it("wraps a tagging with provenance", () => {
    const record = {
      examId: "2099_csat",
      number: 31,
      type: "blank_inference",
      sentenceCount: 7,
      model: "claude-sonnet-5-5",
      promptVersion: 1,
      attempts: 1,
      taggedAt: "2026-11-01T09:00:00+09:00",
      usage: { inputTokens: 10, outputTokens: 20, cacheReadInputTokens: 0, cacheCreationInputTokens: 1000 },
      tagging,
    };
    expect(TaggedItem.safeParse(record).success).toBe(true);
  });
});

describe("taggingJsonSchema", () => {
  it("is a strict object schema listing every field as required", () => {
    const schema = taggingJsonSchema();
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect([...(schema.required as string[])].sort()).toEqual(Object.keys(tagging).sort());
  });
});
