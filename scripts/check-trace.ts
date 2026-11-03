// Fails when a server bundle trace includes files that must never ship: the exam
// corpus, AI drafts, test fixtures, unit specs or student reports (CLAUDE.md).
// Prints only page names and counts, never file contents. Runs after `next build`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const FORBIDDEN = ["corpus/", "content/drafts/", "content/_fixtures/", "content/specs/", "data/reports/"];

function traces(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return traces(full);
    return entry.name.endsWith(".nft.json") ? [full] : [];
  });
}

const serverDir = path.join(process.cwd(), process.env.NEXT_DIST_DIR ?? ".next", "server");
let bad = 0;
for (const file of traces(serverDir)) {
  const { files } = JSON.parse(readFileSync(file, "utf8")) as { files: string[] };
  const hits = FORBIDDEN.map((prefix) => [prefix, files.filter((f) => path.resolve(path.dirname(file), f).includes(`${path.sep}${prefix}`)).length] as const).filter(
    ([, n]) => n > 0,
  );
  if (hits.length) {
    bad += 1;
    process.stderr.write(`${path.relative(serverDir, file)}: ${hits.map(([p, n]) => `${p} ${n}`).join(", ")}\n`);
  }
}
if (bad) {
  process.stderr.write(`trace check failed: ${bad} server bundles include files that must not ship\n`);
  process.exit(1);
}
process.stdout.write("trace check passed\n");
