import { z } from "zod";
import { IsoDateTime, TopicDomain } from "./common";
import { AnalysisItemType } from "./analysis";

// Stage 5 item tagging (DESIGN 14-3 step 3, 14-4, 14-6). The model fills
// ItemTagging for one past-exam item; scripts/tag-items.ts stores it as a
// TaggedItem in corpus/tagged/ (private, never committed).

// Distractor trap labels from the DESIGN 14-4 draft, plus "other" with a required
// note. Confirmed labels go into content/traps.json (TrapType) later in stage 5.
export const TrapLabel = z.enum([
  "opposite_claim",
  "partial_detail",
  "over_generalization",
  "keyword_reuse",
  "no_textual_basis",
  "scope_shift",
  "other",
]);

// Hypothesis list from DESIGN 14-6 plus points commonly tested in item 29.
export const GrammarPoint = z.enum([
  "subject_verb_agreement",
  "finite_vs_nonfinite",
  "relative_pronoun",
  "relative_adverb",
  "active_passive",
  "pronoun_reflexive",
  "adjective_adverb",
  "parallelism",
  "pro_verb",
  "inversion",
  "participle_form",
  "infinitive_gerund",
  "conjunction_vs_preposition",
  "tense_mood",
  "comparison",
  "other",
]);

export const VocabBasis = z.enum(["antonym", "context_logic", "cause_effect", "contrast_signal", "collocation", "other"]);

// Same positions as Blueprint.blank.positionDistribution.
export const BlankRole = z.enum(["topic_sentence", "conclusion", "mid_restatement", "other"]);

export const Cue = z.enum([
  "demonstrative",
  "pronoun",
  "article",
  "connective",
  "time_sequence",
  "lexical_repetition",
  "logical_flow",
  "other",
]);

// Option number 1~5, or a box label A~C for boxed grammar/vocabulary items.
const Target = z.string().regex(/^([1-5]|[A-C])$/);

export const ItemTagging = z.object({
  // 1-based numbers of the sentences given in the prompt.
  evidenceSentenceIndexes: z.array(z.number().int().min(1)),
  distractorTraps: z.array(
    z
      .object({ option: z.number().int().min(1).max(5), trap: TrapLabel, note: z.string() })
      .refine((t) => t.trap !== "other" || t.note.trim().length > 0, "trap 'other' needs a note"),
  ),
  grammarPoints: z.array(z.object({ target: Target, point: GrammarPoint })),
  vocabTargets: z.array(z.object({ target: Target, basis: VocabBasis })),
  blankRole: BlankRole.nullable(),
  orderCues: z.array(Cue),
  insertionCues: z.array(Cue),
  topicDomain: TopicDomain,
});

const Usage = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadInputTokens: z.number().int().min(0),
  cacheCreationInputTokens: z.number().int().min(0),
});

export const TaggedItem = z.object({
  examId: z.string().min(1),
  number: z.number().int().min(18).max(45),
  type: AnalysisItemType,
  sentenceCount: z.number().int().min(0),
  model: z.string().min(1),
  promptVersion: z.number().int().min(1),
  attempts: z.number().int().min(1),
  taggedAt: IsoDateTime,
  usage: Usage,
  tagging: ItemTagging,
});

// JSON Schema handed to `claude -p --json-schema`. Refinements are checked
// afterwards with ItemTagging itself.
export function taggingJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(ItemTagging, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}

export type TrapLabel = z.infer<typeof TrapLabel>;
export type GrammarPoint = z.infer<typeof GrammarPoint>;
export type VocabBasis = z.infer<typeof VocabBasis>;
export type BlankRole = z.infer<typeof BlankRole>;
export type Cue = z.infer<typeof Cue>;
export type ItemTagging = z.infer<typeof ItemTagging>;
export type TaggedItem = z.infer<typeof TaggedItem>;
