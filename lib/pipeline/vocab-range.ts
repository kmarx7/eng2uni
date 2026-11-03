// Allowed-vocabulary check for drafts: the spec's frequency rank cap over
// analysis/vocab_frequency.json, plus every function word.
export interface FrequencyTable {
  lemmas: { lemma: string; kind: string }[];
}

export function allowedLemmas(freq: FrequencyTable, rankMax: number): Set<string> {
  return new Set(freq.lemmas.filter((entry, index) => index < rankMax || entry.kind === "function").map((e) => e.lemma.toLowerCase()));
}

// Simple inflection bases; irregular forms pass only when listed themselves.
function bases(word: string): string[] {
  const out = [word];
  const strip = (suffix: string, add = "") => {
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) out.push(word.slice(0, -suffix.length) + add);
  };
  strip("ies", "y");
  strip("ied", "y");
  strip("es");
  strip("s");
  strip("ed");
  strip("ed", "e");
  strip("ing");
  strip("ing", "e");
  for (const suffix of ["ed", "ing"]) {
    const stem = word.slice(0, -suffix.length);
    if (word.endsWith(suffix) && stem.length > 2 && stem.at(-1) === stem.at(-2)) out.push(stem.slice(0, -1));
  }
  return out;
}

// Words outside the allowed set, lowercased, in order, without repeats. Skips
// punctuation, numbers and capitalized words after the first (proper nouns).
export function outOfRange(tokens: string[], allowed: Set<string>): string[] {
  const out: string[] = [];
  tokens.forEach((token, index) => {
    if (!/^[A-Za-z][A-Za-z'-]*$/.test(token)) return;
    if (index > 0 && /^[A-Z]/.test(token)) return;
    const word = token.toLowerCase();
    if (bases(word).some((b) => allowed.has(b))) return;
    if (!out.includes(word)) out.push(word);
  });
  return out;
}
