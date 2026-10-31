import { z } from "zod";

// Content ids are URL- and filename-safe: letters, digits, "_" and "-".
export const Id = z.string().regex(/^[A-Za-z0-9_-]+$/, "id must use only letters, digits, _ and -");

export const IsoDateTime = z.iso.datetime({ offset: true });

export const LevelId = z.enum(["L0", "L1", "L2", "L3", "L4", "L5", "L6"]);

// DESIGN 6-3. Only "approved" is shown to students.
export const ReviewStatus = z.enum(["draft", "auto_checked", "flagged", "approved", "retired"]);

// Hint levels from DESIGN 13-3: 0 = none, 3 = answer and evidence revealed.
export const HintLevel = z.number().int().min(0).max(3);

// Inclusive token range [start, end].
export const TokenRange = z
  .tuple([z.number().int().min(0), z.number().int().min(0)])
  .refine(([start, end]) => start <= end, "range start must not exceed end");

export const NumberRange = z
  .object({ min: z.number().min(0), max: z.number().min(0) })
  .refine(({ min, max }) => min <= max, "min must not exceed max");

// Topic domains for passages and blueprint distributions (DESIGN 14-3).
export const TopicDomain = z.enum([
  "humanities",
  "social_science",
  "natural_science",
  "technology",
  "arts",
  "daily_life",
]);

// CSAT reading item types (DESIGN 14-2).
export const ReadingType = z.enum([
  "purpose",
  "mood",
  "claim",
  "implication",
  "gist",
  "topic",
  "title",
  "chart",
  "content_match",
  "notice",
  "grammar",
  "contextual_vocab",
  "blank_inference",
  "irrelevant_sentence",
  "ordering",
  "insertion",
  "summary",
  "long_title_vocab",
  "long_narrative",
]);

// Interaction kinds from the catalog in DESIGN 13-2.
export const Interaction = z.enum([
  "role_tagging",
  "sentence_building",
  "expansion_ladder",
  "form_toggle",
  "chunk_reading",
  "modifier_arrow",
  "structure_fold",
  "evidence_highlight",
  "paragraph_sort",
  "predict_reveal",
  "vocab_card",
  "exam_timer",
]);

export type LevelId = z.infer<typeof LevelId>;
export type ReviewStatus = z.infer<typeof ReviewStatus>;
export type TopicDomain = z.infer<typeof TopicDomain>;
export type ReadingType = z.infer<typeof ReadingType>;
export type Interaction = z.infer<typeof Interaction>;
