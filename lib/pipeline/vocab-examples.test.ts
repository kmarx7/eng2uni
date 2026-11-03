import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Vocabulary } from "@/lib/schema/vocabulary";
import type { ClaudeRunner } from "./claude-cli";
import { readDrafts, writeJsonAtomic } from "./draft-store";
import { approve } from "./review-store";
import { runVocabExamples } from "./vocab-examples";

let root: string;
let contentDir: string;
const now = new Date("2026-11-03T09:00:00+09:00");

const word = (id: string, lemma: string, extra: Partial<Vocabulary> = {}): Vocabulary => ({
  id,
  lemma,
  pos: "noun",
  meanings: ["고양이"],
  level: "L0",
  isPolysemous: false,
  reviewStatus: "approved",
  ...extra,
});

const runnerReturning = (change: (item: Record<string, unknown>) => Record<string, unknown> = (i) => i) => {
  const calls: string[] = [];
  const runner: ClaudeRunner = async ({ input }) => {
    calls.push(input);
    const { items } = JSON.parse(input) as { items: Record<string, unknown>[] };
    return { ok: true, json: { items: items.map((i) => change({ ...i, example: { en: "The cat drinks milk.", ko: "고양이가 우유를 마신다." } })) } };
  };
  return { runner, calls };
};

const similarity = async (items: { id: string }[]) => new Map(items.map((i) => [i.id, "pass" as const]));
const run = (runner: ClaudeRunner, dryRun = false) =>
  runVocabExamples({ root, level: "L0", dryRun, runner, similarity, now, log: () => {} });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "vocab-examples-"));
  contentDir = path.join(root, "content");
  mkdirSync(path.join(root, "analysis"));
  const lemmas = ["the", "cat", "drink", "milk"].map((lemma) => ({ lemma, kind: "content" }));
  writeFileSync(path.join(root, "analysis/vocab_frequency.json"), JSON.stringify({ lemmas }));
  const words = Array.from({ length: 21 }, (_, i) => word(`V-${String(i).padStart(4, "0")}`, `cat${i}`));
  words.push(word("V-HAS", "dog", { example: { en: "A dog.", ko: "개." } }));
  writeJsonAtomic(path.join(contentDir, "vocabulary/L0.json"), words);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("runVocabExamples", () => {
  it("plans 20 words per call and makes none in a dry run", async () => {
    const { runner, calls } = runnerReturning();
    expect(await run(runner, true)).toMatchObject({ calls: 2 });
    expect(calls).toHaveLength(0);
  });

  it("drafts examples only for words that lack one", async () => {
    const { runner, calls } = runnerReturning();
    await run(runner);
    expect(calls).toHaveLength(2);
    const drafts = JSON.parse(readFileSync(path.join(contentDir, "drafts/vocabulary/L0-examples.json"), "utf8")) as Vocabulary[];
    expect(drafts).toHaveLength(21);
    expect(drafts[0]).toMatchObject({ id: "V-0000", reviewStatus: "draft", example: { en: "The cat drinks milk." } });
    expect(readDrafts(contentDir, "L0-examples").records[0]).toMatchObject({ kind: "vocabulary", status: "auto_checked" });
  });

  it("flags an attempt to change the meaning and keeps the original", async () => {
    const { runner } = runnerReturning((i) => ({ ...i, meanings: ["강아지"] }));
    await run(runner);
    const drafts = readDrafts(contentDir, "L0-examples");
    expect(drafts.records[0]).toMatchObject({ status: "flagged", reasons: ["뜻 변경 시도"] });
    const draft = JSON.parse(readFileSync(path.join(contentDir, "drafts/vocabulary/L0-examples.json"), "utf8"))[0];
    expect(draft.meanings).toEqual(["고양이"]);
  });
});

describe("approving an example", () => {
  it("adds only the example to the approved word", async () => {
    await run(runnerReturning().runner);
    expect(approve(contentDir, "V-0000", "kim", now)).toEqual({ ok: true });
    const approved = JSON.parse(readFileSync(path.join(contentDir, "vocabulary/L0.json"), "utf8")) as Vocabulary[];
    expect(approved).toHaveLength(22);
    expect(approved[0]).toMatchObject({ meanings: ["고양이"], reviewStatus: "approved", example: { en: "The cat drinks milk." } });
  });

  it("refuses an example for a word that is not approved yet", async () => {
    writeJsonAtomic(path.join(contentDir, "vocabulary/L0.json"), [word("V-0000", "cat0", { reviewStatus: "draft" })]);
    await run(runnerReturning().runner);
    expect(approve(contentDir, "V-0000", "kim", now)).toEqual({ ok: false, error: "단어 cat0이 아직 승인되지 않았습니다(npm run vocab:approve 먼저)" });
  });
});
