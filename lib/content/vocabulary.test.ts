// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCoverageEntries, loadStudentVocabulary } from "./vocabulary";

const word = (id: string, rank: number | undefined, reviewStatus = "approved") => ({
  id, lemma: id.toLowerCase(), pos: "noun", meanings: ["가짜"], level: "L0", isPolysemous: false,
  ...(rank ? { csatFrequencyRank: rank } : {}), reviewStatus,
});

function contentDir(files: Record<string, unknown[]>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "e90-content-"));
  mkdirSync(path.join(dir, "vocabulary"));
  for (const [name, items] of Object.entries(files)) writeFileSync(path.join(dir, "vocabulary", name), JSON.stringify(items));
  return dir;
}

describe("loadStudentVocabulary", () => {
  it("returns approved words only, ranked words first by rank, then file and list order", () => {
    const dir = contentDir({
      "a.json": [word("FIXTURE-A1", undefined), word("FIXTURE-A2", 50), word("FIXTURE-A3", 5, "draft")],
      "b.json": [word("FIXTURE-B1", 10), word("FIXTURE-B2", undefined)],
    });
    expect(loadStudentVocabulary(dir).map((w) => w.id)).toEqual(["FIXTURE-B1", "FIXTURE-A2", "FIXTURE-A1", "FIXTURE-B2"]);
  });

  it("returns nothing when there is no vocabulary folder", () => {
    expect(loadStudentVocabulary(mkdtempSync(path.join(os.tmpdir(), "e90-empty-")))).toEqual([]);
  });
});

describe("loadCoverageEntries", () => {
  it("is null without analysis/vocab_frequency.json and reads lemmas when present", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "e90-root-"));
    expect(loadCoverageEntries(root)).toBeNull();
    mkdirSync(path.join(root, "analysis"));
    writeFileSync(path.join(root, "analysis/vocab_frequency.json"), JSON.stringify({ lemmas: [{ lemma: "fake", kind: "content", totalCount: 3, pos: "NOUN" }] }));
    expect(loadCoverageEntries(root)).toEqual([{ lemma: "fake", kind: "content", totalCount: 3 }]);
  });
});
