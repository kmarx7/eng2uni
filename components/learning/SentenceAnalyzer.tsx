"use client";

// Role tagging (DESIGN 13-2): tap the first and last word of a part, then pick
// S, V or O. Right tags stay in place with their symbol, name and translation
// piece; a wrong tag shakes only that range. Tap-only, and keyboard-complete:
// words are buttons (Tab, Enter) and the role keys are s, v and o.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { checkRoleTag, type RoleSymbol, targetSpans } from "@/lib/engine/analyzer";
import { ROLE_DISPLAY } from "@/lib/design/roles";
import type { AnnotatedSentence, Span } from "@/lib/schema/sentence";
import { cn } from "@/lib/utils";
import { ROLE_CLASS } from "./roleStyles";

// More wrong tags than this on one sentence and the analyzer task is not passed.
export const ALLOWED_MISSES = 2;

const SYMBOLS: RoleSymbol[] = ["S", "V", "O"];
const isPunctuation = (token: string) => /^\p{P}+$/u.test(token);

interface SentenceAnalyzerProps {
  sentence: AnnotatedSentence;
  // Only role tagging for now; modifier arrows and folding come later (13-4).
  mode: "role_tagging";
  onDone: (passed: boolean) => void;
}

export function SentenceAnalyzer({ sentence, onDone }: SentenceAnalyzerProps) {
  const targets = targetSpans(sentence);
  const roles = SYMBOLS.filter((s) => targets[s]);
  const [tagged, setTagged] = useState<Partial<Record<RoleSymbol, Span>>>({});
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [wrong, setWrong] = useState<{ range: [number, number]; key: number } | null>(null);
  const [misses, setMisses] = useState(0);
  const [message, setMessage] = useState("");
  const complete = roles.every((r) => tagged[r]);

  const selected = start === null ? null : ([Math.min(start, end ?? start), Math.max(start, end ?? start)] as [number, number]);

  function tapToken(index: number) {
    setWrong(null);
    if (start === null || end !== null) {
      setStart(index);
      setEnd(null);
    } else {
      setEnd(index);
    }
  }

  function assign(symbol: RoleSymbol) {
    if (!selected || tagged[symbol] || complete) return;
    const result = checkRoleTag(sentence, symbol, selected);
    const label = ROLE_DISPLAY[symbol].label;
    if (result.correct && result.span) {
      setTagged((t) => ({ ...t, [symbol]: result.span }));
      setMessage(`${label}를 찾았어요.`);
    } else {
      setWrong({ range: selected, key: Date.now() });
      setMisses((m) => m + 1);
      setMessage(`다시 골라 보세요. 고른 부분은 ${label}가 아닙니다.`);
    }
    setStart(null);
    setEnd(null);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const symbol = event.key.toUpperCase();
      if (symbol === "S" || symbol === "V" || symbol === "O") {
        event.preventDefault();
        assign(symbol);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const roleAt = (index: number) => SYMBOLS.find((s) => tagged[s] && index >= tagged[s]!.range[0] && index <= tagged[s]!.range[1]);
  const inRange = (range: [number, number] | null, index: number) => range !== null && index >= range[0] && index <= range[1];

  return (
    <section aria-label="문장 성분 표시" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card px-4 py-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]">
        <p lang="en" className="flex flex-wrap gap-x-1 gap-y-2 text-sentence leading-relaxed">
          {sentence.tokens.map((token, i) => {
            if (isPunctuation(token)) return <span key={i} className="self-end">{token}</span>;
            const role = roleAt(i);
            const isWrong = wrong && inRange(wrong.range, i);
            return (
              <button
                key={isWrong ? `${i}-${wrong.key}` : i}
                type="button"
                onClick={() => tapToken(i)}
                aria-pressed={inRange(selected, i)}
                aria-label={role ? `${token}, ${ROLE_DISPLAY[role].label}` : token}
                disabled={complete}
                className={cn(
                  "relative min-h-11 rounded-md border-2 border-transparent px-1.5 transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  role && ROLE_CLASS[role],
                  !role && inRange(selected, i) && "border-foreground bg-muted",
                  isWrong && "animate-shake border-destructive motion-reduce:animate-none",
                )}
              >
                {token}
                {role && tagged[role]!.range[0] === i && (
                  <span aria-hidden className="absolute -top-2 -left-1 rounded-sm border bg-card px-1 text-[0.6875rem] leading-4 font-bold">
                    {role}
                  </span>
                )}
              </button>
            );
          })}
        </p>

        {roles.some((r) => tagged[r]) && (
          <dl className="flex flex-col gap-1.5 border-t pt-3">
            {roles
              .filter((r) => tagged[r])
              .map((r) => (
                <div key={r} className="flex items-baseline gap-2">
                  <dt className={cn("inline-flex min-w-16 items-center gap-1 rounded-md border px-1.5 text-caption font-bold", ROLE_CLASS[r])}>
                    {r} <span className="font-medium">{ROLE_DISPLAY[r].label}</span>
                  </dt>
                  <dd className="flex flex-wrap gap-x-2">
                    <span lang="en">{sentence.tokens.slice(tagged[r]!.range[0], tagged[r]!.range[1] + 1).join(" ")}</span>
                    {tagged[r]!.gloss && <span className="text-muted-foreground">{tagged[r]!.gloss}</span>}
                  </dd>
                </div>
              ))}
          </dl>
        )}

        {complete && <p className="border-t pt-3 font-medium">{sentence.translation}</p>}
      </div>

      <p role="status" aria-live="polite" className="min-h-6 text-caption text-muted-foreground">
        {message}
      </p>

      {complete ? (
        <Button onClick={() => onDone(misses <= ALLOWED_MISSES)} className="h-12 text-base">
          다음
        </Button>
      ) : (
        <div role="group" aria-label="역할 고르기" className="grid grid-cols-3 gap-2">
          {roles.map((r) => (
            <Button
              key={r}
              variant="outline"
              onClick={() => assign(r)}
              disabled={!selected || Boolean(tagged[r])}
              aria-keyshortcuts={r.toLowerCase()}
              className={cn("h-12 gap-1.5 border-2 text-base", !tagged[r] && ROLE_CLASS[r])}
            >
              <span className="font-bold">{r}</span>
              {ROLE_DISPLAY[r].label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
