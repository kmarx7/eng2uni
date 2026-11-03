// Exam-overlap check for drafts (DESIGN 14-7). The Python checker prints only
// ids, counts and an overlap flag, so no corpus text reaches this process.
import { spawn } from "node:child_process";
import path from "node:path";
import type { SimilarityResult } from "./checks";

export interface SimilarityItem {
  id: string;
  text: string;
}

function runChecker(input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("uv", ["run", "python", "check_text.py"], { cwd: path.join(process.cwd(), "scripts/analysis") });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`check_text.py exited ${code}`))));
    child.stdin.end(input);
  });
}

// Every item gets a result; when the checker cannot run, all are "skipped".
export async function similarityStatus(
  items: SimilarityItem[],
  run: (input: string) => Promise<string> = runChecker,
): Promise<Map<string, SimilarityResult>> {
  const result = new Map<string, SimilarityResult>(items.map((i) => [i.id, "skipped"]));
  try {
    const out = JSON.parse(await run(JSON.stringify(items))) as { status: string; results: { id: string; overlap: boolean }[] };
    if (out.status !== "checked") return result;
    for (const r of out.results) if (result.has(r.id)) result.set(r.id, r.overlap ? "fail" : "pass");
  } catch {
    // Missing uv or a crash: leave everything skipped so nothing joins a clean batch.
  }
  return result;
}
