// Stage 8 follow-up: let the generator fix its own drafts from the review notes,
// then cross-solve and pre-review the new versions, for up to --rounds rounds.
// Runs on `claude -p` with the claude.ai subscription. Nothing is approved.
//
//   npm run content:revise -- --unit L0-U05 --dry-run
//   npm run content:revise -- --unit L0-U05 [--limit 5] [--rounds 2]
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { assertSubscriptionAuth, authStatus, subscriptionRunner } from "@/lib/pipeline/claude-cli";
import { runCrossCheck, runPreReview } from "@/lib/pipeline/crosscheck";
import { readDrafts } from "@/lib/pipeline/draft-store";
import { groupContextFor, readSpec } from "@/lib/pipeline/group-context";
import { MAX_VERSION, revisionTargets, runRevise } from "@/lib/pipeline/revise";
import { similarityStatus } from "@/lib/pipeline/similarity";
import { allowedLemmas, type FrequencyTable } from "@/lib/pipeline/vocab-range";

const { values } = parseArgs({
  options: {
    unit: { type: "string" },
    limit: { type: "string" },
    rounds: { type: "string", default: "2" },
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
  const log = (line: string) => process.stdout.write(`${line}\n`);
  const targets = revisionTargets(readDrafts(contentDir, unitId), MAX_VERSION);
  log(`수정할 문항 ${targets.length}개 (1회차 예상 호출: 수정 ${targets.length}, 교차 풀이 ${targets.length}, 사전 검수 ${targets.length})`);
  if (values["dry-run"] || !targets.length) return 0;

  assertSubscriptionAuth(await authStatus());
  const spec = readSpec(contentDir, unitId);
  const rankMax = spec?.generation.vocabRankMax ?? 2000;
  const groupContext = groupContextFor(contentDir, spec);

  const freq = JSON.parse(readFileSync(path.join(root, "analysis/vocab_frequency.json"), "utf8")) as FrequencyTable;
  const agent = readFileSync(path.join(root, ".claude/agents/content-reviewer.md"), "utf8");
  const reviewerPrompt = agent.replace(/^---[\s\S]*?---\s*/, "");
  const limit = values.limit ? Number(values.limit) : undefined;
  const contentModel = process.env.CLAUDE_CONTENT_MODEL ?? "opus";
  const base = { contentDir, unitId, runner: subscriptionRunner, now: new Date(), log };

  let failed = 0;
  for (let round = 1; round <= Number(values.rounds); round += 1) {
    log(`— ${round}회차 —`);
    const revised = await runRevise({ ...base, model: contentModel, allowed: allowedLemmas(freq, rankMax), similarity: similarityStatus, limit, groupContext });
    // Only the revised questions lack second opinions, so these calls stay within the limit.
    const solved = await runCrossCheck({ ...base, model: process.env.CLAUDE_CROSSCHECK_MODEL ?? "sonnet" });
    const reviewed = await runPreReview({ ...base, model: contentModel, reviewerPrompt, groupContext });
    failed += revised.failed + solved.failed + reviewed.failed;
    log(`수정 ${revised.revised}개(실패 ${revised.failed}), 교차 풀이 ${solved.calls}회(불일치·실패 ${solved.flagged}), 사전 검수 ${reviewed.calls}회(지적 남음 ${reviewed.flagged})`);
    if (!revised.revised) break;
  }
  const records = readDrafts(contentDir, unitId).records.filter((r) => r.kind === "question" && r.status !== "retired" && r.status !== "approved");
  const clean = records.filter((r) => r.status === "auto_checked" && r.preReview?.issues.length === 0 && r.crossSolve?.agrees).length;
  log(`결과: 문항 ${records.length}개 중 지적 없음 ${clean}개, 사람이 볼 것 ${records.length - clean}개`);
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
