// Human spot check of AI tags (stage 5 item 4). The CSV carries labels only;
// the reviewer checks them against the exam PDF, not against text in the file.
import type { TaggedItem } from "@/lib/schema/tagging";
import { splitCsvLine } from "../csv";

export interface ReviewRow {
  examId: string;
  number: number;
  type: string;
  correct: string;
  note: string;
}

export const REVIEW_HEADER = ["examId", "number", "type", "evidence", "traps", "grammar", "vocab", "blankRole", "cues", "topicDomain", "correct", "note"];

// mulberry32: small seeded generator so a sample can be redrawn exactly.
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleForReview(records: readonly TaggedItem[], rate: number, seed: number): TaggedItem[] {
  const next = random(seed);
  const byType = new Map<string, TaggedItem[]>();
  for (const r of records) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  const out: TaggedItem[] = [];
  for (const type of [...byType.keys()].sort()) {
    const pool = [...byType.get(type)!].sort((a, b) => a.examId.localeCompare(b.examId) || a.number - b.number);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push(...pool.slice(0, Math.max(1, Math.ceil(pool.length * rate))));
  }
  return out;
}

function cell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function reviewCsv(records: readonly TaggedItem[]): string {
  const rows = records.map((r) => {
    const t = r.tagging;
    return [
      r.examId,
      String(r.number),
      r.type,
      t.evidenceSentenceIndexes.join(" "),
      t.distractorTraps.map((d) => `${d.option}:${d.trap}`).join(" "),
      t.grammarPoints.map((g) => `${g.target}:${g.point}`).join(" "),
      t.vocabTargets.map((v) => `${v.target}:${v.basis}`).join(" "),
      t.blankRole ?? "",
      [...t.orderCues, ...t.insertionCues].join(" "),
      t.topicDomain,
      "",
      "",
    ].map(cell).join(",");
  });
  return [REVIEW_HEADER.join(","), ...rows].join("\n") + "\n";
}

export function parseReviewCsv(text: string): ReviewRow[] {
  const [header, ...lines] = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const cols = splitCsvLine(header);
  const at = (name: string) => cols.indexOf(name);
  return lines.map((line) => {
    const c = splitCsvLine(line);
    return { examId: c[at("examId")], number: Number(c[at("number")]), type: c[at("type")], correct: c[at("correct")] ?? "", note: c[at("note")] ?? "" };
  });
}

const YES = new Set(["y", "yes", "1", "o", "true", "맞음", "정답"]);
const NO = new Set(["n", "no", "0", "x", "false", "틀림", "오답"]);

export function scoreReview(rows: readonly ReviewRow[]): { type: string; reviewed: number; correct: number; accuracy: number | null; pending: number }[] {
  const acc = new Map<string, { reviewed: number; correct: number; pending: number }>();
  for (const r of rows) {
    const a = acc.get(r.type) ?? { reviewed: 0, correct: 0, pending: 0 };
    const v = r.correct.trim().toLowerCase();
    if (!v) a.pending++;
    else if (YES.has(v)) {
      a.reviewed++;
      a.correct++;
    } else if (NO.has(v)) a.reviewed++;
    else throw new Error(`${r.examId} #${r.number}: correct must be y or n, got "${r.correct}"`);
    acc.set(r.type, a);
  }
  return [...acc.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([type, a]) => ({ type, ...a, accuracy: a.reviewed ? Math.round((a.correct / a.reviewed) * 10000) / 10000 : null }))
    .map(({ type, reviewed, correct, accuracy, pending }) => ({ type, reviewed, correct, accuracy, pending }));
}
