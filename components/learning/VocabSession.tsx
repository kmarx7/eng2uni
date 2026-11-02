"use client";

// Today's vocabulary run: due reviews, then new words. The queue is planned once
// from stored progress when the page opens, so a reload resumes with what is left.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { applyGrade } from "@/lib/engine/applyGrade";
import { localDayKey, planToday } from "@/lib/engine/planToday";
import type { Vocabulary } from "@/lib/schema/vocabulary";
import type { Grade } from "@/lib/srs";
import { NotSavedNotice, updateProgress, useProgress } from "./ProgressProvider";
import { VocabularyCard } from "./VocabularyCard";

export function VocabSession({ words }: { words: Vocabulary[] }) {
  const state = useProgress();
  const router = useRouter();
  const [queue, setQueue] = useState<{ ids: string[]; total: number } | null>(null);
  const profile = state?.progress.profile ?? null;

  if (state && profile && queue === null) {
    const now = new Date();
    const plan = planToday({
      dailyMinutes: profile.dailyMinutes,
      now,
      cards: state.progress.cards,
      wordOrder: words.map((w) => w.id),
      learnedToday: state.progress.days[localDayKey(now)]?.learned ?? 0,
    });
    const ids = [...plan.reviews, ...plan.newWords].filter((id) => words.some((w) => w.id === id));
    setQueue({ ids, total: ids.length });
  }

  const finished = queue !== null && queue.ids.length === 0;
  useEffect(() => {
    if (state && !profile) router.replace("/start");
    else if (finished) router.replace("/vocab/done");
  }, [state, profile, finished, router]);

  const currentId = queue?.ids[0];
  const onGrade = useCallback(
    (grade: Grade) => {
      if (!currentId) return;
      updateProgress((p) => applyGrade(p, currentId, grade, new Date()));
      setQueue((q) => (q ? { ...q, ids: q.ids.slice(1) } : q));
    },
    [currentId],
  );

  if (!state || !queue || !currentId) return null;
  const word = words.find((w) => w.id === currentId)!;
  const fsrs = state.progress.cards.find((c) => c.itemType === "word" && c.itemId === currentId)?.fsrs;
  const done = queue.total - queue.ids.length;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h1 className="text-body font-bold">오늘의 어휘</h1>
          <p className="text-caption text-muted-foreground">
            남은 카드 <span className="tabular-nums">{queue.ids.length}</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-label="오늘 어휘 진행"
          aria-valuemin={0}
          aria-valuemax={queue.total}
          aria-valuenow={done}
          className="h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${(done / queue.total) * 100}%` }}
          />
        </div>
      </div>
      <NotSavedNotice persistent={state.persistent} />
      <VocabularyCard key={currentId} word={word} fsrs={fsrs} onGrade={onGrade} />
    </section>
  );
}
