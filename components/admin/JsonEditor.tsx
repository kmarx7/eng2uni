"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface JsonEditorProps {
  initial: unknown;
  pending: boolean;
  error: string | null;
  onSave: (json: string) => void;
  onCancel: () => void;
}

// Plain JSON editing; the server validates against the schema before saving.
export function JsonEditor({ initial, pending, error, onSave, onCancel }: JsonEditorProps) {
  const [text, setText] = useState(() => JSON.stringify(initial, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const save = () => {
    try {
      JSON.parse(text);
    } catch (e: unknown) {
      setParseError(`JSON 형식 오류: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setParseError(null);
    onSave(text);
  };
  const shown = parseError ?? error;
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span>JSON</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={18}
          className="rounded-lg border p-3 font-mono text-caption"
        />
      </label>
      {shown && (
        <p role="alert" className="text-destructive">
          {shown}
        </p>
      )}
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>
          저장
        </Button>
        <Button variant="outline" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
