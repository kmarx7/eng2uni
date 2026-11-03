"use server";

// Grading, hints and sentence-task checks run here so answers, explanations and
// sentence annotations never reach the page before the student acts (CLAUDE.md,
// DESIGN 9-2).
import { z } from "zod";
import {
  type AnswerResult,
  buildResult,
  type BuildResult,
  gradeAnswer,
  type Hint,
  hintFor,
  loadApprovedQuestion,
  loadApprovedSentence,
  loadMisconceptions,
  tagResult,
  type TagResult,
} from "@/lib/content/learning";
import { Id } from "@/lib/schema/common";
import { appendReport, NOTE_MAX, ReportReason } from "@/lib/pipeline/reports";

const Level = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const RoleSym = z.enum(["S", "V", "O"]);
const Index = z.number().int().min(0).max(200);

function approved(questionId: unknown) {
  const id = Id.parse(questionId);
  const question = loadApprovedQuestion(id);
  if (!question) throw new Error(`question ${id} is not available`);
  return question;
}

export async function submitAnswer(questionId: string, optionId: string): Promise<AnswerResult> {
  return gradeAnswer(approved(questionId), Id.parse(optionId), loadMisconceptions());
}

export async function requestHint(questionId: string, level: 1 | 2 | 3): Promise<Hint> {
  return hintFor(approved(questionId), Level.parse(level));
}

function approvedSentence(sentenceId: unknown) {
  const id = Id.parse(sentenceId);
  const sentence = loadApprovedSentence(id);
  if (!sentence) throw new Error(`sentence ${id} is not available`);
  return sentence;
}

export async function tagRole(
  sentenceId: string,
  symbol: "S" | "V" | "O",
  range: [number, number],
  tagged: ("S" | "V" | "O")[],
): Promise<TagResult> {
  return tagResult(approvedSentence(sentenceId), RoleSym.parse(symbol), z.tuple([Index, Index]).parse(range), z.array(RoleSym).max(3).parse(tagged));
}

export async function checkBuiltSentence(sentenceId: string, words: string[]): Promise<BuildResult> {
  return buildResult(approvedSentence(sentenceId), z.array(z.string().max(60)).max(60).parse(words));
}

// Only where reports can be stored (local or self-hosted, ENABLE_REPORTS=1).
export async function reportQuestion(questionId: string, reason: string, note: string): Promise<{ ok: boolean }> {
  if (process.env.ENABLE_REPORTS !== "1") return { ok: false };
  const result = appendReport(process.env.REPORTS_DIR ?? "data/reports", process.env.CONTENT_DIR ?? "content", {
    questionId: Id.parse(questionId),
    reason: ReportReason.parse(reason),
    note: z.string().max(NOTE_MAX * 4).parse(note),
    at: new Date().toISOString(),
  });
  return { ok: result.ok };
}
