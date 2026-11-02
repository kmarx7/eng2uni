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

// Daily goal in minutes (DESIGN 9-2).
export const DailyMinutes = z.union([z.literal(15), z.literal(30), z.literal(60)]);

// Where a lesson is in its flow (stage 7): the linear blocks, then the steps a
// judgment can send the student to.
export const LessonPhase = z.enum(["main", "contrast", "remedial", "foundation", "reassessment"]);

export const LessonAttempt = z.object({
  questionId: Id,
  correct: z.boolean(),
  hintLevel: HintLevel,
  misconception: Id.optional(),
  phase: LessonPhase,
  round: z.number().int().min(0),
  at: IsoDateTime,
});

export const LessonState = z.object({
  unitId: Id,
  status: LessonProgress.shape.status,
  phase: z.union([LessonPhase, z.literal("result")]),
  blockIndex: z.number().int().min(0),
  queue: z.array(Id),
  round: z.number().int().min(0),
  attempts: z.array(LessonAttempt),
  analyzerPassed: z.boolean(),
  judgment: MasteryStatus.optional(),
  focusMisconception: Id.optional(),
  updatedAt: IsoDateTime,
});

// A variant question was needed but none was left (DESIGN 5-2 "문항 부족").
export const Shortage = z.object({
  at: IsoDateTime,
  unitId: Id.optional(),
  skillId: Id.optional(),
  variantGroup: Id.optional(),
});

const LocalProgressV1Fields = {
  profile: z
    .object({
      anonId: z.uuid(),
      nickname: z.string().trim().min(1).max(20),
      dailyMinutes: DailyMinutes,
      createdAt: IsoDateTime,
    })
    .nullable(),
  cards: z.array(ReviewCard),
  // Local calendar date -> counts done that day.
  days: z.record(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.object({ reviewed: z.number().int().min(0), learned: z.number().int().min(0) }),
  ),
};

// Stage 6 progress; the repository moves it to the current version.
export const LocalProgressV1 = z.object({ schemaVersion: z.literal(1), ...LocalProgressV1Fields });

// Progress kept in the student's browser. Bump schemaVersion on any change and
// add a migration in the repository; data it cannot read is backed up and reset.
export const LocalProgress = z.object({
  schemaVersion: z.literal(2),
  ...LocalProgressV1Fields,
  lessons: z.record(Id, LessonState).default({}),
  skills: z
    .record(
      Id,
      z.object({
        delayedCheckPassed: z.boolean(),
        misconceptionCounts: z.record(Id, z.number().int().min(0)),
      }),
    )
    .default({}),
  shortages: z.array(Shortage).default([]),
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
export type DailyMinutes = z.infer<typeof DailyMinutes>;
export type LocalProgress = z.infer<typeof LocalProgress>;
export type LessonPhase = z.infer<typeof LessonPhase>;
export type LessonAttempt = z.infer<typeof LessonAttempt>;
export type LessonState = z.infer<typeof LessonState>;
export type Shortage = z.infer<typeof Shortage>;
