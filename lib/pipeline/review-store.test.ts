import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateContentTree } from "@/lib/schema/content-tree";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import { readDrafts, writeDrafts, writeJsonAtomic } from "./draft-store";
import { approve, approveBatch, cleanBatch, editItem, listQueue, pickSample, reject, sendBatchToIndividual } from "./review-store";

let base: string;
let dir: string;
const now = new Date("2026-11-03T09:00:00+09:00");
const U = "L0-U05";

const sentence = (n: number): AnnotatedSentence => ({
  id: `S-${U}-00${n}`,
  level: "L0",
  text: "The cat drinks milk.",
  tokens: ["The", "cat", "drinks", "milk", "."],
  spans: [
    { id: "s", role: "SUBJECT", range: [0, 1] },
    { id: "v", role: "MAIN_VERB", range: [2, 2] },
  ],
  translation: "고양이가 우유를 마신다.",
  skills: ["subject_find"],
  reviewStatus: "draft",
});
const question = (n: number, sentenceN = n): Question => ({
  id: `Q-${U}-00${n}`,
  type: "multiple_choice",
  difficulty: 1,
  sentenceId: `S-${U}-00${sentenceN}`,
  prompt: "주어는?",
  options: [
    { id: "a", text: "The cat" },
    { id: "b", text: "drinks", misconception: "verb_as_subject" },
  ],
  answer: "a",
  skills: ["subject_find"],
  explanation: { summary: "동작을 하는 쪽", byOption: { a: "주어", b: "동사" } },
  variantGroup: "VG-subject",
  source: { type: "original", generatedBy: "ai_draft" },
  reviewStatus: "draft",
  version: 1,
});
const record = (id: string, kind: ReviewRecord["kind"], extra: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id,
  kind,
  unitId: U,
  status: "auto_checked",
  reasons: [],
  checks: { rules: "pass", vocab: "pass", tags: kind === "question" ? "pass" : "n/a", similarity: "pass" },
  ...(kind === "question" ? { crossSolve: { answer: "a", agrees: true }, preReview: { issues: [] } } : {}),
  generatedAt: now.toISOString(),
  reports: [],
  ...extra,
});

const approvedFile = (kind: string) => path.join(dir, kind, `${U}.json`);
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const snapshot = () => JSON.stringify([readDrafts(dir, U), existsSync(approvedFile("questions")), existsSync(approvedFile("sentences"))]);

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), "review-store-"));
  dir = path.join(base, "content");
  const lemmas = ["the", "cat", "drink", "milk"].map((lemma) => ({ lemma, kind: "content" }));
  writeJsonAtomic(path.join(base, "analysis/vocab_frequency.json"), { lemmas });
  writeJsonAtomic(path.join(dir, "skills.json"), [{ id: "subject_find", name: "주어 찾기", category: "syntax", prerequisiteIds: [] }]);
  writeJsonAtomic(path.join(dir, "misconceptions.json"), [
    { id: "verb_as_subject", skillId: "subject_find", category: "SYN", description: "동사를 주어로 본다" },
  ]);
  writeDrafts(dir, U, {
    sentences: [sentence(1), sentence(2)],
    questions: [question(1), question(2)],
    records: [record(`S-${U}-001`, "sentence"), record(`S-${U}-002`, "sentence", { status: "flagged", reasons: ["허용 어휘 밖: x"] }), record(`Q-${U}-001`, "question"), record(`Q-${U}-002`, "question")],
  });
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("listQueue", () => {
  it("puts flagged items first and leaves out finished ones", () => {
    reject(dir, `Q-${U}-002`, "kim", now);
    expect(listQueue(dir).map((e) => e.record.id)).toEqual([`S-${U}-002`, `Q-${U}-001`, `S-${U}-001`]);
    expect(listQueue(dir)[0].item).toMatchObject({ text: "The cat drinks milk." });
  });
});

describe("approve", () => {
  it("refuses a question whose sentence is still a draft and changes nothing", () => {
    const before = snapshot();
    expect(approve(dir, `Q-${U}-001`, "kim", now)).toEqual({ ok: false, error: `문장 S-${U}-001을 먼저 승인하세요` });
    expect(snapshot()).toBe(before);
  });

  it("refuses without a reviewer name", () => {
    expect(approve(dir, `S-${U}-001`, "", now)).toEqual({ ok: false, error: "REVIEWER_NAME이 없습니다" });
  });

  it("moves an approved sentence and question into content/ with the reviewer", () => {
    expect(approve(dir, `S-${U}-001`, "kim", now)).toEqual({ ok: true });
    expect(approve(dir, `Q-${U}-001`, "kim", now)).toEqual({ ok: true });
    expect(read(approvedFile("questions"))).toEqual([
      expect.objectContaining({ id: `Q-${U}-001`, reviewStatus: "approved", source: { type: "original", generatedBy: "ai_draft", reviewedBy: "kim" } }),
    ]);
    expect(read(approvedFile("sentences"))[0]).toMatchObject({ reviewStatus: "approved" });
    const records = readDrafts(dir, U).records;
    expect(records.find((r) => r.id === `Q-${U}-001`)).toMatchObject({ status: "approved", reviewedBy: "kim", reviewedAt: now.toISOString() });
    expect(readDrafts(dir, U).questions.map((q) => q.id)).toEqual([`Q-${U}-002`]);
    expect(validateContentTree(dir).flatMap((r) => r.issues)).toEqual([]);
  });

  it("keeps one copy when the same id is approved again", () => {
    approve(dir, `S-${U}-001`, "kim", now);
    writeDrafts(dir, U, { sentences: [sentence(1)], records: [record(`S-${U}-001`, "sentence")] });
    approve(dir, `S-${U}-001`, "kim", now);
    expect(read(approvedFile("sentences"))).toHaveLength(1);
  });

  it("says in Korean which catalogue entry to approve first", () => {
    writeFileSync(path.join(dir, "skills.json"), "[]");
    writeFileSync(path.join(dir, "misconceptions.json"), "[]");
    expect(approve(dir, `S-${U}-001`, "kim", now)).toEqual({ ok: false, error: "먼저 '기초 목록'에서 subject_find를 승인하세요" });
  });

  it("says when the misconception a question uses was rejected", () => {
    writeFileSync(path.join(dir, "misconceptions.json"), "[]");
    writeDrafts(dir, U, { records: [record("verb_as_subject", "catalog", { status: "retired", reviewedBy: "kim", reviewedAt: now.toISOString() })] });
    approve(dir, `S-${U}-001`, "kim", now);
    expect(approve(dir, `Q-${U}-001`, "kim", now)).toEqual({
      ok: false,
      error: "verb_as_subject는 '기초 목록'에서 폐기되었습니다. 이 항목을 수정해 verb_as_subject를 빼거나 폐기하세요",
    });
  });

  it("rolls back an approval that breaks the student content", () => {
    writeFileSync(path.join(dir, "misconceptions.json"), "[]");
    approve(dir, `S-${U}-001`, "kim", now);
    const before = snapshot();
    const result = approve(dir, `Q-${U}-001`, "kim", now);
    expect(result).toEqual({ ok: false, error: "먼저 '기초 목록'에서 verb_as_subject를 승인하세요" });
    expect(snapshot()).toBe(before);
  });

  it("refuses a unit that uses unapproved items", () => {
    const unit = {
      id: U,
      levelId: "L0",
      order: 5,
      title: "주어",
      skills: ["subject_find"],
      blocks: [{ id: `${U}-B01`, type: "assessment", questionIds: [`Q-${U}-001`] }],
      reviewStatus: "draft",
      version: 1,
    };
    writeDrafts(dir, U, { units: [unit as never], records: [record(U, "unit")] });
    expect(approve(dir, U, "kim", now)).toEqual({ ok: false, error: `단원이 쓰는 Q-${U}-001가 아직 승인되지 않았습니다` });
  });
});

describe("batches", () => {
  it("picks max(3, 20%) samples, stable for a seed", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `id${i}`);
    expect(pickSample(ids.slice(0, 10), "s")).toHaveLength(3);
    expect(pickSample(ids, "s")).toHaveLength(5);
    expect(pickSample(ids.slice(0, 2), "s")).toHaveLength(2);
    expect(pickSample(ids, "s")).toEqual(pickSample(ids, "s"));
  });

  it("collects clean items only", () => {
    expect(cleanBatch(dir, U)).toEqual([`S-${U}-001`, `Q-${U}-001`, `Q-${U}-002`]);
  });

  it("refuses until every sample item was opened, then approves sentences before questions", () => {
    writeDrafts(dir, U, { records: [record(`S-${U}-002`, "sentence")] });
    const sample = pickSample(cleanBatch(dir, U), U);
    expect(approveBatch(dir, U, sample.slice(1), "kim", now)).toMatchObject({ ok: false });
    expect(approveBatch(dir, U, sample, "kim", now)).toEqual({ ok: true, approved: 4, errors: [] });
    expect(read(approvedFile("questions"))).toHaveLength(2);
  });

  it("sends a batch back to individual review", () => {
    sendBatchToIndividual(dir, U);
    const records = readDrafts(dir, U).records.filter((r) => r.id !== `S-${U}-002`);
    expect(records.every((r) => r.status === "flagged" && r.reasons.includes("표본에서 수정·폐기 발생"))).toBe(true);
    expect(cleanBatch(dir, U)).toEqual([]);
  });
});

describe("editItem", () => {
  it("returns errors for bad JSON or a broken item and saves nothing", () => {
    const before = snapshot();
    expect(editItem(dir, `Q-${U}-001`, "{")).toMatchObject({ ok: false, errors: [expect.stringMatching(/JSON/)] });
    expect(editItem(dir, `Q-${U}-001`, JSON.stringify({ ...question(1), answer: "z" }))).toMatchObject({ ok: false });
    expect(snapshot()).toBe(before);
  });

  it("saves a valid edit as a draft and sends a question back for a new cross-solve", () => {
    const edited = { ...question(1), prompt: "이 문장의 주어는?", reviewStatus: "approved" };
    expect(editItem(dir, `Q-${U}-001`, JSON.stringify(edited))).toEqual({ ok: true });
    const drafts = readDrafts(dir, U);
    expect(drafts.questions[0]).toMatchObject({ prompt: "이 문장의 주어는?", reviewStatus: "draft" });
    const record = drafts.records.find((r) => r.id === `Q-${U}-001`)!;
    expect(record).toMatchObject({ status: "auto_checked", reasons: ["사람이 수정함", "유사도 미검사(수정 후)"] });
    expect(record.crossSolve).toBeUndefined();
    expect(record.preReview).toBeUndefined();
    expect(cleanBatch(dir, U)).not.toContain(`Q-${U}-001`);
  });

  it("re-checks words after an edit and keeps a still-failing item flagged", () => {
    const edited = { ...sentence(1), tokens: ["The", "zyzzyva", "drinks", "milk", "."] };
    expect(editItem(dir, `S-${U}-001`, JSON.stringify(edited))).toEqual({ ok: true });
    const record = readDrafts(dir, U).records.find((r) => r.id === `S-${U}-001`)!;
    expect(record).toMatchObject({ status: "flagged", checks: { vocab: "fail", similarity: "skipped" } });
    expect(record.reasons).toContain("허용 어휘 밖: zyzzyva");
  });

  it("refuses an edit that changes the id", () => {
    expect(editItem(dir, `Q-${U}-001`, JSON.stringify({ ...question(1), id: "Q-X" }))).toMatchObject({ ok: false });
  });
});

describe("reject", () => {
  it("retires the record and the draft item", () => {
    reject(dir, `Q-${U}-001`, "kim", now);
    const drafts = readDrafts(dir, U);
    expect(drafts.records.find((r) => r.id === `Q-${U}-001`)).toMatchObject({ status: "retired", reviewedBy: "kim" });
    expect(drafts.questions.find((q) => q.id === `Q-${U}-001`)?.reviewStatus).toBe("retired");
  });
});
