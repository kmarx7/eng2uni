"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NotSavedNotice, useProgress } from "@/components/learning/ProgressProvider";
import { buttonVariants } from "@/components/ui/button";
import { type CoverageWeights, masteredShare } from "@/lib/engine/coverage";
import { localDayKey, planToday } from "@/lib/engine/planToday";
import { cn } from "@/lib/utils";

interface TodayPlanProps {
  wordOrder: string[];
  lemmaById: Record<string, string>;
  // null when there is no analysis/vocab_frequency.json: the metric stays hidden.
  coverage: CoverageWeights | null;
}

export function TodayPlan({ wordOrder, lemmaById, coverage }: TodayPlanProps) {
  const state = useProgress();
  const router = useRouter();
  const profile = state?.progress.profile ?? null;

  useEffect(() => {
    if (state && !profile) router.replace("/start");
  }, [state, profile, router]);

  if (!state || !profile) {
    return <h1 className="text-title font-bold tracking-tight">오늘의 학습</h1>;
  }

  const now = new Date();
  const { progress } = state;
  const today = progress.days[localDayKey(now)] ?? { reviewed: 0, learned: 0 };
  const plan = planToday({ dailyMinutes: profile.dailyMinutes, now, cards: progress.cards, wordOrder, learnedToday: today.learned });
  const total = plan.reviews.length + plan.newWords.length;
  const noWords = wordOrder.length === 0;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-bold tracking-tight">오늘의 학습</h1>
        <p className="text-muted-foreground">
          {profile.nickname}님, 하루 목표 <span className="tabular-nums">{profile.dailyMinutes}</span>분
        </p>
      </div>

      {noWords ? (
        <p className="rounded-lg bg-muted px-4 py-3">아직 학습할 단어가 없습니다. 단어 목록이 준비되면 여기서 시작할 수 있습니다.</p>
      ) : (
        <dl className="grid grid-cols-3 divide-x rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]">
          <PlanFigure label="복습" value={plan.reviews.length} unit="개" />
          <PlanFigure label="새 단어" value={plan.newWords.length} unit="개" />
          <PlanFigure label="예상 시간" value={plan.estimatedMinutes} unit="분" />
        </dl>
      )}

      {!noWords && total === 0 && (
        <p className="text-muted-foreground">
          오늘 할 일을 모두 마쳤습니다. 복습{" "}
          <span className="tabular-nums">{today.reviewed}</span>개, 새 단어 <span className="tabular-nums">{today.learned}</span>개를 했어요.
        </p>
      )}

      <NotSavedNotice persistent={state.persistent} />

      {total > 0 ? (
        <Link href="/vocab" className={cn(buttonVariants(), "h-12 text-base")}>
          오늘 학습 시작
        </Link>
      ) : (
        <button type="button" disabled className={cn(buttonVariants(), "h-12 text-base")}>
          오늘 학습 시작
        </button>
      )}

      {coverage && (
        <div className="flex flex-col gap-1 border-t pt-4">
          <p className="text-caption text-muted-foreground">수능 지문 어휘 커버리지</p>
          <p className="flex items-baseline gap-2">
            <span className="text-title font-bold tabular-nums">
              {(masteredShare(progress.cards, lemmaById, coverage) * 100).toFixed(1)}%
            </span>
            <span className="text-caption text-muted-foreground">3주 이상 기억할 단어 기준</span>
          </p>
        </div>
      )}
    </section>
  );
}

function PlanFigure({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-4">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="text-display leading-none font-bold tracking-tight tabular-nums">
        {value}
        <span className="ml-0.5 text-body font-medium text-muted-foreground">{unit}</span>
      </dd>
    </div>
  );
}
