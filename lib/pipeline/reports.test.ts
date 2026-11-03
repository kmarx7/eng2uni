import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadUnitBundle } from "@/lib/content/learning";
import { validateContentTree } from "@/lib/schema/content-tree";
import { readDrafts, writeJsonAtomic } from "./draft-store";
import { appendReport, applyReports } from "./reports";

let dir: string;
let contentDir: string;
let reportsDir: string;
const now = new Date("2026-11-03T09:00:00+09:00");
const Q = "Q-L0-U05-001";

const question = {
  id: Q,
  type: "true_false",
  difficulty: 1,
  prompt: "맞으면 T",
  options: [
    { id: "T", text: "맞다" },
    { id: "F", text: "틀리다", misconception: "verb_as_subject" },
  ],
  answer: "T",
  skills: ["subject_find"],
  explanation: { summary: "요약", byOption: {} },
  source: { type: "original", generatedBy: "ai_draft", reviewedBy: "kim" },
  reviewStatus: "approved",
  version: 1,
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "reports-"));
  contentDir = path.join(dir, "content");
  reportsDir = path.join(dir, "reports");
  writeJsonAtomic(path.join(contentDir, "skills.json"), [{ id: "subject_find", name: "주어", category: "syntax", prerequisiteIds: [] }]);
  writeJsonAtomic(path.join(contentDir, "misconceptions.json"), [{ id: "verb_as_subject", skillId: "subject_find", category: "SYN", description: "d" }]);
  writeJsonAtomic(path.join(contentDir, "questions/L0-U05.json"), [question]);
  writeJsonAtomic(path.join(contentDir, "units/L0-U05.json"), [
    {
      id: "L0-U05",
      levelId: "L0",
      order: 5,
      title: "주어",
      skills: ["subject_find"],
      blocks: [{ id: "L0-U05-B01", type: "assessment", questionIds: [Q] }],
      reviewStatus: "approved",
      version: 1,
    },
  ]);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("appendReport", () => {
  it("records a report on an approved question, with the note cut to 300 characters", () => {
    expect(appendReport(reportsDir, contentDir, { questionId: Q, reason: "answer", note: "x".repeat(400), at: now.toISOString() })).toEqual({ ok: true });
    const line = JSON.parse(readFileSync(path.join(reportsDir, "reports.jsonl"), "utf8").trim());
    expect(line).toMatchObject({ questionId: Q, reason: "answer" });
    expect(line.note).toHaveLength(300);
  });

  it("refuses an id that is not an approved question", () => {
    expect(appendReport(reportsDir, contentDir, { questionId: "Q-NOPE", reason: "other", at: now.toISOString() })).toMatchObject({ ok: false });
    expect(existsSync(path.join(reportsDir, "reports.jsonl"))).toBe(false);
  });
});

describe("applyReports", () => {
  it("retires reported questions, sends them back to review and rotates the file", () => {
    appendReport(reportsDir, contentDir, { questionId: Q, reason: "answer", at: now.toISOString() });
    expect(applyReports(contentDir, path.join(reportsDir, "reports.jsonl"), now)).toBe(1);

    expect(loadUnitBundle("L0-U05", contentDir)?.questions.map((q) => q.id)).toEqual([]);
    expect(JSON.parse(readFileSync(path.join(contentDir, "questions/L0-U05.json"), "utf8"))[0].reviewStatus).toBe("retired");
    const drafts = readDrafts(contentDir, "L0-U05");
    expect(drafts.questions[0]).toMatchObject({ id: Q, reviewStatus: "draft" });
    expect(drafts.records[0]).toMatchObject({ id: Q, status: "flagged", reasons: ["학생 신고: 정답 오류"], reports: [{ reason: "answer" }] });
    expect(readdirSync(reportsDir)).toEqual([expect.stringMatching(/^reports-.*\.processed\.jsonl$/)]);
    expect(validateContentTree(contentDir).flatMap((r) => r.issues)).toEqual([]);
  });

  it("does nothing without a reports file", () => {
    expect(applyReports(contentDir, path.join(reportsDir, "reports.jsonl"), now)).toBe(0);
  });
});
