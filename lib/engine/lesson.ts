// Unit flow (DESIGN 5-1, 5-2): the linear blocks, then whatever the judgment calls
// for. A pure reducer over LessonState, so the screen only renders currentStep and
// dispatches what the student did; the state is saved with the rest of progress.
import type { LessonBlock, Unit } from "@/lib/schema/curriculum";
import type { LessonAttempt, LessonState, Shortage } from "@/lib/schema/progress";
import { countsAsCorrect } from "./grade";
import { judgeMastery, type MasteryJudgment, topMisconception } from "./mastery";
import { pickVariant, type VariantCandidate } from "./variants";

export const REMEDIAL_QUESTIONS = 4;
export const FOUNDATION_QUESTIONS = 3;
export const FOUNDATION_PASS = 2;

export interface LessonQuestionMeta extends VariantCandidate {
  skills: string[];
}

export interface LessonContext {
  unit: Unit;
  // The unit's questions plus their variants and prerequisite questions.
  questions: LessonQuestionMeta[];
  misconceptions: { id: string; remedialBlockId?: string }[];
  prerequisiteQuestionIds: string[];
  // Every question this student has answered anywhere.
  seen: ReadonlySet<string>;
}

export type LessonAction =
  | { type: "blockDone" }
  | { type: "analyzerDone"; passed: boolean }
  | { type: "answered"; attempt: LessonAttempt }
  // From a held judgment or a failed foundation check: a new round of variants.
  | { type: "retry" };

export type LessonStep =
  | { kind: "block"; block: LessonBlock }
  | { kind: "question"; questionId: string; block: LessonBlock | null }
  | { kind: "result" };

interface Result {
  state: LessonState;
  shortages: Shortage[];
}

// Remedial and contrast blocks run only when a judgment sends the student there.
export function flowBlocks(unit: Unit): LessonBlock[] {
  return unit.blocks.filter((b) => b.type !== "remedial" && b.type !== "contrast");
}

function assessmentIds(unit: Unit): string[] {
  return unit.blocks.flatMap((b) => (b.type === "assessment" ? b.questionIds : []));
}

function remedialBlock(unit: Unit, misconceptions: LessonContext["misconceptions"], misconception: string | undefined): LessonBlock | undefined {
  if (!misconception) return undefined;
  const inUnit = unit.blocks.find((b) => b.type === "remedial" && b.misconceptionId === misconception);
  if (inUnit) return inUnit;
  const linked = misconceptions.find((m) => m.id === misconception)?.remedialBlockId;
  return unit.blocks.find((b) => b.id === linked);
}

function contrastBlock(unit: Unit, misconception: string | undefined): LessonBlock | undefined {
  return unit.blocks.find((b) => b.type === "contrast" && misconception !== undefined && b.misconceptionIds.includes(misconception));
}

// misconceptions lets a remedial block linked from a misconception (not tagged
// with it) be found; enterRemedial uses the same lookup.
export function currentStep(state: LessonState, unit: Unit, misconceptions: LessonContext["misconceptions"] = []): LessonStep {
  if (state.phase === "result") return { kind: "result" };
  if (state.phase === "main") {
    const block = flowBlocks(unit)[state.blockIndex];
    if (!block) return { kind: "result" };
    if (state.queue[0]) return { kind: "question", questionId: state.queue[0], block };
    return { kind: "block", block };
  }
  // In the other phases blockIndex 0 shows the phase's block, 1 runs its questions.
  if (state.blockIndex === 0) {
    const block =
      state.phase === "contrast"
        ? contrastBlock(unit, state.focusMisconception)
        : state.phase === "remedial"
          ? remedialBlock(unit, misconceptions, state.focusMisconception)
          : undefined;
    if (block) return { kind: "block", block };
  }
  return state.queue[0] ? { kind: "question", questionId: state.queue[0], block: null } : { kind: "result" };
}

export function startLesson(ctx: LessonContext, now: Date): LessonState {
  const state: LessonState = {
    unitId: ctx.unit.id,
    status: "in_progress",
    phase: "main",
    blockIndex: 0,
    queue: [],
    round: 0,
    attempts: [],
    // A unit without a tagging task has no analyzer task to pass.
    analyzerPassed: !flowBlocks(ctx.unit).some((b) => b.type === "sentence_task" && b.interaction === "role_tagging"),
    updatedAt: now.toISOString(),
  };
  return enterBlock(state, 0, ctx, now, []).state;
}

export function lessonReducer(state: LessonState, action: LessonAction, ctx: LessonContext, now: Date): Result {
  const shortages: Shortage[] = [];
  const stamp = (next: LessonState): Result => ({ state: { ...next, updatedAt: now.toISOString() }, shortages });

  switch (action.type) {
    case "analyzerDone":
      if (state.phase !== "main") return { state, shortages };
      return stamp(enterBlock({ ...state, analyzerPassed: action.passed }, state.blockIndex + 1, ctx, now, shortages).state);
    case "blockDone":
      return stamp(blockDone(state, ctx, now, shortages));
    case "answered":
      return answered(state, action.attempt, ctx, now, shortages, stamp);
    case "retry":
      return canRetry(state) ? stamp(enterReassessment(state, ctx, now, shortages)) : { state, shortages };
  }
}

// A result the student cannot continue from: a held judgment (too few questions)
// or a failed foundation check. Retrying asks a new round of variants, which is
// held again when none are left.
export function canRetry(state: LessonState): boolean {
  if (state.phase !== "result") return false;
  if (state.judgment === "foundation_check") return state.attempts.some((a) => a.phase === "foundation" && a.round === state.round);
  return state.judgment === "learning" && state.analyzerPassed;
}

// Saved progress can outlive the content it was planned from (a question no
// longer approved, blocks removed). Drops what the unit no longer has and moves
// on from there; null when the lesson still fits.
export function reconcileLesson(state: LessonState, ctx: LessonContext, now: Date): LessonState | null {
  const known = new Set(ctx.questions.map((q) => q.id));
  const queue = state.queue.filter((id) => known.has(id));
  const blocks = flowBlocks(ctx.unit);
  const pastEnd = state.phase === "main" && state.blockIndex >= blocks.length;
  if (queue.length === state.queue.length && !pastEnd) return null;
  const next = { ...state, queue, updatedAt: now.toISOString() };
  if (pastEnd) return judge({ ...next, queue: [] }, ctx);
  if (queue.length) return next;
  const shortages: Shortage[] = [];
  switch (state.phase) {
    case "main":
      return blocks[state.blockIndex].type === "assessment" ? judge(next, ctx) : enterBlock(next, state.blockIndex + 1, ctx, now, shortages).state;
    case "remedial":
      return enterReassessment(next, ctx, now, shortages);
    case "foundation":
      return enterRemedial(next, ctx, now, shortages);
    default:
      return judge(next, ctx);
  }
}

function blockDone(state: LessonState, ctx: LessonContext, now: Date, shortages: Shortage[]): LessonState {
  switch (state.phase) {
    case "main":
      return enterBlock(state, state.blockIndex + 1, ctx, now, shortages).state;
    case "contrast":
      return enterRemedial(state, ctx, now, shortages);
    case "remedial":
      return state.queue.length ? { ...state, blockIndex: 1 } : enterReassessment(state, ctx, now, shortages);
    case "result":
      return continueFromResult(state, ctx, now, shortages);
    default:
      return state;
  }
}

function answered(
  state: LessonState,
  attempt: LessonAttempt,
  ctx: LessonContext,
  now: Date,
  shortages: Shortage[],
  stamp: (s: LessonState) => Result,
): Result {
  const duplicate = state.attempts.some((a) => a.questionId === attempt.questionId && a.round === attempt.round && a.phase === attempt.phase);
  if (duplicate || state.queue[0] !== attempt.questionId) return { state, shortages };
  let next: LessonState = { ...state, attempts: [...state.attempts, attempt], queue: state.queue.slice(1) };

  const block = state.phase === "main" ? flowBlocks(ctx.unit)[state.blockIndex] : undefined;
  if (block?.type === "practice" && !attempt.correct) {
    const group = ctx.questions.find((q) => q.id === attempt.questionId)?.variantGroup;
    const variant = group ? pickVariant(ctx.questions, group, excluded(next, ctx, assessmentIds(ctx.unit))) : null;
    if (variant) next = { ...next, queue: [variant, ...next.queue] };
    else shortages.push({ at: now.toISOString(), unitId: ctx.unit.id, ...(group ? { variantGroup: group } : {}) });
  }
  if (next.queue.length) return stamp(next);

  switch (next.phase) {
    case "main":
      return stamp(block?.type === "assessment" ? judge(next, ctx) : enterBlock(next, next.blockIndex + 1, ctx, now, shortages).state);
    case "remedial":
      return stamp(enterReassessment(next, ctx, now, shortages));
    case "reassessment":
      return stamp(judge(next, ctx));
    case "foundation": {
      const passed = next.attempts.filter((a) => a.phase === "foundation" && a.round === next.round && countsAsCorrect(a)).length;
      return stamp(passed >= FOUNDATION_PASS ? enterRemedial(next, ctx, now, shortages) : { ...next, phase: "result", judgment: "foundation_check" });
    }
    default:
      return stamp(next);
  }
}

function excluded(state: LessonState, ctx: LessonContext, extra: string[] = []): Set<string> {
  return new Set([...ctx.seen, ...state.attempts.map((a) => a.questionId), ...state.queue, ...extra]);
}

function unanswered(ids: string[], state: LessonState, ctx: LessonContext): string[] {
  const skip = excluded({ ...state, queue: [] }, ctx);
  return ids.filter((id) => !skip.has(id));
}

// Moves to flow block `index`, filling the question queue; question blocks with
// nothing left to ask are passed over (an empty assessment is judged).
function enterBlock(state: LessonState, index: number, ctx: LessonContext, now: Date, shortages: Shortage[]): Result {
  const blocks = flowBlocks(ctx.unit);
  const block = blocks[index];
  if (!block) return { state: judge({ ...state, blockIndex: index, queue: [] }, ctx), shortages };
  const ids = block.type === "practice" || block.type === "assessment" ? block.questionIds : block.type === "predict" ? [block.questionId] : null;
  if (!ids) return { state: { ...state, phase: "main", blockIndex: index, queue: [] }, shortages };
  const queue = unanswered(ids, state, ctx);
  const next: LessonState = { ...state, phase: "main", blockIndex: index, queue };
  if (queue.length) return { state: next, shortages };
  return block.type === "assessment" ? { state: judge(next, ctx), shortages } : enterBlock(next, index + 1, ctx, now, shortages);
}

function roundAttempts(state: LessonState, ctx: Pick<LessonContext, "unit">): LessonAttempt[] {
  if (state.round === 0) {
    const ids = new Set(assessmentIds(ctx.unit));
    return state.attempts.filter((a) => a.phase === "main" && a.round === 0 && ids.has(a.questionId));
  }
  return state.attempts.filter((a) => a.phase === "reassessment" && a.round === state.round);
}

// Credited answers out of all answers in the round being judged, for the result screen.
export function roundScore(state: LessonState, unit: Unit): { correct: number; total: number } {
  const attempts = roundAttempts(state, { unit });
  return { correct: attempts.filter(countsAsCorrect).length, total: attempts.length };
}

// Delayed checks happen on another day through skill review, never inside the unit.
function judgment(state: LessonState, ctx: LessonContext): MasteryJudgment {
  return judgeMastery({ attempts: roundAttempts(state, ctx), analyzerPassed: state.analyzerPassed, delayedCheckPassed: false });
}

function judge(state: LessonState, ctx: LessonContext): LessonState {
  const j = judgment(state, ctx);
  const focus = j.misconception ?? topMisconception(roundAttempts(state, ctx));
  const rest = { ...state };
  delete rest.focusMisconception;
  return {
    ...rest,
    phase: "result",
    queue: [],
    judgment: j.status,
    status: j.status === "can_progress" ? "awaiting_delayed_check" : j.status === "mastered" ? "passed" : "in_progress",
    ...(focus ? { focusMisconception: focus } : {}),
  };
}

function continueFromResult(state: LessonState, ctx: LessonContext, now: Date, shortages: Shortage[]): LessonState {
  switch (state.judgment) {
    case "remedial":
      return enterRemedial(state, ctx, now, shortages);
    case "confusion":
      return contrastBlock(ctx.unit, state.focusMisconception) ? { ...state, phase: "contrast", blockIndex: 0, queue: [] } : enterRemedial(state, ctx, now, shortages);
    case "foundation_check":
      return state.attempts.some((a) => a.phase === "foundation" && a.round === state.round) ? state : enterFoundation(state, ctx, now, shortages);
    case "learning": {
      if (!judgment(state, ctx).needsAnalyzer) return state;
      const tagging = flowBlocks(ctx.unit).findIndex((b) => b.type === "sentence_task" && b.interaction === "role_tagging");
      return tagging < 0 ? state : { ...state, phase: "main", blockIndex: tagging, queue: [] };
    }
    default:
      return state;
  }
}

function enterFoundation(state: LessonState, ctx: LessonContext, now: Date, shortages: Shortage[]): LessonState {
  const queue = unanswered(ctx.prerequisiteQuestionIds, state, ctx).slice(0, FOUNDATION_QUESTIONS);
  if (queue.length === 0) {
    shortages.push({ at: now.toISOString(), unitId: ctx.unit.id });
    return enterRemedial(state, ctx, now, shortages);
  }
  return { ...state, phase: "foundation", blockIndex: 1, queue };
}

// The remedial block for the focus misconception, then its questions topped up
// with variants of the questions the student missed, up to REMEDIAL_QUESTIONS.
function enterRemedial(state: LessonState, ctx: LessonContext, now: Date, shortages: Shortage[]): LessonState {
  const block = remedialBlock(ctx.unit, ctx.misconceptions, state.focusMisconception);
  const queue = unanswered(block?.type === "remedial" ? block.questionIds : [], state, ctx).slice(0, REMEDIAL_QUESTIONS);
  const missedGroups = [
    ...new Set(
      roundAttempts(state, ctx)
        .filter((a) => !countsAsCorrect(a))
        .map((a) => ctx.questions.find((q) => q.id === a.questionId)?.variantGroup)
        .filter((group): group is string => group !== undefined),
    ),
  ];
  let draft: LessonState = { ...state, queue };
  for (const group of missedGroups) {
    while (draft.queue.length < REMEDIAL_QUESTIONS) {
      const variant = pickVariant(ctx.questions, group, excluded(draft, ctx));
      if (!variant) break;
      draft = { ...draft, queue: [...draft.queue, variant] };
    }
  }
  if (draft.queue.length < REMEDIAL_QUESTIONS) shortages.push({ at: now.toISOString(), unitId: ctx.unit.id, ...(missedGroups[0] ? { variantGroup: missedGroups[0] } : {}) });
  const next: LessonState = { ...draft, phase: "remedial", blockIndex: block ? 0 : 1 };
  return block || next.queue.length ? next : enterReassessment(next, ctx, now, shortages);
}

// A new round: one unseen variant for each assessment question.
function enterReassessment(state: LessonState, ctx: LessonContext, now: Date, shortages: Shortage[]): LessonState {
  let draft: LessonState = { ...state, phase: "reassessment", round: state.round + 1, blockIndex: 1, queue: [] };
  for (const id of assessmentIds(ctx.unit)) {
    const group = ctx.questions.find((q) => q.id === id)?.variantGroup;
    const variant = group ? pickVariant(ctx.questions, group, excluded(draft, ctx)) : null;
    if (variant) draft = { ...draft, queue: [...draft.queue, variant] };
    else shortages.push({ at: now.toISOString(), unitId: ctx.unit.id, ...(group ? { variantGroup: group } : {}) });
  }
  return draft.queue.length ? draft : judge(draft, ctx);
}
