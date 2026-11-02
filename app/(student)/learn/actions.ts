"use server";

// Grading and hints run here so answers and explanations never reach the page
// before the student submits (CLAUDE.md, DESIGN 9-2).
import { z } from "zod";
import {
  type AnswerResult,
  gradeAnswer,
  type Hint,
  hintFor,
  loadApprovedQuestion,
  loadMisconceptions,
} from "@/lib/content/learning";
import { Id } from "@/lib/schema/common";

const Level = z.union([z.literal(1), z.literal(2), z.literal(3)]);

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
