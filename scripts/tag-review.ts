// Stage 5 spot check of AI tags.
//   npm run tag:review -- make [--rate 0.1] [--seed 20261101] [--force]  -> corpus/tagged/review.csv
//   npm run tag:review -- score                                           -> per-type accuracy
// Fill the "correct" column with y or n (o/x, 맞음/틀림 also work) after checking each row against the exam PDF.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadTagRecords } from "./tagging/records";
import { parseReviewCsv, reviewCsv, sampleForReview, scoreReview } from "./tagging/review";

const taggedDir = path.join(process.cwd(), "corpus/tagged");
const csvPath = path.join(taggedDir, "review.csv");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { rate: { type: "string", default: "0.1" }, seed: { type: "string", default: "20261101" }, force: { type: "boolean", default: false } },
});

const command = positionals[0];
if (command === "make") {
  if (existsSync(csvPath) && !values.force && parseReviewCsv(readFileSync(csvPath, "utf8")).some((r) => r.correct.trim())) {
    console.error("review.csv already has answers; use --force to replace it");
    process.exit(1);
  }
  const records = loadTagRecords(taggedDir);
  const sample = sampleForReview(records, Number(values.rate), Number(values.seed));
  // BOM so spreadsheet apps open the UTF-8 file correctly.
  writeFileSync(csvPath, "﻿" + reviewCsv(sample));
  console.log(`review.csv: ${sample.length} of ${records.length} tagged items (rate ${values.rate}, seed ${values.seed})`);
} else if (command === "score") {
  const scores = scoreReview(parseReviewCsv(readFileSync(csvPath, "utf8")));
  writeFileSync(path.join(taggedDir, "review-accuracy.json"), JSON.stringify(scores, null, 2) + "\n");
  for (const s of scores) {
    console.log(`${s.type.padEnd(20)} ${s.accuracy === null ? "  -  " : `${(s.accuracy * 100).toFixed(1)}%`.padStart(6)}  reviewed ${s.reviewed}, pending ${s.pending}`);
  }
} else {
  console.error("usage: npm run tag:review -- make|score");
  process.exit(1);
}
