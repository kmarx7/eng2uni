// Builds the per-item tagging prompt. The item comes from corpus/structured
// (private); the prompt is sent only to `claude -p` and never written to git.
import { z } from "zod";

// Bump when the prompt or the required fields change; cached tags from older
// versions are redone on the next run.
export const PROMPT_VERSION = 2;

// The fields of a corpus/structured question that the tagger reads.
export const ExamItem = z.object({
  examId: z.string(),
  number: z.number().int(),
  type: z.string(),
  instruction: z.string(),
  passage: z.string(),
  options: z.array(z.object({ label: z.number().int(), text: z.string(), kind: z.string() })),
  answer: z.number().int().nullable(),
  givenSentence: z.string().nullable(),
  summary: z.string().nullable(),
  orderParts: z.record(z.string(), z.string()).nullable(),
});
export type ExamItem = z.infer<typeof ExamItem>;

export const SYSTEM_PROMPT = `You tag Korean CSAT English reading items for curriculum research.
Return only the JSON object required by the schema. Use these labels:

distractorTraps (one per wrong option, never for the correct answer):
- opposite_claim: says the reverse of the passage
- partial_detail: true detail that is not the main point, or only half matches
- over_generalization: broader or stronger than the passage supports
- keyword_reuse: reuses passage words with a wrong meaning or relation
- no_textual_basis: plausible but not stated or implied
- scope_shift: shifts subject, time, or scope away from the passage
- other: none fits; explain briefly in note (note may be "" otherwise)

grammarPoints (item 29 style; target = option number 1-5, or box label A-C for boxed items):
subject_verb_agreement, finite_vs_nonfinite, relative_pronoun, relative_adverb, active_passive,
pronoun_reflexive, adjective_adverb, parallelism, pro_verb (do/does/did standing for a verb),
inversion, participle_form, infinitive_gerund, conjunction_vs_preposition, tense_mood, comparison, other

vocabTargets (target = option number 1-5, or box label A-C): basis for judging the word:
antonym, context_logic, cause_effect, contrast_signal, collocation, other

blankRole: what the blank sentence does in the passage:
topic_sentence, conclusion, mid_restatement (restates the main idea mid-passage), other

orderCues / insertionCues: cues that fix the order or position:
demonstrative (this/that/these/those/such + noun), pronoun, article (a -> the), connective,
time_sequence, lexical_repetition, logical_flow, other

topicDomain: humanities, social_science, natural_science, technology, arts, daily_life

evidenceSentenceIndexes: the [S#] numbers of the sentences that justify the correct answer.
When a field is marked "leave empty", return [] (or null for blankRole).`;

const MARKERS = "①②③④⑤";
const ABBREVIATIONS = new Set(["mr", "mrs", "ms", "dr", "st", "prof", "vs", "etc", "e.g", "i.e", "u.s", "jr", "sr", "no"]);

// Sentence numbering shared by the prompt and the evidence check.
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    let start = 0;
    const boundary = /([.!?])(["”’')\]]*)\s+(?=["“‘(\[A-Z0-9①-⑤])/g;
    for (let m = boundary.exec(line); m; m = boundary.exec(line)) {
      const before = line.slice(start, m.index).split(/\s+/).pop()?.toLowerCase() ?? "";
      if (m[1] === "." && ABBREVIATIONS.has(before)) continue;
      out.push(line.slice(start, m.index + m[1].length + m[2].length).trim());
      start = boundary.lastIndex;
    }
    out.push(line.slice(start).trim());
  }
  return out.filter((s) => s.length > 0);
}

const TRAP_TYPES = new Set([
  "purpose", "mood", "claim", "implication", "gist", "topic", "title",
  "content_match", "notice", "chart", "blank_inference", "summary",
]);
const LONG_SETS = new Set(["long_title_vocab", "long_narrative"]);

export interface Requirements {
  traps: boolean;
  blankRole: boolean;
  grammar: boolean;
  vocab: boolean;
  orderCues: boolean;
  insertionCues: boolean;
}

export function requirementsFor(item: ExamItem): Requirements {
  const text = item.instruction.replace(/\s+/g, "");
  const longSet = LONG_SETS.has(item.type);
  // In "which is NOT consistent" items the wrong options are true statements,
  // so there is no trap to label.
  const negative = /않는|않은|틀린/.test(text);
  const ordering = item.type === "ordering" || (longSet && /순서/.test(text));
  return {
    traps: !negative && !ordering && (TRAP_TYPES.has(item.type) || (longSet && /제목|주제|내용|일치|빈칸/.test(text))),
    blankRole: item.type === "blank_inference" || (longSet && /빈칸/.test(text)),
    grammar: /어법/.test(text),
    vocab: /낱말|쓰임/.test(text),
    orderCues: ordering,
    insertionCues: item.type === "insertion",
  };
}

const FIELD_NAMES: [keyof Requirements, string][] = [
  ["traps", "distractorTraps"],
  ["blankRole", "blankRole"],
  ["grammar", "grammarPoints"],
  ["vocab", "vocabTargets"],
  ["orderCues", "orderCues"],
  ["insertionCues", "insertionCues"],
];

export function buildPrompt(item: ExamItem): { prompt: string; sentenceCount: number } {
  const sentences = splitSentences(item.passage);
  const req = requirementsFor(item);
  const lines = [
    `Item ${item.number} (${item.type})`,
    `Instruction (Korean): ${item.instruction}`,
    "",
    "Passage sentences:",
    ...sentences.map((s, i) => `[S${i + 1}] ${s}`),
  ];
  if (item.orderParts?.intro) lines.push("", `Given intro (before the parts): ${item.orderParts.intro}`);
  if (item.givenSentence) lines.push("", `Sentence to insert: ${item.givenSentence}`);
  if (item.summary) lines.push("", `Summary box: ${item.summary}`);
  lines.push("", "Options:");
  for (const o of item.options) lines.push(`${MARKERS[o.label - 1] ?? o.label} ${o.text || "(position in passage)"}`);
  lines.push("", `Correct answer: ${item.answer ?? "unknown"}`, "", "Fields:");
  for (const [key, name] of FIELD_NAMES) lines.push(`- ${name}: ${req[key] ? "required" : "leave empty"}`);
  lines.push("- evidenceSentenceIndexes: required (use [] only for grammar items)", "- topicDomain: required");
  return { prompt: lines.join("\n"), sentenceCount: sentences.length };
}
