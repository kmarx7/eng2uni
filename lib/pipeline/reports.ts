// "문제 오류 신고" (stage 8 §8). Reports are appended to a local JSONL file outside
// content/; `npm run content:reports` later retires each reported question so it
// leaves student screens and goes back to the review queue (DESIGN 6-3).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Id } from "@/lib/schema/common";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import { readDrafts, readJsonArray, writeDrafts, writeJsonAtomic } from "./draft-store";

export const ReportReason = z.enum(["answer", "explanation", "sentence", "other"]);
export type ReportReason = z.infer<typeof ReportReason>;

export const REASON_LABEL: Record<ReportReason, string> = {
  answer: "정답 오류",
  explanation: "해설 오류",
  sentence: "문장 이상",
  other: "기타",
};

export const Report = z.object({
  questionId: Id,
  reason: ReportReason,
  note: z.string().optional(),
  at: z.string(),
});
export type Report = z.infer<typeof Report>;

export const NOTE_MAX = 300;
export const REPORTS_FILE = "reports.jsonl";

// The approved question file that holds an id, if any.
function approvedQuestionFile(contentDir: string, questionId: string): string | undefined {
  const dir = path.join(contentDir, "questions");
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .find((f) => readJsonArray<Question>(f).some((q) => q.id === questionId && q.reviewStatus === "approved"));
}

export function appendReport(reportsDir: string, contentDir: string, input: Report): { ok: true } | { ok: false; error: string } {
  const parsed = Report.safeParse(input);
  if (!parsed.success) return { ok: false, error: "신고 내용을 읽지 못했습니다" };
  if (!approvedQuestionFile(contentDir, parsed.data.questionId)) return { ok: false, error: "신고할 문항을 찾지 못했습니다" };
  const note = parsed.data.note?.trim().slice(0, NOTE_MAX);
  mkdirSync(reportsDir, { recursive: true });
  appendFileSync(path.join(reportsDir, REPORTS_FILE), `${JSON.stringify({ ...parsed.data, ...(note ? { note } : { note: undefined }) })}\n`);
  return { ok: true };
}

function readReports(reportsFile: string): Report[] {
  if (!existsSync(reportsFile)) return [];
  return readFileSync(reportsFile, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        const parsed = Report.safeParse(JSON.parse(line));
        return parsed.success ? [parsed.data] : [];
      } catch {
        return [];
      }
    });
}

export interface ReportSummary {
  questionId: string;
  count: number;
  reasons: string[];
  notes: string[];
}

// Pending reports grouped by question, for a person to read before applying them.
export function summarizeReports(reportsFile: string): ReportSummary[] {
  const byQuestion = new Map<string, ReportSummary>();
  for (const r of readReports(reportsFile)) {
    const entry = byQuestion.get(r.questionId) ?? { questionId: r.questionId, count: 0, reasons: [], notes: [] };
    entry.count += 1;
    if (!entry.reasons.includes(REASON_LABEL[r.reason])) entry.reasons.push(REASON_LABEL[r.reason]);
    if (r.note) entry.notes.push(r.note);
    byQuestion.set(r.questionId, entry);
  }
  return [...byQuestion.values()];
}

// Returns how many questions were sent back to review.
export function applyReports(contentDir: string, reportsFile: string, now: Date): number {
  if (!existsSync(reportsFile)) return 0;
  const reports = readReports(reportsFile);
  const handled = new Set<string>();
  for (const report of reports) {
    const file = approvedQuestionFile(contentDir, report.questionId);
    const unitId = file ? path.basename(file, ".json") : findRecordUnit(contentDir, report.questionId);
    if (!unitId) continue;
    const entry = { at: report.at, reason: report.reason, ...(report.note ? { note: report.note } : {}) };
    const reason = `학생 신고: ${REASON_LABEL[report.reason]}`;
    const existing = readDrafts(contentDir, unitId).records.find((r) => r.id === report.questionId);
    if (file) {
      const questions = readJsonArray<Question>(file);
      const question = questions.find((q) => q.id === report.questionId)!;
      writeJsonAtomic(file, questions.map((q) => (q.id === report.questionId ? { ...q, reviewStatus: "retired" } : q)));
      writeDrafts(contentDir, unitId, { questions: [{ ...question, reviewStatus: "draft" }] });
      handled.add(report.questionId);
    }
    const base: ReviewRecord = existing ?? {
      id: report.questionId,
      kind: "question",
      unitId,
      status: "flagged",
      reasons: [],
      checks: { rules: "pass", vocab: "pass", tags: "pass", similarity: "skipped" },
      generatedAt: now.toISOString(),
      reports: [],
    };
    const record: ReviewRecord = {
      ...base,
      status: "flagged",
      reasons: base.reasons.includes(reason) ? base.reasons : [...base.reasons, reason],
      reports: [...base.reports, entry],
    };
    delete record.reviewedBy;
    delete record.reviewedAt;
    writeDrafts(contentDir, unitId, { records: [record] });
  }
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  renameSync(reportsFile, path.join(path.dirname(reportsFile), `reports-${stamp}.processed.jsonl`));
  return handled.size;
}

function findRecordUnit(contentDir: string, questionId: string): string | undefined {
  const dir = path.join(contentDir, "drafts", "records");
  if (!existsSync(dir)) return undefined;
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .find((unitId) => readDrafts(contentDir, unitId).records.some((r) => r.id === questionId));
}
