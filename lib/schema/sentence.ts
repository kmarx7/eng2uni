import { z } from "zod";
import { Id, LevelId, ReviewStatus, TokenRange, TopicDomain } from "./common";

// Starting role set from DESIGN 4-1; extend by adding codes here.
export const SpanRole = z.enum([
  "SUBJECT",
  "MAIN_VERB",
  "OBJECT",
  "COMPLEMENT",
  "MODIFIER",
  "HEAD_NOUN",
  "REL_CLAUSE",
  "NOUN_CLAUSE",
  "ADV_CLAUSE",
  "PARTICIPLE_PHRASE",
  "PREP_PHRASE",
  "INFINITIVE_PHRASE",
]);

// Grammatical function a clause or phrase plays inside its parent.
export const SpanFunction = z.enum(["SUBJECT", "OBJECT", "COMPLEMENT", "MODIFIER"]);

export const Span = z.object({
  id: Id,
  role: SpanRole,
  range: TokenRange,
  parent: Id.optional(),
  modifies: Id.optional(),
  function: SpanFunction.optional(),
  // Korean piece of the translation shown once the role is tagged (DESIGN 13-3).
  gloss: z.string().min(1).optional(),
});

// One rung of the sentence expansion ladder (DESIGN 13-2, 13-5).
export const ExpansionStep = z.object({
  text: z.string().min(1),
  addedRole: SpanRole.optional(),
  translation: z.string().optional(),
});

export const AnnotatedSentence = z.object({
  id: Id,
  level: LevelId,
  text: z.string().min(1),
  tokens: z.array(z.string().min(1)).min(1),
  spans: z.array(Span),
  // Token indices where a new reading chunk starts (index 0 is implicit).
  chunks: z.array(z.number().int().min(1)).optional(),
  expansionSteps: z.array(ExpansionStep).optional(),
  translation: z.string().min(1),
  chunkedTranslation: z.array(z.string().min(1)).optional(),
  skills: z.array(Id).min(1),
  reviewStatus: ReviewStatus,
});

export const EvidenceSpan = z.object({
  questionId: Id,
  // Inclusive index range into Passage.sentences.
  sentenceRange: TokenRange,
});

export const Passage = z.object({
  id: Id,
  level: LevelId,
  text: z.string().min(1),
  sentences: z.array(Id).min(1),
  evidenceSpans: z.array(EvidenceSpan).default([]),
  topicDomain: TopicDomain,
  reviewStatus: ReviewStatus,
});

export type SpanRole = z.infer<typeof SpanRole>;
export type Span = z.infer<typeof Span>;
export type ExpansionStep = z.infer<typeof ExpansionStep>;
export type AnnotatedSentence = z.infer<typeof AnnotatedSentence>;
export type EvidenceSpan = z.infer<typeof EvidenceSpan>;
export type Passage = z.infer<typeof Passage>;
