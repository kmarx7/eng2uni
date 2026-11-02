import { z } from "zod";
import { Id, ReadingType, ReviewStatus, TokenRange } from "./common";

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

// Hints from DESIGN 13-3. Level 1 is the direction text, level 2 highlights a
// token range of the question's sentence; level 3 (answer and reason) needs no data.
export const QuestionHints = z.object({
  direction: z.string().min(1).optional(),
  range: TokenRange.optional(),
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
  hints: QuestionHints.optional(),
  variantGroup: Id.optional(),
  source: QuestionSource,
  reviewStatus: ReviewStatus,
  version: z.number().int().min(1),
});

export type QuestionOption = z.infer<typeof QuestionOption>;
export type QuestionHints = z.infer<typeof QuestionHints>;
export type Question = z.infer<typeof Question>;
