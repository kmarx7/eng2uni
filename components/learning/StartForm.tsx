"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { NEW_WORDS } from "@/lib/engine/planToday";
import { DailyMinutes } from "@/lib/schema/progress";
import { cn } from "@/lib/utils";
import { NotSavedNotice, updateProgress, useProgress } from "./ProgressProvider";

const GOALS = [15, 30, 60] as const satisfies readonly DailyMinutes[];

export function StartForm() {
  const state = useProgress();
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [minutes, setMinutes] = useState<DailyMinutes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nicknameId = useId();
  const errorId = useId();
  const hasProfile = Boolean(state?.progress.profile);

  useEffect(() => {
    if (hasProfile) router.replace("/dashboard");
  }, [hasProfile, router]);

  if (!state || hasProfile) return null;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = nickname.trim();
    if (!name) return setError("닉네임을 입력해 주세요.");
    if (name.length > 20) return setError("닉네임은 20자까지 쓸 수 있습니다.");
    if (!minutes) return setError("하루 목표 시간을 골라 주세요.");
    updateProgress((p) => ({
      ...p,
      profile: { anonId: crypto.randomUUID(), nickname: name, dailyMinutes: minutes, createdAt: new Date().toISOString() },
    }));
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-bold tracking-tight text-balance">하루 몇 분 공부할까요?</h1>
        <p className="text-muted-foreground">
          목표 시간에 맞춰 매일 복습과 새 단어를 정해 드립니다. 이름 대신 닉네임만 씁니다.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={nicknameId} className="font-medium">
          닉네임
        </label>
        <input
          id={nicknameId}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          aria-describedby={error ? errorId : undefined}
          className="h-11 rounded-md border border-input bg-background px-3 text-body outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">하루 목표 시간</legend>
        <div className="grid grid-cols-3 gap-2">
          {GOALS.map((goal) => (
            <label
              key={goal}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border bg-background px-2 py-3 transition-[border-color,background-color] duration-150",
                "has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                minutes === goal ? "border-foreground bg-muted" : "hover:bg-muted/60",
              )}
            >
              <input
                type="radio"
                name="dailyMinutes"
                value={goal}
                checked={minutes === goal}
                onChange={() => setMinutes(goal)}
                className="sr-only"
              />
              <span className="text-title font-bold tabular-nums">{goal}분</span>
              <span className="text-caption text-muted-foreground">새 단어 {NEW_WORDS[goal]}개</span>
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p id={errorId} role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <NotSavedNotice persistent={state.persistent} />
      <Button type="submit" className="h-12 text-base">
        시작하기
      </Button>
    </form>
  );
}
