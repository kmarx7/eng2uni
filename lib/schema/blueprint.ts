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
