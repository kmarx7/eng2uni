// Draft generation from a unit spec (DESIGN 6-2 steps 1-3). One model call per
// variant group, then one call that assembles the unit from the drafted ids.
// Nothing here approves anything: drafts and their records only.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ContentFile } from "@/lib/schema/content-rules";
import { checkContent } from "@/lib/schema/content-rules";
import { DRAFTS_DIR, FIXTURES_DIR, HANDOFF_DIRS, SPECS_DIR, loadContentRoot } from "@/lib/schema/content-tree";
import { LessonBlock, Unit } from "@/lib/schema/curriculum";
import { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import { AnnotatedSentence } from "@/lib/schema/sentence";
import { UnitSpec, type VariantGroupSpec } from "@/lib/schema/spec";
import type { ClaudeRunner } from "./claude-cli";
import { checkDraftGroup, type SimilarityResult } from "./checks";
import { CATALOG_FILES, cacheGet, cachePut, readDrafts, readJsonArray, writeCatalogDrafts, writeDrafts } from "./draft-store";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildGroupPrompt, buildUnitPrompt } from "./prompts";
import { allowedLemmas, type FrequencyTable } from "./vocab-range";

export const CALL_TIMEOUT_MS = 600_000;

const SentenceOut = AnnotatedSentence.omit({ id: true, reviewStatus: true });
const QuestionOut = Question.omit({ id: true, lessonId: true, sentenceId: true, variantGroup: true, source: true, reviewStatus: true, version: true }).extend({
  sentenceIndex: z.number().int().min(0),
});
const GroupOutput = z.object({ sentences: z.array(SentenceOut).min(1), questions: z.array(QuestionOut).min(1) });
const UnitOutput = z.object({ title: z.string().min(1), blocks: z.array(LessonBlock).min(1) });

// claude -p checks --json-schema with a strict draft-07 validator, and the API then
// needs 2020-12. Tuples have no form both accept, so a tuple (TokenRange) becomes an
// array of exactly n items of one type; Zod still checks the real tuple on the way back.
function withoutTuples(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(withoutTuples);
  if (node === null || typeof node !== "object") return node;
  const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, withoutTuples(v)])) as Record<string, unknown>;
  if (Array.isArray(out.items)) {
    const parts = out.items as Record<string, unknown>[];
    out.items = parts[0];
    out.minItems = parts.length;
    out.maxItems = parts.length;
    delete out.additionalItems;
  }
  return out;
}

export function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = withoutTuples(z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any", io: "input" })) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

export const groupOutputSchema = () => jsonSchema(GroupOutput);
export const unitOutputSchema = () => jsonSchema(UnitOutput);

// Ids from DESIGN 4-2: Q-L0-U05-001, S-L0-U05-001.
export function assignIds(unitId: string, existing: string[], n: number, prefix: "Q" | "S"): string[] {
  const head = `${prefix}-${unitId}-`;
  const max = Math.max(0, ...existing.filter((id) => id.startsWith(head)).map((id) => Number(id.slice(head.length)) || 0));
  return Array.from({ length: n }, (_, i) => `${head}${String(max + i + 1).padStart(3, "0")}`);
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

export interface GenerateOptions {
  root: string;
  specPath: string;
  limit?: number;
  dryRun: boolean;
  runner: ClaudeRunner;
  similarity: (items: { id: string; text: string }[]) => Promise<Map<string, SimilarityResult>>;
  now: Date;
  log: (line: string) => void;
  model?: string;
  // Groups whose drafts are retired and drafted again (after a spec change to them).
  redoGroups?: string[];
  // Retire the unit draft and assemble it again (e.g. after a question was retired).
  redoUnit?: boolean;
}

export interface GenerateResult {
  calls: number;
  written: number;
  flagged: number;
  failed: number;
}

// Approved catalogue files plus the drafted ones, for reference checks.
export function catalogFiles(contentDir: string): ContentFile[] {
  const kinds = { levels: "level", skills: "skill", misconceptions: "misconception", traps: "trap" } as const;
  return (Object.keys(CATALOG_FILES) as (keyof typeof CATALOG_FILES)[]).flatMap((key) =>
    [contentDir, path.join(contentDir, "drafts")].map((dir) => ({
      path: path.join(dir, CATALOG_FILES[key]),
      kind: kinds[key],
      data: readJsonArray(path.join(dir, CATALOG_FILES[key])),
    })),
  );
}

// What the unit already has outside the drafts: approved items keep their ids and
// groups, so a re-run neither regenerates nor renumbers them.
function approvedOf<T>(contentDir: string, dir: string, unitId: string): T[] {
  return readJsonArray<T>(path.join(contentDir, dir, `${unitId}.json`));
}

const studentFiles = (contentDir: string) => loadContentRoot(contentDir, [DRAFTS_DIR, FIXTURES_DIR, SPECS_DIR, ...HANDOFF_DIRS]).files;

export function unitOrder(unitId: string): number {
  const match = /U(\d+)$/.exec(unitId);
  return match ? Number(match[1]) : 0;
}

// Retires a group's unapproved drafts (its questions, the sentences only they use,
// and for a building group its unlinked sentences) and the unit draft built from them.
function retireGroups(contentDir: string, unitId: string, specs: VariantGroupSpec[]): void {
  const groups = new Set(specs.map((g) => g.id));
  const approvedQuestions = approvedOf<Question>(contentDir, "questions", unitId);
  const blocked = [
    ...approvedQuestions.filter((q) => q.variantGroup && groups.has(q.variantGroup)).map((q) => q.id),
    ...approvedOf<{ id: string }>(contentDir, "units", unitId).map((u) => u.id),
  ];
  if (blocked.length) throw new Error(`승인된 항목이 있어 다시 생성할 수 없습니다: ${blocked.join(", ")}`);
  const drafts = readDrafts(contentDir, unitId);
  const live = drafts.questions.filter((q) => q.reviewStatus !== "retired");
  const redone = live.filter((q) => q.variantGroup && groups.has(q.variantGroup));
  const kept = live.filter((q) => !redone.includes(q));
  const keptSentences = new Set([...kept, ...approvedQuestions].map((q) => q.sentenceId));
  const redoneSentences = new Set(redone.map((q) => q.sentenceId));
  const buildingSkills = new Set(specs.filter((g) => g.sentenceUse === "building").map((g) => g.skillId));
  const sentences = drafts.sentences.filter(
    (s) => s.reviewStatus !== "retired" && !keptSentences.has(s.id) && (redoneSentences.has(s.id) || (!live.some((q) => q.sentenceId === s.id) && s.skills.some((k) => buildingSkills.has(k)))),
  );
  const ids = new Set([...redone.map((q) => q.id), ...sentences.map((s) => s.id), unitId]);
  const retire = <T extends { id: string; reviewStatus: string }>(items: T[]) => items.filter((i) => ids.has(i.id)).map((i) => ({ ...i, reviewStatus: "retired" as const }));
  const records = drafts.records
    .filter((r) => ids.has(r.id) && r.status !== "approved")
    .map((r): ReviewRecord => ({ ...r, status: "retired", reasons: [...r.reasons, "명세 변경으로 다시 생성"] }));
  writeDrafts(contentDir, unitId, { questions: retire(drafts.questions), sentences: retire(drafts.sentences), units: retire(drafts.units), records });
}

export async function runGenerate(opts: GenerateOptions): Promise<GenerateResult> {
  const { root, runner, log, now } = opts;
  const model = opts.model ?? process.env.CLAUDE_CONTENT_MODEL ?? "opus";
  const contentDir = path.join(root, "content");
  const cacheDir = path.join(root, ".cache/content-pipeline");
  const spec = UnitSpec.parse(JSON.parse(readFileSync(opts.specPath, "utf8")));
  const specHash = hash(spec);
  const groupKey = (g: VariantGroupSpec) => `${spec.unitId}-${g.id}-${specHash}-${PROMPT_VERSION}`;
  const unitKey = `${spec.unitId}-unit-${specHash}-${PROMPT_VERSION}`;
  const at = now.toISOString();

  const redo = new Set(opts.redoGroups ?? []);
  const unknown = [...redo].filter((id) => !spec.generation.variantGroups.some((g) => g.id === id));
  if (unknown.length) throw new Error(`명세에 없는 묶음: ${unknown.join(", ")}`);
  // A redone group and the unit built from it are called again even when cached.
  const redoUnit = redo.size > 0 || opts.redoUnit === true;
  const fresh = new Set([...spec.generation.variantGroups.filter((g) => redo.has(g.id)).map(groupKey), ...(redoUnit ? [unitKey] : [])]);
  const cachedOf = (key: string) => (fresh.has(key) ? undefined : cacheGet(cacheDir, key));
  const planned = [...spec.generation.variantGroups.map(groupKey), unitKey];
  const cached = planned.filter((key) => cachedOf(key) !== undefined).length;
  log(`예상 호출 ${planned.length - cached}회 (캐시 ${cached}회 제외)`);
  if (opts.dryRun) return { calls: planned.length - cached, written: 0, flagged: 0, failed: 0 };
  if (redoUnit) retireGroups(contentDir, spec.unitId, spec.generation.variantGroups.filter((g) => redo.has(g.id)));

  // Catalogue drafts first, so drafts that reference them pass the reference checks.
  // Entries that already have a record (drafted, approved or retired) are left alone.
  // Entries approved while reviewing another unit count too.
  const approvedCatalog = (Object.values(CATALOG_FILES) as string[]).flatMap((file) => readJsonArray<{ id: string }>(path.join(contentDir, file)).map((i) => i.id));
  const existingRecords = new Set([...readDrafts(contentDir, spec.unitId).records.map((r) => r.id), ...approvedCatalog]);
  const unrecorded = <T extends { id: string }>(items: T[]) => items.filter((item) => !existingRecords.has(item.id));
  writeCatalogDrafts(contentDir, {
    level: spec.catalog.level && !existingRecords.has(spec.catalog.level.id) ? spec.catalog.level : undefined,
    skills: unrecorded(spec.catalog.skills),
    misconceptions: unrecorded(spec.catalog.misconceptions),
    traps: unrecorded(spec.catalog.traps),
  });
  const catalogRecords: ReviewRecord[] = [spec.catalog.level, ...spec.catalog.skills, ...spec.catalog.misconceptions, ...spec.catalog.traps]
    .filter((item) => item !== undefined && !existingRecords.has(item.id))
    .map((item) => ({
      id: item!.id,
      kind: "catalog",
      unitId: spec.unitId,
      status: "auto_checked",
      reasons: [],
      checks: { rules: "pass", vocab: "pass", tags: "n/a", similarity: "skipped" },
      generatedAt: at,
      reports: [],
    }));
  if (catalogRecords.length) writeDrafts(contentDir, spec.unitId, { records: catalogRecords });

  const freqFile = path.join(root, "analysis/vocab_frequency.json");
  const freq: FrequencyTable = existsSync(freqFile) ? JSON.parse(readFileSync(freqFile, "utf8")) : { lemmas: [] };
  const allowed = allowedLemmas(freq, spec.generation.vocabRankMax);
  const result: GenerateResult = { calls: 0, written: 0, flagged: 0, failed: 0 };
  const canCall = () => opts.limit === undefined || result.calls < opts.limit;

  async function call<T>(key: string, label: string, input: string, schema: z.ZodType<T>, outSchema: Record<string, unknown>): Promise<T | null> {
    const hit = cachedOf(key);
    if (hit !== undefined) return schema.parse(hit);
    if (!canCall()) return null;
    result.calls += 1;
    log(`${label}: 생성 중`);
    const response = await runner({ model, schema: outSchema, systemPrompt: SYSTEM_PROMPT, input, timeoutMs: CALL_TIMEOUT_MS });
    const parsed = response.ok ? schema.safeParse(response.json) : null;
    if (!parsed?.success) {
      result.failed += 1;
      log(`${label}: 실패 (${response.ok ? "출력이 스키마와 맞지 않음" : response.error})`);
      return null;
    }
    cachePut(cacheDir, key, parsed.data);
    return parsed.data;
  }

  const unitQuestions = () =>
    [...readDrafts(contentDir, spec.unitId).questions, ...approvedOf<Question>(contentDir, "questions", spec.unitId)].filter((q) => q.reviewStatus !== "retired");
  const usedIds = () => {
    const drafts = readDrafts(contentDir, spec.unitId);
    return [
      ...drafts.records.map((r) => r.id),
      ...drafts.sentences.map((x) => x.id),
      ...drafts.questions.map((x) => x.id),
      ...approvedOf<{ id: string }>(contentDir, "sentences", spec.unitId).map((x) => x.id),
      ...approvedOf<{ id: string }>(contentDir, "questions", spec.unitId).map((x) => x.id),
    ];
  };

  for (const group of spec.generation.variantGroups) {
    if (unitQuestions().some((q) => q.variantGroup === group.id)) continue;
    const approvedMisconceptions = readJsonArray<{ id: string; description: string }>(path.join(contentDir, CATALOG_FILES.misconceptions));
    const output = await call(groupKey(group), group.id, buildGroupPrompt(spec, group, approvedMisconceptions), GroupOutput, groupOutputSchema());
    if (!output) continue;

    const used = usedIds();
    const sentenceIds = assignIds(spec.unitId, used, output.sentences.length, "S");
    const questionIds = assignIds(spec.unitId, used, output.questions.length, "Q");
    // Students see a question's sentence above it, so a building group's question
    // (put the words in order) must not show the finished sentence or point into it.
    const building = group.sentenceUse === "building";
    const badIndex = new Map(
      output.questions.flatMap((q, i) => (building || sentenceIds[q.sentenceIndex] ? [] : [[questionIds[i], q.sentenceIndex] as const])),
    );
    const sentences = output.sentences.map((s, i) => ({ ...s, id: sentenceIds[i], reviewStatus: "draft" as const }));
    const questions = output.questions.map(({ sentenceIndex, hints, ...q }, i) => ({
      ...q,
      ...(hints ? { hints: building ? { ...(hints.direction ? { direction: hints.direction } : {}) } : hints } : {}),
      id: questionIds[i],
      ...(!building && sentenceIds[sentenceIndex] ? { sentenceId: sentenceIds[sentenceIndex] } : {}),
      variantGroup: group.id,
      source: { type: "original" as const, generatedBy: "ai_draft" as const },
      reviewStatus: "draft" as const,
      version: 1,
    }));
    const similarity = await opts.similarity([
      ...sentences.map((s) => ({ id: s.id, text: s.text })),
      ...questions.map((q) => ({ id: q.id, text: [q.prompt, ...q.options.map((o) => o.text)].join(" ") })),
    ]);
    const checked = checkDraftGroup({ sentences, questions, catalog: catalogFiles(contentDir), allowed, similarity });
    const records: ReviewRecord[] = [...sentences.map((s) => [s.id, "sentence"] as const), ...questions.map((q) => [q.id, "question"] as const)].map(
      ([id, kind]) => {
        const outcome = checked.get(id)!;
        // A question pointing past the group's sentences would reach students with no sentence.
        if (badIndex.has(id)) {
          return {
            id,
            kind,
            unitId: spec.unitId,
            ...outcome,
            status: "flagged" as const,
            reasons: [...outcome.reasons, `문장 번호 범위 밖: ${badIndex.get(id)}`],
            checks: { ...outcome.checks, rules: "fail" as const },
            generatedAt: at,
            reports: [],
          };
        }
        return { id, kind, unitId: spec.unitId, ...outcome, generatedAt: at, reports: [] };
      },
    );
    writeDrafts(contentDir, spec.unitId, { sentences, questions, records });
    result.written += sentences.length + questions.length;
    result.flagged += records.filter((r) => r.status === "flagged").length;
  }

  const drafts = readDrafts(contentDir, spec.unitId);
  const questionsNow = unitQuestions();
  const allGroups = spec.generation.variantGroups.every((g) => questionsNow.some((q) => q.variantGroup === g.id));
  const hasUnit =
    drafts.units.some((u) => u.reviewStatus !== "retired") ||
    drafts.records.some((r) => r.id === spec.unitId && r.status !== "retired") ||
    approvedOf(contentDir, "units", spec.unitId).length > 0;
  if (allGroups && !hasUnit) {
    // Building questions link no sentence, so a building group's sentences are the
    // unit's sentences with its skill that no question links.
    const sentencesNow = [...drafts.sentences, ...approvedOf<AnnotatedSentence>(contentDir, "sentences", spec.unitId)].filter((s) => s.reviewStatus !== "retired");
    const linked = new Set(questionsNow.map((q) => q.sentenceId));
    const ids = {
      groups: spec.generation.variantGroups.map((g) => {
        const questions = questionsNow.filter((q) => q.variantGroup === g.id);
        const sentenceIds = new Set(questions.map((q) => q.sentenceId).filter((id) => id !== undefined));
        if (g.sentenceUse === "building") for (const s of sentencesNow) if (!linked.has(s.id) && s.skills.includes(g.skillId)) sentenceIds.add(s.id);
        return { id: g.id, sentenceUse: g.sentenceUse, sentenceIds: [...sentenceIds], questionIds: questions.map((q) => q.id) };
      }),
    };
    // The cached unit is reused only for the same ids, so a retired question never comes back.
    const output = await call(redoUnit ? unitKey : `${unitKey}-${hash(ids)}`, "단원", buildUnitPrompt(spec, ids), UnitOutput, unitOutputSchema());
    if (output) {
      const unit = Unit.parse({
        id: spec.unitId,
        levelId: spec.levelId,
        order: unitOrder(spec.unitId),
        title: output.title,
        skills: spec.targetSkills,
        blocks: output.blocks,
        reviewStatus: "draft",
        version: 1,
      });
      // Rule issues on a unit name the unit or "unitId/blockId"; approved items count as present.
      const draftCatalog = catalogFiles(contentDir).filter((f) => f.path.includes(`${path.sep}drafts${path.sep}`));
      const issues = checkContent(
        [
          ...studentFiles(contentDir),
          ...draftCatalog,
          { path: "sentences", kind: "sentence", data: drafts.sentences },
          { path: "questions", kind: "question", data: drafts.questions },
          { path: "units", kind: "unit", data: [unit] },
        ],
        { mode: "full", requireApproved: false, requireFixtureIds: false },
      ).filter((i) => i.itemId === unit.id || i.itemId?.startsWith(`${unit.id}/`));
      const retired = new Set(
        [...drafts.questions, ...approvedOf<Question>(contentDir, "questions", spec.unitId)].filter((q) => q.reviewStatus === "retired").map((q) => q.id),
      );
      const usedRetired = unit.blocks.flatMap((b) => ("questionIds" in b ? (b.questionIds ?? []) : [])).filter((id) => retired.has(id));
      const reasons = [...issues.map((i) => `규칙 위반: ${i.message}`), ...usedRetired.map((id) => `규칙 위반: 폐기된 문항 사용: ${id}`)];
      const record: ReviewRecord = {
        id: unit.id,
        kind: "unit",
        unitId: spec.unitId,
        status: reasons.length ? "flagged" : "auto_checked",
        reasons,
        checks: { rules: reasons.length ? "fail" : "pass", vocab: "pass", tags: "n/a", similarity: "skipped" },
        generatedAt: at,
        reports: [],
      };
      writeDrafts(contentDir, spec.unitId, { units: [unit], records: [record] });
      result.written += 1;
      if (reasons.length) result.flagged += 1;
    }
  }
  log(`완료: 호출 ${result.calls}회, 새 초안 ${result.written}개, 문제 있음 ${result.flagged}개, 실패 ${result.failed}회`);
  return result;
}
