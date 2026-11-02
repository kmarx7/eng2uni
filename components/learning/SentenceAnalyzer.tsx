"use client";

// Role tagging (DESIGN 13-2): tap the first and last word of a part, then pick
// S, V or O. Right tags stay in place with their symbol, name and translation
// piece; a wrong tag shakes only that range. Tap-only, and keyboard-complete:
// words are buttons (Tab, Enter) and the role keys are s, v and o. Tags are
// checked on the server, so the page never holds the sentence's annotation.
import { useEffect, useRef, useState } from "react";
import { tagRole } from "@/app/(student)/learn/actions";
import { Button } from "@/components/ui/button";
import type { PublicSentence } from "@/lib/content/learning";
import { ROLE_DISPLAY } from "@/lib/design/roles";
import type { RoleSymbol } from "@/lib/engine/analyzer";
import { cn } from "@/lib/utils";
import { ROLE_CLASS } from "./roleStyles";

// More wrong tags than this on one sentence and the analyzer task is not passed.
export const ALLOWED_MISSES = 2;

const isPunctuation = (token: string) => /^\p{P}+$/u.test(token);

interface Tag {
  range: [number, number];
  gloss?: string;
}

interface SentenceAnalyzerProps {
  sentence: PublicSentence & { tokens: string[]; roles: RoleSymbol[] };
  // Only role tagging for now; modifier arrows and folding come later (13-4).
  mode: "role_tagging";
  onDone: (passed: boolean) => void;
}

export function SentenceAnalyzer({ sentence, onDone }: SentenceAnalyzerProps) {
  const { tokens, roles } = sentence;
  const [tagged, setTagged] = useState<Partial<Record<RoleSymbol, Tag>>>({});
  // First and last tapped word; a new object per tap so a finished check only
  // clears the selection it was sent with.
  const [selection, setSelection] = useState<{ start: number; end: number | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [wrong, setWrong] = useState<{ range: [number, number]; key: number } | null>(null);
  const [misses, setMisses] = useState(0);
  const [message, setMessage] = useState("");
  const [translation, setTranslation] = useState<string | null>(null);
  const checking = useRef(false);
  const complete = roles.every((r) => tagged[r]);

  const selected = selection === null ? null : ([Math.min(selection.start, selection.end ?? selection.start), Math.max(selection.start, selection.end ?? selection.start)] as [number, number]);

  function tapToken(index: number) {
    setWrong(null);
    setSelection((cur) => (cur === null || cur.end !== null ? { start: index, end: null } : { start: cur.start, end: index }));
  }

  async function assign(symbol: RoleSymbol) {
    if (!selected || tagged[symbol] || complete || checking.current) return;
    checking.current = true;
    setPending(true);
    const sent = selection;
    const label = ROLE_DISPLAY[symbol].label;
    try {
      const result = await tagRole(sentence.id, symbol, selected, roles.filter((r) => tagged[r]));
      if (result.correct && result.range) {
        setTagged((t) => ({ ...t, [symbol]: { range: result.range!, ...(result.gloss ? { gloss: result.gloss } : {}) } }));
        if (result.translation) setTranslation(result.translation);
        setMessage(`${label}를 찾았어요.`);
      } else {
        setWrong({ range: selected, key: Date.now() });
        setMisses((m) => m + 1);
        setMessage(`다시 골라 보세요. 고른 부분은 ${label}가 아닙니다.`);
      }
      setSelection((cur) => (cur === sent ? null : cur));
    } catch {
      setMessage("확인하지 못했습니다. 연결을 확인하고 다시 골라 주세요.");
    } finally {
      checking.current = false;
      setPending(false);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const symbol = event.key.toUpperCase();
      if (symbol === "S" || symbol === "V" || symbol === "O") {
        event.preventDefault();
        void assign(symbol);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const roleAt = (index: number) => roles.find((s) => tagged[s] && index >= tagged[s]!.range[0] && index <= tagged[s]!.range[1]);
  const inRange = (range: [number, number] | null, index: number) => range !== null && index >= range[0] && index <= range[1];

  return (
    <section aria-label="문장 성분 표시" className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 rounded-xl border bg-card px-4 py-5 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]">
        <p lang="en" className="flex flex-wrap gap-x-1 gap-y-2 pt-1 text-sentence leading-relaxed">
          {tokens.map((token, i) => {
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
                    <span lang="en">{tokens.slice(tagged[r]!.range[0], tagged[r]!.range[1] + 1).join(" ")}</span>
                    {tagged[r]!.gloss && <span className="text-muted-foreground">{tagged[r]!.gloss}</span>}
                  </dd>
                </div>
              ))}
          </dl>
        )}

        {complete && translation && <p className="border-t pt-3 font-medium">{translation}</p>}
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
              onClick={() => void assign(r)}
              disabled={!selected || pending || Boolean(tagged[r])}
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
