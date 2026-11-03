import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewRecord } from "./review-record";
import { UnitSpec } from "./spec";

const template = JSON.parse(readFileSync(path.join(__dirname, "../../docs/templates/unit-spec.template.json"), "utf8"));

const generation = {
  difficulty: 1,
  vocabRankMax: 2000,
  sentenceCount: 12,
  variantGroups: [
    {
      id: "VG-L0-U05-subject",
      skillId: "skill_id",
      misconceptionIds: ["misconception_id"],
      questionType: "multiple_choice",
      count: 6,
      sentenceUse: "question",
      note: "주어 찾기",
    },
  ],
};

const spec = { ...template, interactions: ["role_tagging"], generation };

describe("UnitSpec", () => {
  it("accepts the template with a generation block", () => {
    const parsed = UnitSpec.parse(spec);
    expect(parsed.catalog).toEqual({ skills: [], misconceptions: [], traps: [] });
  });

  it("needs at least 6 questions per variant group", () => {
    const bad = { ...spec, generation: { ...generation, variantGroups: [{ ...generation.variantGroups[0], count: 5 }] } };
    const result = UnitSpec.safeParse(bad);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("count");
  });

  it("accepts draft catalogue entries", () => {
    const parsed = UnitSpec.parse({
      ...spec,
      catalog: {
        level: { id: "L0", order: 0, name: "기초" },
        skills: [{ id: "skill_id", name: "주어 찾기", category: "syntax" }],
        misconceptions: [{ id: "misconception_id", skillId: "skill_id", category: "SYN", description: "동사를 주어로 본다" }],
      },
    });
    expect(parsed.catalog.skills[0].prerequisiteIds).toEqual([]);
  });
});

const record = {
  id: "Q-L0-U05-001",
  kind: "question",
  unitId: "L0-U05",
  status: "auto_checked",
  reasons: [],
  checks: { rules: "pass", vocab: "pass", tags: "pass", similarity: "pass" },
  generatedAt: "2026-11-03T09:00:00+09:00",
};

describe("ReviewRecord", () => {
  it("parses a pipeline record with default reports", () => {
    expect(ReviewRecord.parse(record).reports).toEqual([]);
  });

  it("needs a reviewer and time once approved", () => {
    expect(ReviewRecord.safeParse({ ...record, status: "approved" }).success).toBe(false);
    expect(
      ReviewRecord.safeParse({ ...record, status: "approved", reviewedBy: "kim", reviewedAt: "2026-11-03T10:00:00+09:00" }).success,
    ).toBe(true);
  });
});
