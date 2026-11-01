import path from "node:path";

// Approved student content. Changes go through the review screen, never through
// an agent's Edit/Write or a shell command.
export const PROTECTED_DIRS = ["content/units/", "content/sentences/", "content/questions/", "content/vocabulary/"];

export const BLOCK_MESSAGE = "승인본은 검수 화면으로만 변경";

export interface Verdict {
  blocked: boolean;
  reason?: string;
}

const ALLOW: Verdict = { blocked: false };

function block(target: string): Verdict {
  return { blocked: true, reason: `${BLOCK_MESSAGE}: ${target}` };
}

// Returns the project-relative POSIX path, or null when the path is outside the project.
export function projectRelative(filePath: string, projectDir: string): string | null {
  const absolute = path.resolve(projectDir, filePath);
  const relative = path.relative(projectDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

export function isProtected(filePath: string, projectDir: string): boolean {
  const relative = projectRelative(filePath, projectDir);
  // Trailing "/" so the folder itself ("cp x content/units/") counts too.
  return relative !== null && PROTECTED_DIRS.some((dir) => `${relative}/`.startsWith(dir));
}

export function checkFileWrite(filePath: string, projectDir: string): Verdict {
  return isProtected(filePath, projectDir) ? block(projectRelative(filePath, projectDir) ?? filePath) : ALLOW;
}

// Commands whose last path argument is the destination.
const COPY_LIKE = new Set(["cp", "mv", "rsync", "install", "ln"]);
// Commands that change every path they are given.
const MODIFY_ALL = new Set(["rm", "rmdir", "touch", "tee", "truncate", "mkdir", "chmod", "unlink"]);
const GIT_MODIFY = new Set(["mv", "rm", "checkout", "restore"]);

function unquote(token: string): string {
  return token.replace(/^['"]|['"]$/g, "");
}

function tokens(segment: string): string[] {
  return (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote);
}

// Best-effort check of a shell command for writes into protected folders.
// It catches redirections and the usual file commands; it cannot see writes made
// from inside another program (for example a Python or Node one-liner).
export function checkBashCommand(command: string, projectDir: string): Verdict {
  const hit = (token: string) => !token.startsWith("-") && isProtected(token, projectDir);

  for (const match of command.matchAll(/(?:^|[^0-9&<>])>{1,2}\|?\s*("[^"]*"|'[^']*'|[^\s;&|<>]+)/g)) {
    const target = unquote(match[1]);
    if (hit(target)) return block(target);
  }

  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = tokens(segment).filter((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w));
    while (words[0] === "sudo" || words[0] === "command" || words[0] === "xargs") words.shift();
    const [name, ...args] = words;
    if (!name) continue;
    const program = path.basename(name);
    const paths = args.filter((a) => !a.startsWith("-") && !a.startsWith(">"));

    if (COPY_LIKE.has(program)) {
      const destination = paths.at(-1);
      if (destination && hit(destination)) return block(destination);
    } else if (MODIFY_ALL.has(program) || (program === "sed" && args.some((a) => a.startsWith("-i")))) {
      const target = paths.find(hit);
      if (target) return block(target);
    } else if (program === "git" && GIT_MODIFY.has(args[0] ?? "")) {
      const target = paths.slice(1).find(hit);
      if (target) return block(target);
    }
  }
  return ALLOW;
}

export interface HookInput {
  tool_name?: string;
  tool_input?: { file_path?: string; notebook_path?: string; command?: string };
  cwd?: string;
}

export function checkHookInput(input: HookInput, projectDir: string): Verdict {
  const tool = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};
  if (tool === "Bash" && toolInput.command) return checkBashCommand(toolInput.command, projectDir);
  const target = toolInput.file_path ?? toolInput.notebook_path;
  if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool) && target) {
    return checkFileWrite(target, projectDir);
  }
  return ALLOW;
}
