import type { CoverageEntry, LemmaKind } from "@/lib/schema/analysis";
import type { ReviewCard } from "@/lib/schema/progress";
import { isMastered } from "@/lib/srs";

// Same rules as scripts/analysis/csat_stats/lexicon.py; both are checked
// against coverage.cases.json. See docs/analysis/LEMMA_RULES.md.

export type { CoverageEntry };

// Proper nouns and numbers are never "unknown words", so they are left out.
const COUNTED: ReadonlySet<LemmaKind> = new Set(["content", "function"]);

export function normalizeLemma(lemma: string): string {
  return lemma.normalize("NFKC").replace(/[‘’ʼ]/g, "'").trim().toLowerCase();
}

// Share of counted exam-passage tokens whose lemma is in `known` (0..1).
export function coverage(known: ReadonlySet<string>, entries: readonly CoverageEntry[]): number {
  const knownNormalized = new Set([...known].map(normalizeLemma));
  let total = 0;
  let hit = 0;
  for (const entry of entries) {
    if (!COUNTED.has(entry.kind)) continue;
    total += entry.totalCount;
    if (knownNormalized.has(normalizeLemma(entry.lemma))) hit += entry.totalCount;
  }
  return total === 0 ? 0 : hit / total;
}

// Coverage reached by knowing the N most frequent counted lemmas.
export function coverageCurve(
  entries: readonly CoverageEntry[],
  sizes: readonly number[],
): { topN: number; coverage: number }[] {
  const ranked = entries.filter((e) => COUNTED.has(e.kind)).sort((a, b) => b.totalCount - a.totalCount);
  return sizes.map((topN) => ({
    topN,
    coverage: coverage(new Set(ranked.slice(0, topN).map((e) => e.lemma)), ranked),
  }));
}

// Coverage from the words a student has mastered (lib/srs isMastered).
export function masteredCoverage(
  cards: readonly ReviewCard[],
  lemmaById: Readonly<Record<string, string>>,
  entries: readonly CoverageEntry[],
): number {
  const known = cards
    .filter((c) => c.itemType === "word" && isMastered(c.fsrs) && lemmaById[c.itemId])
    .map((c) => lemmaById[c.itemId]);
  return coverage(new Set(known), entries);
}

// The analysis file is too large to send to the browser. The server keeps the
// counted total and the counts of the lemmas a student can learn; the share
// then matches masteredCoverage.
export interface CoverageWeights {
  total: number;
  countByLemma: Record<string, number>;
}

export function coverageWeights(entries: readonly CoverageEntry[], lemmas: readonly string[]): CoverageWeights {
  const wanted = new Set(lemmas.map(normalizeLemma));
  const countByLemma: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    if (!COUNTED.has(entry.kind)) continue;
    total += entry.totalCount;
    const lemma = normalizeLemma(entry.lemma);
    if (wanted.has(lemma)) countByLemma[lemma] = (countByLemma[lemma] ?? 0) + entry.totalCount;
  }
  return { total, countByLemma };
}

export function masteredShare(
  cards: readonly ReviewCard[],
  lemmaById: Readonly<Record<string, string>>,
  weights: CoverageWeights,
): number {
  if (weights.total === 0) return 0;
  const known = new Set(
    cards
      .filter((c) => c.itemType === "word" && isMastered(c.fsrs) && lemmaById[c.itemId])
      .map((c) => normalizeLemma(lemmaById[c.itemId])),
  );
  let hit = 0;
  for (const lemma of known) hit += weights.countByLemma[lemma] ?? 0;
  return hit / weights.total;
}
