import { Check } from "lucide-react";
import { ROLE_CLASS } from "@/components/learning/roleStyles";
import type { RoleSymbol } from "@/lib/engine/analyzer";
import type { Question } from "@/lib/schema/question";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import type { Vocabulary } from "@/lib/schema/vocabulary";
import type { QueueEntry } from "@/lib/pipeline/review-store";
import { cn } from "@/lib/utils";

const SYMBOL: Partial<Record<string, RoleSymbol>> = { SUBJECT: "S", MAIN_VERB: "V", OBJECT: "O" };

// What the student would see, with the answer side open (admin only).
export function ItemPreview({ entry, sentences }: { entry: QueueEntry; sentences: Record<string, string> }) {
  const { record, item } = entry;
  if (!item) return <p className="text-destructive">초안 파일에서 이 항목을 찾지 못했습니다.</p>;
  if (record.kind === "sentence") return <SentencePreview sentence={item as AnnotatedSentence} />;
  if (record.kind === "question") return <QuestionPreview question={item as Question} sentenceText={sentences[(item as Question).sentenceId ?? ""]} />;
  if (record.kind === "vocabulary") return <VocabularyPreview word={item as Vocabulary} />;
  return <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-caption">{JSON.stringify(item, null, 2)}</pre>;
}

function SentencePreview({ sentence }: { sentence: AnnotatedSentence }) {
  return (
    <div className="flex flex-col gap-3">
      <p lang="en" className="text-sentence">
        {sentence.text}
      </p>
      <ul className="flex flex-wrap gap-2">
        {sentence.spans.map((span) => {
          const symbol = SYMBOL[span.role];
          return (
            <li key={span.id} className={cn("rounded-md border px-2 py-1 text-caption", symbol ? ROLE_CLASS[symbol] : "bg-muted")}>
              <span className="font-bold">{symbol ?? span.role}</span>{" "}
              <span lang="en">{sentence.tokens.slice(span.range[0], span.range[1] + 1).join(" ")}</span>
              {span.gloss && <span> · {span.gloss}</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground">{sentence.translation}</p>
    </div>
  );
}

function QuestionPreview({ question, sentenceText }: { question: Question; sentenceText?: string }) {
  return (
    <div className="flex flex-col gap-3">
      {sentenceText && (
        <p lang="en" className="text-sentence">
          {sentenceText}
        </p>
      )}
      <p className="font-bold">{question.prompt}</p>
      <ul className="flex flex-col gap-2">
        {question.options.map((o) => {
          const right = o.id === question.answer;
          return (
            <li key={o.id} className={cn("rounded-lg border px-3 py-2", right && "border-primary")}>
              <p className="flex items-center gap-2">
                {right ? <Check aria-label="정답" className="size-4" /> : <span aria-hidden className="size-4" />}
                <span lang="en">{o.text}</span>
                {(o.misconception || o.trap) && <span className="text-caption text-muted-foreground">{o.misconception ?? o.trap}</span>}
              </p>
              {question.explanation.byOption[o.id] && <p className="pl-6 text-caption text-muted-foreground">{question.explanation.byOption[o.id]}</p>}
            </li>
          );
        })}
      </ul>
      <p>해설: {question.explanation.summary}</p>
      {question.hints?.direction && <p className="text-caption text-muted-foreground">힌트 1: {question.hints.direction}</p>}
    </div>
  );
}

function VocabularyPreview({ word }: { word: Vocabulary }) {
  return (
    <div className="flex flex-col gap-2">
      <p>
        <span lang="en" className="text-title font-bold">
          {word.lemma}
        </span>{" "}
        <span className="text-caption text-muted-foreground">{word.pos}</span>
      </p>
      <p>{word.meanings.join(", ")}</p>
      {word.example && (
        <>
          <p lang="en" className="text-sentence">
            {word.example.en}
          </p>
          <p className="text-muted-foreground">{word.example.ko}</p>
        </>
      )}
    </div>
  );
}
