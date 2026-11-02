// Server-only readers for the student screens. Students see approved words only.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CoverageEntry } from "@/lib/schema/analysis";
import { Vocabulary } from "@/lib/schema/vocabulary";

// CONTENT_DIR lets e2e and local previews point at content/_fixtures/valid.
export function loadStudentVocabulary(contentDir = process.env.CONTENT_DIR ?? "content"): Vocabulary[] {
  const dir = path.join(contentDir, "vocabulary");
  if (!existsSync(dir)) return [];
  const words: Vocabulary[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const items: unknown[] = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    for (const item of items) {
      const word = Vocabulary.safeParse(item);
      if (word.success && word.data.reviewStatus === "approved") words.push(word.data);
    }
  }
  // Ranked words by CSAT frequency first (14-5), then source order (stable sort).
  return words.sort((a, b) => (a.csatFrequencyRank ?? Infinity) - (b.csatFrequencyRank ?? Infinity));
}

// Lemma counts for the coverage metric; null hides the metric (no analysis yet).
export function loadCoverageEntries(rootDir = process.cwd()): CoverageEntry[] | null {
  const file = path.join(rootDir, "analysis/vocab_frequency.json");
  if (!existsSync(file)) return null;
  const { lemmas } = JSON.parse(readFileSync(file, "utf8")) as { lemmas: CoverageEntry[] };
  return lemmas.map(({ lemma, kind, totalCount }) => ({ lemma, kind, totalCount }));
}
