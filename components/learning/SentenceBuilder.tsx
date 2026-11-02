"use client";

// Sentence building (DESIGN 13-2): tap shuffled word chips in order; undo takes
// back the last chip. When every chip is placed, wrong positions are marked and
// the student fixes them from the first wrong word.
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { builderTokens, checkBuild, shuffled } from "@/lib/engine/analyzer";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import { cn } from "@/lib/utils";

interface SentenceBuilderProps {
  sentence: AnnotatedSentence;
  seed: string;
  onDone: () => void;
}

export function SentenceBuilder({ sentence, seed, onDone }: SentenceBuilderProps) {
  const expected = builderTokens(sentence);
  const [chips] = useState(() => shuffled(expected, seed));
  const [built, setBuilt] = useState<number[]>([]);
  const words = built.map((i) => chips[i]);
  const full = built.length === chips.length;
  const marks = full ? checkBuild(expected, words) : null;
  const solved = marks?.every(Boolean) ?? false;

  function retry() {
    const firstWrong = marks!.findIndex((ok) => !ok);
    setBuilt((b) => b.slice(0, firstWrong));
  }

  return (
    <section aria-label="문장 만들기" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card px-4 py-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]">
        <p className="text-caption text-muted-foreground">{sentence.translation}</p>
        <ol aria-label="만든 문장" lang="en" className="flex min-h-12 flex-wrap items-center gap-1.5 border-b-2 border-dashed pb-2 text-sentence">
          {words.map((w, i) => (
            <li
              key={`${i}-${w}`}
              className={cn(
                "rounded-md px-1.5",
                marks && !marks[i] && "animate-shake bg-destructive/10 text-destructive underline decoration-2 motion-reduce:animate-none",
              )}
            >
              {w}
              {marks && !marks[i] && <span className="sr-only"> (틀린 자리)</span>}
            </li>
          ))}
        </ol>
        {solved && <p className="font-medium">맞았어요. {sentence.text}</p>}
      </div>

      {!full && (
        <div role="group" aria-label="단어 칩" lang="en" className="flex flex-wrap gap-2">
          {chips.map((chip, i) => (
            <Button
              key={i}
              variant="outline"
              disabled={built.includes(i)}
              onClick={() => setBuilt((b) => [...b, i])}
              className="h-11 px-3 text-base"
            >
              {chip}
            </Button>
          ))}
        </div>
      )}

      {solved ? (
        <Button onClick={onDone} className="h-12 text-base">
          다음
        </Button>
      ) : full ? (
        <Button onClick={retry} className="h-12 text-base">
          다시 맞추기
        </Button>
      ) : (
        <Button variant="ghost" onClick={() => setBuilt((b) => b.slice(0, -1))} disabled={built.length === 0} className="h-11 self-start text-base">
          <Undo2 aria-hidden />
          되돌리기
        </Button>
      )}
    </section>
  );
}
