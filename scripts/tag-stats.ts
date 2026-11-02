// Stage 5: aggregate corpus/tagged into analysis/tagging_stats.json and
// docs/analysis/GRAMMAR_PRIORITY.md (counts and labels only, no exam text).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { TaggingStats } from "@/lib/schema/tagging";
import { aggregateTags } from "./tagging/aggregate";
import { renderGrammarReport } from "./tagging/grammar-report";
import { loadTagRecords } from "./tagging/records";

const root = process.cwd();
const taggedDir = path.join(root, "corpus/tagged");
const records = loadTagRecords(taggedDir);
if (!records.length) throw new Error("no tag records in corpus/tagged; run npm run tag:items first");

const stats = TaggingStats.parse(
  aggregateTags(records, { generator: "scripts/tag-stats.ts", reviewed: existsSync(path.join(taggedDir, "review-accuracy.json")) }),
);
mkdirSync(path.join(root, "docs/analysis"), { recursive: true });
writeFileSync(path.join(root, "analysis/tagging_stats.json"), JSON.stringify(stats, null, 1) + "\n");
writeFileSync(path.join(root, "docs/analysis/GRAMMAR_PRIORITY.md"), renderGrammarReport(stats));
console.log(`tagging stats: ${records.length} items from ${stats.meta.exams.length} exams -> analysis/tagging_stats.json`);
