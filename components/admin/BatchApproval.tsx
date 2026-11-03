"use client";

// Clean items (every automatic gate passed) are approved together, but only after
// the reviewer opens every sample item. A problem in the sample sends the whole
// batch back to one-by-one review.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveBatchAction, sendToIndividual } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import type { QueueEntry } from "@/lib/pipeline/review-store";
import { ItemPreview } from "./ItemPreview";
import { type Notice, NoticeLine, RecordFacts } from "./ReviewQueue";

export interface BatchView {
  unitId: string;
  count: number;
  sample: QueueEntry[];
}

export function BatchApproval({ batches, sentences }: { batches: BatchView[]; sentences: Record<string, string> }) {
  const [notice, setNotice] = useState<Notice>(null);
  return (
    <div className="flex flex-col gap-4">
      <NoticeLine notice={notice} />
      {batches.length === 0 ? (
        <p className="text-muted-foreground">깨끗한 문항이 없습니다.</p>
      ) : (
        batches.map((batch) => <Batch key={batch.unitId} batch={batch} sentences={sentences} onNotice={setNotice} />)
      )}
    </div>
  );
}

function Batch({ batch, sentences, onNotice }: { batch: BatchView; sentences: Record<string, string>; onNotice: (n: Notice) => void }) {
  const router = useRouter();
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const allOpened = batch.sample.every((e) => opened.has(e.record.id));

  const toggle = (id: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (action: () => ReturnType<typeof sendToIndividual>) =>
    startTransition(async () => {
      const result = await action();
      onNotice(result.ok ? { kind: "ok", text: result.message } : { kind: "error", text: result.error });
      router.refresh();
    });

  return (
    <section aria-label={`${batch.unitId} 묶음`} className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-4">
      <h2 className="font-bold">{batch.unitId}</h2>
      <p className="text-caption text-muted-foreground tabular-nums">
        깨끗한 문항 {batch.count}개 · 표본 {batch.sample.length}개를 모두 열어 봐야 승인할 수 있습니다
      </p>
      <ul className="flex flex-col gap-2">
        {batch.sample.map((entry) => {
          const id = entry.record.id;
          const open = opened.has(id);
          return (
            <li key={id} className="flex flex-col gap-2 rounded-lg border px-3 py-2">
              <Button variant="ghost" className="justify-start" onClick={() => toggle(id)} aria-expanded={open}>
                {open ? `표본 접기 ${id}` : `표본 펼치기 ${id}`}
              </Button>
              {open && (
                <>
                  <RecordFacts entry={entry} />
                  <ItemPreview entry={entry} sentences={sentences} />
                </>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!allOpened || pending} onClick={() => run(() => approveBatchAction(batch.unitId, [...opened]))}>
          모두 승인 ({batch.count}개)
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(() => sendToIndividual(batch.unitId))}>
          표본에 문제 있음 (개별 검수로)
        </Button>
      </div>
    </section>
  );
}
