import { z } from "zod";
import { Id, Interaction, LevelId } from "./common";
import { Level, Misconception, Skill, TrapType } from "./curriculum";

// Unit lifecycle from DATA_CONTRACT_ADDENDUM §4. Only a person sets "approved".
export const UnitStatusValue = z.enum(["specified", "drafted", "reviewed", "approved", "implemented"]);

// One generation call makes one variant group (DESIGN 6-2, stage 8 design).
export const VariantGroupSpec = z.object({
  id: Id,
  skillId: Id,
  misconceptionIds: z.array(Id).default([]),
  questionType: z.enum(["multiple_choice", "true_false"]),
  count: z.number().int().min(6),
  // What the group's sentences are for: a tagging task, a building task, or only questions.
  sentenceUse: z.enum(["tagging", "building", "question"]),
  note: z.string().min(1),
});

export const GenerationSpec = z.object({
  difficulty: z.number().int().min(1).max(5),
  // Allowed words: frequency rank cap in analysis/vocab_frequency.json.
  vocabRankMax: z.number().int().min(1),
  sentenceCount: z.number().int().min(1),
  variantGroups: z.array(VariantGroupSpec).min(1),
});

// Draft catalogue entries a unit needs before its items can be approved.
export const SpecCatalog = z.object({
  level: Level.optional(),
  skills: z.array(Skill).default([]),
  misconceptions: z.array(Misconception).default([]),
  traps: z.array(TrapType).default([]),
});

// The unit spec curriculum-architect writes to content/specs/{unitId}.json
// (DATA_CONTRACT_ADDENDUM §3), plus what the content pipeline needs to generate.
export const UnitSpec = z.object({
  unitId: Id,
  levelId: LevelId,
  title: z.string().min(1),
  objectives: z.array(z.string().min(1)).min(1),
  prerequisiteSkills: z.array(Id).default([]),
  targetSkills: z.array(Id).min(1),
  misconceptions: z.array(z.object({ id: Id, description: z.string().min(1), remediation: z.string().min(1) })).default([]),
  vocabRange: z.object({ maxLevel: LevelId, note: z.string().min(1) }),
  families: z.array(z.object({ familyId: Id, questionCount: z.number().int().min(0), note: z.string() })).default([]),
  interactions: z.array(Interaction).default([]),
  assessmentCriteria: z.array(z.string().min(1)).default([]),
  status: UnitStatusValue,
  unverified: z.array(z.string()).default([]),
  generation: GenerationSpec,
  catalog: SpecCatalog.default({ skills: [], misconceptions: [], traps: [] }),
});

export type UnitStatusValue = z.infer<typeof UnitStatusValue>;
export type VariantGroupSpec = z.infer<typeof VariantGroupSpec>;
export type GenerationSpec = z.infer<typeof GenerationSpec>;
export type SpecCatalog = z.infer<typeof SpecCatalog>;
export type UnitSpec = z.infer<typeof UnitSpec>;
