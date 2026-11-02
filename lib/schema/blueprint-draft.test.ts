import { describe, expect, it } from "vitest";
import { BlueprintDraft } from "./blueprint";

const draft = {
  id: "BPD-blank_inference",
  type: "blank_inference",
  items: "31-34",
  basis: { scope: "since2018", passages: 116, taggedItems: 116, tagsReviewed: false },
  passage: {
    wordCount: { min: 140, max: 170 },
    wordCountMedian: 156,
    paragraphsMean: 1.2,
    avgSentenceLength: 21,
    maxClauseDepth: { min: 1, max: 3 },
    constructionsPer100Sentences: { relativeClause: 27 },
    vocabBand: { source: "csat_frequency", topN: 4000, coverage: 0.96 },
    topicDomains: { social_science: 0.5, humanities: 0.5 },
  },
  evidence: { meanSpans: 3.4, position: { early: 0.2, middle: 0.4, late: 0.4 } },
  blank: { positionDistribution: [{ position: "conclusion", ratio: 0.4 }] },
  distractors: { count: 4, traps: [{ trap: "no_textual_basis", ratio: 0.4 }] },
  sourceStats: [{ file: "analysis/passage_stats.json", path: "byScope.since2018.blank_inference.wordCount" }],
  pending: ["requiredSkills: skills.json not defined yet"],
};

describe("BlueprintDraft", () => {
  it("accepts a draft built from statistics", () => {
    expect(BlueprintDraft.safeParse(draft).success).toBe(true);
  });

  it("requires sources and rejects non-analysis files", () => {
    expect(BlueprintDraft.safeParse({ ...draft, sourceStats: [] }).success).toBe(false);
    expect(BlueprintDraft.safeParse({ ...draft, sourceStats: [{ file: "corpus/tagged/x.json", path: "a" }] }).success).toBe(false);
  });

  it("rejects ratios above 1 and unknown blank positions", () => {
    expect(BlueprintDraft.safeParse({ ...draft, distractors: { count: 4, traps: [{ trap: "x", ratio: 1.5 }] } }).success).toBe(false);
    expect(BlueprintDraft.safeParse({ ...draft, blank: { positionDistribution: [{ position: "start", ratio: 0.1 }] } }).success).toBe(false);
  });
});
