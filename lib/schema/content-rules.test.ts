import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { checkContent, type CheckOptions, type ContentFile, type ContentKind } from "./content-rules";
import { loadContentRoot } from "./content-tree";

const FIXTURE_ROOT = path.join(__dirname, "../../content/_fixtures/valid");
const FULL: CheckOptions = { mode: "full", requireApproved: true, requireFixtureIds: true };

const pristine = loadContentRoot(FIXTURE_ROOT);

// Fresh deep copy of the valid fixture set for each test to mutate.
let files: ContentFile[];
beforeEach(() => {
  files = structuredClone(pristine.files);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Item = Record<string, any>;

function items(kind: ContentKind): Item[] {
  return files.filter((file) => file.kind === kind).flatMap((file) => file.data as Item[]);
}

function find(kind: ContentKind, id: string): Item {
  const item = items(kind).find((entry) => entry.id === id);
  if (!item) throw new Error(`fixture ${kind} ${id} missing`);
  return item;
}

function messages(options: CheckOptions = FULL): string[] {
  return checkContent(files, options).map((issue) => `${issue.itemId ?? ""}: ${issue.message}`);
}

function expectIssue(pattern: RegExp, options?: CheckOptions) {
  const found = messages(options);
  expect(found.some((message) => pattern.test(message)), found.join("\n")).toBe(true);
}

describe("valid fixture set", () => {
  it("loads every fixture file without load errors", () => {
    expect(pristine.issues).toEqual([]);
    expect(new Set(pristine.files.map((file) => file.kind)).size).toBe(10);
  });

  it("passes every rule", () => {
    expect(messages()).toEqual([]);
  });
});

describe("schema validity", () => {
  it("rejects an item that breaks its schema and reports the field", () => {
    find("question", "FIXTURE-Q-001").difficulty = 9;
    expectIssue(/FIXTURE-Q-001: schema: difficulty/);
  });

  it("falls back to the array index when the item has no id", () => {
    (files.find((file) => file.kind === "vocabulary")!.data as Item[]).push({ lemma: "run" });
    expectIssue(/^#1: schema:/);
  });

  it("rejects a file that is not an array", () => {
    files.push({ path: "skills.json", kind: "skill", data: { id: "x" } });
    expectIssue(/file must contain a JSON array/);
  });

  it("checks schema only in schema mode", () => {
    find("question", "FIXTURE-Q-001").answer = "Z";
    find("question", "FIXTURE-Q-002").difficulty = 0;
    const found = messages({ mode: "schema", requireApproved: false, requireFixtureIds: false });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/FIXTURE-Q-002: schema: difficulty/);
  });
});

describe("id uniqueness", () => {
  it("rejects the same id across kinds", () => {
    find("vocabulary", "FIXTURE-V-001").id = "FIXTURE-S-001";
    expectIssue(/FIXTURE-S-001: duplicate id/);
  });

  it("rejects a lesson block id that collides with another item", () => {
    find("unit", "FIXTURE-U01").blocks[0].id = "FIXTURE-Q-001";
    expectIssue(/FIXTURE-Q-001: duplicate id/);
  });
});

describe("question answer and options", () => {
  it("rejects an answer that is not an option", () => {
    find("question", "FIXTURE-Q-001").answer = "Z";
    expectIssue(/answer "Z" is not one of the options/);
  });

  it("rejects an answer that matches more than one option", () => {
    find("question", "FIXTURE-Q-002").options[0].id = "B";
    expectIssue(/option ids must be unique/);
    expectIssue(/answer "B" matches more than one option/);
  });

  it("rejects a distractor without a misconception or trap", () => {
    delete find("question", "FIXTURE-Q-001").options[0].misconception;
    expectIssue(/distractor "A" needs a misconception or trap/);
  });

  it("rejects an undefined misconception id", () => {
    find("question", "FIXTURE-Q-001").options[0].misconception = "FIXTURE_unknown";
    expectIssue(/misconception "FIXTURE_unknown" is not defined/);
  });

  it("rejects an undefined trap id", () => {
    find("question", "FIXTURE-Q-003").options[1].trap = "FIXTURE_unknown";
    expectIssue(/trap "FIXTURE_unknown" is not defined/);
  });

  it("rejects a misconception tag on the answer option", () => {
    find("question", "FIXTURE-Q-001").options[2].misconception = "FIXTURE_object_as_verb";
    expectIssue(/answer option "C" must not carry/);
  });

  it("rejects explanation keys that are not options", () => {
    find("question", "FIXTURE-Q-001").explanation.byOption.Z = "없는 선택지";
    expectIssue(/byOption key "Z" is not an option/);
  });
});

describe("sentence spans and chunks", () => {
  it("rejects a span range past the last token", () => {
    find("sentence", "FIXTURE-S-001").spans[3].range = [3, 5];
    expectIssue(/span "obj" range \[3, 5\] exceeds last token index 4/);
  });

  it("rejects a reversed span range at the schema level", () => {
    find("sentence", "FIXTURE-S-001").spans[3].range = [3, 2];
    expectIssue(/schema: spans.3.range: range start must not exceed end/);
  });

  it("rejects a parent that does not exist", () => {
    find("sentence", "FIXTURE-S-001").spans[1].parent = "missing";
    expectIssue(/span "head" parent "missing" does not exist/);
  });

  it("rejects a span that is its own parent", () => {
    find("sentence", "FIXTURE-S-001").spans[1].parent = "head";
    expectIssue(/span "head" parent "head" does not exist/);
  });

  it("rejects a modifies target that does not exist", () => {
    find("sentence", "FIXTURE-S-002").spans[3].modifies = "missing";
    expectIssue(/span "time" modifies "missing"/);
  });

  it("rejects a child span outside its parent", () => {
    find("sentence", "FIXTURE-S-001").spans[1].range = [1, 2];
    expectIssue(/span "head" lies outside its parent "subj"/);
  });

  it("rejects duplicate span ids within a sentence", () => {
    find("sentence", "FIXTURE-S-001").spans[3].id = "verb";
    expectIssue(/duplicate span id "verb"/);
  });

  it("rejects a chunk boundary past the last token", () => {
    find("sentence", "FIXTURE-S-001").chunks = [2, 5];
    expectIssue(/chunk boundary 5 exceeds last token index 4/);
  });

  it("rejects chunk boundaries that are not increasing", () => {
    find("sentence", "FIXTURE-S-001").chunks = [3, 2];
    expectIssue(/chunk boundaries must be strictly increasing/);
  });

  it("rejects a chunk boundary at token 0 at the schema level", () => {
    find("sentence", "FIXTURE-S-001").chunks = [0];
    expectIssue(/schema: chunks.0/);
  });
});

describe("approved-only student content", () => {
  it.each([
    ["question", "FIXTURE-Q-001"],
    ["sentence", "FIXTURE-S-001"],
    ["unit", "FIXTURE-U01"],
    ["passage", "FIXTURE-P-001"],
    ["vocabulary", "FIXTURE-V-001"],
  ] as const)("rejects a non-approved %s", (kind, id) => {
    find(kind, id).reviewStatus = "draft";
    expectIssue(new RegExp(`${id}: reviewStatus "draft" is not allowed`));
  });

  it("allows non-approved items when the rule is off", () => {
    find("question", "FIXTURE-Q-001").reviewStatus = "flagged";
    expect(messages({ ...FULL, requireApproved: false })).toEqual([]);
  });

  it("requires a reviewer on approved questions", () => {
    delete find("question", "FIXTURE-Q-001").source.reviewedBy;
    expectIssue(/approved question needs source.reviewedBy/);
  });
});

describe("referential integrity", () => {
  it("rejects a missing lesson", () => {
    find("question", "FIXTURE-Q-001").lessonId = "FIXTURE-U99";
    expectIssue(/lesson "FIXTURE-U99" does not exist/);
  });

  it("rejects a missing skill on questions, sentences and units", () => {
    find("question", "FIXTURE-Q-001").skills = ["FIXTURE_nope"];
    find("sentence", "FIXTURE-S-001").skills = ["FIXTURE_nope"];
    find("unit", "FIXTURE-U01").skills = ["FIXTURE_nope"];
    const found = messages().filter((message) => /skill "FIXTURE_nope" does not exist/.test(message));
    expect(found).toHaveLength(3);
  });

  it("rejects a missing sentence", () => {
    find("question", "FIXTURE-Q-001").sentenceId = "FIXTURE-S-999";
    expectIssue(/FIXTURE-Q-001: sentence "FIXTURE-S-999" does not exist/);
  });

  it("rejects a missing passage", () => {
    find("question", "FIXTURE-Q-003").passageId = "FIXTURE-P-999";
    expectIssue(/passage "FIXTURE-P-999" does not exist/);
  });

  it("rejects a variant group whose questions share no skill", () => {
    find("question", "FIXTURE-Q-002").skills = ["FIXTURE_subject_identification"];
    expectIssue(/variant group "FIXTURE-VG-verb" shares no skill/);
  });

  it("rejects missing references inside lesson blocks", () => {
    const blocks = find("unit", "FIXTURE-U01").blocks;
    blocks[1].sentenceIds = ["FIXTURE-S-999"];
    blocks[2].questionIds = ["FIXTURE-Q-999"];
    blocks[3].misconceptionId = "FIXTURE_nope";
    blocks[4].misconceptionIds = ["FIXTURE_nope", "FIXTURE_object_as_verb"];
    blocks.push({ id: "FIXTURE-U01-B07", type: "predict", body: "예측해 보세요.", questionId: "FIXTURE-Q-998" });
    const found = messages();
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/B02: sentence "FIXTURE-S-999"/),
        expect.stringMatching(/B03: question "FIXTURE-Q-999"/),
        expect.stringMatching(/B04: misconception "FIXTURE_nope"/),
        expect.stringMatching(/B05: misconception "FIXTURE_nope"/),
        expect.stringMatching(/B07: question "FIXTURE-Q-998"/),
      ]),
    );
  });

  it("rejects a misconception with a missing skill or remedial block", () => {
    const misconception = find("misconception", "FIXTURE_subject_as_verb");
    misconception.skillId = "FIXTURE_nope";
    misconception.remedialBlockId = "FIXTURE-U01-B99";
    expectIssue(/skill "FIXTURE_nope" does not exist/);
    expectIssue(/remedial block "FIXTURE-U01-B99" does not exist/);
  });

  it("rejects missing and cyclic skill prerequisites", () => {
    find("skill", "FIXTURE_subject_identification").prerequisiteIds = ["FIXTURE_main_idea", "FIXTURE_nope"];
    expectIssue(/prerequisite skill "FIXTURE_nope" does not exist/);
    expectIssue(/FIXTURE_main_idea: skill prerequisites form a cycle/);
  });

  it("rejects passage sentences and evidence that do not resolve", () => {
    const passage = find("passage", "FIXTURE-P-001");
    passage.sentences = ["FIXTURE-S-001", "FIXTURE-S-999"];
    passage.evidenceSpans = [
      { questionId: "FIXTURE-Q-999", sentenceRange: [0, 0] },
      { questionId: "FIXTURE-Q-003", sentenceRange: [1, 2] },
    ];
    expectIssue(/sentence "FIXTURE-S-999" does not exist/);
    expectIssue(/evidence question "FIXTURE-Q-999" does not exist/);
    expectIssue(/evidence range \[1,2\] exceeds 2 sentences/);
  });

  it("rejects blueprint traps and skills that are not defined", () => {
    const blueprint = find("blueprint", "FIXTURE-BP-001");
    blueprint.distractors.traps = ["FIXTURE_nope"];
    blueprint.requiredSkills = ["FIXTURE_nope_skill"];
    expectIssue(/trap "FIXTURE_nope" does not exist/);
    expectIssue(/skill "FIXTURE_nope_skill" does not exist/);
  });
});

describe("fixture ids", () => {
  it("rejects a fixture id without FIXTURE", () => {
    find("vocabulary", "FIXTURE-V-001").id = "V-001";
    expectIssue(/V-001: fixture ids must contain FIXTURE/);
  });
});
