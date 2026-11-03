// Runs `claude -p` on the claude.ai subscription login (tagging, and the content
// pipeline since 2026-11-03). API credentials are removed from the child
// environment and --bare is never used (it reads only an API key), so a run can
// never switch to per-token API billing.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const BILLING_VARS = /^(ANTHROPIC_|CLAUDE_CODE_USE_(BEDROCK|VERTEX|FOUNDRY)$)/;

export function subscriptionEnv(env: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !BILLING_VARS.test(key)));
}

export function assertSubscriptionAuth(statusJson: string): void {
  let status: { loggedIn?: boolean; authMethod?: string };
  try {
    status = JSON.parse(statusJson);
  } catch {
    throw new Error("could not read `claude auth status`");
  }
  if (!status.loggedIn || status.authMethod !== "claude.ai") {
    throw new Error(`claude runs only on the claude.ai subscription login (found ${status.authMethod ?? "none"}); refusing to risk API billing`);
  }
}

export function claudeArgs(opts: { model: string; schema: string; systemPrompt: string }): string[] {
  return [
    "-p",
    "--model", opts.model,
    "--tools", "",
    "--strict-mcp-config",
    // User settings carry plugins and hooks; skipping them keeps each call small.
    "--setting-sources", "project",
    "--no-session-persistence",
    "--system-prompt", opts.systemPrompt,
    "--output-format", "json",
    "--json-schema", opts.schema,
  ];
}

// A neutral working directory, so no project CLAUDE.md or settings are loaded.
function neutralDir(): string {
  const dir = path.join(os.tmpdir(), "eng2uni-claude");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function runClaude(args: string[], input: string, timeoutMs = 300_000): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("claude", args, { cwd: neutralDir(), env: subscriptionEnv(process.env) as NodeJS.ProcessEnv });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

export function authStatus(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("claude", ["auth", "status"], { env: subscriptionEnv(process.env) as NodeJS.ProcessEnv });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(out));
  });
}

export type RunnerResult = { ok: true; json: unknown } | { ok: false; error: string };

// One structured call. Every pipeline step takes a runner so tests can pass a fake.
export type ClaudeRunner = (req: {
  model: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  input: string;
  timeoutMs: number;
}) => Promise<RunnerResult>;

export function parseRunnerOutput(stdout: string): RunnerResult {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stdout);
  } catch {
    return { ok: false, error: "output is not JSON" };
  }
  if (data.is_error) return { ok: false, error: String(data.result ?? data.subtype ?? "error").slice(0, 200) };
  if (data.structured_output === undefined) return { ok: false, error: "no structured output" };
  return { ok: true, json: data.structured_output };
}

export const subscriptionRunner: ClaudeRunner = async ({ model, schema, systemPrompt, input, timeoutMs }) => {
  const { code, stdout, stderr } = await runClaude(claudeArgs({ model, schema: JSON.stringify(schema), systemPrompt }), input, timeoutMs);
  if (code !== 0 && !stdout) return { ok: false, error: `claude exited ${code}: ${stderr.slice(0, 200)}` };
  return parseRunnerOutput(stdout);
};
