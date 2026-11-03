// Stage 8: cross-solve (answer hidden) and pre-review of a unit's drafted
// questions with `claude -p` on the claude.ai subscription. Both can only flag.
//
//   npm run content:crosscheck -- --unit L0-U05 --dry-run
//   npm run content:crosscheck -- --unit L0-U05 [--limit 5]
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { assertSubscriptionAuth, authStatus, subscriptionRunner } from "@/lib/pipeline/claude-cli";
import { runCrossCheck, runPreReview } from "@/lib/pipeline/crosscheck";
import { readDrafts } from "@/lib/pipeline/draft-store";

const { values } = parseArgs({
  options: {
    unit: { type: "string" },
    limit: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

async function main(): Promise<number> {
  const root = process.cwd();
  const contentDir = path.join(root, "content");
  const unitId = values.unit;
  if (!unitId) {
    process.stderr.write("--unit {unitId}가 필요합니다\n");
    return 2;
  }
  const open = readDrafts(contentDir, unitId).records.filter((r) => r.kind === "question" && r.status !== "retired" && r.status !== "approved");
  const solve = open.filter((r) => !r.crossSolve).length;
  const review = open.filter((r) => !r.preReview).length;
  process.stdout.write(`예상 호출: 교차 풀이 ${solve}회, 사전 검수 ${review}회\n`);
  if (values["dry-run"]) return 0;

  assertSubscriptionAuth(await authStatus());
  const log = (line: string) => process.stdout.write(`${line}\n`);
  const limit = values.limit ? Number(values.limit) : undefined;
  const base = { contentDir, unitId, runner: subscriptionRunner, limit, now: new Date(), log };
  const solved = await runCrossCheck({ ...base, model: process.env.CLAUDE_CROSSCHECK_MODEL ?? "sonnet" });
  const agent = readFileSync(path.join(root, ".claude/agents/content-reviewer.md"), "utf8");
  const reviewerPrompt = agent.replace(/^---[\s\S]*?---\s*/, "");
  const reviewed = await runPreReview({ ...base, model: process.env.CLAUDE_CONTENT_MODEL ?? "opus", reviewerPrompt });
  log(`교차 풀이 ${solved.calls}회(문제 있음 ${solved.flagged}, 실패 ${solved.failed}), 사전 검수 ${reviewed.calls}회(문제 있음 ${reviewed.flagged}, 실패 ${reviewed.failed})`);
  return solved.failed + reviewed.failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
