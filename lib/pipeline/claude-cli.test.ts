import { describe, expect, it } from "vitest";
import { assertSubscriptionAuth, claudeArgs, parseRunnerOutput, subscriptionEnv } from "./claude-cli";

describe("billing safeguards", () => {
  it("removes API credentials so claude uses the subscription login", () => {
    const env = subscriptionEnv({ ANTHROPIC_API_KEY: "k", ANTHROPIC_AUTH_TOKEN: "t", ANTHROPIC_BASE_URL: "u", PATH: "/bin" });
    expect(env).toEqual({ PATH: "/bin" });
  });

  it("refuses to run unless logged in through claude.ai", () => {
    expect(() => assertSubscriptionAuth(JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }))).not.toThrow();
    expect(() => assertSubscriptionAuth(JSON.stringify({ loggedIn: true, authMethod: "api_key" }))).toThrow(/subscription/);
    expect(() => assertSubscriptionAuth("garbage")).toThrow();
  });

  it("never passes --bare (which reads only an API key)", () => {
    const args = claudeArgs({ model: "sonnet", schema: "{}", systemPrompt: "s" });
    expect(args).not.toContain("--bare");
    expect(args).toEqual(expect.arrayContaining(["-p", "--tools", "", "--strict-mcp-config", "--json-schema", "{}", "--model", "sonnet"]));
  });
});

describe("parseRunnerOutput", () => {
  it("returns the structured output", () => {
    expect(parseRunnerOutput(JSON.stringify({ structured_output: { a: 1 } }))).toEqual({ ok: true, json: { a: 1 } });
  });

  it("reports an error result", () => {
    expect(parseRunnerOutput(JSON.stringify({ is_error: true, result: "x" }))).toEqual({ ok: false, error: "x" });
  });

  it("reports output that is not JSON", () => {
    expect(parseRunnerOutput("nope")).toMatchObject({ ok: false });
  });

  it("reports a missing structured output", () => {
    expect(parseRunnerOutput(JSON.stringify({ result: "text" }))).toMatchObject({ ok: false });
  });
});
