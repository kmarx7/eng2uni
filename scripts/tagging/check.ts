// Validates one `claude -p` result: Zod schema first, then item-level consistency.
import { ItemTagging } from "@/lib/schema/tagging";
import { requirementsFor, type ExamItem } from "./prompt";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export type ClaudeResult =
  | { ok: true; tagging: ItemTagging; model: string; usage: Usage }
  | { ok: false; error: string; limitReached: boolean; usage?: Usage };

// Any "limit" message from claude (usage, rate, 5-hour, weekly, spend) stops the run.
const LIMIT = /\blimit\b|\b429\b|settings\/usage/i;

function usageOf(raw: Record<string, number> | undefined): Usage {
  return {
    inputTokens: raw?.input_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    cacheReadInputTokens: raw?.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: raw?.cache_creation_input_tokens ?? 0,
  };
}

export function parseClaudeResult(stdout: string): ClaudeResult {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stdout);
  } catch {
    return { ok: false, error: "output is not JSON", limitReached: LIMIT.test(stdout) };
  }
  const usage = usageOf(data.usage as Record<string, number> | undefined);
  if (data.is_error) {
    const message = String(data.result ?? data.subtype ?? "error");
    return { ok: false, error: message.slice(0, 200), limitReached: LIMIT.test(message), usage };
  }
  const parsed = ItemTagging.safeParse(data.structured_output);
  if (!parsed.success) {
    return { ok: false, error: `schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, limitReached: false, usage };
  }
  const model = Object.keys((data.modelUsage as Record<string, unknown>) ?? {})[0] ?? "unknown";
  return { ok: true, tagging: parsed.data, model, usage };
}

// Problems a schema cannot see. An empty list means the tagging is usable.
export function checkTagging(item: ExamItem, sentenceCount: number, t: ItemTagging): string[] {
  const req = requirementsFor(item);
  const problems: string[] = [];
  for (const n of t.evidenceSentenceIndexes) {
    if (n > sentenceCount) problems.push(`evidence sentence ${n} is outside 1..${sentenceCount}`);
  }
  if (req.traps) {
    if (item.answer !== null && t.distractorTraps.some((d) => d.option === item.answer)) {
      problems.push(`trap given for the correct answer ${item.answer}`);
    }
    if (item.answer !== null) {
      const covered = new Set(t.distractorTraps.map((d) => d.option));
      const missing = [1, 2, 3, 4, 5].filter((o) => o !== item.answer && !covered.has(o));
      if (missing.length) problems.push(`traps missing for options ${missing.join(", ")}`);
    }
  } else if (t.distractorTraps.length) {
    problems.push("distractorTraps must be empty for this item");
  }
  if (req.blankRole && t.blankRole === null) problems.push("blankRole is required");
  if (!req.blankRole && t.blankRole !== null) problems.push("blankRole must be null for this item");
  const lists: [boolean, unknown[], string][] = [
    [req.grammar, t.grammarPoints, "grammarPoints"],
    [req.vocab, t.vocabTargets, "vocabTargets"],
    [req.orderCues, t.orderCues, "orderCues"],
    [req.insertionCues, t.insertionCues, "insertionCues"],
  ];
  for (const [required, list, name] of lists) {
    if (required && list.length === 0) problems.push(`${name} is required`);
    if (!required && list.length > 0) problems.push(`${name} must be empty for this item`);
  }
  return problems;
}
