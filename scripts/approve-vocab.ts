// HUMAN-ONLY approval: copies the draft list in content/drafts/vocabulary/
// into the approved vocabulary folder with reviewStatus "approved".
//   npm run vocab:approve -- middle [--replace]
// Agents never run this (CLAUDE.md: only a person approves). It refuses to run
// inside Claude Code, which sets CLAUDECODE in its shell.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { Vocabulary } from "@/lib/schema/vocabulary";

if (process.env.CLAUDECODE) {
  console.error("사람이 직접 터미널에서 실행하는 승인 명령입니다. 에이전트는 실행할 수 없습니다.");
  process.exit(1);
}
const { values, positionals } = parseArgs({ allowPositionals: true, options: { replace: { type: "boolean", default: false } } });
const source = positionals[0] ?? "";
const root = process.cwd();
const from = path.join(root, "content", "drafts", "vocabulary", `${source}.json`);
const to = path.join(root, "content", "vocabulary", `${source}.json`);
if (!/^[a-z0-9-]+$/.test(source) || !existsSync(from)) throw new Error(`no draft list named "${source}"`);
if (existsSync(to) && !values.replace) throw new Error(`approved list "${source}" exists; add --replace to overwrite`);

const words = z.array(Vocabulary).parse(JSON.parse(readFileSync(from, "utf8")));
writeFileSync(to, JSON.stringify(words.map((w) => ({ ...w, reviewStatus: "approved" })), null, 2) + "\n");
console.log(`승인: ${words.length}개 단어 (${source}). npm run validate:content 로 확인하세요.`);
