import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClaudeRunner } from "./claude-cli";
import { readDrafts } from "./draft-store";
import { assignIds, groupOutputSchema, runGenerate, unitOutputSchema } from "./generate";
import { approve, reject } from "./review-store";

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

  it("avoids tuple forms, so both the claude CLI (draft-07) and the API (2020-12) accept it", () => {
    const arrayItems = (node: unknown): boolean =>
      Array.isArray(node) ? node.some(arrayItems) : node !== null && typeof node === "object"
        ? Object.entries(node).some(([k, v]) => (k === "items" && Array.isArray(v)) || arrayItems(v))
        : false;
    for (const schema of [groupOutputSchema(), unitOutputSchema()]) {
      expect(arrayItems(schema)).toBe(false);
      expect(JSON.stringify(schema)).not.toMatch(/"prefixItems"|"additionalItems"|"\$defs"|"definitions"/);
    }
    expect(JSON.stringify(groupOutputSchema())).toContain('"minItems":2,"maxItems":2');
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

describe("review fixes", () => {
  const contentDir = () => path.join(root, "content");
  const approveAll = () => {
    for (const id of ["subject_find", "verb_as_subject", "S-L0-U05-001", "S-L0-U05-002", "Q-L0-U05-001", "Q-L0-U05-002", "L0-U05"]) {
      expect(approve(contentDir(), id, "kim", now)).toEqual({ ok: true });
    }
  };

  it("does not bring approved items back or touch their records on a re-run", async () => {
    await run(fakeRunner().runner);
    approveAll();
    const again = await run(fakeRunner().runner);
    expect(again).toMatchObject({ calls: 0, written: 0 });
    const drafts = readDrafts(contentDir(), "L0-U05");
    expect(drafts.sentences).toEqual([]);
    expect(drafts.questions).toEqual([]);
    expect(drafts.units).toEqual([]);
    expect(drafts.records.every((r) => r.status === "approved" && r.reviewedBy === "kim")).toBe(true);
    expect(existsSync(path.join(contentDir(), "drafts/skills.json")) ? JSON.parse(readFileSync(path.join(contentDir(), "drafts/skills.json"), "utf8")) : []).toEqual([]);
  });

  it("numbers new drafts after approved ones and skips approved groups when the spec changes", async () => {
    await run(fakeRunner().runner, { limit: 1 });
    for (const id of ["subject_find", "verb_as_subject", "S-L0-U05-001", "Q-L0-U05-001"]) expect(approve(contentDir(), id, "kim", now)).toEqual({ ok: true });
    const changed = { ...spec, objectives: ["바뀐 목표"] };
    writeFileSync(path.join(root, "content/specs/L0-U05.json"), JSON.stringify(changed));
    const { runner, calls } = fakeRunner();
    await run(runner);
    expect(calls).toHaveLength(2);
    const drafts = readDrafts(contentDir(), "L0-U05");
    expect(drafts.questions.map((q) => [q.id, q.variantGroup])).toEqual([["Q-L0-U05-002", "VG-L0-U05-verb"]]);
    expect(drafts.sentences.map((s) => s.id)).toEqual(["S-L0-U05-002"]);
  });

  it("checks a unit against approved items too", async () => {
    await run(fakeRunner().runner, { limit: 2 });
    for (const id of ["subject_find", "verb_as_subject", "S-L0-U05-001", "Q-L0-U05-001"]) expect(approve(contentDir(), id, "kim", now)).toEqual({ ok: true });
    await run(fakeRunner().runner);
    expect(readDrafts(contentDir(), "L0-U05").units.map((u) => u.id)).toEqual(["L0-U05"]);
    expect(readDrafts(contentDir(), "L0-U05").records.find((r) => r.id === "L0-U05")).toMatchObject({ status: "auto_checked", reasons: [] });
  });

  it("flags a unit that uses an id no draft or approved item has", async () => {
    const bad = { ...unitOut, blocks: [...unitOut.blocks, { id: "L0-U05-B03", type: "practice", questionIds: ["Q-L0-U05-999"] }] };
    const runner: ClaudeRunner = async ({ input }) =>
      input.includes('"task":"unit"') ? { ok: true, json: bad } : { ok: true, json: { sentences: [sentenceOut], questions: [questionOut()] } };
    await run(runner);
    const record = readDrafts(contentDir(), "L0-U05").records.find((r) => r.id === "L0-U05");
    expect(record).toMatchObject({ status: "flagged" });
    expect(record?.reasons.join()).toContain("Q-L0-U05-999");
  });

  it("flags a question whose sentence number is out of range", async () => {
    const runner: ClaudeRunner = async ({ input }) =>
      input.includes('"task":"unit"')
        ? { ok: true, json: unitOut }
        : { ok: true, json: { sentences: [sentenceOut], questions: [{ ...questionOut(), sentenceIndex: 5 }] } };
    await run(runner, { limit: 1 });
    const record = readDrafts(contentDir(), "L0-U05").records.find((r) => r.id === "Q-L0-U05-001");
    expect(record).toMatchObject({ status: "flagged", checks: { rules: "fail" } });
    expect(record?.reasons).toContain("문장 번호 범위 밖: 5");
  });
});

// Stage 8 trial 3: the student screen shows a question's sentence above it, so a
// word-order question linked to the finished sentence showed its own answer.
describe("building groups", () => {
  const contentDir = () => path.join(root, "content");
  const buildingSpec = {
    ...spec,
    generation: {
      ...spec.generation,
      variantGroups: [spec.generation.variantGroups[0], { ...spec.generation.variantGroups[1], sentenceUse: "building" }],
    },
  };
  const withHints = { ...questionOut(), hints: { direction: "동사 앞을 보세요", range: [0, 2] } };
  const runnerWith = () => {
    const calls: string[] = [];
    const runner: ClaudeRunner = async ({ input }) => {
      calls.push(input);
      if (input.includes('"task":"unit"')) return { ok: true, json: unitOut };
      return { ok: true, json: { sentences: [sentenceOut], questions: [withHints] } };
    };
    return { runner, calls };
  };
  beforeEach(() => writeFileSync(path.join(root, "content/specs/L0-U05.json"), JSON.stringify(buildingSpec)));

  it("does not link a building group's questions to a sentence or a hint range", async () => {
    await run(runnerWith().runner);
    const [tagged, built] = readDrafts(contentDir(), "L0-U05").questions;
    expect(tagged).toMatchObject({ sentenceId: "S-L0-U05-001", hints: { range: [0, 2] } });
    expect(built.sentenceId).toBeUndefined();
    expect(built.hints).toEqual({ direction: "동사 앞을 보세요" });
  });

  it("still gives the unit the building group's sentences", async () => {
    const { runner, calls } = runnerWith();
    await run(runner);
    const unitInput = JSON.parse(calls.find((c) => c.includes('"task":"unit"'))!);
    expect(unitInput.drafts.find((g: { id: string }) => g.id === "VG-L0-U05-verb")).toMatchObject({ sentenceUse: "building", sentenceIds: ["S-L0-U05-002"] });
  });
});

describe("redoGroups", () => {
  const contentDir = () => path.join(root, "content");
  const redo = (runner: ClaudeRunner) =>
    runGenerate({ root, specPath: path.join(root, "content/specs/L0-U05.json"), dryRun: false, runner, similarity, now, log: (l) => logs.push(l), redoGroups: ["VG-L0-U05-verb"] });

  it("retires the group's drafts and the unit draft, then drafts them again with new ids", async () => {
    await run(fakeRunner().runner);
    const { runner, calls } = fakeRunner();
    expect(await redo(runner)).toMatchObject({ calls: 2, written: 3 });
    expect(calls).toHaveLength(2);
    const drafts = readDrafts(contentDir(), "L0-U05");
    const status = (id: string) => drafts.records.find((r) => r.id === id)?.status;
    expect([status("Q-L0-U05-002"), status("S-L0-U05-002")]).toEqual(["retired", "retired"]);
    expect(drafts.records.find((r) => r.id === "Q-L0-U05-002")?.reasons).toContain("명세 변경으로 다시 생성");
    expect(drafts.questions.find((q) => q.id === "Q-L0-U05-002")?.reviewStatus).toBe("retired");
    expect([status("Q-L0-U05-001"), status("S-L0-U05-001")]).toEqual(["auto_checked", "auto_checked"]);
    expect(drafts.questions.find((q) => q.id === "Q-L0-U05-003")).toMatchObject({ variantGroup: "VG-L0-U05-verb", sentenceId: "S-L0-U05-003", reviewStatus: "draft" });
    // Drafted again; the fake unit still names the retired Q-002, so it is flagged for that.
    expect(drafts.records.find((r) => r.id === "L0-U05")?.reasons).toEqual(["규칙 위반: 폐기된 문항 사용: Q-L0-U05-002"]);
  });

  it("retires a building group's unlinked sentences too", async () => {
    const building = { ...spec, generation: { ...spec.generation, variantGroups: [spec.generation.variantGroups[0], { ...spec.generation.variantGroups[1], sentenceUse: "building" }] } };
    writeFileSync(path.join(root, "content/specs/L0-U05.json"), JSON.stringify(building));
    await run(fakeRunner().runner);
    await redo(fakeRunner().runner);
    const drafts = readDrafts(contentDir(), "L0-U05");
    expect(drafts.sentences.map((s) => [s.id, s.reviewStatus])).toEqual([
      ["S-L0-U05-001", "draft"],
      ["S-L0-U05-002", "retired"],
      ["S-L0-U05-003", "draft"],
    ]);
  });

  it("refuses when an item of the group is already approved", async () => {
    await run(fakeRunner().runner);
    for (const id of ["subject_find", "verb_as_subject", "S-L0-U05-002", "Q-L0-U05-002"]) expect(approve(contentDir(), id, "kim", now)).toEqual({ ok: true });
    await expect(redo(fakeRunner().runner)).rejects.toThrow(/승인된 항목/);
  });
});

// Stage 8 trial 3: after a question was retired, the unit came back from the cache
// still using it, and the unit check let a retired question through.
describe("unit after a retired question", () => {
  const contentDir = () => path.join(root, "content");
  const redoUnit = (runner: ClaudeRunner) =>
    runGenerate({ root, specPath: path.join(root, "content/specs/L0-U05.json"), dryRun: false, runner, similarity, now, log: (l) => logs.push(l), redoUnit: true });

  it("assembles the unit again instead of reusing the cached one", async () => {
    await run(fakeRunner().runner);
    expect(reject(contentDir(), "L0-U05", "kim", now)).toEqual({ ok: true });
    expect(reject(contentDir(), "Q-L0-U05-002", "kim", now)).toEqual({ ok: true });
    const { runner, calls } = fakeRunner();
    await run(runner);
    expect(calls.filter((c) => c.includes('"task":"unit"'))).toHaveLength(1);
    const unitInput = JSON.parse(calls.find((c) => c.includes('"task":"unit"'))!);
    expect(unitInput.drafts.flatMap((g: { questionIds: string[] }) => g.questionIds)).not.toContain("Q-L0-U05-002");
  });

  it("flags a unit that uses a retired question", async () => {
    await run(fakeRunner().runner);
    expect(reject(contentDir(), "Q-L0-U05-002", "kim", now)).toEqual({ ok: true });
    await redoUnit(fakeRunner().runner);
    const record = readDrafts(contentDir(), "L0-U05").records.find((r) => r.id === "L0-U05");
    expect(record).toMatchObject({ status: "flagged" });
    expect(record?.reasons).toContain("규칙 위반: 폐기된 문항 사용: Q-L0-U05-002");
  });

  it("redoUnit retires the unit draft and drafts it again", async () => {
    await run(fakeRunner().runner);
    const { runner, calls } = fakeRunner();
    expect(await redoUnit(runner)).toMatchObject({ calls: 1, written: 1 });
    expect(calls).toHaveLength(1);
    expect(readDrafts(contentDir(), "L0-U05").units[0].reviewStatus).toBe("draft");
  });
});

// L0-U01: the level L0, approved while reviewing L0-U05, was drafted again because
// only this unit's records were checked.
describe("catalogue already approved for another unit", () => {
  it("is not drafted again", async () => {
    writeFileSync(path.join(root, "content/skills.json"), JSON.stringify([{ id: "subject_find", name: "주어 찾기", category: "syntax", prerequisiteIds: [], reviewStatus: "approved" }]));
    await run(fakeRunner().runner);
    const drafts = readDrafts(path.join(root, "content"), "L0-U05");
    expect(drafts.records.filter((r) => r.kind === "catalog").map((r) => r.id)).toEqual(["verb_as_subject"]);
    expect(existsSync(path.join(root, "content/drafts/skills.json"))).toBe(false);
  });
});

// L0-U04 (approved 2026-11-08): fill-in-the-blank questions put the sentence with a
// blank in the prompt, so like building questions they must not show the full sentence.
describe("blank groups", () => {
  const contentDir = () => path.join(root, "content");
  const blankSpec = {
    ...spec,
    generation: { ...spec.generation, variantGroups: [spec.generation.variantGroups[0], { ...spec.generation.variantGroups[1], sentenceUse: "blank" }] },
  };
  const withHints = { ...questionOut(), hints: { direction: "주어를 보세요", range: [0, 1] } };
  const runnerWith = () => {
    const calls: string[] = [];
    const runner: ClaudeRunner = async ({ input }) => {
      calls.push(input);
      if (input.includes('"task":"unit"')) return { ok: true, json: unitOut };
      return { ok: true, json: { sentences: [sentenceOut], questions: [withHints] } };
    };
    return { runner, calls };
  };
  beforeEach(() => writeFileSync(path.join(root, "content/specs/L0-U05.json"), JSON.stringify(blankSpec)));

  it("links no sentence or hint range, and still gives the unit the group's sentences", async () => {
    const { runner, calls } = runnerWith();
    await run(runner);
    const [, blank] = readDrafts(contentDir(), "L0-U05").questions;
    expect(blank.sentenceId).toBeUndefined();
    expect(blank.hints).toEqual({ direction: "주어를 보세요" });
    const unitInput = JSON.parse(calls.find((c) => c.includes('"task":"unit"'))!);
    expect(unitInput.drafts.find((g: { id: string }) => g.id === "VG-L0-U05-verb")).toMatchObject({ sentenceUse: "blank", sentenceIds: ["S-L0-U05-002"] });
  });

  it("retires a blank group's unlinked sentences on a redo", async () => {
    await run(runnerWith().runner);
    await runGenerate({ root, specPath: path.join(root, "content/specs/L0-U05.json"), dryRun: false, runner: runnerWith().runner, similarity, now, log: () => {}, redoGroups: ["VG-L0-U05-verb"] });
    expect(readDrafts(contentDir(), "L0-U05").sentences.find((s) => s.id === "S-L0-U05-002")?.reviewStatus).toBe("retired");
  });
});
