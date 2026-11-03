"use client";

// One item at a time with its reasons and the answer side open. Keys: A approve,
// R reject, E edit, J/K next/previous (ignored while typing).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { type AdminResult, approveItem, rejectItem, saveEdit } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import type { QueueEntry } from "@/lib/pipeline/review-store";
import { cn } from "@/lib/utils";
import { BatchApproval, type BatchView } from "./BatchApproval";
import { ItemPreview } from "./ItemPreview";
import { JsonEditor } from "./JsonEditor";

export type QueueTab = "items" | "batch" | "catalog" | "vocab";

const TAB_LABEL: Record<QueueTab, string> = { items: "개별 검수", batch: "깨끗한 묶음", catalog: "기초 목록", vocab: "어휘" };
export const STATUS_LABEL: Record<string, string> = { flagged: "문제 있음", auto_checked: "검사 통과", draft: "초안" };
const KIND_LABEL: Record<string, string> = { sentence: "문장", question: "문항", unit: "단원", catalog: "기초 목록", vocabulary: "어휘" };

interface ReviewQueueProps {
  tab: QueueTab;
  entries: QueueEntry[];
  batches: BatchView[];
  sentences: Record<string, string>;
}

export type Notice = { kind: "ok" | "error"; text: string } | null;

export function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return notice.kind === "ok" ? (
    <p role="status">{notice.text}</p>
  ) : (
    <p role="alert" className="text-destructive">
      {notice.text}
    </p>
  );
}

export function ReviewQueue({ tab, entries, batches, sentences }: ReviewQueueProps) {
  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-title font-bold tracking-tight">검수 대기</h1>
      <nav className="flex flex-wrap gap-2">
        {(Object.keys(TAB_LABEL) as QueueTab[]).map((t) => (
          <Link
            key={t}
            href={`/admin/review-queue?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cn("rounded-lg border px-3 py-2", t === tab && "border-primary font-bold")}
          >
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>
      {tab === "batch" ? <BatchApproval batches={batches} sentences={sentences} /> : <ItemsView entries={entries} sentences={sentences} />}
    </section>
  );
}

function ItemsView({ entries, sentences }: { entries: QueueEntry[]; sentences: Record<string, string> }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.record.id ?? null);
  const [lastIndex, setLastIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // After an action the list shrinks; stay at the same position.
  const found = entries.findIndex((e) => e.record.id === selectedId);
  const index = found >= 0 ? found : Math.min(lastIndex, entries.length - 1);
  const entry = index >= 0 ? entries[index] : undefined;

  const select = useCallback(
    (i: number) => {
      const next = entries[i];
      if (!next) return;
      setSelectedId(next.record.id);
      setLastIndex(i);
      setEditing(false);
    },
    [entries],
  );

  const run = useCallback(
    (action: () => Promise<AdminResult>, onOk?: () => void) => {
      startTransition(async () => {
        const result = await action();
        if (result.ok) {
          setNotice({ kind: "ok", text: result.message });
          setLastIndex(index);
          onOk?.();
          router.refresh();
        } else {
          setNotice({ kind: "error", text: result.error });
        }
      });
    },
    [index, router],
  );

  const approveCurrent = useCallback(() => entry && run(() => approveItem(entry.record.id)), [entry, run]);
  const rejectCurrent = useCallback(() => entry && run(() => rejectItem(entry.record.id)), [entry, run]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (editing || pending || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = e.key.toLowerCase();
      if (key === "a") approveCurrent();
      else if (key === "r") rejectCurrent();
      else if (key === "e") setEditing(true);
      else if (key === "j") select(index + 1);
      else if (key === "k") select(index - 1);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, pending, approveCurrent, rejectCurrent, select, index]);

  if (!entry) {
    return (
      <>
        <NoticeLine notice={notice} />
        <p className="text-muted-foreground">검수할 항목이 없습니다.</p>
      </>
    );
  }
  const { record } = entry;
  return (
    <div className="flex flex-col gap-4">
      <NoticeLine notice={notice} />
      <section aria-label="검수 항목" className="flex flex-col gap-4 rounded-xl border bg-card px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-bold">
            {KIND_LABEL[record.kind]} {record.id}
          </p>
          <p className="text-caption text-muted-foreground tabular-nums">
            {STATUS_LABEL[record.status]} · {index + 1} / {entries.length}
          </p>
        </div>
        <RecordFacts entry={entry} />
        {editing ? (
          <JsonEditor
            initial={entry.item}
            pending={pending}
            error={editError}
            onCancel={() => {
              setEditing(false);
              setEditError(null);
            }}
            onSave={(json) =>
              startTransition(async () => {
                const result = await saveEdit(record.id, json);
                if (result.ok) {
                  setEditing(false);
                  setEditError(null);
                  setNotice({ kind: "ok", text: result.message });
                  router.refresh();
                } else {
                  setEditError(result.error);
                }
              })
            }
          />
        ) : (
          <>
            <ItemPreview entry={entry} sentences={sentences} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={approveCurrent} disabled={pending} aria-keyshortcuts="A">
                승인
              </Button>
              <Button variant="destructive" onClick={rejectCurrent} disabled={pending} aria-keyshortcuts="R">
                폐기
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)} aria-keyshortcuts="E">
                수정
              </Button>
            </div>
          </>
        )}
      </section>
      <ol aria-label="검수 목록" className="flex flex-col gap-1">
        {entries.map((e, i) => (
          <li key={e.record.id}>
            <button
              type="button"
              onClick={() => select(i)}
              aria-current={i === index ? "true" : undefined}
              className={cn("flex w-full justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted", i === index && "bg-muted font-bold")}
            >
              <span>{e.record.id}</span>
              <span className={cn("text-caption", e.record.status === "flagged" ? "text-destructive" : "text-muted-foreground")}>
                {STATUS_LABEL[e.record.status]}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RecordFacts({ entry }: { entry: QueueEntry }) {
  const { record } = entry;
  return (
    <div className="flex flex-col gap-1 text-caption">
      {record.reasons.length > 0 && (
        <ul className="flex flex-col gap-1">
          {record.reasons.map((reason) => (
            <li key={reason} className="text-destructive">
              {reason}
            </li>
          ))}
        </ul>
      )}
      {record.crossSolve && (
        <p className="text-muted-foreground">
          교차 풀이: {record.crossSolve.answer ?? "없음"} ({record.crossSolve.agrees ? "일치" : "불일치"})
        </p>
      )}
      {record.preReview && record.preReview.issues.length === 0 && <p className="text-muted-foreground">사전 검수: 지적 없음</p>}
    </div>
  );
}
