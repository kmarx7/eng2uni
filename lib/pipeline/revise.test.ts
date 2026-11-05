import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import type { SimilarityResult } from "./checks";
import type { ClaudeRunner } from "./claude-cli";
import { readDrafts, writeCatalogDrafts, writeDrafts } from "./draft-store";
import { revisionTargets, runRevise } from "./revise";

let dir: string;
const now = new Date("2026-11-05T09:00:00+09:00");
const unitId = "L0-U05";

const sentence = (n: number, text: string, tokens: string[]): AnnotatedSentence => ({
  id: `S-L0-U05-00${n}`,
  level: "L0",
  text,
  tokens,
  spans: [],
  translation: "번역",
  skills: ["subject_find"],
  reviewStatus: "draft",
});
const s1 = sentence(1, "The cat drinks milk.", ["The", "cat", "drinks", "milk", "."]);
const s2 = sentence(2, "The dog eats food.", ["The", "dog", "eats", "food", "."]);

const question = (n: number, sentenceId: string, overrides: Partial<Question> = {}): Question => ({
  id: `Q-L0-U05-00${n}`,
  type: "multiple_choice",
  difficulty: 1,
  sentenceId,
  prompt: "다음 문장의 주어는?",
  options: [
    { id: "a", text: "the cat" },
    { id: "b", text: "drinks", misconception: "verb_as_subject" },
  ],
  answer: "a",
  skills: ["subject_find"],
  explanation: { summary: "목적어는 주어가 될 수 없습니다.", byOption: { a: "주어", b: "동사" } },
  hints: { direction: "동사 앞을 보세요" },
  variantGroup: "VG-L0-U05-SUBJ",
  source: { type: "original", generatedBy: "ai_draft" },
  reviewStatus: "draft",
  version: 1,
  ...overrides,
});

const record = (id: string, kind: ReviewRecord["kind"], extra: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id,
  kind,
  unitId,
  status: "flagged",
  reasons: [],
  checks: { rules: "pass", vocab: "pass", tags: kind === "question" ? "pass" : "n/a", similarity: "pass" },
  generatedAt: "2026-11-03T00:00:00.000Z",
  reports: [],
  ...extra,
});

const issue = "해설의 '목적어는 주어가 될 수 없습니다'는 지나친 일반화입니다.";
const reviewed = (issues: string[]) => ({ crossSolve: { answer: "a", agrees: true }, preReview: { issues } });

// The model's answer: the question without the fields the pipeline owns.
const revisedQuestion = (overrides: Record<string, unknown> = {}) => {
  const owned = ["id", "sentenceId", "variantGroup", "source", "reviewStatus", "version", "lessonId"];
  const rest = Object.fromEntries(Object.entries(question(1, s1.id)).filter(([key]) => !owned.includes(key)));
  return { ...rest, explanation: { summary: "이 문장에서 the cat이 주어입니다.", byOption: { a: "주어", b: "동사" } }, ...overrides };
};

const runnerOf = (json: unknown, fail = false) => {
  const inputs: string[] = [];
  const runner: ClaudeRunner = async ({ input }) => {
    inputs.push(input);
    return fail ? { ok: false, error: "usage limit" } : { ok: true, json };
  };
  return { runner, inputs };
};
const pass = async (items: { id: string }[]) => new Map<string, SimilarityResult>(items.map((i) => [i.id, "pass"]));
const logs: string[] = [];
const opts = (runner: ClaudeRunner, extra: Partial<Parameters<typeof runRevise>[0]> = {}) => ({
  contentDir: dir,
  unitId,
  runner,
  model: "opus",
  allowed: new Set(["the", "cat", "drink", "milk", "dog", "eat", "food", "bird", "sing"]),
  similarity: pass,
  now,
  log: (line: string) => logs.push(line),
  ...extra,
});
const drafts = () => readDrafts(dir, unitId);
const recordOf = (id: string) => drafts().records.find((r) => r.id === id)!;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "revise-"));
  logs.length = 0;
  writeCatalogDrafts(dir, {
    level: { id: "L0", order: 0, name: "영어의 시작" },
    skills: [{ id: "subject_find", name: "주어 찾기", category: "syntax", prerequisiteIds: [] }],
    misconceptions: [{ id: "verb_as_subject", skillId: "subject_find", category: "SYN", description: "동사를 주어로 본다" }],
    traps: [],
  } as never);
  writeDrafts(dir, unitId, {
    sentences: [s1, s2],
    questions: [question(1, s1.id), question(2, s2.id), question(3, s2.id)],
    records: [
      record(s1.id, "sentence", { status: "auto_checked" }),
      record(s2.id, "sentence", { status: "auto_checked" }),
      record("Q-L0-U05-001", "question", reviewed([issue])),
      record("Q-L0-U05-002", "question", { status: "auto_checked", ...reviewed([]) }),
      record("Q-L0-U05-003", "question"),
    ],
  });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("revisionTargets", () => {
  it("picks reviewed questions with issues, and skips clean or not yet reviewed ones", () => {
    expect(revisionTargets(drafts(), 3).map((t) => t.question.id)).toEqual(["Q-L0-U05-001"]);
  });

  it("collects pre-review issues, a cross-solve disagreement and check failures of the question and its sentence", () => {
    writeDrafts(dir, unitId, {
      records: [
        record(s1.id, "sentence", { reasons: ["허용 어휘 밖: kicks", "유사도 미검사"] }),
        record("Q-L0-U05-001", "question", {
          reasons: ["사전 검수: x", "오답 오개념 누락: c"],
          crossSolve: { answer: "b", agrees: false },
          preReview: { issues: [issue] },
        }),
      ],
    });
    const [target] = revisionTargets(drafts(), 3);
    expect(target.issues).toEqual([
      issue,
      "다른 모델이 정답 대신 b를 골랐습니다. 정답이 하나로만 정해지는지 확인하세요.",
      "오답 오개념 누락: c",
      "문장: 허용 어휘 밖: kicks",
    ]);
  });

  it("stops after the last allowed revision and never touches approved or retired questions", () => {
    writeDrafts(dir, unitId, { questions: [question(1, s1.id, { version: 3 })] });
    expect(revisionTargets(drafts(), 3)).toEqual([]);
    writeDrafts(dir, unitId, { questions: [question(1, s1.id)], records: [record("Q-L0-U05-001", "question", { status: "retired", ...reviewed([issue]) })] });
    expect(revisionTargets(drafts(), 3)).toEqual([]);
  });

  it("lets the model change a sentence only when no other question uses it", () => {
    writeDrafts(dir, unitId, { records: [record("Q-L0-U05-003", "question", reviewed([issue]))] });
    const targets = revisionTargets(drafts(), 3);
    expect(targets.map((t) => [t.question.id, t.sentenceEditable])).toEqual([
      ["Q-L0-U05-001", true],
      ["Q-L0-U05-003", false],
    ]);
  });
});

describe("runRevise", () => {
  it("sends the question, its sentence and the issues, and saves the next version as a draft", async () => {
    const { runner, inputs } = runnerOf({ question: revisedQuestion() });
    const result = await runRevise(opts(runner));
    expect(result).toMatchObject({ calls: 1, revised: 1, failed: 0 });
    const input = JSON.parse(inputs[0]);
    expect(input).toMatchObject({ task: "revise", issues: [issue], sentence: { text: s1.text }, sentenceEditable: true });
    const saved = drafts().questions.find((q) => q.id === "Q-L0-U05-001")!;
    expect(saved).toMatchObject({
      sentenceId: s1.id,
      variantGroup: "VG-L0-U05-SUBJ",
      source: { type: "original", generatedBy: "ai_draft" },
      reviewStatus: "draft",
      version: 2,
      explanation: { summary: "이 문장에서 the cat이 주어입니다." },
    });
  });

  it("re-runs the checks and clears the old second opinions so they judge the new text", async () => {
    await runRevise(opts(runnerOf({ question: revisedQuestion() }).runner));
    const r = recordOf("Q-L0-U05-001");
    expect(r).toMatchObject({ status: "auto_checked", reasons: ["AI 수정 1회"], checks: { rules: "pass", vocab: "pass", similarity: "pass" } });
    expect(r.crossSolve).toBeUndefined();
    expect(r.preReview).toBeUndefined();
  });

  it("flags a revision that breaks a rule or leaves the word list", async () => {
    const options = [
      { id: "a", text: "the parrot" },
      { id: "b", text: "drinks" },
    ];
    await runRevise(opts(runnerOf({ question: revisedQuestion({ options }) }).runner));
    const r = recordOf("Q-L0-U05-001");
    expect(r.status).toBe("flagged");
    expect(r.reasons).toEqual(expect.arrayContaining(["허용 어휘 밖: parrot", "오답 오개념 누락: b", "AI 수정 1회"]));
  });

  it("saves a revised sentence and re-checks it", async () => {
    const sentenceOut = { ...s1, id: undefined, reviewStatus: undefined, text: "The bird sings.", tokens: ["The", "bird", "sings", "."] };
    await runRevise(opts(runnerOf({ question: revisedQuestion(), sentence: sentenceOut }).runner));
    expect(drafts().sentences.find((s) => s.id === s1.id)).toMatchObject({ text: "The bird sings.", reviewStatus: "draft" });
    expect(recordOf(s1.id)).toMatchObject({ status: "auto_checked", reasons: ["AI 수정 1회"] });
  });

  it("ignores a sentence the model returns for a shared sentence", async () => {
    writeDrafts(dir, unitId, { records: [record("Q-L0-U05-002", "question", { status: "auto_checked" }), record("Q-L0-U05-003", "question", reviewed([issue]))] });
    const sentenceOut = { ...s2, id: undefined, reviewStatus: undefined, text: "The bird sings.", tokens: ["The", "bird", "sings", "."] };
    await runRevise(opts(runnerOf({ question: revisedQuestion(), sentence: sentenceOut }).runner));
    expect(drafts().sentences.find((s) => s.id === s2.id)!.text).toBe(s2.text);
  });

  it("keeps the draft and logs why when a call fails or the output does not fit", async () => {
    const before = drafts();
    expect(await runRevise(opts(runnerOf(null, true).runner))).toMatchObject({ calls: 1, revised: 0, failed: 1 });
    await runRevise(opts(runnerOf({ wrong: true }).runner));
    expect(drafts()).toEqual(before);
    expect(logs.filter((l) => l.includes("실패"))).toEqual(["Q-L0-U05-001: 수정 실패 (usage limit)", "Q-L0-U05-001: 수정 실패 (출력이 스키마와 맞지 않음)"]);
  });

  it("stops at the call limit", async () => {
    writeDrafts(dir, unitId, { records: [record("Q-L0-U05-003", "question", reviewed([issue]))] });
    const { runner, inputs } = runnerOf({ question: revisedQuestion() });
    await runRevise(opts(runner, { limit: 1 }));
    expect(inputs).toHaveLength(1);
  });

  it("never approves anything", async () => {
    await runRevise(opts(runnerOf({ question: revisedQuestion() }).runner));
    expect(drafts().records.every((r) => r.status !== "approved")).toBe(true);
    expect(drafts().questions.every((q) => q.reviewStatus === "draft")).toBe(true);
  });
});
