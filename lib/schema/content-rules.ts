import type { z } from "zod";
import { Blueprint } from "./blueprint";
import { Level, Misconception, Skill, TrapType, Unit } from "./curriculum";
import { Question } from "./question";
import { AnnotatedSentence, Passage } from "./sentence";
import { Vocabulary } from "./vocabulary";

// Every content file holds a JSON array of one kind of item.
export const CONTENT_SCHEMAS = {
  level: Level,
  skill: Skill,
  misconception: Misconception,
  trap: TrapType,
  unit: Unit,
  sentence: AnnotatedSentence,
  passage: Passage,
  question: Question,
  vocabulary: Vocabulary,
  blueprint: Blueprint,
} as const;

export type ContentKind = keyof typeof CONTENT_SCHEMAS;

export interface ContentFile {
  path: string;
  kind: ContentKind;
  data: unknown;
}

export interface ContentIssue {
  path: string;
  itemId?: string;
  message: string;
}

export interface CheckOptions {
  // "schema" checks shape only (drafts); "full" adds integrity rules.
  mode: "schema" | "full";
  requireApproved: boolean;
  requireFixtureIds: boolean;
}

type Parsed<K extends ContentKind> = { path: string; item: z.infer<(typeof CONTENT_SCHEMAS)[K]> };
type ParsedByKind = { [K in ContentKind]: Parsed<K>[] };

function emptyParsed(): ParsedByKind {
  return {
    level: [],
    skill: [],
    misconception: [],
    trap: [],
    unit: [],
    sentence: [],
    passage: [],
    question: [],
    vocabulary: [],
    blueprint: [],
  };
}

function itemIdOf(raw: unknown): string | undefined {
  if (raw && typeof raw === "object" && "id" in raw && typeof raw.id === "string") return raw.id;
  return undefined;
}

function parseFiles(files: ContentFile[], issues: ContentIssue[]): ParsedByKind {
  const parsed = emptyParsed();
  for (const file of files) {
    if (!Array.isArray(file.data)) {
      issues.push({ path: file.path, message: "file must contain a JSON array" });
      continue;
    }
    const schema = CONTENT_SCHEMAS[file.kind];
    file.data.forEach((raw: unknown, index: number) => {
      const result = schema.safeParse(raw);
      if (!result.success) {
        for (const problem of result.error.issues) {
          const where = problem.path.length ? `${problem.path.join(".")}: ` : "";
          issues.push({
            path: file.path,
            itemId: itemIdOf(raw) ?? `#${index}`,
            message: `schema: ${where}${problem.message}`,
          });
        }
        return;
      }
      (parsed[file.kind] as Parsed<ContentKind>[]).push({ path: file.path, item: result.data });
    });
  }
  return parsed;
}

export function checkContent(files: ContentFile[], options: CheckOptions): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const parsed = parseFiles(files, issues);
  if (options.mode === "full") checkIntegrity(parsed, issues);
  if (options.requireApproved) checkApproved(parsed, issues);
  if (options.requireFixtureIds) checkFixtureIds(parsed, issues);
  return issues;
}

function allTopLevel(parsed: ParsedByKind): { path: string; id: string }[] {
  return Object.values(parsed).flatMap((list) =>
    (list as Parsed<ContentKind>[]).map(({ path, item }) => ({ path, id: item.id })),
  );
}

function checkIntegrity(parsed: ParsedByKind, issues: ContentIssue[]): void {
  const add = (path: string, itemId: string, message: string) => issues.push({ path, itemId, message });

  // Ids are unique across all kinds, including lesson blocks nested in units.
  const seen = new Map<string, string>();
  const blockIds = new Set<string>();
  const ids = allTopLevel(parsed);
  for (const { path, item } of parsed.unit) {
    for (const block of item.blocks) {
      ids.push({ path, id: block.id });
      blockIds.add(block.id);
    }
  }
  for (const { path, id } of ids) {
    const first = seen.get(id);
    if (first) add(path, id, `duplicate id (first defined in ${first})`);
    else seen.set(id, path);
  }

  const idSet = <K extends ContentKind>(kind: K) => new Set(parsed[kind].map(({ item }) => item.id));
  const skills = idSet("skill");
  const misconceptions = idSet("misconception");
  const traps = idSet("trap");
  const units = idSet("unit");
  const sentences = idSet("sentence");
  const passages = idSet("passage");
  const questions = idSet("question");

  const requireRef = (path: string, itemId: string, set: Set<string>, ref: string, label: string) => {
    if (!set.has(ref)) add(path, itemId, `${label} "${ref}" does not exist`);
  };

  // Skills: prerequisites exist and form no cycle.
  const prereqs = new Map(parsed.skill.map(({ item }) => [item.id, item.prerequisiteIds]));
  for (const { path, item } of parsed.skill) {
    for (const ref of item.prerequisiteIds) requireRef(path, item.id, skills, ref, "prerequisite skill");
    if (reachesItself(item.id, prereqs)) add(path, item.id, "skill prerequisites form a cycle");
  }

  for (const { path, item } of parsed.misconception) {
    requireRef(path, item.id, skills, item.skillId, "skill");
    if (item.remedialBlockId) requireRef(path, item.id, blockIds, item.remedialBlockId, "remedial block");
  }

  for (const { path, item } of parsed.unit) {
    for (const ref of item.skills) requireRef(path, item.id, skills, ref, "skill");
    for (const block of item.blocks) {
      const where = `${item.id}/${block.id}`;
      switch (block.type) {
        case "predict":
          requireRef(path, where, questions, block.questionId, "question");
          break;
        case "sentence_task":
          for (const ref of block.sentenceIds) requireRef(path, where, sentences, ref, "sentence");
          break;
        case "practice":
        case "assessment":
          for (const ref of block.questionIds) requireRef(path, where, questions, ref, "question");
          break;
        case "remedial":
          requireRef(path, where, misconceptions, block.misconceptionId, "misconception");
          for (const ref of block.questionIds) requireRef(path, where, questions, ref, "question");
          break;
        case "contrast":
          for (const ref of block.misconceptionIds) requireRef(path, where, misconceptions, ref, "misconception");
          break;
      }
    }
  }

  for (const { path, item } of parsed.sentence) {
    for (const ref of item.skills) requireRef(path, item.id, skills, ref, "skill");
    checkSentenceStructure(item, (message) => add(path, item.id, message));
  }

  for (const { path, item } of parsed.passage) {
    for (const ref of item.sentences) requireRef(path, item.id, sentences, ref, "sentence");
    for (const evidence of item.evidenceSpans) {
      requireRef(path, item.id, questions, evidence.questionId, "evidence question");
      if (evidence.sentenceRange[1] >= item.sentences.length) {
        add(path, item.id, `evidence range ${JSON.stringify(evidence.sentenceRange)} exceeds ${item.sentences.length} sentences`);
      }
    }
  }

  const variantGroups = new Map<string, Parsed<"question">[]>();
  for (const entry of parsed.question) {
    const { path, item } = entry;
    if (item.lessonId) requireRef(path, item.id, units, item.lessonId, "lesson");
    if (item.sentenceId) requireRef(path, item.id, sentences, item.sentenceId, "sentence");
    if (item.passageId) requireRef(path, item.id, passages, item.passageId, "passage");
    for (const ref of item.skills) requireRef(path, item.id, skills, ref, "skill");
    checkQuestionOptions(item, misconceptions, traps, (message) => add(path, item.id, message));
    if (item.variantGroup) {
      const group = variantGroups.get(item.variantGroup) ?? [];
      group.push(entry);
      variantGroups.set(item.variantGroup, group);
    }
  }

  // A variant group asks about one concept, so its questions share a skill.
  for (const [groupId, group] of variantGroups) {
    const shared = group
      .map(({ item }) => new Set(item.skills))
      .reduce((acc, next) => new Set([...acc].filter((skill) => next.has(skill))));
    if (shared.size === 0) {
      for (const { path, item } of group) add(path, item.id, `variant group "${groupId}" shares no skill`);
    }
  }

  for (const { path, item } of parsed.blueprint) {
    for (const ref of item.distractors.traps) requireRef(path, item.id, traps, ref, "trap");
    for (const ref of item.requiredSkills) requireRef(path, item.id, skills, ref, "skill");
  }
}

function reachesItself(start: string, edges: Map<string, string[]>): boolean {
  const stack = [...(edges.get(start) ?? [])];
  const visited = new Set<string>();
  while (stack.length) {
    const next = stack.pop()!;
    if (next === start) return true;
    if (visited.has(next)) continue;
    visited.add(next);
    stack.push(...(edges.get(next) ?? []));
  }
  return false;
}

export function checkSentenceStructure(sentence: AnnotatedSentence, report: (message: string) => void): void {
  const last = sentence.tokens.length - 1;
  const spans = new Map<string, AnnotatedSentence["spans"][number]>();
  for (const span of sentence.spans) {
    if (spans.has(span.id)) report(`duplicate span id "${span.id}"`);
    spans.set(span.id, span);
  }
  for (const span of sentence.spans) {
    const [start, end] = span.range;
    if (end > last) report(`span "${span.id}" range [${start}, ${end}] exceeds last token index ${last}`);
    if (span.parent !== undefined) {
      const parent = spans.get(span.parent);
      if (!parent || span.parent === span.id) {
        report(`span "${span.id}" parent "${span.parent}" does not exist`);
      } else if (start < parent.range[0] || end > parent.range[1]) {
        report(`span "${span.id}" lies outside its parent "${parent.id}"`);
      }
    }
    if (span.modifies !== undefined && (!spans.has(span.modifies) || span.modifies === span.id)) {
      report(`span "${span.id}" modifies "${span.modifies}" which does not exist`);
    }
  }
  if (sentence.chunks) {
    sentence.chunks.forEach((boundary, index) => {
      if (boundary > last) report(`chunk boundary ${boundary} exceeds last token index ${last}`);
      if (index > 0 && boundary <= sentence.chunks![index - 1]) {
        report("chunk boundaries must be strictly increasing");
      }
    });
  }
}

export function checkQuestionOptions(
  question: Question,
  misconceptions: Set<string>,
  traps: Set<string>,
  report: (message: string) => void,
): void {
  const optionIds = question.options.map((option) => option.id);
  if (new Set(optionIds).size !== optionIds.length) report("option ids must be unique");
  const matches = question.options.filter((option) => option.id === question.answer);
  if (matches.length === 0) report(`answer "${question.answer}" is not one of the options`);
  else if (matches.length > 1) report(`answer "${question.answer}" matches more than one option`);

  for (const option of question.options) {
    const tag = option.misconception ?? option.trap;
    if (option.id === question.answer) {
      if (tag) report(`answer option "${option.id}" must not carry a misconception or trap`);
      continue;
    }
    if (!tag) report(`distractor "${option.id}" needs a misconception or trap`);
    if (option.misconception && !misconceptions.has(option.misconception)) {
      report(`distractor "${option.id}" misconception "${option.misconception}" is not defined`);
    }
    if (option.trap && !traps.has(option.trap)) {
      report(`distractor "${option.id}" trap "${option.trap}" is not defined`);
    }
  }

  for (const key of Object.keys(question.explanation.byOption)) {
    if (!optionIds.includes(key)) report(`explanation.byOption key "${key}" is not an option`);
  }
}

function checkApproved(parsed: ParsedByKind, issues: ContentIssue[]): void {
  const reviewed = [
    ...parsed.unit,
    ...parsed.sentence,
    ...parsed.passage,
    ...parsed.question,
    ...parsed.vocabulary,
  ] as { path: string; item: { id: string; reviewStatus: string } }[];
  for (const { path, item } of reviewed) {
    if (item.reviewStatus !== "approved") {
      issues.push({
        path,
        itemId: item.id,
        message: `reviewStatus "${item.reviewStatus}" is not allowed in student content; keep it in content/drafts/`,
      });
    }
  }
  for (const { path, item } of parsed.question) {
    if (item.reviewStatus === "approved" && !item.source.reviewedBy) {
      issues.push({ path, itemId: item.id, message: "approved question needs source.reviewedBy" });
    }
  }
}

// Level ids are a fixed enum (L0–L6), so they are exempt.
function checkFixtureIds(parsed: ParsedByKind, issues: ContentIssue[]): void {
  for (const { path, id } of allTopLevel({ ...parsed, level: [] })) {
    if (!id.includes("FIXTURE")) issues.push({ path, itemId: id, message: "fixture ids must contain FIXTURE" });
  }
}
