// Second opinions on drafted questions (DESIGN 6-2 step 4): a cross-solve with
// the answer hidden, and a pre-review against the content-reviewer criteria.
// Either one can only flag an item; approval stays with a person.
import path from "node:path";
import { z } from "zod";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import type { ClaudeRunner, RunnerResult } from "./claude-cli";
import type { Misconception } from "@/lib/schema/curriculum";
import { CATALOG_FILES, readDrafts, readJsonArray, writeDrafts } from "./draft-store";
import { HOUSE_RULES } from "./prompts";

const TIMEOUT_MS = 300_000;

export interface MaskedQuestion {
  prompt: string;
  options: { id: string; text: string }[];
  sentenceText?: string;
}

export function maskQuestion(q: Question, sentence?: AnnotatedSentence): MaskedQuestion {
  return {
    prompt: q.prompt,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    ...(sentence ? { sentenceText: sentence.text } : {}),
  };
}

export interface SecondOpinionOptions {
  contentDir: string;
  unitId: string;
  runner: ClaudeRunner;
  model: string;
  limit?: number;
  now: Date;
  log: (line: string) => void;
}

export interface SecondOpinionResult {
  calls: number;
  flagged: number;
  failed: number;
}

const CROSS_SOLVE_PROMPT = `You are a careful student taking an English reading quiz written for Korean high-school beginners.
Read the question and choose the single best option. Reply with the option id only, in the "answer" field.`;

const SolveOutput = z.object({ answer: z.string() });
const ReviewOutput = z.object({ issues: z.array(z.string().min(1)) });

// Why a call gave nothing usable, for the run log (e.g. a usage limit or a timeout).
const failureReason = (response: RunnerResult) => (response.ok ? "출력이 스키마와 맞지 않음" : response.error);

const flag = (r: ReviewRecord, reason: string): ReviewRecord => ({ ...r, status: "flagged", reasons: [...r.reasons, reason] });

// Runs one call per question that still lacks this opinion, saving after each.
async function eachQuestion(
  opts: SecondOpinionOptions,
  needs: (r: ReviewRecord) => boolean,
  ask: (q: Question, sentence: AnnotatedSentence | undefined) => Promise<(r: ReviewRecord) => ReviewRecord>,
): Promise<SecondOpinionResult> {
  const result: SecondOpinionResult = { calls: 0, flagged: 0, failed: 0 };
  const drafts = readDrafts(opts.contentDir, opts.unitId);
  for (const record of drafts.records) {
    if (record.kind !== "question" || record.status === "retired" || record.status === "approved" || !needs(record)) continue;
    const question = drafts.questions.find((q) => q.id === record.id);
    if (!question) continue;
    if (opts.limit !== undefined && result.calls >= opts.limit) break;
    result.calls += 1;
    const update = await ask(question, drafts.sentences.find((s) => s.id === question.sentenceId));
    const current = readDrafts(opts.contentDir, opts.unitId).records.find((r) => r.id === record.id) ?? record;
    const next = update(current);
    if (next.status === "flagged" && current.status !== "flagged") result.flagged += 1;
    writeDrafts(opts.contentDir, opts.unitId, { records: [next] });
  }
  return result;
}

export async function runCrossCheck(opts: SecondOpinionOptions): Promise<SecondOpinionResult> {
  let failed = 0;
  const result = await eachQuestion(
    opts,
    (r) => r.crossSolve === undefined && !r.reasons.includes("교차 풀이 실패"),
    async (q, sentence) => {
      const response = await opts.runner({
        model: opts.model,
        schema: z.toJSONSchema(SolveOutput, { target: "draft-7" }) as Record<string, unknown>,
        systemPrompt: CROSS_SOLVE_PROMPT,
        input: JSON.stringify(maskQuestion(q, sentence)),
        timeoutMs: TIMEOUT_MS,
      });
      const parsed = response.ok ? SolveOutput.safeParse(response.json) : null;
      if (!parsed?.success) {
        failed += 1;
        opts.log(`${q.id}: 교차 풀이 실패 (${failureReason(response)})`);
        return (r) => flag(r, "교차 풀이 실패");
      }
      const answer = parsed.data.answer;
      const agrees = answer === q.answer;
      return (r) => {
        const solved = { ...r, crossSolve: { answer: q.options.some((o) => o.id === answer) ? answer : null, agrees } };
        return agrees ? solved : flag(solved, `교차 풀이 불일치(고른 답: ${answer})`);
      };
    },
  );
  return { ...result, failed };
}

export async function runPreReview(opts: SecondOpinionOptions & { reviewerPrompt: string }): Promise<SecondOpinionResult> {
  let failed = 0;
  const systemPrompt = `${opts.reviewerPrompt}

You are reviewing one AI-drafted question before a teacher sees it. List concrete problems only: a wrong or doubtful answer, more than one defensible answer, an unclear sentence, unnatural English, content above the beginner level, a wrong explanation, or a wrong misconception tag. Write each issue as one short Korean sentence. Return an empty list when there is nothing to fix.

${HOUSE_RULES}`;
  const misconceptions = [opts.contentDir, path.join(opts.contentDir, "drafts")]
    .flatMap((dir) => readJsonArray<Misconception>(path.join(dir, CATALOG_FILES.misconceptions)))
    .map((m) => ({ id: m.id, description: m.description }));
  const result = await eachQuestion(
    opts,
    (r) => r.preReview === undefined && !r.reasons.includes("사전 검수 실패"),
    async (q, sentence) => {
      const response = await opts.runner({
        model: opts.model,
        schema: z.toJSONSchema(ReviewOutput, { target: "draft-7" }) as Record<string, unknown>,
        systemPrompt,
        input: JSON.stringify({
          question: q,
          sentence,
          misconceptions: misconceptions.filter((m) => q.options.some((o) => o.misconception === m.id)),
        }),
        timeoutMs: TIMEOUT_MS,
      });
      const parsed = response.ok ? ReviewOutput.safeParse(response.json) : null;
      if (!parsed?.success) {
        failed += 1;
        opts.log(`${q.id}: 사전 검수 실패 (${failureReason(response)})`);
        return (r) => flag(r, "사전 검수 실패");
      }
      const { issues } = parsed.data;
      return (r) => issues.reduce<ReviewRecord>((acc, issue) => flag(acc, `사전 검수: ${issue}`), { ...r, preReview: { issues } });
    },
  );
  return { ...result, failed };
}
