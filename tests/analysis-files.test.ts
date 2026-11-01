import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { coverageCurve } from "@/lib/engine/coverage";
import { PassageStats, SyntaxStats, VocabFrequency } from "@/lib/schema/analysis";

const dir = path.join(__dirname, "../analysis");
const read = (name: string): unknown => JSON.parse(readFileSync(path.join(dir, name), "utf8"));

// The committed stage 4 outputs (npm run analyze) must match the schemas, and the
// app's coverage rule must reproduce the curve the Python script computed.
describe.skipIf(!existsSync(path.join(dir, "vocab_frequency.json")))("analysis/ files", () => {
  it("match their schemas", () => {
    expect(VocabFrequency.safeParse(read("vocab_frequency.json")).success).toBe(true);
    expect(SyntaxStats.safeParse(read("syntax_stats.json")).success).toBe(true);
    expect(PassageStats.safeParse(read("passage_stats.json")).success).toBe(true);
  });

  it("give the same coverage curve in the app as in the analysis script", () => {
    const vocab = VocabFrequency.parse(read("vocab_frequency.json"));
    const sizes = vocab.coverageCurve.all.map((c) => c.topN);
    const app = coverageCurve(vocab.lemmas, sizes);
    app.forEach((c, i) => expect(c.coverage).toBeCloseTo(vocab.coverageCurve.all[i].coverage, 3));
  });
});
