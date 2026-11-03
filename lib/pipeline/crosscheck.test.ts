import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import type { ClaudeRunner } from "./claude-cli";
import { maskQuestion, runCrossCheck, runPreReview } from "./crosscheck";
import { readDrafts, writeDrafts } from "./draft-store";

let dir: string;
const now = new Date("2026-11-03T09:00:00+09:00");

const sentence: AnnotatedSentence = {
  id: "S-L0-U05-001",
  level: "L0",
  text: "The cat drinks milk.",
  tokens: ["The", "cat", "drinks", "milk", "."],
  spans: [],
  translation: "고양이가 우유를 마신다.",
  skills: ["subject_find"],
  reviewStatus: "draft",
};
const question: Question = {
  id: "Q-L0-U05-001",
  type: "multiple_choice",
  difficulty: 1,
  sentenceId: sentence.id,
  prompt: "주어는?",
  options: [
    { id: "a", text: "The cat" },
    { id: "b", text: "drinks", misconception: "verb_as_subject" },
  ],
  answer: "a",
  skills: ["subject_find"],
  explanation: { summary: "SECRET-EXPLANATION", byOption: { a: "SECRET-A" } },
  hints: { direction: "SECRET-HINT" },
  source: { type: "original", generatedBy: "ai_draft" },
  reviewStatus: "draft",
  version: 1,
};
const record = (id: string, kind: ReviewRecord["kind"]): ReviewRecord => ({
  id,
  kind,
  unitId: "L0-U05",
  status: "auto_checked",
  reasons: [],
  checks: { rules: "pass", vocab: "pass", tags: kind === "question" ? "pass" : "n/a", similarity: "pass" },
  generatedAt: now.toISOString(),
  reports: [],
});

const runnerOf = (json: unknown, fail = false) => {
  const inputs: string[] = [];
  const runner: ClaudeRunner = async ({ input }) => {
    inputs.push(input);
    return fail ? { ok: false, error: "timeout" } : { ok: true, json };
  };
  return { runner, inputs };
};
const opts = (runner: ClaudeRunner) => ({ contentDir: dir, unitId: "L0-U05", runner, model: "sonnet", now, log: () => {} });
const questionRecord = () => readDrafts(dir, "L0-U05").records.find((r) => r.id === question.id)!;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "crosscheck-"));
  writeDrafts(dir, "L0-U05", { sentences: [sentence], questions: [question], records: [record(sentence.id, "sentence"), record(question.id, "question")] });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("maskQuestion", () => {
  it("leaves out the answer, explanation, hints and distractor tags", () => {
    const masked = JSON.stringify(maskQuestion(question, sentence));
    expect(masked).toContain("The cat drinks milk.");
    for (const hidden of ['"answer"', "SECRET", "verb_as_subject"]) expect(masked).not.toContain(hidden);
  });
});

describe("runCrossCheck", () => {
  it("keeps an agreeing question auto_checked", async () => {
    const { runner, inputs } = runnerOf({ answer: "a" });
    await runCrossCheck(opts(runner));
    expect(questionRecord()).toMatchObject({ status: "auto_checked", crossSolve: { answer: "a", agrees: true } });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).not.toContain("SECRET");
  });

  it("flags a disagreement with the chosen answer", async () => {
    await runCrossCheck(opts(runnerOf({ answer: "b" }).runner));
    expect(questionRecord()).toMatchObject({ status: "flagged", crossSolve: { answer: "b", agrees: false } });
    expect(questionRecord().reasons).toContain("교차 풀이 불일치(고른 답: b)");
  });

  it("flags a failed call and does not treat the question as solved", async () => {
    await runCrossCheck(opts(runnerOf(null, true).runner));
    expect(questionRecord()).toMatchObject({ status: "flagged", reasons: ["교차 풀이 실패"] });
    expect(questionRecord().crossSolve).toBeUndefined();
  });

  it("skips questions already cross-solved", async () => {
    await runCrossCheck(opts(runnerOf({ answer: "a" }).runner));
    const again = runnerOf({ answer: "a" });
    await runCrossCheck(opts(again.runner));
    expect(again.inputs).toHaveLength(0);
  });
});

describe("runPreReview", () => {
  const review = (runner: ClaudeRunner) => runPreReview({ ...opts(runner), reviewerPrompt: "검수 기준" });

  it("records no issues and keeps the status", async () => {
    await review(runnerOf({ issues: [] }).runner);
    expect(questionRecord()).toMatchObject({ status: "auto_checked", preReview: { issues: [] } });
  });

  it("flags each issue", async () => {
    await review(runnerOf({ issues: ["정답이 둘일 수 있음"] }).runner);
    expect(questionRecord()).toMatchObject({ status: "flagged", reasons: ["사전 검수: 정답이 둘일 수 있음"] });
  });

  it("flags a failed call", async () => {
    await review(runnerOf(null, true).runner);
    expect(questionRecord()).toMatchObject({ status: "flagged", reasons: ["사전 검수 실패"] });
  });

  it("never approves anything", async () => {
    for (const json of [{ answer: "a" }, { answer: "b" }]) await runCrossCheck(opts(runnerOf(json).runner));
    for (const json of [{ issues: [] }, { issues: ["x"] }]) await review(runnerOf(json).runner);
    expect(readDrafts(dir, "L0-U05").records.every((r) => r.status !== "approved")).toBe(true);
  });
});
