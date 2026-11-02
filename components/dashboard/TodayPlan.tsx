"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { NotSavedNotice, useProgress } from "@/components/learning/ProgressProvider";
import { useNow } from "@/components/learning/useNow";
import { buttonVariants } from "@/components/ui/button";
import { type CoverageWeights, masteredShare } from "@/lib/engine/coverage";
import { localDayKey, type PlannedUnit, planToday } from "@/lib/engine/planToday";
import { cn } from "@/lib/utils";

interface TodayPlanProps {
  wordOrder: string[];
  lemmaById: Record<string, string>;
  // null when there is no analysis/vocab_frequency.json: the metric stays hidden.
  coverage: CoverageWeights | null;
  // Approved units in learning order.
  units: PlannedUnit[];
}

export function TodayPlan({ wordOrder, lemmaById, coverage, units }: TodayPlanProps) {
  const state = useProgress();
  const now = useNow();
  const router = useRouter();
  const profile = state?.progress.profile ?? null;

  useEffect(() => {
    if (state && !profile) router.replace("/start");
  }, [state, profile, router]);

  if (!state || !profile || !now) {
    return <h1 className="text-title font-bold tracking-tight">오늘의 학습</h1>;
  }

  const { progress } = state;
  const today = progress.days[localDayKey(now)] ?? { reviewed: 0, learned: 0 };
  const plan = planToday({
    dailyMinutes: profile.dailyMinutes,
    now,
    cards: progress.cards,
    wordOrder,
    learnedToday: today.learned,
    units,
    lessons: progress.lessons,
  });
  const words = plan.reviews.length + plan.newWords.length;
  const total = words + plan.skillReviews.length + (plan.unit ? 1 : 0);
  const noWords = wordOrder.length === 0;
  // Reviews first, then vocabulary, then the unit (DESIGN 5-1).
  const startHref = plan.skillReviews.length ? "/review" : words ? "/vocab" : plan.unit ? `/learn/${plan.unit.id}` : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title font-bold tracking-tight">오늘의 학습</h1>
        <p className="text-muted-foreground">
          {profile.nickname}님, 하루 목표 <span className="tabular-nums">{profile.dailyMinutes}</span>분
        </p>
      </div>

      {noWords && (
        <p className="rounded-lg bg-muted px-4 py-3">아직 학습할 단어가 없습니다. 단어 목록이 준비되면 여기서 시작할 수 있습니다.</p>
      )}
      {(!noWords || plan.unit || plan.skillReviews.length > 0) && (
        <dl className="grid grid-cols-3 divide-x rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]">
          <PlanFigure label="복습" value={plan.reviews.length + plan.skillReviews.length} unit="개" />
          <PlanFigure label="새 단어" value={plan.newWords.length} unit="개" />
          <PlanFigure label="예상 시간" value={plan.estimatedMinutes} unit="분" />
        </dl>
      )}

      {total > 0 && (
        <ol aria-label="오늘 할 일" className="flex flex-col divide-y rounded-xl border">
          {plan.skillReviews.length > 0 && <TodoRow label="개념 복습" detail={`${plan.skillReviews.length}문제`} />}
          {words > 0 && <TodoRow label="어휘" detail={`복습 ${plan.reviews.length} · 새 단어 ${plan.newWords.length}`} />}
          {plan.unit && <TodoRow label="단원 학습" detail={plan.unit.title} />}
        </ol>
      )}

      {(!noWords || units.length > 0) && total === 0 && (
        <p className="text-muted-foreground">
          오늘 할 일을 모두 마쳤습니다. 복습{" "}
          <span className="tabular-nums">{today.reviewed}</span>개, 새 단어 <span className="tabular-nums">{today.learned}</span>개를 했어요.
        </p>
      )}

      <NotSavedNotice persistent={state.persistent} />

      {startHref ? (
        <Link href={startHref} className={cn(buttonVariants(), "h-12 text-base")}>
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

function TodoRow({ label, detail }: { label: string; detail: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 px-4 py-3">
      <span className="font-medium">{label}</span>
      <span className="text-caption text-muted-foreground tabular-nums">{detail}</span>
    </li>
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
