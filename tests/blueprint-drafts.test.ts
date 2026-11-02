import { describe, expect, it } from "vitest";
import { BlueprintDraft } from "@/lib/schema/blueprint";
import { buildBlueprintDrafts, depthRange, type Stats } from "../scripts/blueprints/build";

const dist = (median: number, p25: number, p75: number, mean = median) => ({ n: 10, mean, median, p10: p25, p25, p75, p90: p75, min: p25, max: p75 });
const hist = (counts: number[]) => counts.map((count, i) => ({ bin: i === counts.length - 1 ? `${i}+` : String(i), count }));
const cons = { relativeClause: { count: 3, per100Sentences: 30 }, participlePhrase: { count: 1, per100Sentences: 10 }, toInfinitive: { count: 0, per100Sentences: 0 }, nounClause: { count: 0, per100Sentences: 0 }, inversion: { count: 0, per100Sentences: 0 } };
const typeSyntax = { sentences: 10, sentenceLength: dist(20, 15, 25, 21), sentenceLengthHistogram: [], clausesPerSentence: dist(2, 1, 3), clauseCountHistogram: [], clauseDepthHistogram: hist([0, 4, 4, 1, 1, 0]), constructions: cons };
const typePassages = { passages: 4, wordCount: dist(156, 140, 170), paragraphs: dist(1, 1, 1, 1.25), discourseMarkers: [] };
const scopeTags = {
  items: 8,
  trapsByType: { blank_inference: { no_textual_basis: 3, keyword_reuse: 1 } },
  grammarPoints: [{ point: "relative_pronoun", count: 2, share: 1 }],
  vocabBasis: { context_logic: 1 },
  blankRoles: { conclusion: 1, topic_sentence: 3 },
  orderCues: { connective: 2 },
  insertionCues: {},
  topicDomainsByType: { blank_inference: { arts: 3, humanities: 1 } },
  evidenceByType: { blank_inference: { items: 4, meanSpans: 3, position: { early: 3, middle: 3, late: 6 } } },
};

const stats = {
  vocab: { coverageCurve: { since2018: [{ topN: 3000, coverage: 0.94 }, { topN: 4000, coverage: 0.962 }] } },
  syntax: { byScope: { since2018: { blank_inference: typeSyntax, grammar: typeSyntax } } },
  passages: { byScope: { since2018: { blank_inference: typePassages, grammar: typePassages, all: typePassages } } },
  tagging: { meta: { reviewed: false }, byScope: { since2018: scopeTags } },
} as unknown as Stats;

describe("depthRange", () => {
  it("spans from the shallowest used depth to the depth covering 90% of sentences", () => {
    expect(depthRange(hist([0, 4, 4, 1, 1, 0]))).toEqual({ min: 1, max: 3 });
  });
});

describe("buildBlueprintDrafts", () => {
  const drafts = buildBlueprintDrafts(stats);
  const blank = drafts.find((d) => d.type === "blank_inference")!;

  it("makes one valid draft per item type with passages, never for the pooled bucket", () => {
    expect(drafts.map((d) => d.type)).toEqual(["grammar", "blank_inference"]);
    for (const d of drafts) expect(BlueprintDraft.safeParse(d).success).toBe(true);
  });

  it("takes every number from the statistics", () => {
    expect(blank.items).toBe("31-34");
    expect(blank.passage.wordCount).toEqual({ min: 140, max: 170 });
    expect(blank.passage.avgSentenceLength).toBe(21);
    expect(blank.passage.vocabBand).toEqual({ source: "csat_frequency", topN: 4000, coverage: 0.962 });
    expect(blank.passage.topicDomains).toEqual({ arts: 0.75, humanities: 0.25 });
    expect(blank.evidence).toEqual({ meanSpans: 3, position: { early: 0.25, middle: 0.25, late: 0.5 } });
    expect(blank.blank?.positionDistribution).toEqual([{ position: "topic_sentence", ratio: 0.75 }, { position: "conclusion", ratio: 0.25 }]);
    expect(blank.distractors).toEqual({ count: 4, traps: [{ trap: "no_textual_basis", ratio: 0.75 }, { trap: "keyword_reuse", ratio: 0.25 }] });
  });

  it("names its sources and lists what statistics cannot decide", () => {
    expect(blank.sourceStats).toContainEqual({ file: "analysis/passage_stats.json", path: "byScope.since2018.blank_inference.wordCount" });
    expect(blank.pending.join(" ")).toMatch(/requiredSkills/);
    expect(blank.pending.join(" ")).toMatch(/표본 검수 전/);
    const grammar = drafts.find((d) => d.type === "grammar")!;
    expect(grammar.grammarPoints).toEqual([{ point: "relative_pronoun", ratio: 1 }]);
    expect(grammar.distractors).toBeUndefined();
  });
});
