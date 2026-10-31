import { z } from "zod";
import { Id, ReadingType, ReviewStatus } from "./common";

export const QuestionOption = z.object({
  id: Id,
  text: z.string().min(1),
  misconception: Id.optional(),
  trap: Id.optional(),
});

export const QuestionSource = z.object({
  type: z.enum(["original", "licensed"]),
  generatedBy: z.enum(["ai_draft", "human"]),
  reviewedBy: z.string().min(1).optional(),
});

export const Question = z.object({
  id: Id,
  lessonId: Id.optional(),
  type: z.enum(["multiple_choice", "true_false"]),
  readingType: ReadingType.optional(),
  difficulty: z.number().int().min(1).max(5),
  sentenceId: Id.optional(),
  passageId: Id.optional(),
  prompt: z.string().min(1),
  options: z.array(QuestionOption).min(2),
  answer: Id,
  skills: z.array(Id).min(1),
  explanation: z.object({
    summary: z.string().min(1),
    byOption: z.record(z.string(), z.string().min(1)).default({}),
  }),
  variantGroup: Id.optional(),
  source: QuestionSource,
  reviewStatus: ReviewStatus,
  version: z.number().int().min(1),
});

export type QuestionOption = z.infer<typeof QuestionOption>;
export type Question = z.infer<typeof Question>;
