// @vitest-environment node
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Question } from "@/lib/schema/question";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import { buildResult, gradeAnswer, hintFor, loadApprovedQuestion, loadApprovedSentence, loadReviewBundle, loadStudentUnits, loadUnitBundle, tagResult, toPublicQuestion } from "./learning";

const FIXTURES = path.join(__dirname, "../../content/_fixtures/valid");
const questions: Question[] = JSON.parse(readFileSync(path.join(FIXTURES, "questions/FIXTURE-Q.json"), "utf8"));
const q = (id: string) => questions.find((x) => x.id === id)!;
const sentences: AnnotatedSentence[] = JSON.parse(readFileSync(path.join(FIXTURES, "sentences/FIXTURE-S.json"), "utf8"));
const sentence = (id: string) => sentences.find((x) => x.id === id)!;
const misconceptions = JSON.parse(readFileSync(path.join(FIXTURES, "misconceptions.json"), "utf8"));

// A copy of the fixtures where one unit and one question are drafts.
function withDrafts(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "e90-learning-"));
  cpSync(FIXTURES, dir, { recursive: true });
  const unitsFile = path.join(dir, "units/FIXTURE-U01.json");
  const units = JSON.parse(readFileSync(unitsFile, "utf8"));
  units[1].reviewStatus = "draft";
  writeFileSync(unitsFile, JSON.stringify(units));
  const qFile = path.join(dir, "questions/FIXTURE-Q.json");
  writeFileSync(qFile, JSON.stringify(questions.map((x) => (x.id === "FIXTURE-Q-008" ? { ...x, reviewStatus: "draft" } : x))));
  return dir;
}

describe("toPublicQuestion", () => {
  it("leaves out the answer, explanations, hints and distractor tags", () => {
    const text = JSON.stringify(toPublicQuestion(q("FIXTURE-Q-001")));
    for (const secret of ['"answer"', "explanation", "hints", "FIXTURE_subject_as_verb", "마신다'는 동작", "동작을 나타내는 단어를"]) {
      expect(text).not.toContain(secret);
    }
    expect(toPublicQuestion(q("FIXTURE-Q-001")).options).toEqual([
      { id: "A", text: "The" },
      { id: "B", text: "cat" },
      { id: "C", text: "drinks" },
      { id: "D", text: "milk" },
    ]);
  });

  it("lists the hint levels the question has data for; level 3 always", () => {
    expect(toPublicQuestion(q("FIXTURE-Q-001")).hintLevels).toEqual([1, 2, 3]);
    expect(toPublicQuestion(q("FIXTURE-Q-011")).hintLevels).toEqual([2, 3]);
    expect(toPublicQuestion(q("FIXTURE-Q-002")).hintLevels).toEqual([3]);
  });
});

describe("gradeAnswer", () => {
  it("grades a right answer with the summary", () => {
    expect(gradeAnswer(q("FIXTURE-Q-001"), "C", misconceptions)).toEqual({
      correct: true,
      answerId: "C",
      summary: "drinks가 '마신다'는 동작을 나타내는 동사입니다.",
    });
  });

  it("explains a wrong answer by its option and misconception", () => {
    expect(gradeAnswer(q("FIXTURE-Q-001"), "B", misconceptions)).toEqual({
      correct: false,
      answerId: "C",
      summary: "drinks가 '마신다'는 동작을 나타내는 동사입니다.",
      chosen: "cat은 동작을 하는 주어입니다.",
      misconception: { id: "FIXTURE_subject_as_verb", description: "주어를 동사로 고른다." },
    });
  });

  it("rejects an option the question does not have", () => {
    expect(() => gradeAnswer(q("FIXTURE-Q-001"), "Z", misconceptions)).toThrow(/option/);
  });
});

describe("hintFor", () => {
  it("returns each level's data and refuses a level without it", () => {
    expect(hintFor(q("FIXTURE-Q-001"), 1)).toEqual({ level: 1, direction: "동작을 나타내는 단어를 찾아보세요." });
    expect(hintFor(q("FIXTURE-Q-001"), 2)).toEqual({ level: 2, range: [1, 2] });
    expect(hintFor(q("FIXTURE-Q-002"), 3)).toEqual({ level: 3, answerId: "B", summary: "plays가 '친다'는 동작을 나타내는 동사입니다." });
    expect(() => hintFor(q("FIXTURE-Q-002"), 1)).toThrow(/hint/);
  });
});

describe("loading", () => {
  it("lists approved units in level and unit order", () => {
    expect(loadStudentUnits(FIXTURES).map((u) => u.id)).toEqual(["FIXTURE-U01", "FIXTURE-U02"]);
    expect(loadStudentUnits(withDrafts()).map((u) => u.id)).toEqual(["FIXTURE-U01"]);
  });

  it("bundles a unit with its sentences, public questions and their variants, approved only", () => {
    const bundle = loadUnitBundle("FIXTURE-U01", FIXTURES)!;
    const ids = bundle.questions.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["FIXTURE-Q-001", "FIXTURE-Q-002", "FIXTURE-Q-008", "FIXTURE-Q-013", "FIXTURE-Q-014"]));
    expect(ids).not.toContain("FIXTURE-Q-003");
    expect(bundle.sentences.map((s) => s.id)).toEqual(expect.arrayContaining(["FIXTURE-S-001", "FIXTURE-S-003", "FIXTURE-S-004", "FIXTURE-S-008"]));
    expect(JSON.stringify(bundle)).not.toContain('"answer"');
    expect(loadUnitBundle("FIXTURE-U01", withDrafts())!.questions.map((x) => x.id)).not.toContain("FIXTURE-Q-008");
    expect(loadUnitBundle("FIXTURE-U99", FIXTURES)).toBeNull();
    expect(loadUnitBundle("FIXTURE-U02", withDrafts())).toBeNull();
  });

  it("finds an approved question by id, never a draft", () => {
    expect(loadApprovedQuestion("FIXTURE-Q-008", FIXTURES)?.id).toBe("FIXTURE-Q-008");
    expect(loadApprovedQuestion("FIXTURE-Q-008", withDrafts())).toBeNull();
  });

  it("gives skill review every approved public question and each unit's skills", () => {
    const bundle = loadReviewBundle(FIXTURES);
    expect(bundle.units).toEqual([
      { id: "FIXTURE-U01", skills: ["FIXTURE_subject_identification", "FIXTURE_verb_identification"] },
      { id: "FIXTURE-U02", skills: ["FIXTURE_verb_identification"] },
    ]);
    expect(bundle.questions).toHaveLength(questions.length);
    expect(JSON.stringify(bundle)).not.toContain("explanation");
  });
});

describe("sentences leave the server without their answers", () => {
  it("sends tokens and role symbols, never spans, glosses or translations, for tagging and questions", () => {
    const bundle = loadUnitBundle("FIXTURE-U01", FIXTURES)!;
    const text = JSON.stringify(bundle.sentences);
    for (const secret of ["spans", "gloss", "MAIN_VERB", "고양이가", "chunkedTranslation", "고양이가 우유를 마신다."]) expect(text).not.toContain(secret);
    expect(bundle.sentences.find((s) => s.id === "FIXTURE-S-001")).toEqual({ id: "FIXTURE-S-001", tokens: ["The", "cat", "drinks", "milk", "."], roles: ["S", "V", "O"] });
    expect(JSON.stringify(loadReviewBundle(FIXTURES).sentences)).not.toContain("spans");
  });

  it("sends a building sentence as shuffled chips with its translation as the prompt", () => {
    const building = loadUnitBundle("FIXTURE-U01", FIXTURES)!.sentences.find((s) => s.id === "FIXTURE-S-004")!;
    expect(building.chips).toHaveLength(5);
    expect(building.chips).not.toEqual(["We", "eat", "lunch", "at", "noon"]);
    expect(building.translation).toBe("우리는 정오에 점심을 먹는다.");
  });

  it("checks a role tag on the server, with the translation once every role is tagged", () => {
    const s = sentence("FIXTURE-S-001");
    expect(tagResult(s, "V", [2, 2], [])).toEqual({ correct: true, range: [2, 2], gloss: "마신다" });
    expect(tagResult(s, "S", [1, 1], ["V"])).toEqual({ correct: true, range: [0, 1], gloss: "고양이가" });
    expect(tagResult(s, "O", [2, 2], ["S", "V"])).toEqual({ correct: false });
    expect(tagResult(s, "O", [3, 3], ["S", "V"])).toEqual({ correct: true, range: [3, 3], gloss: "우유를", translation: "고양이가 우유를 마신다." });
  });

  it("checks a built sentence on the server, with the sentence once it is right", () => {
    const s = sentence("FIXTURE-S-004");
    expect(buildResult(s, ["eat", "We", "lunch", "at", "noon"])).toEqual({ marks: [false, false, true, true, true] });
    expect(buildResult(s, ["We", "eat", "lunch", "at", "noon"])).toEqual({ marks: [true, true, true, true, true], text: "We eat lunch at noon." });
  });

  it("finds an approved sentence by id", () => {
    expect(loadApprovedSentence("FIXTURE-S-001", FIXTURES)?.id).toBe("FIXTURE-S-001");
    expect(loadApprovedSentence("FIXTURE-S-999", FIXTURES)).toBeNull();
  });
});
