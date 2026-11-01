import { describe, expect, it } from "vitest";
import { PassageStats, SyntaxStats, VocabFrequency } from "./analysis";

const meta = {
  generator: "scripts/analysis/analyze_corpus.py",
  spacy: "3.8.18",
  model: "en_core_web_sm-3.8.0",
  exams: ["2099_csat", "2099_m06"],
  since2018Exams: ["2099_csat", "2099_m06"],
};

const dist = { n: 2, mean: 10, median: 10, p10: 8, p25: 9, p75: 11, p90: 12, min: 8, max: 12 };

const vocab = {
  meta,
  totals: {
    all: { tokens: 120, countedTokens: 100, lemmas: 3 },
    since2018: { tokens: 120, countedTokens: 100, lemmas: 3 },
  },
  coverageCurve: { all: [{ topN: 1, coverage: 0.6 }], since2018: [{ topN: 1, coverage: 0.6 }] },
  lemmas: [
    {
      lemma: "the",
      kind: "function",
      pos: "DET",
      totalCount: 60,
      examCount: 2,
      itemTypes: ["blank_inference", "reference"],
      inAnswerOptions: true,
      since2018: { totalCount: 60, examCount: 2 },
    },
  ],
};

const construction = { count: 3, per100Sentences: 30 };
const typeSyntax = {
  sentences: 10,
  sentenceLength: dist,
  sentenceLengthHistogram: [{ bin: "1-10", count: 4 }],
  clausesPerSentence: dist,
  clauseCountHistogram: [{ bin: "1", count: 5 }],
  clauseDepthHistogram: [{ bin: "1", count: 5 }],
  constructions: {
    relativeClause: construction,
    participlePhrase: construction,
    toInfinitive: construction,
    nounClause: construction,
    inversion: construction,
  },
};

const cueCounts = { demonstrative: { count: 1, per1000Words: 2 }, article: { count: 1, per1000Words: 2 }, connective: { count: 1, per1000Words: 2 } };
const startCounts = { demonstrative: { count: 1, perSegment: 0.5 }, article: { count: 0, perSegment: 0 }, connective: { count: 1, perSegment: 0.5 } };

const passages = {
  meta,
  byScope: {
    all: { all: { passages: 2, wordCount: dist, paragraphs: dist, discourseMarkers: [{ marker: "however", count: 1, per1000Words: 5 }] } },
    since2018: {},
  },
  cues: {
    all: { ordering: { segments: 2, words: 500, overall: cueCounts, atSegmentStart: startCounts } },
    since2018: {},
  },
};

describe("VocabFrequency", () => {
  it("accepts a well-formed file", () => {
    expect(VocabFrequency.safeParse(vocab).success).toBe(true);
  });

  it("rejects unknown lemma kinds and coverage above 1", () => {
    const badKind = { ...vocab, lemmas: [{ ...vocab.lemmas[0], kind: "slang" }] };
    expect(VocabFrequency.safeParse(badKind).success).toBe(false);
    const badCoverage = { ...vocab, coverageCurve: { ...vocab.coverageCurve, all: [{ topN: 1, coverage: 1.2 }] } };
    expect(VocabFrequency.safeParse(badCoverage).success).toBe(false);
  });
});

describe("SyntaxStats", () => {
  it("accepts per-scope, per-type stats", () => {
    expect(SyntaxStats.safeParse({ meta, byScope: { all: { all: typeSyntax }, since2018: {} } }).success).toBe(true);
  });

  it("rejects item types outside the extractor's list", () => {
    expect(SyntaxStats.safeParse({ meta, byScope: { all: { listening: typeSyntax }, since2018: {} } }).success).toBe(false);
  });
});

describe("PassageStats", () => {
  it("accepts passage and cue stats", () => {
    expect(PassageStats.safeParse(passages).success).toBe(true);
  });

  it("requires every cue class", () => {
    const partial = { demonstrative: cueCounts.demonstrative, article: cueCounts.article };
    const bad = { ...passages, cues: { all: { ordering: { segments: 2, words: 500, overall: partial, atSegmentStart: startCounts } }, since2018: {} } };
    expect(PassageStats.safeParse(bad).success).toBe(false);
  });
});
