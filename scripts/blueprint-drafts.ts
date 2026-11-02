// Stage 5: draft blueprints from analysis/ statistics into
// content/drafts/blueprint-drafts/{type}.json (one-item arrays, schema-checked
// by validate:content). Drafts become Blueprints after human review.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PassageStats, SyntaxStats, VocabFrequency } from "@/lib/schema/analysis";
import { BlueprintDraft } from "@/lib/schema/blueprint";
import { TaggingStats } from "@/lib/schema/tagging";
import { buildBlueprintDrafts } from "./blueprints/build";

const root = process.cwd();
const read = (name: string) => JSON.parse(readFileSync(path.join(root, "analysis", name), "utf8"));
const drafts = buildBlueprintDrafts({
  vocab: VocabFrequency.parse(read("vocab_frequency.json")),
  syntax: SyntaxStats.parse(read("syntax_stats.json")),
  passages: PassageStats.parse(read("passage_stats.json")),
  tagging: TaggingStats.parse(read("tagging_stats.json")),
});
const outDir = path.join(root, "content/drafts/blueprint-drafts");
mkdirSync(outDir, { recursive: true });
for (const draft of drafts) {
  writeFileSync(path.join(outDir, `${draft.type}.json`), JSON.stringify([BlueprintDraft.parse(draft)], null, 2) + "\n");
}
console.log(`${drafts.length} blueprint drafts -> content/drafts/blueprint-drafts/`);
