"use client";

// One unit (DESIGN 5-1, 9-2): renders the step the lesson engine says is current
// and feeds every action back through lessonReducer. The lesson state is saved
// with the rest of progress, so a reload resumes at the same block and question.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type AnsweredQuestion, PracticeQuestion } from "@/components/question/PracticeQuestion";
import { buttonVariants } from "@/components/ui/button";
import type { AnswerResult, UnitBundle } from "@/lib/content/learning";
import { currentStep, flowBlocks, type LessonAction, type LessonContext, lessonReducer, roundScore, startLesson } from "@/lib/engine/lesson";
import { isUnlocked, nextUnit, recordLessonAnswer, scheduleDelayedCheck } from "@/lib/engine/skillProgress";
import type { LessonBlock } from "@/lib/schema/curriculum";
import type { LessonState, LocalProgress } from "@/lib/schema/progress";
import { cn } from "@/lib/utils";
import { ConceptBlock } from "./ConceptBlock";
import { LessonResult } from "./LessonResult";
import { NotSavedNotice, updateProgress, useProgress } from "./ProgressProvider";
import { SentenceAnalyzer } from "./SentenceAnalyzer";
import { SentenceBuilder } from "./SentenceBuilder";

interface LessonRunnerProps {
  bundle: UnitBundle;
  units: { id: string; title: string }[];
}

const PHASE_LABEL: Record<Exclude<LessonState["phase"], "main" | "result">, string> = {
  contrast: "비교해 보기",
  remedial: "보충 학습",
  foundation: "기초 확인",
  reassessment: "다시 평가",
};

function context(bundle: UnitBundle, progress: LocalProgress): LessonContext {
  const seen = new Set(Object.values(progress.lessons).flatMap((l) => l.attempts.map((a) => a.questionId)));
  return {
    unit: bundle.unit,
    questions: bundle.questions,
    misconceptions: bundle.misconceptions,
    prerequisiteQuestionIds: bundle.prerequisiteQuestionIds,
    seen,
  };
}

// Applies one action to stored progress: the lesson, any shortages, the skill
// cards an answer touches, and the delayed check when the unit is passed.
function dispatch(bundle: UnitBundle, action: LessonAction, durationMs = 0) {
  updateProgress((p) => {
    const current = p.lessons[bundle.unit.id];
    if (!current) return p;
    const now = new Date();
    const { state, shortages } = lessonReducer(current, action, context(bundle, p), now);
    if (state === current) return p;
    let next: LocalProgress = { ...p, lessons: { ...p.lessons, [bundle.unit.id]: state }, shortages: [...p.shortages, ...shortages] };
    if (action.type === "answered") {
      const skills = bundle.questions.find((q) => q.id === action.attempt.questionId)?.skills ?? [];
      next = recordLessonAnswer(next, { attempt: action.attempt, skills, durationMs }, now);
    }
    if (current.status !== "awaiting_delayed_check" && state.status === "awaiting_delayed_check") {
      next = scheduleDelayedCheck(next, bundle.unit.skills, now);
    }
    return next;
  });
}

export function LessonRunner({ bundle, units }: LessonRunnerProps) {
  const state = useProgress();
  const router = useRouter();
  const { unit } = bundle;
  const profile = state?.progress.profile ?? null;
  const lesson = state?.progress.lessons[unit.id];
  const unlocked = state ? Boolean(lesson) || isUnlocked(unit.id, units, state.progress.lessons) : false;
  // The question whose feedback is on screen; it stays until "다음".
  const [held, setHeld] = useState<string | null>(null);

  useEffect(() => {
    if (state && !profile) router.replace("/start");
  }, [state, profile, router]);

  useEffect(() => {
    if (!state || !profile || !unlocked || lesson) return;
    updateProgress((p) => (p.lessons[unit.id] ? p : { ...p, lessons: { ...p.lessons, [unit.id]: startLesson(context(bundle, p), new Date()) } }));
  }, [state, profile, unlocked, lesson, bundle, unit.id]);

  const heading = <p className="text-caption text-muted-foreground">{unit.title}</p>;
  if (!state || !profile) return heading;

  if (!unlocked) {
    return (
      <section className="flex flex-col gap-4">
        {heading}
        <h1 className="text-title font-bold">아직 열리지 않은 단원입니다</h1>
        <p className="text-muted-foreground">앞 단원을 먼저 마치세요.</p>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-12 text-base")}>
          대시보드로
        </Link>
      </section>
    );
  }
  if (!lesson) return heading;

  const step = currentStep(lesson, unit, bundle.misconceptions);
  const activeQuestion = held ?? (step.kind === "question" ? step.questionId : null);
  const flow = flowBlocks(unit);
  const block = lesson.phase === "main" ? flow[lesson.blockIndex] : undefined;

  function nextLabel(result: AnswerResult): string {
    const retrying = !result.correct && block?.type === "practice" && lesson!.queue[0] !== undefined && !block.questionIds.includes(lesson!.queue[0]);
    return retrying ? "비슷한 문제 풀기" : "다음";
  }

  let body: React.ReactNode;
  if (activeQuestion) {
    const question = bundle.questions.find((q) => q.id === activeQuestion)!;
    body = (
      <PracticeQuestion
        // The id alone: answering can move the lesson to another phase while this
        // question's feedback is still on screen. A question is asked once per lesson.
        key={activeQuestion}
        question={question}
        sentence={bundle.sentences.find((s) => s.id === question.sentenceId)}
        onAnswered={({ result, hintLevel, durationMs }: AnsweredQuestion) => {
          setHeld(activeQuestion);
          if (lesson.phase === "result") return;
          dispatch(
            bundle,
            {
              type: "answered",
              attempt: {
                questionId: activeQuestion,
                correct: result.correct,
                hintLevel,
                ...(result.misconception ? { misconception: result.misconception.id } : {}),
                phase: lesson.phase,
                round: lesson.round,
                at: new Date().toISOString(),
              },
            },
            durationMs,
          );
        }}
        onNext={() => setHeld(null)}
        nextLabel={nextLabel}
      />
    );
  } else if (step.kind === "block") {
    body = <BlockView key={`${step.block.id}-${lesson.round}-${lesson.phase}`} block={step.block} bundle={bundle} />;
  } else {
    const index = units.findIndex((u) => u.id === unit.id);
    body = (
      <LessonResult
        lesson={lesson}
        score={roundScore(lesson, unit)}
        nextUnit={nextUnit(units, state.progress.lessons)}
        previousUnit={index > 0 ? units[index - 1] : null}
        onContinue={() => dispatch(bundle, { type: "blockDone" })}
      />
    );
  }

  const where =
    lesson.phase === "main" ? `${Math.min(lesson.blockIndex + 1, flow.length)} / ${flow.length}` : lesson.phase === "result" ? "결과" : PHASE_LABEL[lesson.phase];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-body font-bold">{unit.title}</h1>
        <p className="text-caption text-muted-foreground tabular-nums">
          {where}
          {activeQuestion && lesson.phase !== "result" && (
            <>
              {" · "}남은 문제 <span data-testid="remaining-questions">{lesson.queue.length}</span>
            </>
          )}
        </p>
      </div>
      <NotSavedNotice persistent={state.persistent} />
      {body}
    </section>
  );
}

function BlockView({ block, bundle }: { block: LessonBlock; bundle: UnitBundle }) {
  const done = () => dispatch(bundle, { type: "blockDone" });
  switch (block.type) {
    case "concept":
      return <ConceptBlock heading="개념" body={block.body} onDone={done} />;
    case "remedial":
      return <ConceptBlock heading="보충 학습" body={block.body} onDone={done} doneLabel="보충 문제 풀기" />;
    case "contrast":
      return <ConceptBlock heading="헷갈리는 두 가지 비교" body={block.body} onDone={done} />;
    case "sentence_task":
      return <SentenceTask block={block} bundle={bundle} />;
    default:
      // Question blocks render through their queue; an empty one is skipped by the engine.
      return null;
  }
}

function SentenceTask({ block, bundle }: { block: Extract<LessonBlock, { type: "sentence_task" }>; bundle: UnitBundle }) {
  const [index, setIndex] = useState(0);
  const [allPassed, setAllPassed] = useState(true);
  const sentences = block.sentenceIds.map((id) => bundle.sentences.find((s) => s.id === id)).filter((s) => s !== undefined);
  const sentence = sentences[index];

  function finish(passed: boolean) {
    const passedSoFar = allPassed && passed;
    if (index + 1 < sentences.length) {
      setAllPassed(passedSoFar);
      setIndex(index + 1);
    } else if (block.interaction === "role_tagging") {
      dispatch(bundle, { type: "analyzerDone", passed: passedSoFar });
    } else {
      dispatch(bundle, { type: "blockDone" });
    }
  }

  if (!sentence || (block.interaction !== "role_tagging" && block.interaction !== "sentence_building")) {
    // An interaction this stage does not build yet: say so instead of pretending.
    return (
      <ConceptBlock heading="준비 중" body="이 연습은 아직 준비 중입니다. 다음으로 넘어가세요." onDone={() => dispatch(bundle, { type: "blockDone" })} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-muted-foreground">
        {block.instruction}
        {sentences.length > 1 && (
          <span className="tabular-nums">
            {" "}
            ({index + 1}/{sentences.length})
          </span>
        )}
      </p>
      {block.interaction === "role_tagging" ? (
        <SentenceAnalyzer key={sentence.id} sentence={sentence} mode="role_tagging" onDone={finish} />
      ) : (
        <SentenceBuilder key={sentence.id} sentence={sentence} seed={sentence.id} onDone={() => finish(true)} />
      )}
    </div>
  );
}
