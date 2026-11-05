// Prompts for the content generator. They carry only spec data: no corpus text
// ever goes into a prompt (DESIGN 14-7).
import type { UnitSpec, VariantGroupSpec } from "@/lib/schema/spec";

// Bump when a prompt changes so cached outputs are not reused.
export const PROMPT_VERSION = "content-v4";

export const SYSTEM_PROMPT = `You write draft learning content for "English 90", a Korean high-school English reading course that prepares beginners for the CSAT (수능).
Everything you write is a draft that a teacher reviews before any student sees it.

Rules:
- Write original English sentences. Never reproduce, closely paraphrase or recall sentences from real CSAT or mock exams, textbooks or other published material.
- Use only common words a beginner knows. Stay within the word-frequency limit given in the task.
- Tokens: one token per word, and punctuation as separate tokens. "text" is the natural sentence those tokens spell.
- Spans: token ranges are inclusive [start, end] indexes into tokens. Mark SUBJECT, MAIN_VERB and OBJECT/COMPLEMENT where present, and a HEAD_NOUN span (with "parent" set to its subject span id) when the subject has more than one word. Give each SUBJECT, MAIN_VERB and OBJECT span a short Korean "gloss" (the piece of the translation it maps to).
- translation: natural Korean.
- Questions are in Korean except quoted English. Each question uses exactly one of your sentences, chosen by "sentenceIndex".
- Every wrong option must carry the misconception id (from the task) that would lead a student to choose it. Use "trap" only when no listed misconception fits.
- explanation.summary is a one-sentence Korean reason. explanation.byOption explains every option, keyed by option id.
- hints.direction is a Korean nudge that does not give the answer. hints.range is the token range in the question's sentence where the answer is found.
- Questions in one variant group test the same idea with different sentences, so a student who missed one can try another.
- Never hint at the answer in the question prompt: no brackets, glosses or descriptions that point to the right option (write "다음 문장의 주어는?", not "다음 문장의 주어(피아노를 치는 사람)는?"). Hints belong only in "hints".
- Do not define a grammatical role by meaning ("the one doing the action", "the animal that eats"). Explain roles by position and form in the sentence, so no option can be chosen by meaning alone.
- When an English word has several Korean renderings (sister: 언니·누나·여동생), use a neutral Korean word (자매, 형제) or a context that fixes one meaning, and keep the translation, glosses and explanation consistent.
- Span ids are short role names unique within their own sentence (subj, verb, obj, head). Never reuse ids or annotations from another sentence.
- Use common nouns (my brother, the girl, the teacher) instead of personal names, and prefer the most frequent everyday words.
- Option text copies the words exactly as they appear in the sentence, so capital letters give nothing away; when options mix sentence-initial and other words, write every option in lowercase instead.
- hints.range must cover more than the answer (for example the whole part before the verb), so the level-2 hint narrows the search without marking the answer.
- Explain a role by its position and its relation to the verb, never by a word ending: "-s" ends plural nouns (cats) as well as verbs (drinks).
- Explain each option for this sentence only ("이 문장에서 milk는 목적어입니다"). Never state a general claim such as "목적어는 주어가 될 수 없습니다", "주어는 동사 앞에 놓인 말입니다" or "영어는 동사를 문장 끝에 두지 않습니다".
- Each option must match exactly one place in the sentence. When a word appears twice (The cat drinks the milk), use a longer chunk ("the milk") or another distractor.
- hints.direction and hints.range must describe the same place: if the direction says "the place right after the subject", the range starts there.
- Translate articles the same way within a sentence, and use natural Korean (honorifics for parents and teachers: 아버지가 세차를 하신다).`;

// Rules the generator follows on purpose; the pre-review is told not to flag them.
export const HOUSE_RULES = `House rules (deliberate, do not flag them):
- When options mix the sentence's first word with other words, every option is written in lowercase so capital letters do not give the answer away.
- hints.range covers more than the answer on purpose, so the hint narrows the search without marking the answer. Flag it only when it disagrees with hints.direction.
- Roles are explained by position and relation to the verb, not by meaning.
- Misconception ids come from the unit's list given in the input; judge a tag by that list's description, not by its name.`;

export function buildGroupPrompt(spec: UnitSpec, group: VariantGroupSpec): string {
  const misconceptions = spec.catalog.misconceptions.filter((m) => group.misconceptionIds.includes(m.id));
  return JSON.stringify({
    task: "variant_group",
    unit: { id: spec.unitId, level: spec.levelId, title: spec.title, objectives: spec.objectives },
    group: {
      id: group.id,
      skillId: group.skillId,
      note: group.note,
      questionType: group.questionType,
      questionCount: group.count,
      sentenceUse: group.sentenceUse,
    },
    misconceptions: misconceptions.map((m) => ({ id: m.id, description: m.description })),
    difficulty: spec.generation.difficulty,
    wordFrequencyLimit: `Use only words within the ${spec.generation.vocabRankMax} most frequent English words.`,
    output: `Write ${group.count} questions and at least ${Math.ceil(group.count / 2)} sentences. Every sentence lists skill "${group.skillId}" and level "${spec.levelId}".`,
  });
}

export interface UnitPromptIds {
  groups: { id: string; sentenceUse: VariantGroupSpec["sentenceUse"]; sentenceIds: string[]; questionIds: string[] }[];
}

export function buildUnitPrompt(spec: UnitSpec, ids: UnitPromptIds): string {
  return JSON.stringify({
    task: "unit",
    unit: { id: spec.unitId, level: spec.levelId, title: spec.title, objectives: spec.objectives },
    misconceptions: spec.misconceptions,
    interactions: spec.interactions,
    assessmentCriteria: spec.assessmentCriteria,
    drafts: ids.groups,
    output: [
      `Assemble lesson blocks with ids ${spec.unitId}-B01, ${spec.unitId}-B02, … in this order:`,
      "concept (Korean explanation) → sentence_task role_tagging with the tagging sentences → sentence_task sentence_building with the building sentences → practice (1-2 questions) → assessment (at least 8 questions, mixing groups) → remedial per misconception (Korean body, 1-2 questions) → contrast when two misconceptions are easily confused.",
      "Use only the given ids. A question appears in at most one block. Write instructions and bodies in Korean.",
    ].join(" "),
  });
}
