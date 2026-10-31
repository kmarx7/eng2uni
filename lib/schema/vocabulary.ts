import { z } from "zod";
import { Id, LevelId, ReviewStatus } from "./common";

export const PartOfSpeech = z.enum([
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "conjunction",
  "pronoun",
  "determiner",
  "interjection",
  "phrase",
]);

export const Vocabulary = z.object({
  id: Id,
  lemma: z.string().min(1),
  pos: PartOfSpeech,
  meanings: z.array(z.string().min(1)).min(1),
  example: z.object({ en: z.string().min(1), ko: z.string().min(1) }),
  // Path to a pre-generated TTS file under public/ (word-level playback only).
  audio: z.string().regex(/^\/audio\/[\w/.-]+\.(mp3|ogg|m4a)$/).optional(),
  level: LevelId,
  isPolysemous: z.boolean(),
  csatFrequencyRank: z.number().int().min(1).optional(),
  reviewStatus: ReviewStatus,
});

export type PartOfSpeech = z.infer<typeof PartOfSpeech>;
export type Vocabulary = z.infer<typeof Vocabulary>;
