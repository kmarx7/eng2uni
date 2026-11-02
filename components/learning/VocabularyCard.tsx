"use client";

// One word card (DESIGN 13-2): front → reveal (Space or tap) → self-rating
// (1–4 or tap). Meanings and the blanked word stay out of the DOM until reveal.
// Mount with key={word.id}; the card grades at most once.
import { Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cardMode, findWord } from "@/lib/engine/cardMode";
import type { FsrsState } from "@/lib/schema/progress";
import type { PartOfSpeech, Vocabulary } from "@/lib/schema/vocabulary";
import { type Grade, gradeCard, newCardState } from "@/lib/srs";

const POS_LABEL: Record<PartOfSpeech, string> = {
  noun: "명사",
  verb: "동사",
  adjective: "형용사",
  adverb: "부사",
  preposition: "전치사",
  conjunction: "접속사",
  pronoun: "대명사",
  determiner: "한정사",
  interjection: "감탄사",
  phrase: "구",
};

const GRADES: { grade: Grade; label: string; key: string }[] = [
  { grade: "again", label: "다시", key: "1" },
  { grade: "hard", label: "어려움", key: "2" },
  { grade: "good", label: "보통", key: "3" },
  { grade: "easy", label: "쉬움", key: "4" },
];

const PROMPT = { meaning: "뜻을 떠올려 보세요", cloze: "빈칸에 들어갈 단어는?", context: "이 문장에서 뜻은?" } as const;

// "10분", "5시간", "3일": when the card comes back after this rating.
function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간`;
  return `${Math.round(hours / 24)}일`;
}

interface VocabularyCardProps {
  word: Vocabulary;
  fsrs: FsrsState | undefined;
  onGrade: (grade: Grade) => void;
}

export function VocabularyCard({ word, fsrs, onGrade }: VocabularyCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const graded = useRef(false);
  const audio = useRef<HTMLAudioElement>(null);
  const [shownAt] = useState(() => new Date());

  const mode = cardMode(word, fsrs);
  const showAudio = Boolean(word.audio) && !audioFailed && (mode !== "cloze" || revealed);

  const grade = useCallback(
    (g: Grade) => {
      if (graded.current) return;
      graded.current = true;
      onGrade(g);
    },
    [onGrade],
  );

  const play = useCallback(() => {
    audio.current?.play().catch(() => setAudioFailed(true));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === " ") {
        event.preventDefault();
        setRevealed(true);
      } else if (revealed && /^[1-4]$/.test(event.key)) {
        grade(GRADES[Number(event.key) - 1].grade);
      } else if ((event.key === "p" || event.key === "P") && showAudio) {
        play();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, grade, play, showAudio]);

  const before = fsrs ?? newCardState(shownAt);
  const intervals = GRADES.map(({ grade: g }) => Date.parse(gradeCard(before, g, shownAt).due) - shownAt.getTime());

  return (
    <article aria-label="단어 카드" className="flex flex-col gap-5">
      <div className="flex min-h-64 flex-col justify-center gap-5 rounded-2xl border bg-card px-5 py-7 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_rgb(0_0_0/0.05)]">
        <p className="text-caption text-muted-foreground">{PROMPT[mode]}</p>

        {mode === "cloze" && word.example ? (
          <Sentence text={word.example.en} lemma={word.lemma} blank={!revealed} />
        ) : (
          <div className="flex items-center gap-3">
            <h2 lang="en" className="text-[2.5rem] leading-tight font-bold tracking-tight break-words">
              {word.lemma}
            </h2>
            {showAudio && <AudioButton onPlay={play} />}
          </div>
        )}

        {mode === "context" && word.example && <Sentence text={word.example.en} lemma={word.lemma} />}

        <p className="text-caption text-muted-foreground">
          {POS_LABEL[word.pos]}
          {mode === "cloze" && word.example && ` · ${word.example.ko}`}
        </p>

        {revealed && (
          <div className="flex flex-col gap-2 border-t pt-4">
            {mode === "cloze" && (
              <p className="flex items-center gap-3">
                <span lang="en" className="text-title font-bold">
                  {word.lemma}
                </span>
                {showAudio && <AudioButton onPlay={play} />}
              </p>
            )}
            <ul aria-label="뜻" className="flex flex-col gap-1 text-title font-medium">
              {word.meanings.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            {mode !== "cloze" && word.example && (
              <p className="text-muted-foreground">
                {mode === "meaning" && (
                  <span lang="en" className="block text-foreground">
                    {word.example.en}
                  </span>
                )}
                {word.example.ko}
              </p>
            )}
          </div>
        )}
      </div>

      {word.audio && <audio ref={audio} src={word.audio} preload="metadata" onError={() => setAudioFailed(true)} />}

      {revealed ? (
        <div role="group" aria-label="얼마나 잘 기억했나요?" className="grid grid-cols-4 gap-2">
          {GRADES.map(({ grade: g, label, key }, i) => (
            <Button
              key={g}
              variant="outline"
              onClick={() => grade(g)}
              aria-keyshortcuts={key}
              className="h-auto flex-col gap-0.5 py-2.5 text-base"
            >
              <span className="font-bold">{label}</span>
              <span className="text-caption font-normal text-muted-foreground tabular-nums">{formatInterval(intervals[i])}</span>
            </Button>
          ))}
        </div>
      ) : (
        <Button onClick={() => setRevealed(true)} aria-keyshortcuts="Space" className="h-12 text-base">
          {mode === "cloze" ? "단어 보기" : "뜻 보기"}
          <kbd className="ml-1 hidden rounded border border-primary-foreground/30 px-1.5 text-caption font-normal sm:inline">Space</kbd>
        </Button>
      )}
    </article>
  );
}

function Sentence({ text, lemma, blank = false }: { text: string; lemma: string; blank?: boolean }) {
  const at = findWord(text, lemma);
  if (!at) return <p lang="en">{text}</p>;
  return (
    <p lang="en" className="text-sentence leading-relaxed">
      {text.slice(0, at.start)}
      {blank ? (
        <span aria-label="빈칸" className="inline-block w-20 border-b-2 border-foreground align-baseline" />
      ) : (
        <strong className="font-bold underline decoration-2 underline-offset-4">{text.slice(at.start, at.end)}</strong>
      )}
      {text.slice(at.end)}
    </p>
  );
}

function AudioButton({ onPlay }: { onPlay: () => void }) {
  return (
    <Button variant="ghost" size="icon-lg" onClick={onPlay} aria-label="발음 듣기" aria-keyshortcuts="P">
      <Volume2 className="size-5" />
    </Button>
  );
}
