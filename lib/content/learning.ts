// Server-only readers for unit learning. Students see approved content only, and
// questions leave the server without their answers, explanations, hints or
// distractor tags: grading and hints go through gradeAnswer and hintFor.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { Level, Misconception, Skill, Unit } from "@/lib/schema/curriculum";
import { Question } from "@/lib/schema/question";
import { builderTokens, checkBuild, checkRoleTag, type RoleSymbol, shuffled, targetSpans } from "@/lib/engine/analyzer";
import { AnnotatedSentence } from "@/lib/schema/sentence";

const defaultDir = () => process.env.CONTENT_DIR ?? "content";

function readItems<T>(file: string, schema: z.ZodType<T>): T[] {
  if (!existsSync(file)) return [];
  const items: unknown[] = JSON.parse(readFileSync(file, "utf8"));
  return items.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function readDir<T extends { reviewStatus: string }>(contentDir: string, dir: string, schema: z.ZodType<T>): T[] {
  const full = path.join(contentDir, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((f) => readItems(path.join(full, f), schema))
    .filter((item) => item.reviewStatus === "approved");
}

export type HintLevelNumber = 1 | 2 | 3;

export interface PublicQuestion {
  id: string;
  type: Question["type"];
  prompt: string;
  sentenceId?: string;
  options: { id: string; text: string }[];
  skills: string[];
  variantGroup?: string;
  hintLevels: HintLevelNumber[];
}

export function toPublicQuestion(q: Question): PublicQuestion {
  const hintLevels: HintLevelNumber[] = [];
  if (q.hints?.direction) hintLevels.push(1);
  if (q.hints?.range) hintLevels.push(2);
  hintLevels.push(3);
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    ...(q.sentenceId ? { sentenceId: q.sentenceId } : {}),
    options: q.options.map(({ id, text }) => ({ id, text })),
    skills: q.skills,
    ...(q.variantGroup ? { variantGroup: q.variantGroup } : {}),
    hintLevels,
  };
}

// A sentence as the page gets it: tokens to show (questions, tagging), the role
// symbols to find (tagging), or shuffled chips and the translation prompt
// (building). Spans, glosses and translations stay on the server.
export interface PublicSentence {
  id: string;
  tokens?: string[];
  roles?: RoleSymbol[];
  chips?: string[];
  translation?: string;
}

interface SentenceUses {
  shown: boolean;
  tagging: boolean;
  building: boolean;
}

export function toPublicSentence(s: AnnotatedSentence, uses: SentenceUses): PublicSentence {
  const spans = targetSpans(s);
  return {
    id: s.id,
    ...(uses.shown || uses.tagging ? { tokens: s.tokens } : {}),
    ...(uses.tagging ? { roles: (["S", "V", "O"] as const).filter((r) => spans[r]) } : {}),
    ...(uses.building ? { chips: shuffled(builderTokens(s), s.id), translation: s.translation } : {}),
  };
}

export interface TagResult {
  correct: boolean;
  range?: [number, number];
  gloss?: string;
  // Once every role of the sentence is tagged.
  translation?: string;
}

export function tagResult(s: AnnotatedSentence, symbol: RoleSymbol, range: [number, number], tagged: RoleSymbol[]): TagResult {
  const { correct, span } = checkRoleTag(s, symbol, range);
  if (!correct || !span) return { correct: false };
  const spans = targetSpans(s);
  const done = (["S", "V", "O"] as const).filter((r) => spans[r]).every((r) => r === symbol || tagged.includes(r));
  return {
    correct: true,
    range: span.range,
    ...(span.gloss ? { gloss: span.gloss } : {}),
    ...(done ? { translation: s.translation } : {}),
  };
}

export interface BuildResult {
  marks: boolean[];
  // The finished sentence, once every word is in place.
  text?: string;
}

export function buildResult(s: AnnotatedSentence, words: string[]): BuildResult {
  const marks = checkBuild(builderTokens(s), words);
  return marks.every(Boolean) ? { marks, text: s.text } : { marks };
}

export interface AnswerResult {
  correct: boolean;
  answerId: string;
  summary: string;
  chosen?: string;
  misconception?: { id: string; description: string };
}

export function gradeAnswer(q: Question, optionId: string, misconceptions: Misconception[]): AnswerResult {
  const option = q.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`question ${q.id} has no option "${optionId}"`);
  const correct = optionId === q.answer;
  const chosen = q.explanation.byOption[optionId];
  const misconception = misconceptions.find((m) => m.id === option.misconception);
  return {
    correct,
    answerId: q.answer,
    summary: q.explanation.summary,
    ...(!correct && chosen ? { chosen } : {}),
    ...(!correct && misconception ? { misconception: { id: misconception.id, description: misconception.description } } : {}),
  };
}

export type Hint =
  | { level: 1; direction: string }
  | { level: 2; range: [number, number] }
  | { level: 3; answerId: string; summary: string };

export function hintFor(q: Question, level: HintLevelNumber): Hint {
  if (level === 1 && q.hints?.direction) return { level, direction: q.hints.direction };
  if (level === 2 && q.hints?.range) return { level, range: q.hints.range };
  if (level === 3) return { level, answerId: q.answer, summary: q.explanation.summary };
  throw new Error(`question ${q.id} has no level ${level} hint`);
}

function loadAll(contentDir: string) {
  const levels = readItems(path.join(contentDir, "levels.json"), Level);
  const levelOrder = new Map(levels.map((l) => [l.id, l.order]));
  const units = readDir(contentDir, "units", Unit).sort(
    (a, b) => (levelOrder.get(a.levelId) ?? 99) - (levelOrder.get(b.levelId) ?? 99) || a.order - b.order,
  );
  return {
    units,
    questions: readDir(contentDir, "questions", Question),
    sentences: readDir(contentDir, "sentences", AnnotatedSentence),
    misconceptions: readItems(path.join(contentDir, "misconceptions.json"), Misconception),
    skills: readItems(path.join(contentDir, "skills.json"), Skill),
  };
}

// Approved units in level order, then unit order.
export function loadStudentUnits(contentDir = defaultDir()): Unit[] {
  return loadAll(contentDir).units;
}

export function loadApprovedQuestion(id: string, contentDir = defaultDir()): Question | null {
  return loadAll(contentDir).questions.find((q) => q.id === id) ?? null;
}

export function loadApprovedSentence(id: string, contentDir = defaultDir()): AnnotatedSentence | null {
  return loadAll(contentDir).sentences.find((s) => s.id === id) ?? null;
}

export function loadMisconceptions(contentDir = defaultDir()): Misconception[] {
  return loadAll(contentDir).misconceptions;
}

export interface UnitBundle {
  unit: Unit;
  sentences: PublicSentence[];
  questions: PublicQuestion[];
  misconceptions: { id: string; remedialBlockId?: string }[];
  prerequisiteQuestionIds: string[];
}

function blockQuestionIds(unit: Unit): string[] {
  return unit.blocks.flatMap((b) => {
    if (b.type === "practice" || b.type === "assessment" || b.type === "remedial") return b.questionIds;
    if (b.type === "predict") return [b.questionId];
    return [];
  });
}

// The unit, the questions its blocks use plus every variant of them, and the
// questions on its prerequisite skills (for the foundation check).
export function loadUnitBundle(unitId: string, contentDir = defaultDir()): UnitBundle | null {
  const all = loadAll(contentDir);
  const unit = all.units.find((u) => u.id === unitId);
  if (!unit) return null;
  const direct = new Set(blockQuestionIds(unit));
  const groups = new Set(all.questions.filter((q) => direct.has(q.id) && q.variantGroup).map((q) => q.variantGroup));
  const own = new Set(unit.skills);
  const prerequisites = new Set(
    all.skills.filter((s) => own.has(s.id)).flatMap((s) => s.prerequisiteIds).filter((id) => !own.has(id)),
  );
  const prerequisiteQuestions = all.questions.filter((q) => q.skills.some((s) => prerequisites.has(s)));
  const questions = all.questions.filter(
    (q) => direct.has(q.id) || (q.variantGroup && groups.has(q.variantGroup)) || prerequisiteQuestions.includes(q),
  );
  const tasks = unit.blocks.flatMap((b) => (b.type === "sentence_task" ? [b] : []));
  const tagging = new Set(tasks.filter((b) => b.interaction === "role_tagging").flatMap((b) => b.sentenceIds));
  const building = new Set(tasks.filter((b) => b.interaction === "sentence_building").flatMap((b) => b.sentenceIds));
  const shown = new Set(questions.flatMap((q) => (q.sentenceId ? [q.sentenceId] : [])));
  return {
    unit,
    sentences: all.sentences
      .filter((s) => shown.has(s.id) || tagging.has(s.id) || building.has(s.id))
      .map((s) => toPublicSentence(s, { shown: shown.has(s.id), tagging: tagging.has(s.id), building: building.has(s.id) })),
    questions: questions.map(toPublicQuestion),
    misconceptions: all.misconceptions.map(({ id, remedialBlockId }) => (remedialBlockId ? { id, remedialBlockId } : { id })),
    prerequisiteQuestionIds: prerequisiteQuestions.map((q) => q.id),
  };
}

export interface ReviewBundle {
  questions: PublicQuestion[];
  sentences: PublicSentence[];
  units: { id: string; skills: string[] }[];
}

// Skill review can ask any approved question on the skill.
export function loadReviewBundle(contentDir = defaultDir()): ReviewBundle {
  const all = loadAll(contentDir);
  const sentenceIds = new Set(all.questions.flatMap((q) => (q.sentenceId ? [q.sentenceId] : [])));
  return {
    questions: all.questions.map(toPublicQuestion),
    sentences: all.sentences
      .filter((s) => sentenceIds.has(s.id))
      .map((s) => toPublicSentence(s, { shown: true, tagging: false, building: false })),
    units: all.units.map((u) => ({ id: u.id, skills: u.skills })),
  };
}
