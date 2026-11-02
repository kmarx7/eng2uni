"use client";

// Multiple-choice and true/false questions (DESIGN 4-2, 13-3). The question
// arrives without its answer; submitAnswer and requestHint run on the server, so
// nothing about the answer is in the page until the student submits or asks for
// the level-3 hint. Submitting locks the question: one attempt per question.
import { useEffect, useRef, useState } from "react";
import { requestHint, submitAnswer } from "@/app/(student)/learn/actions";
import { Button } from "@/components/ui/button";
import type { AnswerResult, Hint, HintLevelNumber, PublicQuestion, PublicSentence } from "@/lib/content/learning";
import { cn } from "@/lib/utils";
import { FeedbackPanel } from "./FeedbackPanel";
import { HintBar } from "./HintBar";

export interface AnsweredQuestion {
  result: AnswerResult;
  optionId: string;
  hintLevel: number;
  durationMs: number;
}

interface PracticeQuestionProps {
  question: PublicQuestion;
  sentence?: PublicSentence;
  onAnswered: (answer: AnsweredQuestion) => void;
  onNext: () => void;
  nextLabel: (result: AnswerResult) => string;
}

export function PracticeQuestion({ question, sentence, onAnswered, onNext, nextLabel }: PracticeQuestionProps) {
  const [choice, setChoice] = useState<string | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const hintLevel = hints.length ? hints[hints.length - 1].level : 0;
  const range = hints.find((h): h is Extract<Hint, { level: 2 }> => h.level === 2)?.range ?? null;

  async function submit() {
    if (!choice || locked.current) return;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      const graded = await submitAnswer(question.id, choice);
      setResult(graded);
      onAnswered({ result: graded, optionId: choice, hintLevel, durationMs: Date.now() - shownAt.current });
    } catch {
      locked.current = false;
      setError("채점하지 못했습니다. 연결을 확인하고 다시 제출해 주세요.");
    } finally {
      setPending(false);
    }
  }

  async function reveal(level: HintLevelNumber) {
    setPending(true);
    setError("");
    try {
      const hint = await requestHint(question.id, level);
      setHints((h) => [...h, hint]);
    } catch {
      setError("힌트를 불러오지 못했습니다. 다시 눌러 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="문제" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]">
        {sentence?.tokens && (
          <p lang="en" className="text-sentence leading-relaxed">
            {sentence.tokens.map((token, i) => (
              <span key={i}>
                {i > 0 && !/^\p{P}+$/u.test(token) && " "}
                <span className={cn(range && i >= range[0] && i <= range[1] && "rounded bg-muted px-0.5 font-bold underline decoration-2 underline-offset-4")}>
                  {token}
                </span>
              </span>
            ))}
          </p>
        )}
        <h2 className="text-title leading-snug font-bold">{question.prompt}</h2>
      </div>

      <fieldset disabled={result !== null || pending} className="flex flex-col gap-2">
        <legend className="sr-only">선택지</legend>
        {question.options.map((option) => (
          <label
            key={option.id}
            className={cn(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-2 transition-colors duration-150 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
              choice === option.id ? "border-foreground bg-muted" : "border-border",
              result && option.id === result.answerId && "border-foreground",
            )}
          >
            <input type="radio" name={question.id} value={option.id} checked={choice === option.id} onChange={() => setChoice(option.id)} className="sr-only" />
            <span aria-hidden className="w-5 text-caption font-bold text-muted-foreground">
              {option.id}
            </span>
            <span lang={question.type === "true_false" ? "ko" : "en"}>{option.text}</span>
          </label>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}

      {result ? (
        <FeedbackPanel result={result} options={question.options} afterAnswerHint={hintLevel === 3} onNext={onNext} nextLabel={nextLabel(result)} />
      ) : (
        <>
          <HintBar levels={question.hintLevels} hints={hints} options={question.options} pending={pending} onReveal={reveal} />
          <Button onClick={submit} disabled={!choice || pending} className="h-12 text-base">
            제출
          </Button>
        </>
      )}
    </section>
  );
}
