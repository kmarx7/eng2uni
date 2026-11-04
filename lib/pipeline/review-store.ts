// Human review of drafts (DESIGN 6-2 step 5, stage 8 design §6). Approval is the
// only path into content/, and it runs only from the admin screen a person clicks.
// Every approval re-validates the student content and rolls back on new issues.
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CONTENT_SCHEMAS, checkContent, type ContentFile, type ContentIssue } from "@/lib/schema/content-rules";
import { DRAFTS_DIR, FIXTURES_DIR, HANDOFF_DIRS, SPECS_DIR, loadContentRoot, validateContentTree } from "@/lib/schema/content-tree";
import type { Unit } from "@/lib/schema/curriculum";
import type { Question } from "@/lib/schema/question";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import type { Vocabulary } from "@/lib/schema/vocabulary";
import type { ReviewRecord } from "@/lib/schema/review-record";
import { englishWords, isClean, missingDistractorTags } from "./checks";
import { allowedLemmas, outOfRange, type FrequencyTable } from "./vocab-range";
import { CATALOG_FILES, draftFile, mergeById, readDrafts, readJsonArray, writeDrafts, writeJsonAtomic } from "./draft-store";

export interface QueueEntry {
  record: ReviewRecord;
  item: unknown;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

type Item = { id: string; reviewStatus?: string } & Record<string, unknown>;

const STATUS_ORDER: Record<string, number> = { flagged: 0, auto_checked: 1, draft: 2 };
const KIND_DIR = { sentence: "sentences", question: "questions", unit: "units", vocabulary: "vocabulary" } as const;
const CATALOG_KIND = { levels: "level", skills: "skill", misconceptions: "misconception", traps: "trap" } as const;

function recordUnits(contentDir: string): string[] {
  const dir = path.join(contentDir, DRAFTS_DIR, "records");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort();
}

function findRecord(contentDir: string, itemId: string): ReviewRecord | undefined {
  for (const unitId of recordUnits(contentDir)) {
    const found = readDrafts(contentDir, unitId).records.find((r) => r.id === itemId);
    if (found) return found;
  }
  return undefined;
}

function catalogFileOf(contentDir: string, itemId: string): keyof typeof CATALOG_FILES | undefined {
  return (Object.keys(CATALOG_FILES) as (keyof typeof CATALOG_FILES)[]).find((key) =>
    readJsonArray<Item>(path.join(contentDir, DRAFTS_DIR, CATALOG_FILES[key])).some((i) => i.id === itemId),
  );
}

// The draft file that holds an item, and its current list.
function draftLocation(contentDir: string, record: ReviewRecord): { file: string; items: Item[] } | undefined {
  if (record.kind === "catalog") {
    const key = catalogFileOf(contentDir, record.id);
    if (!key) return undefined;
    const file = path.join(contentDir, DRAFTS_DIR, CATALOG_FILES[key]);
    return { file, items: readJsonArray<Item>(file) };
  }
  const file = draftFile(contentDir, KIND_DIR[record.kind], record.unitId);
  return { file, items: readJsonArray<Item>(file) };
}

// The approved vocabulary file that holds a word (examples are added to it in place).
function approvedVocabularyFile(contentDir: string, itemId: string): string | undefined {
  const dir = path.join(contentDir, "vocabulary");
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .find((f) => readJsonArray<Item>(f).some((i) => i.id === itemId));
}

function approvedLocation(contentDir: string, record: ReviewRecord): string | undefined {
  if (record.kind === "vocabulary") return approvedVocabularyFile(contentDir, record.id);
  if (record.kind === "catalog") {
    const key = catalogFileOf(contentDir, record.id);
    return key && path.join(contentDir, CATALOG_FILES[key]);
  }
  return path.join(contentDir, KIND_DIR[record.kind], `${record.unitId}.json`);
}

function findItem(contentDir: string, record: ReviewRecord): Item | undefined {
  return draftLocation(contentDir, record)?.items.find((i) => i.id === record.id);
}

export function listQueue(contentDir: string): QueueEntry[] {
  return recordUnits(contentDir)
    .flatMap((unitId) => readDrafts(contentDir, unitId).records)
    .filter((r) => r.status !== "approved" && r.status !== "retired")
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.unitId.localeCompare(b.unitId) || a.id.localeCompare(b.id))
    .map((record) => ({ record, item: findItem(contentDir, record) }));
}

// Approved ids in the student content.
function approvedIds(contentDir: string): Set<string> {
  const { files } = loadContentRoot(contentDir, [DRAFTS_DIR, FIXTURES_DIR, SPECS_DIR, ...HANDOFF_DIRS]);
  return new Set(
    files.flatMap((f) => (Array.isArray(f.data) ? (f.data as Item[]) : [])).filter((i) => i.reviewStatus === "approved").map((i) => i.id),
  );
}

const issueKey = (i: ContentIssue) => `${i.path}|${i.itemId ?? ""}|${i.message}`;
const studentIssues = (contentDir: string) => validateContentTree(contentDir)[0].issues;

function readRaw(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

function restore(file: string, raw: string | null): void {
  if (raw === null) rmSync(file, { force: true });
  else writeFileSync(file, raw);
}

function precondition(contentDir: string, record: ReviewRecord, item: Item): string | null {
  const approved = approvedIds(contentDir);
  if (record.kind === "question") {
    const sentenceId = (item as unknown as Question).sentenceId;
    if (sentenceId && !approved.has(sentenceId)) return `문장 ${sentenceId}을 먼저 승인하세요`;
  }
  if (record.kind === "vocabulary") {
    const file = approvedVocabularyFile(contentDir, record.id);
    const word = file && readJsonArray<Item>(file).find((i) => i.id === record.id);
    if (!word || word.reviewStatus !== "approved") return `단어 ${String(item.lemma)}이 아직 승인되지 않았습니다(npm run vocab:approve 먼저)`;
  }
  if (record.kind === "unit") {
    const unit = item as unknown as Unit;
    const used = unit.blocks.flatMap((b) => [
      ...("questionIds" in b ? b.questionIds : []),
      ...("questionId" in b ? [b.questionId] : []),
      ...("sentenceIds" in b ? b.sentenceIds : []),
    ]);
    const missing = used.find((id) => !approved.has(id));
    if (missing) return `단원이 쓰는 ${missing}가 아직 승인되지 않았습니다`;
  }
  return null;
}

export function approve(contentDir: string, itemId: string, reviewer: string, now: Date): ActionResult {
  if (!reviewer.trim()) return { ok: false, error: "REVIEWER_NAME이 없습니다" };
  const record = findRecord(contentDir, itemId);
  if (!record || record.status === "approved" || record.status === "retired") return { ok: false, error: `검수할 항목 ${itemId}이 없습니다` };
  const item = findItem(contentDir, record);
  if (!item) return { ok: false, error: `초안 ${itemId}을 찾을 수 없습니다` };
  const blocked = precondition(contentDir, record, item);
  if (blocked) return { ok: false, error: blocked };
  const target = approvedLocation(contentDir, record);
  if (!target) return { ok: false, error: `초안 ${itemId}을 찾을 수 없습니다` };

  const before = new Set(studentIssues(contentDir).map(issueKey));
  const raw = readRaw(target);
  // A vocabulary draft only adds its example to the approved word.
  const base = record.kind === "vocabulary" ? readJsonArray<Item>(target).find((i) => i.id === itemId)! : item;
  const approvedItem: Item = record.kind === "vocabulary" ? { ...base, example: item.example, reviewStatus: "approved" } : { ...item, reviewStatus: "approved" };
  if (record.kind === "question") approvedItem.source = { ...(item as unknown as Question).source, reviewedBy: reviewer };
  writeJsonAtomic(target, mergeById(readJsonArray<Item>(target), [approvedItem]));

  const added = studentIssues(contentDir).filter((i) => !before.has(issueKey(i)));
  if (added.length) {
    restore(target, raw);
    return { ok: false, error: missingCatalogMessage(contentDir, added) ?? `승인하면 검증 오류: ${added.map((i) => `${i.itemId ?? ""} ${i.message}`.trim()).join("; ")}` };
  }

  const location = draftLocation(contentDir, record)!;
  writeJsonAtomic(location.file, location.items.filter((i) => i.id !== itemId));
  writeDrafts(contentDir, record.unitId, {
    records: [{ ...record, status: "approved", reviewedBy: reviewer, reviewedAt: now.toISOString() }],
  });
  return { ok: true };
}

// The usual reason an approval fails: it refers to a skill, misconception or trap
// that is not approved yet, or that the reviewer rejected. Say so in plain Korean.
function missingCatalogMessage(contentDir: string, issues: ContentIssue[]): string | null {
  for (const issue of issues) {
    const match =
      /^(?:prerequisite skill|skill|misconception|trap) "([^"]+)" does not exist$/.exec(issue.message) ??
      /(?:misconception|trap) "([^"]+)" is not defined$/.exec(issue.message);
    if (!match) continue;
    const id = match[1];
    const record = findRecord(contentDir, id);
    if (record?.status === "retired") return `${id}는 '기초 목록'에서 폐기되었습니다. 이 항목을 수정해 ${id}를 빼거나 폐기하세요`;
    return `먼저 '기초 목록'에서 ${id}를 승인하세요`;
  }
  return null;
}

export function cleanBatch(contentDir: string, unitId: string): string[] {
  return readDrafts(contentDir, unitId).records.filter(isClean).map((r) => r.id);
}

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

// max(3, 20%) items, at most all of them; the same ids and seed give the same sample.
export function pickSample(ids: string[], seed: string): string[] {
  const size = Math.min(ids.length, Math.max(3, Math.ceil(ids.length * 0.2)));
  const random = seededRandom(seed);
  const pool = [...ids];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export type BatchResult = { ok: true; approved: number; errors: string[] } | { ok: false; error: string };

const KIND_RANK: Record<ReviewRecord["kind"], number> = { catalog: 0, vocabulary: 1, sentence: 2, question: 3, unit: 4 };

export function approveBatch(contentDir: string, unitId: string, sampleSeen: string[], reviewer: string, now: Date): BatchResult {
  const ids = cleanBatch(contentDir, unitId);
  const unseen = pickSample(ids, unitId).filter((id) => !sampleSeen.includes(id));
  if (unseen.length) return { ok: false, error: `표본 ${unseen.join(", ")}을 먼저 열어 보세요` };
  const records = readDrafts(contentDir, unitId).records.filter((r) => ids.includes(r.id));
  records.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.id.localeCompare(b.id));
  const errors: string[] = [];
  let approved = 0;
  for (const r of records) {
    const result = approve(contentDir, r.id, reviewer, now);
    if (result.ok) approved += 1;
    else errors.push(`${r.id}: ${result.error}`);
  }
  return { ok: true, approved, errors };
}

export function sendBatchToIndividual(contentDir: string, unitId: string): void {
  const ids = new Set(cleanBatch(contentDir, unitId));
  const records = readDrafts(contentDir, unitId)
    .records.filter((r) => ids.has(r.id))
    .map((r): ReviewRecord => ({ ...r, status: "flagged", reasons: [...r.reasons, "표본에서 수정·폐기 발생"] }));
  writeDrafts(contentDir, unitId, { records });
}

export type EditResult = { ok: true } | { ok: false; errors: string[] };

export function editItem(contentDir: string, itemId: string, json: string): EditResult {
  const record = findRecord(contentDir, itemId);
  const location = record && draftLocation(contentDir, record);
  if (!record || !location) return { ok: false, errors: [`초안 ${itemId}을 찾을 수 없습니다`] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (error: unknown) {
    return { ok: false, errors: [`JSON 형식 오류: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const kind = record.kind === "catalog" ? CATALOG_KIND[catalogFileOf(contentDir, itemId)!] : record.kind;
  const edited = { ...(raw as Item), reviewStatus: "draft" };
  if (edited.id !== itemId) return { ok: false, errors: ["id는 바꿀 수 없습니다"] };
  const parsed = CONTENT_SCHEMAS[kind].safeParse(edited);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };

  // Draft rules against the student content, the drafted catalogue and this unit's other drafts.
  const { files } = loadContentRoot(contentDir, [DRAFTS_DIR, FIXTURES_DIR, SPECS_DIR, ...HANDOFF_DIRS]);
  const drafts = readDrafts(contentDir, record.unitId);
  const draftCatalog: ContentFile[] = (Object.keys(CATALOG_FILES) as (keyof typeof CATALOG_FILES)[]).map((key) => ({
    path: `drafts/${CATALOG_FILES[key]}`,
    kind: CATALOG_KIND[key],
    data: readJsonArray<Item>(path.join(contentDir, DRAFTS_DIR, CATALOG_FILES[key])).map((i) => (i.id === itemId ? parsed.data : i)),
  }));
  const swap = <T extends { id: string }>(list: T[]) => list.map((i) => (i.id === itemId ? (parsed.data as unknown as T) : i));
  const issues = checkContent(
    [
      ...files.filter((f) => !["level", "skill", "misconception", "trap"].includes(f.kind) || record.kind !== "catalog"),
      ...draftCatalog,
      { path: "drafts/sentences", kind: "sentence", data: swap(drafts.sentences) },
      { path: "drafts/questions", kind: "question", data: swap(drafts.questions) },
      { path: "drafts/units", kind: "unit", data: swap(drafts.units) },
    ],
    { mode: "full", requireApproved: false, requireFixtureIds: false },
  ).filter((i) => i.itemId === itemId);
  if (issues.length) return { ok: false, errors: issues.map((i) => i.message) };

  writeJsonAtomic(location.file, location.items.map((i) => (i.id === itemId ? (parsed.data as Item) : i)));
  writeDrafts(contentDir, record.unitId, { records: [recheckEdited(contentDir, record, parsed.data as Item)] });
  return { ok: true };
}

// The spec's word limit for a unit, else the default 2000.
function rankFor(contentDir: string, unitId: string): number {
  const file = path.join(contentDir, SPECS_DIR, `${unitId}.json`);
  if (!existsSync(file)) return 2000;
  const spec = JSON.parse(readFileSync(file, "utf8")) as { generation?: { vocabRankMax?: number } };
  return spec.generation?.vocabRankMax ?? 2000;
}

function frequencyTable(contentDir: string): FrequencyTable {
  const candidates = [path.join(contentDir, "..", "analysis/vocab_frequency.json"), path.join(process.cwd(), "analysis/vocab_frequency.json")];
  const file = candidates.find((f) => existsSync(f));
  return file ? (JSON.parse(readFileSync(file, "utf8")) as FrequencyTable) : { lemmas: [] };
}

// A person's edit re-runs the word and tag checks. The exam-overlap check needs the
// Python checker, so it is marked skipped, which keeps the item out of clean batches.
// A question also loses its cross-solve and pre-review: they judged the old text.
function recheckEdited(contentDir: string, record: ReviewRecord, item: Item): ReviewRecord {
  const allowed = allowedLemmas(frequencyTable(contentDir), rankFor(contentDir, record.unitId));
  let words: string[] = [];
  let untagged: string[] | null = null;
  if (record.kind === "sentence") words = (item as unknown as AnnotatedSentence).tokens;
  if (record.kind === "question") {
    const q = item as unknown as Question;
    words = q.options.flatMap((o) => englishWords(o.text));
    untagged = missingDistractorTags(q);
  }
  if (record.kind === "vocabulary") {
    const word = item as unknown as Vocabulary;
    words = word.example ? englishWords(word.example.en) : [];
    allowed.add(word.lemma.toLowerCase());
  }
  const extra = outOfRange(words, allowed);
  const reasons = ["사람이 수정함"];
  if (extra.length) reasons.push(`허용 어휘 밖: ${extra.join(", ")}`);
  if (untagged?.length) reasons.push(`오답 오개념 누락: ${untagged.join(", ")}`);
  reasons.push("유사도 미검사(수정 후)");
  const checks: ReviewRecord["checks"] = {
    rules: "pass",
    vocab: extra.length ? "fail" : "pass",
    tags: untagged === null ? "n/a" : untagged.length ? "fail" : "pass",
    similarity: "skipped",
  };
  const keep: ReviewRecord = { ...record };
  if (record.kind === "question") {
    delete keep.crossSolve;
    delete keep.preReview;
  }
  return { ...keep, status: extra.length || untagged?.length ? "flagged" : "auto_checked", reasons, checks };
}

export function reject(contentDir: string, itemId: string, reviewer: string, now: Date): ActionResult {
  const record = findRecord(contentDir, itemId);
  if (!record) return { ok: false, error: `검수할 항목 ${itemId}이 없습니다` };
  const location = draftLocation(contentDir, record);
  if (location) writeJsonAtomic(location.file, location.items.map((i) => (i.id === itemId ? { ...i, reviewStatus: "retired" } : i)));
  writeDrafts(contentDir, record.unitId, {
    records: [{ ...record, status: "retired", reviewedBy: reviewer || undefined, reviewedAt: now.toISOString() }],
  });
  return { ok: true };
}
