// Allowed-vocabulary check for drafts: the spec's frequency rank cap over
// analysis/vocab_frequency.json, plus every function word.
export interface FrequencyTable {
  lemmas: { lemma: string; kind: string }[];
}

export function allowedLemmas(freq: FrequencyTable, rankMax: number): Set<string> {
  return new Set(freq.lemmas.filter((entry, index) => index < rankMax || entry.kind === "function").map((e) => e.lemma.toLowerCase()));
}

// Common irregular forms a beginner sentence uses, mapped to the lemma the
// frequency table lists. Other irregular forms pass only when listed themselves.
const IRREGULAR: Record<string, string> = {
  children: "child", men: "man", women: "woman", people: "person", feet: "foot", teeth: "tooth", mice: "mouse",
  is: "be", are: "be", am: "be", was: "be", were: "be", been: "be", has: "have", had: "have", does: "do", did: "do", done: "do",
  went: "go", gone: "go", ate: "eat", eaten: "eat", saw: "see", seen: "see", ran: "run", took: "take", taken: "take",
  made: "make", got: "get", came: "come", gave: "give", given: "give", said: "say", wrote: "write", written: "write",
  bought: "buy", caught: "catch", taught: "teach", thought: "think", brought: "bring", found: "find", left: "leave",
  felt: "feel", kept: "keep", slept: "sleep", met: "meet", sat: "sit", stood: "stand", told: "tell", sold: "sell",
  won: "win", began: "begin", drank: "drink", swam: "swim", sang: "sing", flew: "fly", drew: "draw", threw: "throw",
  knew: "know", known: "know", grew: "grow", wore: "wear", broke: "break", spoke: "speak", chose: "choose", rode: "ride",
  drove: "drive", fell: "fall", held: "hold", heard: "hear", lost: "lose", paid: "pay", built: "build", sent: "send",
  spent: "spend", understood: "understand", forgot: "forget", became: "become",
  // Object pronouns: the frequency table lists them under the subject form.
  me: "i", him: "he", us: "we", them: "they",
};

// Simple inflection bases plus the irregular table.
function bases(word: string): string[] {
  const out = [word];
  if (IRREGULAR[word]) out.push(IRREGULAR[word]);
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
