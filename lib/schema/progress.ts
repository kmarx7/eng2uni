import { z } from "zod";
import { HintLevel, Id, Interaction, IsoDateTime } from "./common";

// Mirrors ts-fsrs Card with dates serialized as ISO strings.
export const FsrsState = z.object({
  due: IsoDateTime,
  stability: z.number().min(0),
  difficulty: z.number().min(0),
  scheduled_days: z.number().int().min(0),
  learning_steps: z.number().int().min(0),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.enum(["New", "Learning", "Review", "Relearning"]),
  last_review: IsoDateTime.optional(),
});

export const ReviewCard = z.object({
  userId: z.string().min(1),
  itemType: z.enum(["word", "skill"]),
  itemId: Id,
  fsrs: FsrsState,
});

export const Attempt = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  questionId: Id,
  answer: Id,
  correct: z.boolean(),
  durationMs: z.number().int().min(0),
  hintLevel: HintLevel.default(0),
  at: IsoDateTime,
});

export const LessonProgress = z.object({
  userId: z.string().min(1),
  lessonId: Id,
  status: z.enum(["locked", "available", "in_progress", "awaiting_delayed_check", "passed"]),
  currentBlockId: Id.optional(),
  score: z.number().min(0).max(1).optional(),
  evidenceCount: z.number().int().min(0),
  updatedAt: IsoDateTime,
});

// Judgments from DESIGN 5-2.
export const MasteryStatus = z.enum([
  "not_started",
  "learning",
  "mastered",
  "can_progress",
  "remedial",
  "foundation_check",
  "confusion",
]);

export const SkillMastery = z.object({
  userId: z.string().min(1),
  skillId: Id,
  status: MasteryStatus,
  evidenceCount: z.number().int().min(0),
  accuracy: z.number().min(0).max(1).optional(),
  analyzerTaskPassed: z.boolean().default(false),
  delayedCheckPassed: z.boolean().default(false),
  misconceptionCounts: z.record(z.string(), z.number().int().min(0)).default({}),
  updatedAt: IsoDateTime,
});

// Event types from DESIGN 9-3.
export const LearningEventType = z.enum([
  "session_start",
  "session_end",
  "card_review",
  "block_view",
  "question_answer",
  "analyzer_action",
  "report_error",
]);

export const LearningEvent = z.object({
  anonId: z.string().min(1),
  type: LearningEventType,
  interaction: Interaction.optional(),
  hintLevel: HintLevel.optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  at: IsoDateTime,
});

export type FsrsState = z.infer<typeof FsrsState>;
export type ReviewCard = z.infer<typeof ReviewCard>;
export type Attempt = z.infer<typeof Attempt>;
export type LessonProgress = z.infer<typeof LessonProgress>;
export type MasteryStatus = z.infer<typeof MasteryStatus>;
export type SkillMastery = z.infer<typeof SkillMastery>;
export type LearningEventType = z.infer<typeof LearningEventType>;
export type LearningEvent = z.infer<typeof LearningEvent>;
