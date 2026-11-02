"use client";

// Skill review (DESIGN 5-4): each due skill card gets an unseen question on that
// skill, preferring the variant group the student missed last. A skill with no
// question left is logged as a shortage and skipped, never asked twice.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PracticeQuestion } from "@/components/question/PracticeQuestion";
import { buttonVariants } from "@/components/ui/button";
import type { ReviewBundle } from "@/lib/content/learning";
import { lastMissedGroup, pickSkillReviewQuestion, recordSkillReview } from "@/lib/engine/skillProgress";
import type { LocalProgress } from "@/lib/schema/progress";
import { isDue } from "@/lib/srs";
import { cn } from "@/lib/utils";
import { NotSavedNotice, updateProgress, useProgress } from "./ProgressProvider";

interface ReviewItem {
  skillId: string;
  questionId: string | null;
}

function planReview(progress: LocalProgress, bundle: ReviewBundle, now: Date): ReviewItem[] {
  const seen = new Set(Object.values(progress.lessons).flatMap((l) => l.attempts.map((a) => a.questionId)));
  return progress.cards
    .filter((c) => c.itemType === "skill" && isDue(c.fsrs, now))
    .sort((a, b) => Date.parse(a.fsrs.due) - Date.parse(b.fsrs.due))
    .map((c) => {
      const questionId = pickSkillReviewQuestion(c.itemId, bundle.questions, seen, lastMissedGroup(progress, c.itemId, bundle.questions));
      if (questionId) seen.add(questionId);
      return { skillId: c.itemId, questionId };
    });
}

export function SkillReviewSession({ bundle }: { bundle: ReviewBundle }) {
  const state = useProgress();
  const router = useRouter();
  const profile = state?.progress.profile ?? null;
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [index, setIndex] = useState(0);

  if (state && profile && items === null) setItems(planReview(state.progress, bundle, new Date()));

  useEffect(() => {
    if (state && !profile) router.replace("/start");
  }, [state, profile, router]);

  // Log skills that had no question left, once per planned session.
  const missing = items?.filter((i) => i.questionId === null).map((i) => i.skillId).join(",");
  useEffect(() => {
    if (!missing) return;
    const at = new Date().toISOString();
    updateProgress((p) => ({ ...p, shortages: [...p.shortages, ...missing.split(",").map((skillId) => ({ at, skillId }))] }));
  }, [missing]);

  if (!state || !profile || !items) return <h1 className="text-title font-bold">개념 복습</h1>;

  const askable = items.filter((i): i is { skillId: string; questionId: string } => i.questionId !== null);
  const current = askable[index];

  if (!current) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-title font-bold">{askable.length ? "개념 복습을 마쳤습니다" : "지금 복습할 문제가 없습니다"}</h1>
        {items.length > askable.length && <p className="text-muted-foreground">복습할 새 문제가 부족한 개념이 있어 건너뛰었습니다.</p>}
        <NotSavedNotice persistent={state.persistent} />
        <Link href="/dashboard" className={cn(buttonVariants(), "h-12 text-base")}>
          대시보드로
        </Link>
      </section>
    );
  }

  const question = bundle.questions.find((q) => q.id === current.questionId)!;
  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-body font-bold">개념 복습</h1>
        <p className="text-caption text-muted-foreground tabular-nums">
          {index + 1} / {askable.length}
        </p>
      </div>
      <NotSavedNotice persistent={state.persistent} />
      <PracticeQuestion
        key={question.id}
        question={question}
        sentence={bundle.sentences.find((s) => s.id === question.sentenceId)}
        onAnswered={({ result, hintLevel, durationMs }) =>
          updateProgress((p) => recordSkillReview(p, { skillId: current.skillId, correct: result.correct, hintLevel, durationMs }, bundle.units, new Date()))
        }
        onNext={() => setIndex((i) => i + 1)}
        nextLabel={() => (index + 1 < askable.length ? "다음" : "마치기")}
      />
    </section>
  );
}
