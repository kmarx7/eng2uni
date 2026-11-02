import { describe, expect, it } from "vitest";
import { TaggingStats, type TaggedItem } from "@/lib/schema/tagging";
import { aggregateTags } from "../scripts/tagging/aggregate";

function rec(examId: string, number: number, type: string, t: Partial<TaggedItem["tagging"]>, sentenceCount = 9): TaggedItem {
  return {
    examId, number, type: type as TaggedItem["type"], sentenceCount, model: "fake-model", promptVersion: 2, attempts: 1,
    taggedAt: "2026-11-01T09:00:00+09:00",
    usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    tagging: { evidenceSentenceIndexes: [], distractorTraps: [], grammarPoints: [], vocabTargets: [], blankRole: null, orderCues: [], insertionCues: [], topicDomain: "arts", ...t },
  };
}

const records = [
  rec("2016_csat", 31, "blank_inference", { blankRole: "conclusion", evidenceSentenceIndexes: [8, 9], distractorTraps: [{ option: 1, trap: "keyword_reuse", note: "" }] }),
  rec("2020_csat", 32, "blank_inference", { blankRole: "topic_sentence", evidenceSentenceIndexes: [1, 5], distractorTraps: [{ option: 2, trap: "keyword_reuse", note: "" }, { option: 3, trap: "opposite_claim", note: "" }] }),
  rec("2020_csat", 29, "grammar", { grammarPoints: [{ target: "1", point: "relative_pronoun" }, { target: "2", point: "relative_pronoun" }, { target: "3", point: "active_passive" }], topicDomain: "humanities" }),
  rec("2020_csat", 36, "ordering", { orderCues: ["connective", "article"] }),
];

describe("aggregateTags", () => {
  const stats = aggregateTags(records, { generator: "test", reviewed: false });

  it("produces a valid stats file split by scope", () => {
    expect(TaggingStats.safeParse(stats).success).toBe(true);
    expect(stats.byScope.all.items).toBe(4);
    expect(stats.byScope.since2018.items).toBe(3);
    expect(stats.meta.since2018Exams).toEqual(["2020_csat"]);
  });

  it("counts traps per type and ranks grammar points", () => {
    expect(stats.byScope.all.trapsByType.blank_inference).toEqual({ keyword_reuse: 2, opposite_claim: 1 });
    expect(stats.byScope.all.grammarPoints).toEqual([
      { point: "relative_pronoun", count: 2, share: 0.6667 },
      { point: "active_passive", count: 1, share: 0.3333 },
    ]);
  });

  it("counts blank roles, cues and topic domains", () => {
    expect(stats.byScope.all.blankRoles).toEqual({ conclusion: 1, topic_sentence: 1 });
    expect(stats.byScope.since2018.blankRoles).toEqual({ topic_sentence: 1 });
    expect(stats.byScope.all.orderCues).toEqual({ connective: 1, article: 1 });
    expect(stats.byScope.all.topicDomainsByType.grammar).toEqual({ humanities: 1 });
  });

  it("places evidence sentences in the early, middle or late third of the passage", () => {
    // 8,9 of 9 -> late; 1 of 9 -> early, 5 of 9 -> middle
    expect(stats.byScope.all.evidenceByType.blank_inference).toEqual({ items: 2, meanSpans: 2, position: { early: 1, middle: 1, late: 2 } });
  });
});
