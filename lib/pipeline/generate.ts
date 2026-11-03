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

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any", io: "input" }) as Record<string, unknown>;
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
}

export interface GenerateResult {
  calls: number;
  written: number;
  flagged: number;
  failed: number;
}

// Approved catalogue files plus the drafted ones, for reference checks.
function catalogFiles(contentDir: string): ContentFile[] {
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

  const planned = [...spec.generation.variantGroups.map(groupKey), unitKey];
  const cached = planned.filter((key) => cacheGet(cacheDir, key) !== undefined).length;
  log(`예상 호출 ${planned.length - cached}회 (캐시 ${cached}회 제외)`);
  if (opts.dryRun) return { calls: planned.length - cached, written: 0, flagged: 0, failed: 0 };

  // Catalogue drafts first, so drafts that reference them pass the reference checks.
  // Entries that already have a record (drafted, approved or retired) are left alone.
  const existingRecords = new Set(readDrafts(contentDir, spec.unitId).records.map((r) => r.id));
  const fresh = <T extends { id: string }>(items: T[]) => items.filter((item) => !existingRecords.has(item.id));
  writeCatalogDrafts(contentDir, {
    level: spec.catalog.level && !existingRecords.has(spec.catalog.level.id) ? spec.catalog.level : undefined,
    skills: fresh(spec.catalog.skills),
    misconceptions: fresh(spec.catalog.misconceptions),
    traps: fresh(spec.catalog.traps),
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
    const hit = cacheGet(cacheDir, key);
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

  const unitQuestions = () => [...readDrafts(contentDir, spec.unitId).questions, ...approvedOf<Question>(contentDir, "questions", spec.unitId)];
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
    const output = await call(groupKey(group), group.id, buildGroupPrompt(spec, group), GroupOutput, groupOutputSchema());
    if (!output) continue;

    const used = usedIds();
    const sentenceIds = assignIds(spec.unitId, used, output.sentences.length, "S");
    const questionIds = assignIds(spec.unitId, used, output.questions.length, "Q");
    const badIndex = new Map(output.questions.flatMap((q, i) => (sentenceIds[q.sentenceIndex] ? [] : [[questionIds[i], q.sentenceIndex] as const])));
    const sentences = output.sentences.map((s, i) => ({ ...s, id: sentenceIds[i], reviewStatus: "draft" as const }));
    const questions = output.questions.map(({ sentenceIndex, ...q }, i) => ({
      ...q,
      id: questionIds[i],
      ...(sentenceIds[sentenceIndex] ? { sentenceId: sentenceIds[sentenceIndex] } : {}),
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
  const questionsNow = unitQuestions().filter((q) => q.reviewStatus !== "retired");
  const allGroups = spec.generation.variantGroups.every((g) => questionsNow.some((q) => q.variantGroup === g.id));
  const hasUnit = drafts.units.length > 0 || drafts.records.some((r) => r.id === spec.unitId) || approvedOf(contentDir, "units", spec.unitId).length > 0;
  if (allGroups && !hasUnit) {
    const ids = {
      groups: spec.generation.variantGroups.map((g) => {
        const questions = questionsNow.filter((q) => q.variantGroup === g.id);
        const sentenceIds = new Set(questions.map((q) => q.sentenceId).filter((id) => id !== undefined));
        return { id: g.id, sentenceUse: g.sentenceUse, sentenceIds: [...sentenceIds], questionIds: questions.map((q) => q.id) };
      }),
    };
    const output = await call(unitKey, "단원", buildUnitPrompt(spec, ids), UnitOutput, unitOutputSchema());
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
      const reasons = issues.map((i) => `규칙 위반: ${i.message}`);
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
