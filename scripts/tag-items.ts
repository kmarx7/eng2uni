// Stage 5: tag corpus/structured items with `claude -p` on the claude.ai
// subscription (no API key, no per-token billing). Results go to corpus/tagged/
// (private). Prompts hold exam text, so nothing here prints them.
//
//   npm run tag:items -- --exam 2026_csat --dry-run
//   npm run tag:items -- --exam 2026_csat [--limit 5] [--model sonnet] [--concurrency 2] [--retag]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { TaggedItem, taggingJsonSchema } from "@/lib/schema/tagging";
import { checkTagging, parseClaudeResult, type Usage } from "./tagging/check";
import { assertSubscriptionAuth, authStatus, claudeArgs, runClaude } from "@/lib/pipeline/claude-cli";
import { ExamItem, PROMPT_VERSION, SYSTEM_PROMPT, buildPrompt } from "./tagging/prompt";

const root = process.cwd();
const structuredDir = path.join(root, "corpus/structured");
const taggedDir = path.join(root, "corpus/tagged");

const { values } = parseArgs({
  options: {
    exam: { type: "string", multiple: true },
    limit: { type: "string" },
    model: { type: "string", default: process.env.CLAUDE_TAGGING_MODEL ?? "sonnet" },
    concurrency: { type: "string", default: "2" },
    "dry-run": { type: "boolean", default: false },
    retag: { type: "boolean", default: false },
  },
});

const examFilter = new Set((values.exam ?? []).flatMap((e) => e.split(",")));
const cachePath = (item: ExamItem) => path.join(taggedDir, item.examId, `${item.number}.json`);

function cached(item: ExamItem): boolean {
  if (values.retag || !existsSync(cachePath(item))) return false;
  const record = TaggedItem.safeParse(JSON.parse(readFileSync(cachePath(item), "utf8")));
  return record.success && record.data.promptVersion === PROMPT_VERSION;
}

function loadItems(): ExamItem[] {
  const items: ExamItem[] = [];
  for (const file of readdirSync(structuredDir).filter((f) => /^\d{4}_\w+\.json$/.test(f)).sort()) {
    const exam = JSON.parse(readFileSync(path.join(structuredDir, file), "utf8"));
    if (examFilter.size && !examFilter.has(exam.examId)) continue;
    for (const q of exam.questions) items.push(ExamItem.parse({ ...q, examId: exam.examId }));
  }
  return items;
}

const totals: Usage = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
function addUsage(u?: Usage) {
  if (!u) return;
  for (const k of Object.keys(totals) as (keyof Usage)[]) totals[k] += u[k];
}

let calls = 0;
let stopped = false;
const failures: { examId: string; number: number; errors: string[] }[] = [];
let done = 0;

async function tagOne(item: ExamItem, schema: string): Promise<void> {
  const { prompt, sentenceCount } = buildPrompt(item);
  const args = claudeArgs({ model: values.model!, schema, systemPrompt: SYSTEM_PROMPT });
  const errors: string[] = [];
  let input = prompt;
  for (let attempt = 1; attempt <= 2 && !stopped; attempt++) {
    calls++;
    const run = await runClaude(args, input);
    const result = parseClaudeResult(run.stdout);
    addUsage(result.usage);
    if (!result.ok) {
      if (result.limitReached) {
        stopped = true;
        console.error(`usage limit reached at ${item.examId} #${item.number}; stopping (finished items are cached)`);
        return;
      }
      errors.push(`attempt ${attempt}: ${result.error}${run.code ? ` (exit ${run.code})` : ""}`);
      continue;
    }
    const problems = checkTagging(item, sentenceCount, result.tagging);
    if (problems.length) {
      errors.push(`attempt ${attempt}: ${problems.join("; ")}`);
      input = `${prompt}\n\nYour previous answer had these problems; fix them:\n- ${problems.join("\n- ")}`;
      continue;
    }
    const record = TaggedItem.parse({
      examId: item.examId,
      number: item.number,
      type: item.type,
      sentenceCount,
      model: result.model,
      promptVersion: PROMPT_VERSION,
      attempts: attempt,
      taggedAt: new Date().toISOString(),
      usage: result.usage,
      tagging: result.tagging,
    });
    mkdirSync(path.dirname(cachePath(item)), { recursive: true });
    writeFileSync(cachePath(item), JSON.stringify(record, null, 2) + "\n");
    done++;
    console.log(`ok   ${item.examId} #${item.number} (${item.type}) attempt ${attempt}`);
    return;
  }
  if (!stopped) {
    failures.push({ examId: item.examId, number: item.number, errors });
    console.error(`FAIL ${item.examId} #${item.number}: ${errors.at(-1)}`);
  }
}

async function main() {
  const items = loadItems();
  if (!items.length) throw new Error("no items: check --exam and corpus/structured");
  let todo = items.filter((i) => !cached(i));
  if (values.limit) todo = todo.slice(0, Number(values.limit));
  console.log(`items: ${items.length}, already tagged: ${items.length - items.filter((i) => !cached(i)).length}, to tag now: ${todo.length}`);
  console.log(`expected claude -p calls: ${todo.length} (up to ${todo.length * 2} with one retry each), model: ${values.model}`);
  if (values["dry-run"] || !todo.length) return;

  assertSubscriptionAuth(await authStatus());
  const schema = JSON.stringify(taggingJsonSchema());
  const queue = [...todo];
  const workers = Array.from({ length: Math.max(1, Number(values.concurrency)) }, async () => {
    while (queue.length && !stopped) await tagOne(queue.shift()!, schema);
  });
  await Promise.all(workers);

  mkdirSync(taggedDir, { recursive: true });
  const failurePath = path.join(taggedDir, "failures.json");
  const previous = existsSync(failurePath) ? JSON.parse(readFileSync(failurePath, "utf8")) : [];
  const keep = previous.filter((f: { examId: string; number: number }) => !todo.some((t) => t.examId === f.examId && t.number === f.number));
  writeFileSync(failurePath, JSON.stringify([...keep, ...failures], null, 2) + "\n");
  const summary = { at: new Date().toISOString(), model: values.model, planned: todo.length, tagged: done, failed: failures.length, stoppedAtLimit: stopped, calls, usage: totals };
  appendFileSync(path.join(taggedDir, "run-log.jsonl"), JSON.stringify(summary) + "\n");
  console.log(`\ntagged ${done}/${todo.length}, failed ${failures.length}, calls ${calls}${stopped ? ", stopped at usage limit" : ""}`);
  console.log(`tokens: input ${totals.inputTokens}, output ${totals.outputTokens}, cache write ${totals.cacheCreationInputTokens}, cache read ${totals.cacheReadInputTokens}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
