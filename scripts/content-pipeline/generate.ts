// Stage 8: draft sentences, questions and a unit from content/specs/{unitId}.json
// with `claude -p` on the claude.ai subscription (no API key, no per-token billing).
// Drafts go to content/drafts/ only; a person approves them in /admin/review-queue.
//
//   npm run content:generate -- --spec L0-U05 --dry-run
//   npm run content:generate -- --spec L0-U05 [--limit 5] [--model opus]
//   npm run content:generate -- --spec-file path/to/spec.json --dry-run
//   npm run content:generate -- --vocab L0 [--dry-run] [--limit 5]   (examples for vocabulary cards)
import path from "node:path";
import { parseArgs } from "node:util";
import { assertSubscriptionAuth, authStatus, subscriptionRunner } from "@/lib/pipeline/claude-cli";
import { runGenerate } from "@/lib/pipeline/generate";
import { similarityStatus } from "@/lib/pipeline/similarity";
import { runVocabExamples } from "@/lib/pipeline/vocab-examples";

const { values } = parseArgs({
  options: {
    spec: { type: "string" },
    "spec-file": { type: "string" },
    vocab: { type: "string" },
    limit: { type: "string" },
    model: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

async function main(): Promise<number> {
  const root = process.cwd();
  const log = (line: string) => process.stdout.write(`${line}\n`);
  if (values.vocab) {
    const dryRun = values["dry-run"] ?? false;
    if (!dryRun) assertSubscriptionAuth(await authStatus());
    const result = await runVocabExamples({
      root,
      level: values.vocab,
      dryRun,
      limit: values.limit ? Number(values.limit) : undefined,
      model: values.model,
      runner: subscriptionRunner,
      similarity: similarityStatus,
      now: new Date(),
      log,
    });
    return result.failed > 0 ? 1 : 0;
  }
  const specPath = values["spec-file"] ?? (values.spec ? path.join(root, "content/specs", `${values.spec}.json`) : undefined);
  if (!specPath) {
    process.stderr.write("--spec {unitId}, --spec-file {경로} 또는 --vocab {레벨}이 필요합니다\n");
    return 2;
  }
  const dryRun = values["dry-run"] ?? false;
  if (!dryRun) assertSubscriptionAuth(await authStatus());
  const result = await runGenerate({
    root,
    specPath,
    dryRun,
    limit: values.limit ? Number(values.limit) : undefined,
    model: values.model,
    runner: subscriptionRunner,
    similarity: similarityStatus,
    now: new Date(),
    log,
  });
  return result.failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
