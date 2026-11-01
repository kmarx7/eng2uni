// PreToolUse hook: blocks Edit/Write/NotebookEdit and shell writes into approved
// content folders. Claude Code passes the tool call as JSON on stdin; exit code 2
// blocks the call and shows stderr to the model.
import { checkHookInput, type HookInput } from "./protect-content-rules";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<number> {
  let input: HookInput;
  try {
    input = JSON.parse(await readStdin()) as HookInput;
  } catch {
    process.stderr.write("protect-content: could not parse hook input; not blocking\n");
    return 1;
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const verdict = checkHookInput(input, projectDir);
  if (verdict.blocked) {
    process.stderr.write(`${verdict.reason}\n`);
    return 2;
  }
  return 0;
}

main().then((code) => process.exit(code));
