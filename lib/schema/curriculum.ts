import { z } from "zod";
import { Id, Interaction, LevelId, ReviewStatus } from "./common";

export const Level = z.object({
  id: LevelId,
  order: z.number().int().min(0),
  name: z.string().min(1),
  description: z.string().optional(),
});

// Upper-level error causes from DESIGN 5-3, kept as misconception categories.
export const ErrorCause = z.enum(["VOC", "GRM", "SYN", "LOG", "INF", "LIS", "TIM"]);

export const Skill = z.object({
  id: Id,
  name: z.string().min(1),
  category: z.enum(["vocabulary", "grammar", "syntax", "reading", "strategy"]),
  prerequisiteIds: z.array(Id).default([]),
});

// Edge form of a prerequisite, for repositories and analytics that need pairs.
export const SkillPrerequisite = z.object({
  skillId: Id,
  prerequisiteId: Id,
});

export const Misconception = z.object({
  id: Id,
  skillId: Id,
  category: ErrorCause,
  description: z.string().min(1),
  remedialBlockId: Id.optional(),
});

// Distractor trap tags for reading items (DESIGN 14-4).
export const TrapType = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().min(1),
});

const BlockBase = { id: Id };

export const LessonBlock = z.discriminatedUnion("type", [
  z.object({ ...BlockBase, type: z.literal("concept"), body: z.string().min(1) }),
  z.object({ ...BlockBase, type: z.literal("predict"), body: z.string().min(1), questionId: Id }),
  z.object({
    ...BlockBase,
    type: z.literal("sentence_task"),
    interaction: Interaction,
    instruction: z.string().min(1),
    sentenceIds: z.array(Id).min(1),
  }),
  z.object({ ...BlockBase, type: z.literal("practice"), questionIds: z.array(Id).min(1) }),
  z.object({ ...BlockBase, type: z.literal("assessment"), questionIds: z.array(Id).min(1) }),
  z.object({
    ...BlockBase,
    type: z.literal("remedial"),
    misconceptionId: Id,
    body: z.string().min(1),
    questionIds: z.array(Id).default([]),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("contrast"),
    misconceptionIds: z.tuple([Id, Id]),
    body: z.string().min(1),
  }),
]);

export const Unit = z.object({
  id: Id,
  levelId: LevelId,
  order: z.number().int().min(0),
  title: z.string().min(1),
  skills: z.array(Id).min(1),
  blocks: z.array(LessonBlock).min(1),
  reviewStatus: ReviewStatus,
  version: z.number().int().min(1),
});

export type Level = z.infer<typeof Level>;
export type ErrorCause = z.infer<typeof ErrorCause>;
export type Skill = z.infer<typeof Skill>;
export type SkillPrerequisite = z.infer<typeof SkillPrerequisite>;
export type Misconception = z.infer<typeof Misconception>;
export type TrapType = z.infer<typeof TrapType>;
export type LessonBlock = z.infer<typeof LessonBlock>;
export type Unit = z.infer<typeof Unit>;
