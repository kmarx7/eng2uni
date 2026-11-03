import { describe, expect, it } from "vitest";
import type { ContentFile } from "@/lib/schema/content-rules";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import { checkDraftGroup, isClean, missingDistractorTags } from "./checks";

const sentence: AnnotatedSentence = {
  id: "S-L0-U05-001",
  level: "L0",
  text: "The cat drinks milk.",
  tokens: ["The", "cat", "drinks", "milk", "."],
  spans: [
    { id: "s", role: "SUBJECT", range: [0, 1] },
    { id: "v", role: "MAIN_VERB", range: [2, 2] },
    { id: "o", role: "OBJECT", range: [3, 3] },
  ],
  translation: "고양이가 우유를 마신다.",
  skills: ["subject_find"],
  reviewStatus: "draft",
};

const question: Question = {
  id: "Q-L0-U05-001",
  type: "multiple_choice",
  difficulty: 1,
  sentenceId: "S-L0-U05-001",
  prompt: "주어는?",
  options: [
    { id: "a", text: "The cat" },
    { id: "b", text: "drinks", misconception: "verb_as_subject" },
    { id: "c", text: "milk" },
  ],
  answer: "a",
  skills: ["subject_find"],
  explanation: { summary: "동작을 하는 쪽이 주어", byOption: {} },
  variantGroup: "VG-L0-U05-subject",
  source: { type: "original", generatedBy: "ai_draft" },
  reviewStatus: "draft",
  version: 1,
};

const catalog: ContentFile[] = [
  { path: "skills.json", kind: "skill", data: [{ id: "subject_find", name: "주어 찾기", category: "syntax" }] },
  {
    path: "misconceptions.json",
    kind: "misconception",
    data: [{ id: "verb_as_subject", skillId: "subject_find", category: "SYN", description: "동사를 주어로 본다" }],
  },
];

const allowed = new Set(["the", "cat", "drink", "milk"]);
const pass = (ids: string[]) => new Map(ids.map((id) => [id, "pass" as const]));

describe("missingDistractorTags", () => {
  it("lists wrong options with no misconception or trap", () => {
    expect(missingDistractorTags(question)).toEqual(["c"]);
  });
});

describe("checkDraftGroup", () => {
  it("passes clean drafts as auto_checked", () => {
    const tagged = { ...question, options: question.options.map((o) => (o.id === "c" ? { ...o, trap: "partial_detail" } : o)) };
    const traps: ContentFile = { path: "traps.json", kind: "trap", data: [{ id: "partial_detail", name: "부분", description: "일부만 맞음" }] };
    const result = checkDraftGroup({
      sentences: [sentence],
      questions: [tagged],
      catalog: [...catalog, traps],
      allowed,
      similarity: pass([sentence.id, question.id]),
    });
    expect(result.get(sentence.id)).toEqual({ status: "auto_checked", reasons: [], checks: { rules: "pass", vocab: "pass", tags: "n/a", similarity: "pass" } });
    expect(result.get(question.id)?.status).toBe("auto_checked");
  });

  it("flags a rule violation, a missing tag, words out of range and an exam overlap", () => {
    const broken = { ...question, answer: "z" };
    const wordy = { ...sentence, tokens: ["The", "dog", "drinks", "milk", "."] };
    const result = checkDraftGroup({
      sentences: [wordy],
      questions: [broken],
      catalog,
      allowed,
      similarity: new Map([
        [sentence.id, "fail"],
        [question.id, "skipped"],
      ]),
    });
    const q = result.get(question.id)!;
    expect(q.status).toBe("flagged");
    expect(q.checks).toMatchObject({ rules: "fail", tags: "fail", similarity: "skipped" });
    expect(q.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/^규칙 위반: /), expect.stringMatching(/^오답 오개념 누락: /), "유사도 미검사"]));
    const s = result.get(sentence.id)!;
    expect(s.reasons).toEqual(expect.arrayContaining(["허용 어휘 밖: dog", "기출 유사"]));
  });
});

const clean: ReviewRecord = {
  id: "Q-L0-U05-001",
  kind: "question",
  unitId: "L0-U05",
  status: "auto_checked",
  reasons: [],
  checks: { rules: "pass", vocab: "pass", tags: "pass", similarity: "pass" },
  crossSolve: { answer: "a", agrees: true },
  preReview: { issues: [] },
  generatedAt: "2026-11-03T09:00:00+09:00",
  reports: [],
};

describe("isClean", () => {
  it("needs every gate", () => {
    expect(isClean(clean)).toBe(true);
    expect(isClean({ ...clean, checks: { ...clean.checks, similarity: "skipped" } })).toBe(false);
    expect(isClean({ ...clean, crossSolve: { answer: "b", agrees: false } })).toBe(false);
    expect(isClean({ ...clean, preReview: undefined })).toBe(false);
    expect(isClean({ ...clean, preReview: { issues: ["애매함"] } })).toBe(false);
    expect(isClean({ ...clean, status: "flagged" })).toBe(false);
    expect(isClean({ ...clean, checks: { ...clean.checks, vocab: "fail" } })).toBe(false);
    expect(isClean({ ...clean, checks: { ...clean.checks, rules: "fail" } })).toBe(false);
    expect(isClean({ ...clean, checks: { ...clean.checks, tags: "fail" } })).toBe(false);
  });

  it("treats a sentence as clean without a cross-solve", () => {
    expect(isClean({ ...clean, kind: "sentence", crossSolve: undefined, checks: { ...clean.checks, tags: "n/a" } })).toBe(true);
  });
});
