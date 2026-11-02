"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { localDayKey } from "@/lib/engine/planToday";
import { cn } from "@/lib/utils";
import { NotSavedNotice, useProgress } from "./ProgressProvider";

export function VocabDone() {
  const state = useProgress();
  const router = useRouter();
  const profile = state?.progress.profile ?? null;

  useEffect(() => {
    if (state && !profile) router.replace("/start");
  }, [state, profile, router]);

  if (!state || !profile) return null;

  const now = new Date();
  const today = state.progress.days[localDayKey(now)] ?? { reviewed: 0, learned: 0 };
  // Due before the local midnight that ends tomorrow.
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2).getTime();
  const dueByTomorrow = state.progress.cards.filter((c) => c.itemType === "word" && Date.parse(c.fsrs.due) < endOfTomorrow).length;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-display font-bold tracking-tight">오늘 어휘를 마쳤습니다</h1>
        <p className="text-muted-foreground">수고했어요, {profile.nickname}님.</p>
      </div>
      <dl className="flex flex-col divide-y rounded-xl border bg-card">
        <Row label="오늘 복습" value={today.reviewed} />
        <Row label="오늘 새 단어" value={today.learned} />
        <Row label="내일까지 복습 예정" value={dueByTomorrow} />
      </dl>
      <NotSavedNotice persistent={state.persistent} />
      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-12 text-base")}>
        대시보드로
      </Link>
    </section>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-title font-bold tabular-nums">{value}개</dd>
    </div>
  );
}
