// Which face a word card shows (DESIGN 3-3, 13-2): meaning → example blank →
// meaning in context, getting harder as reviews add up. Cards that need an
// example appear only when the word has one that contains it.
import type { FsrsState } from "@/lib/schema/progress";
import type { Vocabulary } from "@/lib/schema/vocabulary";

export type CardMode = "meaning" | "cloze" | "context";

// The lemma, or a form starting with it ("run" → "runs"), as a whole word.
// Irregular forms ("ran") are not found, so such words keep the meaning card.
export function findWord(sentence: string, lemma: string): { start: number; end: number } | null {
  const escaped = lemma.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b${escaped}\\w*\\b`, "i").exec(sentence);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

export function cardMode(word: Pick<Vocabulary, "lemma" | "example">, fsrs: FsrsState | undefined): CardMode {
  const reps = fsrs?.reps ?? 0;
  if (reps === 0 || !word.example || !findWord(word.example.en, word.lemma)) return "meaning";
  return reps === 1 ? "cloze" : "context";
}
