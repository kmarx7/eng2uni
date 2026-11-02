// Reads current-version tag records from corpus/tagged/{examId}/{number}.json.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { TaggedItem } from "@/lib/schema/tagging";
import { PROMPT_VERSION } from "./prompt";

export function loadTagRecords(taggedDir: string): TaggedItem[] {
  const out: TaggedItem[] = [];
  for (const exam of readdirSync(taggedDir, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of readdirSync(path.join(taggedDir, exam.name)).filter((f) => f.endsWith(".json"))) {
      const r = TaggedItem.safeParse(JSON.parse(readFileSync(path.join(taggedDir, exam.name, file), "utf8")));
      if (r.success && r.data.promptVersion === PROMPT_VERSION) out.push(r.data);
    }
  }
  return out.sort((a, b) => a.examId.localeCompare(b.examId) || a.number - b.number);
}
