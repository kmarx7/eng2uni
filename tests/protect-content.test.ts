import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLOCK_MESSAGE,
  checkBashCommand,
  checkFileWrite,
  checkHookInput,
} from "../scripts/hooks/protect-content-rules";

const root = "/proj";

describe("checkFileWrite", () => {
  it.each(["content/units/L0-U05.json", "content/sentences/s.json", "content/questions/q.json", "content/vocabulary/v.json"])(
    "blocks %s",
    (file) => {
      const verdict = checkFileWrite(path.join(root, file), root);
      expect(verdict.blocked).toBe(true);
      expect(verdict.reason).toBe(`${BLOCK_MESSAGE}: ${file}`);
    },
  );

  it.each([
    "content/_fixtures/valid/questions/q.json",
    "content/specs/L0-U05.json",
    "content/drafts/L0-U05/q.json",
    "content/blueprints/blank.json",
    "content/curriculum/unit-status.json",
    "content/README.md",
    "lib/schema/question.ts",
  ])("allows %s", (file) => {
    expect(checkFileWrite(path.join(root, file), root).blocked).toBe(false);
  });

  it("resolves relative and dotted paths against the project", () => {
    expect(checkFileWrite("content/questions/q.json", root).blocked).toBe(true);
    expect(checkFileWrite("/proj/content/drafts/../questions/q.json", root).blocked).toBe(true);
    expect(checkFileWrite("/elsewhere/content/questions/q.json", root).blocked).toBe(false);
  });
});

describe("checkBashCommand", () => {
  it.each([
    "echo '{}' > content/questions/x.json",
    "cat a.json >> /proj/content/units/u.json",
    "cp /tmp/x.json content/vocabulary/",
    "mv content/drafts/a.json content/questions/a.json",
    "rm -f content/sentences/s.json",
    "sed -i '' 's/a/b/' content/questions/q.json",
    "jq . a.json | tee content/units/u.json",
    "npm run x && touch content/questions/new.json",
    "git checkout -- content/questions/q.json",
  ])("blocks %s", (command) => {
    expect(checkBashCommand(command, root).blocked).toBe(true);
  });

  it.each([
    "cat content/questions/q.json",
    "cp content/questions/q.json /tmp/copy.json",
    "grep -r lemma content/vocabulary",
    "npm run validate:content 2>&1 | tail",
    "echo hi > content/drafts/L0-U05/note.json",
    "ls content/units > /tmp/list.txt",
  ])("allows %s", (command) => {
    expect(checkBashCommand(command, root).blocked).toBe(false);
  });
});

describe("checkHookInput", () => {
  it("routes by tool name", () => {
    expect(checkHookInput({ tool_name: "Write", tool_input: { file_path: "/proj/content/units/u.json" } }, root).blocked).toBe(true);
    expect(checkHookInput({ tool_name: "Bash", tool_input: { command: "rm content/units/u.json" } }, root).blocked).toBe(true);
    expect(checkHookInput({ tool_name: "Read", tool_input: { file_path: "/proj/content/units/u.json" } }, root).blocked).toBe(false);
  });
});

describe("hook script", () => {
  const script = path.join(__dirname, "../scripts/hooks/protect-content.ts");
  const tsx = path.join(__dirname, "../node_modules/.bin/tsx");
  const run = (input: unknown) =>
    spawnSync(tsx, [script], {
      input: JSON.stringify(input),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: "utf8",
    });

  it("exits 2 with the message on stderr when blocking", () => {
    const result = run({ tool_name: "Edit", tool_input: { file_path: "/proj/content/questions/q.json" } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(BLOCK_MESSAGE);
  });

  it("exits 0 when allowing", () => {
    expect(run({ tool_name: "Write", tool_input: { file_path: "/proj/content/specs/s.json" } }).status).toBe(0);
  });
});
