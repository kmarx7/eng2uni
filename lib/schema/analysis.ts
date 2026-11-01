import { z } from "zod";
import { ReadingType } from "./common";

// Files in analysis/, written by scripts/analysis/analyze_corpus.py (stage 4).
// They hold counts and lemmas only, never exam sentences.

const Count = z.number().int().min(0);
const Ratio = z.number().min(0).max(1);
const Rate = z.number().min(0);

// "all" covers every exam in corpus/structured; "since2018" only the
// absolute-grading years (DESIGN 14-3).
export const AnalysisScope = z.enum(["all", "since2018"]);

// ReadingType plus the extractor's single-passage "reference" item and an
// "all" bucket that pools every type.
export const AnalysisItemType = z.union([ReadingType, z.literal("reference"), z.literal("all")]);

// How a lemma counts for coverage (docs/analysis/LEMMA_RULES.md).
export const LemmaKind = z.enum(["content", "function", "proper", "number"]);

export const AnalysisMeta = z.object({
  generator: z.string().min(1),
  spacy: z.string().min(1),
  model: z.string().min(1),
  exams: z.array(z.string().min(1)),
  since2018Exams: z.array(z.string().min(1)),
});

export const Distribution = z.object({
  n: Count,
  mean: z.number(),
  median: z.number(),
  p10: z.number(),
  p25: z.number(),
  p75: z.number(),
  p90: z.number(),
  min: z.number(),
  max: z.number(),
});

const Histogram = z.array(z.object({ bin: z.string().min(1), count: Count }));

const ScopeCounts = z.object({ tokens: Count, countedTokens: Count, lemmas: Count });

export const CoverageEntry = z.object({
  lemma: z.string(),
  kind: LemmaKind,
  totalCount: Count,
});

export const LemmaFrequency = CoverageEntry.extend({
  pos: z.string().min(1),
  examCount: Count,
  itemTypes: z.array(AnalysisItemType),
  inAnswerOptions: z.boolean(),
  since2018: z.object({ totalCount: Count, examCount: Count }),
});

export const VocabFrequency = z.object({
  meta: AnalysisMeta,
  totals: z.record(AnalysisScope, ScopeCounts),
  coverageCurve: z.record(AnalysisScope, z.array(z.object({ topN: z.number().int().min(1), coverage: Ratio }))),
  lemmas: z.array(LemmaFrequency),
});

const ConstructionCount = z.object({ count: Count, per100Sentences: Rate });

export const Construction = z.enum(["relativeClause", "participlePhrase", "toInfinitive", "nounClause", "inversion"]);

export const TypeSyntax = z.object({
  sentences: Count,
  sentenceLength: Distribution,
  sentenceLengthHistogram: Histogram,
  clausesPerSentence: Distribution,
  clauseCountHistogram: Histogram,
  clauseDepthHistogram: Histogram,
  constructions: z.record(Construction, ConstructionCount),
});

export const SyntaxStats = z.object({
  meta: AnalysisMeta,
  byScope: z.record(AnalysisScope, z.partialRecord(AnalysisItemType, TypeSyntax)),
});

export const TypePassages = z.object({
  passages: Count,
  wordCount: Distribution,
  paragraphs: Distribution,
  discourseMarkers: z.array(z.object({ marker: z.string().min(1), count: Count, per1000Words: Rate })),
});

// Reference words, articles and connectives in ordering/insertion items (36~39).
export const CueClass = z.enum(["demonstrative", "article", "connective"]);

export const CueStats = z.object({
  segments: Count,
  words: Count,
  overall: z.record(CueClass, z.object({ count: Count, per1000Words: Rate })),
  atSegmentStart: z.record(CueClass, z.object({ count: Count, perSegment: Rate })),
});

export const PassageStats = z.object({
  meta: AnalysisMeta,
  byScope: z.record(AnalysisScope, z.partialRecord(AnalysisItemType, TypePassages)),
  cues: z.record(AnalysisScope, z.partialRecord(z.enum(["ordering", "insertion"]), CueStats)),
});

export type AnalysisScope = z.infer<typeof AnalysisScope>;
export type AnalysisItemType = z.infer<typeof AnalysisItemType>;
export type LemmaKind = z.infer<typeof LemmaKind>;
export type AnalysisMeta = z.infer<typeof AnalysisMeta>;
export type Distribution = z.infer<typeof Distribution>;
export type CoverageEntry = z.infer<typeof CoverageEntry>;
export type LemmaFrequency = z.infer<typeof LemmaFrequency>;
export type VocabFrequency = z.infer<typeof VocabFrequency>;
export type Construction = z.infer<typeof Construction>;
export type TypeSyntax = z.infer<typeof TypeSyntax>;
export type SyntaxStats = z.infer<typeof SyntaxStats>;
export type TypePassages = z.infer<typeof TypePassages>;
export type CueClass = z.infer<typeof CueClass>;
export type CueStats = z.infer<typeof CueStats>;
export type PassageStats = z.infer<typeof PassageStats>;
