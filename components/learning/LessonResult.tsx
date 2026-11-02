import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { DELAYED_CHECK_DAYS } from "@/lib/engine/mastery";
import type { LessonState } from "@/lib/schema/progress";
import { cn } from "@/lib/utils";

interface LessonResultProps {
  lesson: LessonState;
  score: { correct: number; total: number };
  nextUnit: { id: string; title: string } | null;
  previousUnit: { id: string; title: string } | null;
  onContinue: () => void;
}

// What the judgment means for the student and where to go next (DESIGN 5-2).
export function LessonResult({ lesson, score, nextUnit, previousUnit, onContinue }: LessonResultProps) {
  const foundationFailed = lesson.judgment === "foundation_check" && lesson.attempts.some((a) => a.phase === "foundation" && a.round === lesson.round);
  const needsAnalyzer = lesson.judgment === "learning" && !lesson.analyzerPassed && score.total > 0;

  let title: string;
  let detail: string;
  let action: "continue" | "next" | "home" = "home";
  switch (lesson.judgment) {
    case "mastered":
      title = "이 단원을 완전히 익혔습니다";
      detail = "확인 문제까지 통과했어요.";
      action = "next";
      break;
    case "can_progress":
      title = "통과했습니다";
      detail = `${DELAYED_CHECK_DAYS}일 뒤 확인 문제가 나옵니다.`;
      action = "next";
      break;
    case "remedial":
      title = "보충 학습으로 이어갑니다";
      detail = "자주 틀린 부분을 다시 설명하고, 비슷한 새 문제로 다시 평가해요.";
      action = "continue";
      break;
    case "confusion":
      title = "헷갈리는 부분이 있어요";
      detail = "같은 실수가 반복됐어요. 두 개념을 나란히 비교해 볼게요.";
      action = "continue";
      break;
    case "foundation_check":
      title = foundationFailed ? "기초부터 다시 확인해요" : "기초를 먼저 확인해요";
      detail = foundationFailed ? "앞 단원을 복습한 뒤 다시 도전해 보세요." : "앞에서 배운 내용을 짧게 확인할게요.";
      action = foundationFailed ? "home" : "continue";
      break;
    default:
      title = needsAnalyzer ? "문장 성분 표시를 한 번 더 해 봐요" : "판정을 미뤘습니다";
      detail = needsAnalyzer ? "문제는 잘 풀었어요. 주어·동사·목적어 표시를 다시 연습하면 통과할 수 있어요." : "문항이 부족해 이번에는 판정하지 않았어요.";
      action = needsAnalyzer ? "continue" : "home";
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{detail}</p>
      </div>
      {score.total > 0 && (
        <p className="flex items-baseline gap-2">
          <span className="text-caption text-muted-foreground">맞힌 문제</span>
          <span className="text-title font-bold tabular-nums">
            {score.correct} / {score.total}
          </span>
        </p>
      )}
      {action === "continue" && (
        <Button onClick={onContinue} className="h-12 text-base">
          계속하기
        </Button>
      )}
      {action === "next" && nextUnit && (
        <Link href={`/learn/${nextUnit.id}`} className={cn(buttonVariants(), "h-12 text-base")}>
          다음 단원: {nextUnit.title}
        </Link>
      )}
      {foundationFailed && previousUnit && (
        <Link href={`/learn/${previousUnit.id}`} className={cn(buttonVariants(), "h-12 text-base")}>
          앞 단원 복습: {previousUnit.title}
        </Link>
      )}
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-12 text-base")}>
        대시보드로
      </Link>
    </section>
  );
}
