import { z } from "zod";
import { Id, NumberRange, ReadingType, TopicDomain } from "./common";

const Ratio = z.number().min(0).max(1);

// Per-type item spec derived from past-exam analysis (DESIGN 14-4).
export const Blueprint = z.object({
  id: Id,
  type: ReadingType,
  // Item numbers on the exam, e.g. "31-34" or "29".
  items: z.string().regex(/^\d{1,2}(-\d{1,2})?$/),
  passage: z.object({
    wordCount: NumberRange,
    avgSentenceLength: z.number().min(0),
    maxClauseDepth: NumberRange,
    vocabBand: z.object({ source: z.literal("csat_frequency"), topN: z.number().int().min(1) }),
    topicDomains: z.partialRecord(TopicDomain, Ratio),
  }),
  blank: z
    .object({
      positionDistribution: z
        .array(
          z.object({
            position: z.enum(["topic_sentence", "conclusion", "mid_restatement", "other"]),
            ratio: Ratio,
          }),
        )
        .min(1),
      answerBasis: z.string().min(1),
      minEvidenceSpans: z.number().int().min(1),
    })
    .optional(),
  distractors: z.object({
    count: z.number().int().min(1),
    traps: z.array(Id).min(1),
  }),
  requiredSkills: z.array(Id).min(1),
});

export type Blueprint = z.infer<typeof Blueprint>;

const Share = <T extends z.ZodType>(key: string, label: T) =>
  z.array(z.object({ [key]: label, ratio: Ratio } as Record<string, z.ZodType>)).min(1);

// Stage 5 draft, written by scripts/blueprint-drafts.ts to
// content/drafts/blueprint-drafts/. Every number comes from analysis/ (named in
// sourceStats); what the statistics cannot decide is listed in pending. It
// becomes a Blueprint once traps.json and skills.json are approved.
export const BlueprintDraft = z.object({
  id: Id,
  type: ReadingType,
  items: z.string().regex(/^\d{1,2}(-\d{1,2})?$/),
  basis: z.object({ scope: z.enum(["all", "since2018"]), passages: z.number().int().min(0), taggedItems: z.number().int().min(0), tagsReviewed: z.boolean() }),
  passage: z.object({
    wordCount: NumberRange,
    wordCountMedian: z.number().min(0),
    paragraphsMean: z.number().min(0),
    avgSentenceLength: z.number().min(0),
    maxClauseDepth: NumberRange,
    constructionsPer100Sentences: z.record(z.string(), z.number().min(0)),
    vocabBand: z.object({ source: z.literal("csat_frequency"), topN: z.number().int().min(1), coverage: Ratio }),
    topicDomains: z.partialRecord(TopicDomain, Ratio),
  }),
  evidence: z.object({ meanSpans: z.number().min(0), position: z.object({ early: Ratio, middle: Ratio, late: Ratio }) }).optional(),
  blank: z.object({ positionDistribution: Share("position", z.enum(["topic_sentence", "conclusion", "mid_restatement", "other"])) }).optional(),
  distractors: z.object({ count: z.number().int().min(1), traps: Share("trap", z.string().min(1)) }).optional(),
  grammarPoints: Share("point", z.string().min(1)).optional(),
  vocabBasis: Share("basis", z.string().min(1)).optional(),
  cues: Share("cue", z.string().min(1)).optional(),
  sourceStats: z.array(z.object({ file: z.string().regex(/^analysis\/[a-z_]+\.json$/), path: z.string().min(1) })).min(1),
  pending: z.array(z.string().min(1)),
});

export type BlueprintDraft = z.infer<typeof BlueprintDraft>;
