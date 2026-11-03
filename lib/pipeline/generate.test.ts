import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaudeRunner } from "./claude-cli";
import { readDrafts } from "./draft-store";
import { assignIds, groupOutputSchema, runGenerate } from "./generate";

let root: string;
const now = new Date("2026-11-03T09:00:00+09:00");

const spec = {
  unitId: "L0-U05",
  levelId: "L0",
  title: "주어 찾기",
  objectives: ["문장에서 주어를 찾는다"],
  targetSkills: ["subject_find"],
  vocabRange: { maxLevel: "L0", note: "빈도 상위 2000" },
  status: "specified",
  generation: {
    difficulty: 1,
    vocabRankMax: 2000,
    sentenceCount: 2,
    variantGroups: ["subject", "verb"].map((g) => ({
      id: `VG-L0-U05-${g}`,
      skillId: "subject_find",
      misconceptionIds: ["verb_as_subject"],
      questionType: "multiple_choice",
      count: 6,
      sentenceUse: "question",
      note: g,
    })),
  },
  catalog: {
    skills: [{ id: "subject_find", name: "주어 찾기", category: "syntax" }],
    misconceptions: [{ id: "verb_as_subject", skillId: "subject_find", category: "SYN", description: "동사를 주어로 본다" }],
  },
};

const sentenceOut = {
  level: "L0",
  text: "The cat drinks milk.",
  tokens: ["The", "cat", "drinks", "milk", "."],
  spans: [
    { id: "s", role: "SUBJECT", range: [0, 1] },
    { id: "v", role: "MAIN_VERB", range: [2, 2] },
  ],
  translation: "고양이가 우유를 마신다.",
  skills: ["subject_find"],
};
const questionOut = (answer = "a") => ({
  type: "multiple_choice",
  difficulty: 1,
  sentenceIndex: 0,
  prompt: "주어는?",
  options: [
    { id: "a", text: "The cat" },
    { id: "b", text: "drinks", misconception: "verb_as_subject" },
  ],
  answer,
  skills: ["subject_find"],
  explanation: { summary: "동작을 하는 쪽", byOption: { a: "주어", b: "동사" } },
});
const unitOut = {
  title: "주어 찾기",
  blocks: [
    { id: "L0-U05-B01", type: "concept", body: "주어는 동작을 하는 쪽" },
    { id: "L0-U05-B02", type: "assessment", questionIds: ["Q-L0-U05-001", "Q-L0-U05-002"] },
  ],
};

function fakeRunner(overrides: { fail?: boolean; answer?: string } = {}) {
  const calls: string[] = [];
  const runner: ClaudeRunner = async ({ input }) => {
    calls.push(input);
    if (overrides.fail) return { ok: false, error: "boom" };
    if (input.includes('"task":"unit"')) return { ok: true, json: unitOut };
    return { ok: true, json: { sentences: [sentenceOut], questions: [questionOut(overrides.answer)] } };
  };
  return { runner, calls };
}

const similarity = async (items: { id: string }[]) => new Map(items.map((i) => [i.id, "pass" as const]));
const logs: string[] = [];
const run = (runner: ClaudeRunner, extra: { limit?: number; dryRun?: boolean } = {}) =>
  runGenerate({ root, specPath: path.join(root, "content/specs/L0-U05.json"), dryRun: false, runner, similarity, now, log: (l) => logs.push(l), ...extra });

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "generate-"));
  mkdirSync(path.join(root, "content/specs"), { recursive: true });
  mkdirSync(path.join(root, "analysis"));
  writeFileSync(path.join(root, "content/specs/L0-U05.json"), JSON.stringify(spec));
  const lemmas = ["the", "cat", "drink", "milk"].map((lemma) => ({ lemma, kind: "content" }));
  writeFileSync(path.join(root, "analysis/vocab_frequency.json"), JSON.stringify({ lemmas }));
  logs.length = 0;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("assignIds", () => {
  it("continues after the highest existing number", () => {
    expect(assignIds("L0-U05", ["Q-L0-U05-007", "Q-L0-U05-002"], 2, "Q")).toEqual(["Q-L0-U05-008", "Q-L0-U05-009"]);
    expect(assignIds("L0-U05", [], 1, "S")).toEqual(["S-L0-U05-001"]);
  });
});

describe("groupOutputSchema", () => {
  it("is a JSON Schema without ids or review fields", () => {
    const schema = JSON.stringify(groupOutputSchema());
    expect(schema).toContain("sentenceIndex");
    expect(schema).not.toContain("reviewStatus");
    expect(schema).not.toContain("$schema");
  });
});

describe("runGenerate", () => {
  it("plans calls without making any in a dry run", async () => {
    const { runner, calls } = fakeRunner();
    expect(await run(runner, { dryRun: true })).toMatchObject({ calls: 3, written: 0 });
    expect(calls).toHaveLength(0);
    expect(logs.join("\n")).toContain("예상 호출 3회 (캐시 0회 제외)");
    expect(readDrafts(path.join(root, "content"), "L0-U05").records).toEqual([]);
  });

  it("stops at the call limit", async () => {
    const { runner, calls } = fakeRunner();
    await run(runner, { limit: 1 });
    expect(calls).toHaveLength(1);
    expect(readDrafts(path.join(root, "content"), "L0-U05").units).toEqual([]);
  });

  it("writes drafts, records, catalogue drafts and the unit with DESIGN 4-2 ids", async () => {
    const { runner } = fakeRunner();
    const result = await run(runner);
    expect(result).toMatchObject({ calls: 3, written: 5, flagged: 0 });
    const drafts = readDrafts(path.join(root, "content"), "L0-U05");
    expect(drafts.questions.map((q) => q.id)).toEqual(["Q-L0-U05-001", "Q-L0-U05-002"]);
    expect(drafts.questions[1]).toMatchObject({
      sentenceId: "S-L0-U05-002",
      variantGroup: "VG-L0-U05-verb",
      reviewStatus: "draft",
      source: { type: "original", generatedBy: "ai_draft" },
      version: 1,
    });
    expect(drafts.units[0]).toMatchObject({ id: "L0-U05", order: 5, skills: ["subject_find"], reviewStatus: "draft" });
    expect(drafts.records.find((r) => r.id === "Q-L0-U05-001")).toMatchObject({ status: "auto_checked", kind: "question" });
    expect(drafts.records.filter((r) => r.kind === "catalog").map((r) => r.id)).toEqual(["subject_find", "verb_as_subject"]);
    expect(JSON.parse(readFileSync(path.join(root, "content/drafts/skills.json"), "utf8"))[0].id).toBe("subject_find");
  });

  it("saves output that breaks a content rule as flagged with the reason", async () => {
    const { runner } = fakeRunner({ answer: "z" });
    await run(runner, { limit: 1 });
    const record = readDrafts(path.join(root, "content"), "L0-U05").records.find((r) => r.id === "Q-L0-U05-001");
    expect(record?.status).toBe("flagged");
    expect(record?.reasons.join()).toMatch(/규칙 위반/);
  });

  it("writes nothing for a failed call and says so", async () => {
    const { runner } = fakeRunner({ fail: true });
    const result = await run(runner);
    expect(result).toMatchObject({ written: 0, failed: 2 });
    expect(readDrafts(path.join(root, "content"), "L0-U05").questions).toEqual([]);
    expect(logs.join("\n")).toContain("실패");
  });

  it("re-runs from the cache without new calls, new ids or duplicate records", async () => {
    await run(fakeRunner().runner);
    const before = readDrafts(path.join(root, "content"), "L0-U05");
    const again = fakeRunner();
    expect(await run(again.runner)).toMatchObject({ calls: 0, written: 0 });
    expect(again.calls).toHaveLength(0);
    expect(readDrafts(path.join(root, "content"), "L0-U05")).toEqual(before);
  });
});
