import path from "node:path";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ReviewQueue, type QueueTab } from "@/components/admin/ReviewQueue";
import { readDrafts, readJsonArray } from "@/lib/pipeline/draft-store";
import { cleanBatch, listQueue, pickSample } from "@/lib/pipeline/review-store";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import { readdirSync, existsSync } from "node:fs";
import { adminState, contentDir } from "../session";

const TABS: QueueTab[] = ["items", "batch", "catalog", "vocab"];

export default function ReviewQueuePage({ searchParams }: PageProps<"/admin/review-queue">) {
  return (
    <Suspense fallback={null}>
      <Queue searchParams={searchParams} />
    </Suspense>
  );
}

// Sentence text by id, drafted or approved, for previews of questions.
function sentenceTexts(dir: string, unitIds: string[]): Record<string, string> {
  const approvedDir = path.join(dir, "sentences");
  const approved = existsSync(approvedDir)
    ? readdirSync(approvedDir)
        .filter((f) => f.endsWith(".json"))
        .flatMap((f) => readJsonArray<AnnotatedSentence>(path.join(approvedDir, f)))
    : [];
  const drafted = unitIds.flatMap((u) => readDrafts(dir, u).sentences);
  return Object.fromEntries([...approved, ...drafted].map((s) => [s.id, s.text]));
}

async function Queue({ searchParams }: Pick<PageProps<"/admin/review-queue">, "searchParams">) {
  if ((await adminState()) !== "ok") redirect("/admin/login");
  const params = await searchParams;
  const tab = TABS.find((t) => t === params.tab) ?? "items";
  const dir = contentDir();
  const entries = listQueue(dir);
  const unitIds = [...new Set(entries.map((e) => e.record.unitId))];
  const batches = unitIds
    .map((unitId) => {
      const ids = cleanBatch(dir, unitId);
      const sample = pickSample(ids, unitId).map((id) => entries.find((e) => e.record.id === id)!);
      return { unitId, count: ids.length, sample };
    })
    .filter((b) => b.count > 0);
  const shown = entries.filter((e) =>
    tab === "catalog" ? e.record.kind === "catalog" : tab === "vocab" ? e.record.kind === "vocabulary" : !["catalog", "vocabulary"].includes(e.record.kind),
  );
  return <ReviewQueue tab={tab} entries={shown} batches={batches} sentences={sentenceTexts(dir, unitIds)} />;
}
