// AI revision of drafted questions from their own review notes (stage 8 follow-up):
// the pre-review issues, a cross-solve disagreement and failed checks go back to the
// generator, which fixes only those. The new version is a draft again, re-checked and
// sent through cross-solve and pre-review, so nothing here approves anything.
import { z } from "zod";
import { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import { AnnotatedSentence } from "@/lib/schema/sentence";
import { checkDraftGroup, type SimilarityResult } from "./checks";
import type { ClaudeRunner } from "./claude-cli";
import { type Drafts, readDrafts, writeDrafts } from "./draft-store";
import type { GroupContextOf } from "./group-context";
import { CALL_TIMEOUT_MS, catalogFiles, jsonSchema } from "./generate";
import { SYSTEM_PROMPT } from "./prompts";

// Version 1 is the generated draft, so 3 allows two revisions.
export const MAX_VERSION = 3;

const QuestionRevision = Question.omit({ id: true, lessonId: true, sentenceId: true, variantGroup: true, source: true, reviewStatus: true, version: true });
const SentenceRevision = AnnotatedSentence.omit({ id: true, reviewStatus: true });
const RevisionOutput = z.object({ question: QuestionRevision, sentence: SentenceRevision.optional() });

const REVISE_PROMPT = `${SYSTEM_PROMPT}

Task "revise": a reviewer listed problems in one of your draft questions. Return the corrected question, fixing every listed problem and changing nothing else.
- Keep the question type, the option ids and the misconception tags unless a problem is about them.
- Return "sentence" only when "sentenceEditable" is true and a problem needs the sentence changed; keep its tokens, spans and translation consistent.
- When "sentenceEditable" is false, fix the question without changing the sentence.
- Keep the same number of options: replace a faulty option instead of deleting it.
- "groupNote" is the unit's instruction for this question group (which spans to mark, how many options, what to avoid); follow it. Use only misconception ids listed in "misconceptions".`;

// Reasons from the automatic checks worth sending back to the model.
const CHECK_REASON = /^(규칙 위반|허용 어휘 밖|오답 오개념 누락|문장 번호 범위 밖)/;

export interface RevisionTarget {
  question: Question;
  sentence: AnnotatedSentence | undefined;
  sentenceEditable: boolean;
  issues: string[];
}

// Reviewed questions that still have something to fix and revisions left.
export function revisionTargets(drafts: Drafts, maxVersion: number): RevisionTarget[] {
  const recordOf = new Map(drafts.records.map((r) => [r.id, r]));
  const users = (sentenceId: string | undefined) =>
    drafts.questions.filter((q) => q.sentenceId === sentenceId && recordOf.get(q.id)?.status !== "retired").length;
  return drafts.questions.flatMap((question) => {
    const record = recordOf.get(question.id);
    if (!record || record.status === "approved" || record.status === "retired") return [];
    if (!record.preReview || question.version >= maxVersion) return [];
    const sentence = drafts.sentences.find((s) => s.id === question.sentenceId);
    const sentenceRecord = sentence && recordOf.get(sentence.id);
    const issues = [
      ...record.preReview.issues,
      ...(record.crossSolve && !record.crossSolve.agrees
        ? [`다른 모델이 정답 대신 ${record.crossSolve.answer ?? "다른 답"}를 골랐습니다. 정답이 하나로만 정해지는지 확인하세요.`]
        : []),
      ...record.reasons.filter((r) => CHECK_REASON.test(r)),
      ...(sentenceRecord?.reasons ?? []).filter((r) => CHECK_REASON.test(r)).map((r) => `문장: ${r}`),
    ];
    if (!issues.length) return [];
    const sentenceEditable = sentenceRecord !== undefined && sentenceRecord.status !== "approved" && users(sentence?.id) === 1;
    return [{ question, sentence, sentenceEditable, issues }];
  });
}

export interface ReviseOptions {
  contentDir: string;
  unitId: string;
  runner: ClaudeRunner;
  model: string;
  allowed: Set<string>;
  similarity: (items: { id: string; text: string }[]) => Promise<Map<string, SimilarityResult>>;
  limit?: number;
  maxVersion?: number;
  // The spec's note and misconceptions for the question's group.
  groupContext?: GroupContextOf;
  now: Date;
  log: (line: string) => void;
}

export interface ReviseResult {
  calls: number;
  revised: number;
  flagged: number;
  failed: number;
}

// A revised item's record: fresh check results and no second opinions, which judged the old text.
function revisedRecord(old: ReviewRecord, outcome: Pick<ReviewRecord, "status" | "reasons" | "checks">, round: number): ReviewRecord {
  const next: ReviewRecord = { ...old, ...outcome, reasons: [...outcome.reasons, `AI 수정 ${round}회`] };
  delete next.crossSolve;
  delete next.preReview;
  return next;
}

export async function runRevise(opts: ReviseOptions): Promise<ReviseResult> {
  const result: ReviseResult = { calls: 0, revised: 0, flagged: 0, failed: 0 };
  const targets = revisionTargets(readDrafts(opts.contentDir, opts.unitId), opts.maxVersion ?? MAX_VERSION);
  for (const target of targets) {
    if (opts.limit !== undefined && result.calls >= opts.limit) break;
    const { question, sentence, sentenceEditable, issues } = target;
    result.calls += 1;
    const context = opts.groupContext?.(question);
    opts.log(`${question.id}: 수정 중 (지적 ${issues.length}건)`);
    const response = await opts.runner({
      model: opts.model,
      schema: jsonSchema(RevisionOutput),
      systemPrompt: REVISE_PROMPT,
      input: JSON.stringify({
        task: "revise",
        question: QuestionRevision.parse(question),
        sentence,
        sentenceEditable,
        issues,
        ...(context ? { groupNote: context.note, misconceptions: context.misconceptions } : {}),
      }),
      timeoutMs: CALL_TIMEOUT_MS,
    });
    const parsed = response.ok ? RevisionOutput.safeParse(response.json) : null;
    if (!parsed?.success) {
      result.failed += 1;
      opts.log(`${question.id}: 수정 실패 (${response.ok ? "출력이 스키마와 맞지 않음" : response.error})`);
      continue;
    }

    const round = question.version;
    const revised: Question = {
      ...parsed.data.question,
      id: question.id,
      ...(question.lessonId ? { lessonId: question.lessonId } : {}),
      ...(question.sentenceId ? { sentenceId: question.sentenceId } : {}),
      ...(question.variantGroup ? { variantGroup: question.variantGroup } : {}),
      source: question.source,
      reviewStatus: "draft",
      version: question.version + 1,
    };
    const newSentence = sentence && sentenceEditable && parsed.data.sentence ? { ...parsed.data.sentence, id: sentence.id, reviewStatus: "draft" as const } : undefined;
    const sentences = newSentence ? [newSentence] : sentence ? [sentence] : [];
    const similarity = await opts.similarity([
      ...(newSentence ? [{ id: newSentence.id, text: newSentence.text }] : []),
      { id: revised.id, text: [revised.prompt, ...revised.options.map((o) => o.text)].join(" ") },
    ]);
    const checked = checkDraftGroup({ sentences, questions: [revised], catalog: catalogFiles(opts.contentDir), allowed: opts.allowed, similarity });

    const records = readDrafts(opts.contentDir, opts.unitId).records;
    const recordOf = (id: string) => records.find((r) => r.id === id)!;
    const questionRecord = revisedRecord(recordOf(revised.id), checked.get(revised.id)!, round);
    const update: Partial<Drafts> = { questions: [revised], records: [questionRecord] };
    if (newSentence) {
      update.sentences = [newSentence];
      update.records!.push(revisedRecord(recordOf(newSentence.id), checked.get(newSentence.id)!, round));
    }
    writeDrafts(opts.contentDir, opts.unitId, update);
    result.revised += 1;
    if (questionRecord.status === "flagged") result.flagged += 1;
  }
  return result;
}
