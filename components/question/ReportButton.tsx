"use client";

// "문제 오류 신고": a student flags a broken question. Shown only where reports
// can be stored (ENABLE_REPORTS=1); `npm run content:reports` handles them.
import { useState } from "react";
import { reportQuestion } from "@/app/(student)/learn/actions";
import { Button } from "@/components/ui/button";

const REASONS = [
  { id: "answer", label: "정답이 틀린 것 같아요" },
  { id: "explanation", label: "해설이 이상해요" },
  { id: "sentence", label: "문장이 이상해요" },
  { id: "other", label: "기타" },
] as const;

export function ReportButton({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]["id"] | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (state === "sent") return <p className="text-caption text-muted-foreground">신고했습니다. 검토 후 고칠게요.</p>;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-caption text-muted-foreground underline underline-offset-4">
        문제 오류 신고
      </button>
    );
  }

  async function send() {
    if (!reason) return;
    setState("sending");
    const result = await reportQuestion(questionId, reason, note).catch(() => ({ ok: false }));
    setState(result.ok ? "sent" : "error");
  }

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      <legend className="px-1 text-caption font-bold">문제 오류 신고</legend>
      {REASONS.map((r) => (
        <label key={r.id} className="flex min-h-11 items-center gap-2">
          <input type="radio" name={`report-${questionId}`} value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} />
          {r.label}
        </label>
      ))}
      <label className="flex flex-col gap-1">
        <span className="text-caption">메모 (선택)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} className="rounded-lg border p-2" />
      </label>
      {state === "error" && (
        <p role="alert" className="text-caption text-destructive">
          신고를 보내지 못했습니다. 다시 눌러 주세요.
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={send} disabled={!reason || state === "sending"}>
          보내기
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>
    </fieldset>
  );
}
