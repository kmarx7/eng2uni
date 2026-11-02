// Stage 6: data/vocab-source/{source}.csv into content/drafts/vocabulary/{source}.json (draft).
//   npm run vocab:import -- --source middle --level L0
// Fix every reported CSV problem first; nothing is written while errors remain.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { LevelId } from "@/lib/schema/common";
import { Vocabulary } from "@/lib/schema/vocabulary";
import { parseVocabCsv, toDraftVocabulary } from "./vocab/import";

const root = process.cwd();
const { values } = parseArgs({ options: { source: { type: "string" }, level: { type: "string" } } });
const source = values.source ?? "";
if (!/^[a-z0-9-]+$/.test(source)) throw new Error("--source must be lowercase letters, digits or - (file data/vocab-source/<source>.csv)");
const level = LevelId.parse(values.level);

const { rows, errors } = parseVocabCsv(readFileSync(path.join(root, "data/vocab-source", `${source}.csv`), "utf8"));
if (errors.length) {
  for (const e of errors) console.error(e);
  console.error(`\n${errors.length} problem(s); nothing written`);
  process.exit(1);
}

// CSAT frequency rank = position among counted lemmas in analysis/vocab_frequency.json.
const rankByLemma = new Map<string, number>();
const freqFile = path.join(root, "analysis/vocab_frequency.json");
if (existsSync(freqFile)) {
  const { lemmas } = JSON.parse(readFileSync(freqFile, "utf8")) as { lemmas: { lemma: string; kind: string }[] };
  lemmas
    .filter((l) => l.kind === "content" || l.kind === "function")
    .forEach((l, i) => rankByLemma.has(l.lemma) || rankByLemma.set(l.lemma, i + 1));
}

const words = toDraftVocabulary(rows, { source, level, rankByLemma }).map((w) => Vocabulary.parse(w));
const outDir = path.join(root, "content/drafts/vocabulary");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, `${source}.json`), JSON.stringify(words, null, 2) + "\n");
const ranked = words.filter((w) => w.csatFrequencyRank).length;
console.log(`${words.length} draft words saved as content/drafts/vocabulary/${source}.json (${ranked} with CSAT rank${rankByLemma.size ? "" : "; no analysis/vocab_frequency.json"})`);
