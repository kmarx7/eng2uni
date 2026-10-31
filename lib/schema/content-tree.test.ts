import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kindForPath, validateContentTree } from "./content-tree";

let base: string;
let content: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), "content-tree-"));
  content = path.join(base, "content");
  mkdirSync(content);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function write(relative: string, data: unknown) {
  const full = path.join(content, relative);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, typeof data === "string" ? data : JSON.stringify(data));
}

const draftVocab = {
  id: "V-0001",
  lemma: "run",
  pos: "verb",
  meanings: ["달리다"],
  example: { en: "I run every day.", ko: "나는 매일 달린다." },
  level: "L0",
  isPolysemous: true,
  reviewStatus: "draft",
};

describe("kindForPath", () => {
  it.each([
    ["skills.json", "skill"],
    ["levels.json", "level"],
    ["misconceptions.json", "misconception"],
    ["traps.json", "trap"],
    ["questions/L0/U05.json", "question"],
    ["vocabulary/middle.json", "vocabulary"],
    ["blueprints/blank.json", "blueprint"],
    ["passages/p.json", "passage"],
    ["units/L0-U05.json", "unit"],
    ["sentences/s.json", "sentence"],
  ])("maps %s to %s", (relative, kind) => {
    expect(kindForPath(relative)).toBe(kind);
  });

  it("returns null for unknown locations", () => {
    expect(kindForPath("notes.json")).toBeNull();
    expect(kindForPath("misc/a.json")).toBeNull();
  });
});

describe("validateContentTree", () => {
  it("passes an empty tree", () => {
    const reports = validateContentTree(content);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ root: "content", fileCount: 0, itemCount: 0, issues: [] });
  });

  it("fails a non-approved item in student content with its path and id", () => {
    write("vocabulary/a.json", [draftVocab]);
    const [student] = validateContentTree(content);
    expect(student.itemCount).toBe(1);
    expect(student.issues).toEqual([
      expect.objectContaining({ path: path.join("content", "vocabulary", "a.json"), itemId: "V-0001" }),
    ]);
  });

  it("checks drafts for schema only and keeps them out of the student root", () => {
    write("drafts/vocabulary/a.json", [draftVocab, { ...draftVocab, id: "V-0002", pos: "verbish" }]);
    write("drafts/questions/q.json", [
      {
        id: "Q-1",
        type: "multiple_choice",
        difficulty: 1,
        prompt: "?",
        options: [{ id: "A", text: "a" }, { id: "B", text: "b" }],
        answer: "Z",
        skills: ["unknown_skill"],
        explanation: { summary: "s" },
        source: { type: "original", generatedBy: "ai_draft" },
        reviewStatus: "draft",
        version: 1,
      },
    ]);
    const [student, drafts] = validateContentTree(content);
    expect(student.fileCount).toBe(0);
    expect(drafts.root).toBe(path.join("content", "drafts"));
    expect(drafts.issues).toHaveLength(1);
    expect(drafts.issues[0]).toMatchObject({ itemId: "V-0002" });
  });

  it("checks each fixture set for integrity and FIXTURE ids but not approval", () => {
    write("_fixtures/set/vocabulary/a.json", [draftVocab]);
    const [, fixtures] = validateContentTree(content);
    expect(fixtures.root).toBe(path.join("content", "_fixtures", "set"));
    expect(fixtures.issues.map((issue) => issue.message)).toEqual(["fixture ids must contain FIXTURE"]);
  });

  it("ignores loose files directly under _fixtures/", () => {
    write("_fixtures/README.json", "{}");
    expect(validateContentTree(content)).toHaveLength(1);
  });

  it("reports unknown file locations and invalid JSON", () => {
    write("notes.json", []);
    write("questions/broken.json", "{ not json");
    const [student] = validateContentTree(content);
    expect(student.issues.map((issue) => issue.message)).toEqual([
      "unknown content file location",
      expect.stringMatching(/^invalid JSON/),
    ]);
  });

  it("ignores non-JSON files such as README.md", () => {
    write("questions/README.md", "질문");
    expect(validateContentTree(content)[0].issues).toEqual([]);
  });
});

describe("repository content", () => {
  it("passes validation", () => {
    const reports = validateContentTree(path.join(__dirname, "../../content"));
    expect(reports.flatMap((report) => report.issues)).toEqual([]);
  });
});
