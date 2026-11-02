// Checks for the sentence tasks (DESIGN 13-2): role tagging and sentence building.
import type { AnnotatedSentence, Span, SpanRole } from "@/lib/schema/sentence";

export type RoleSymbol = "S" | "V" | "O";

export const TARGET_ROLES: Record<RoleSymbol, SpanRole> = { S: "SUBJECT", V: "MAIN_VERB", O: "OBJECT" };

// Top-level S, V and O spans; a role the sentence lacks is undefined.
export function targetSpans(sentence: AnnotatedSentence): Record<RoleSymbol, Span | undefined> {
  const top = (role: SpanRole) => sentence.spans.find((s) => s.role === role && s.parent === undefined);
  return { S: top("SUBJECT"), V: top("MAIN_VERB"), O: top("OBJECT") };
}

const sameRange = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1];

// The subject also accepts its head noun alone ("cat" for "The cat").
export function checkRoleTag(sentence: AnnotatedSentence, symbol: RoleSymbol, range: [number, number]): { correct: boolean; span?: Span } {
  const span = targetSpans(sentence)[symbol];
  if (!span) return { correct: false };
  const head = symbol === "S" ? sentence.spans.find((s) => s.role === "HEAD_NOUN" && s.parent === span.id) : undefined;
  if (sameRange(span.range, range) || (head && sameRange(head.range, range))) return { correct: true, span };
  return { correct: false };
}

// Word chips for building: punctuation stays out.
export function builderTokens(sentence: AnnotatedSentence): string[] {
  return sentence.tokens.filter((t) => !/^\p{P}+$/u.test(t));
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// Same seed, same order; never the original order (rotated once if the shuffle lands on it).
export function shuffled(tokens: readonly string[], seed: string): string[] {
  const random = seededRandom(seed);
  const out = [...tokens];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((t, i) => t === tokens[i])) out.push(out.shift()!);
  return out;
}

// Right or wrong for each position of the expected sentence.
export function checkBuild(expected: readonly string[], built: readonly string[]): boolean[] {
  return expected.map((token, i) => built[i] === token);
}
