// Automatic checks every draft goes through before a person sees it (DESIGN 6-2 step 3).
import { checkContent, type ContentFile } from "@/lib/schema/content-rules";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import { outOfRange } from "./vocab-range";

export type SimilarityResult = "pass" | "fail" | "skipped";
export type CheckOutcome = Pick<ReviewRecord, "status" | "reasons" | "checks">;

export function missingDistractorTags(q: Question): string[] {
  return q.options.filter((o) => o.id !== q.answer && !o.misconception && !o.trap).map((o) => o.id);
}

const englishWords = (text: string): string[] => text.split(/\s+/).map((w) => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, ""));

export interface DraftGroup {
  sentences: AnnotatedSentence[];
  questions: Question[];
  // Approved and draft catalogue files the drafts may reference.
  catalog: ContentFile[];
  allowed: Set<string>;
  similarity: Map<string, SimilarityResult>;
}

export function checkDraftGroup({ sentences, questions, catalog, allowed, similarity }: DraftGroup): Map<string, CheckOutcome> {
  const issues = checkContent(
    [...catalog, { path: "sentences", kind: "sentence", data: sentences }, { path: "questions", kind: "question", data: questions }],
    { mode: "full", requireApproved: false, requireFixtureIds: false },
  );
  const items: { id: string; words: string[]; untagged: string[] | null }[] = [
    ...sentences.map((s) => ({ id: s.id, words: s.tokens, untagged: null })),
    ...questions.map((q) => ({ id: q.id, words: q.options.flatMap((o) => englishWords(o.text)), untagged: missingDistractorTags(q) })),
  ];
  const result = new Map<string, CheckOutcome>();
  for (const { id, words, untagged } of items) {
    const reasons = issues.filter((i) => i.itemId === id).map((i) => `규칙 위반: ${i.message}`);
    const extra = outOfRange(words, allowed);
    if (extra.length) reasons.push(`허용 어휘 밖: ${extra.join(", ")}`);
    if (untagged?.length) reasons.push(`오답 오개념 누락: ${untagged.join(", ")}`);
    const sim = similarity.get(id) ?? "skipped";
    if (sim === "fail") reasons.push("기출 유사");
    if (sim === "skipped") reasons.push("유사도 미검사");
    const checks: CheckOutcome["checks"] = {
      rules: reasons.some((r) => r.startsWith("규칙 위반")) ? "fail" : "pass",
      vocab: extra.length ? "fail" : "pass",
      tags: untagged === null ? "n/a" : untagged.length ? "fail" : "pass",
      similarity: sim,
    };
    const ok = checks.rules === "pass" && checks.vocab === "pass" && checks.tags !== "fail" && sim !== "fail";
    // A skipped similarity check still lets the item be auto_checked; isClean keeps it out of batches.
    result.set(id, { status: ok ? "auto_checked" : "flagged", reasons, checks });
  }
  return result;
}

// Clean items may be approved in a sampled batch (stage 8 design §6).
// Questions also need an agreeing cross-solve and a pre-review with no issues;
// units and catalogue entries are always approved one by one.
export function isClean(r: ReviewRecord): boolean {
  if (r.status !== "auto_checked" || r.checks.similarity !== "pass") return false;
  if (r.kind === "question") return r.crossSolve?.agrees === true && r.preReview !== undefined && r.preReview.issues.length === 0;
  return r.kind === "sentence" || r.kind === "vocabulary";
}
