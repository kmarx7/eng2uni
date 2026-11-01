import type { CoverageEntry, LemmaKind } from "@/lib/schema/analysis";

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
