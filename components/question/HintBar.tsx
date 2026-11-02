import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Hint, HintLevelNumber } from "@/lib/content/learning";

interface HintBarProps {
  levels: HintLevelNumber[];
  hints: Hint[];
  options: { id: string; text: string }[];
  pending: boolean;
  onReveal: (level: HintLevelNumber) => void;
}

const LABEL: Record<HintLevelNumber, string> = { 1: "방향 힌트", 2: "범위 힌트", 3: "정답 보기" };

// Three hint steps opened in order (DESIGN 13-3); a step without data is skipped.
// Level 2 highlights the range in the sentence above; the bar shows what the
// other levels say.
export function HintBar({ levels, hints, options, pending, onReveal }: HintBarProps) {
  const opened = hints.length ? hints[hints.length - 1].level : 0;
  const next = levels.find((l) => l > opened);
  return (
    <div className="flex flex-col gap-2">
      {hints.map((hint) => (
        <p key={hint.level} className="flex gap-2 rounded-lg bg-muted px-3 py-2">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            {hint.level === 1 && hint.direction}
            {hint.level === 2 && "문장에서 강조된 부분을 살펴보세요."}
            {hint.level === 3 && (
              <>
                정답은 <span lang="en" className="font-bold">{options.find((o) => o.id === hint.answerId)?.text}</span>입니다. {hint.summary}
              </>
            )}
          </span>
        </p>
      ))}
      {next && (
        <Button variant="ghost" onClick={() => onReveal(next)} disabled={pending} className="h-10 self-start text-base">
          <Lightbulb aria-hidden />
          {LABEL[next]}
          {next === 3 && <span className="text-caption text-muted-foreground">(맞혀도 점수에 안 들어가요)</span>}
        </Button>
      )}
    </div>
  );
}
