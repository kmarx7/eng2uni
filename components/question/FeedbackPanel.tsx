import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AnswerResult } from "@/lib/content/learning";

interface FeedbackPanelProps {
  result: AnswerResult;
  options: { id: string; text: string }[];
  // True when the answer came after the level-3 hint: right, but not credited.
  afterAnswerHint: boolean;
  onNext: () => void;
  nextLabel: string;
}

// After submission only: whether it was right, why the chosen option was wrong
// (its explanation and misconception), and the summary (DESIGN 4-2, 13-3).
export function FeedbackPanel({ result, options, afterAnswerHint, onNext, nextLabel }: FeedbackPanelProps) {
  const answer = options.find((o) => o.id === result.answerId);
  return (
    <section aria-label="해설" className="flex flex-col gap-4">
      <div role="status" className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-5">
        <p className="flex items-center gap-2 text-title font-bold">
          {result.correct ? <Check aria-hidden className="size-6" /> : <X aria-hidden className="size-6 text-destructive" />}
          {result.correct ? "정답입니다" : "아쉬워요"}
        </p>
        {!result.correct && (
          <p>
            정답은 <span lang="en" className="font-bold">{answer?.text}</span>입니다.
          </p>
        )}
        {afterAnswerHint && <p className="text-caption text-muted-foreground">정답 힌트를 본 뒤라 맞힌 개수에는 들어가지 않습니다.</p>}
        {result.chosen && <p>{result.chosen}</p>}
        {result.misconception && (
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-caption text-muted-foreground">이렇게 헷갈렸을 수 있어요</p>
            <p>{result.misconception.description}</p>
          </div>
        )}
        <p className="text-muted-foreground">{result.summary}</p>
      </div>
      <Button onClick={onNext} className="h-12 text-base">
        {nextLabel}
      </Button>
    </section>
  );
}
