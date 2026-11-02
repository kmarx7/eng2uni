import { Button } from "@/components/ui/button";

interface ConceptBlockProps {
  heading: string;
  body: string;
  onDone: () => void;
  doneLabel?: string;
}

// Text blocks of a unit: concept, remedial and contrast explanations.
export function ConceptBlock({ heading, body, onDone, doneLabel = "다음" }: ConceptBlockProps) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_4px_12px_rgb(0_0_0/0.04)]">
        <p className="text-caption text-muted-foreground">{heading}</p>
        <p className="text-title leading-snug font-medium text-balance">{body}</p>
      </div>
      <Button onClick={onDone} className="h-12 text-base">
        {doneLabel}
      </Button>
    </section>
  );
}
