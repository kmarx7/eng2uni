// Validates analysis/*.json (stage 4 outputs) against lib/schema/analysis. Exits 1 on any issue.
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";
import { PassageStats, SyntaxStats, VocabFrequency } from "@/lib/schema/analysis";

const files: [string, ZodType][] = [
  ["vocab_frequency.json", VocabFrequency],
  ["syntax_stats.json", SyntaxStats],
  ["passage_stats.json", PassageStats],
];
let failed = 0;

for (const [name, schema] of files) {
  const file = path.resolve(process.cwd(), "analysis", name);
  const result = schema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (result.success) {
    console.log(`ok    analysis/${name}`);
    continue;
  }
  failed += result.error.issues.length;
  console.error(`FAIL  analysis/${name}`);
  for (const issue of result.error.issues.slice(0, 20)) console.error(`  ${issue.path.join(".")}: ${issue.message}`);
}

if (failed) {
  console.error(`\nanalysis validation failed: ${failed} issue(s)`);
  process.exit(1);
}
console.log("analysis validation passed");
