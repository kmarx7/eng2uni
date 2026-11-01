import { describe, expect, it } from "vitest";
import type { ItemTagging } from "@/lib/schema/tagging";
import { assertSubscriptionAuth, claudeArgs, subscriptionEnv } from "../scripts/tagging/claude";
import { buildPrompt, requirementsFor, splitSentences, type ExamItem } from "../scripts/tagging/prompt";
import { checkTagging, parseClaudeResult } from "../scripts/tagging/check";

// Self-written fake items only (no exam text).
const blankItem: ExamItem = {
  examId: "2099_csat",
  number: 31,
  type: "blank_inference",
  instruction: "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.",
  passage: "Fake cats sleep a lot. Dr. Fake says they rest _____. \"Why?\" asked Mr. Lee. They dream.",
  options: [1, 2, 3, 4, 5].map((label) => ({ label, text: `fake ${label}`, kind: "listed" })),
  answer: 3,
  givenSentence: null,
  summary: null,
  orderParts: null,
};

const base: ItemTagging = {
  evidenceSentenceIndexes: [1],
  distractorTraps: [1, 2, 4, 5].map((option) => ({ option, trap: "keyword_reuse" as const, note: "" })),
  grammarPoints: [],
  vocabTargets: [],
  blankRole: "conclusion",
  orderCues: [],
  insertionCues: [],
  topicDomain: "natural_science",
};

describe("splitSentences", () => {
  it("splits on sentence ends but not on titles or quoted questions", () => {
    expect(splitSentences(blankItem.passage)).toEqual([
      "Fake cats sleep a lot.",
      "Dr. Fake says they rest _____.",
      "\"Why?\" asked Mr. Lee.",
      "They dream.",
    ]);
  });

  it("treats a line break as a boundary and drops empty pieces", () => {
    expect(splitSentences("One fake line\nTwo fake line.\n\n")).toEqual(["One fake line", "Two fake line."]);
  });
});

describe("requirementsFor", () => {
  it("asks only for the fields that fit the item", () => {
    expect(requirementsFor(blankItem)).toEqual({ traps: true, blankRole: true, grammar: false, vocab: false, orderCues: false, insertionCues: false });
    expect(requirementsFor({ ...blankItem, type: "grammar", instruction: "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?" }).grammar).toBe(true);
    expect(requirementsFor({ ...blankItem, number: 42, type: "long_title_vocab", instruction: "밑줄 친 (a)～(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?" }).vocab).toBe(true);
    expect(requirementsFor({ ...blankItem, number: 41, type: "long_title_vocab", instruction: "윗글의 제목으로 가장 적절한 것은?" }).traps).toBe(true);
  });

  it("skips traps for 'not consistent' items, whose wrong options are true statements", () => {
    expect(requirementsFor({ ...blankItem, number: 25, type: "chart", instruction: "다음 도표의 내용과 일치하지 않는 것은?" }).traps).toBe(false);
    expect(requirementsFor({ ...blankItem, number: 45, type: "long_narrative", instruction: "윗글에 관한 내용으로 적절하지 않은 것은?" }).traps).toBe(false);
    expect(requirementsFor({ ...blankItem, number: 28, type: "notice", instruction: "Fake Day에 관한 다음 안내문의 내용과 일치하는 것은?" }).traps).toBe(true);
  });

  it("asks for order cues on the long-passage ordering item", () => {
    const req = requirementsFor({ ...blankItem, number: 43, type: "long_narrative", instruction: "주어진 글 (A)에 이어질 내용을 순서에 맞게 배열한 것으로 가장 적절한 것은?" });
    expect(req).toMatchObject({ traps: false, orderCues: true });
  });
});

describe("buildPrompt", () => {
  it("numbers the sentences and names the answer and the required fields", () => {
    const { prompt, sentenceCount } = buildPrompt(blankItem);
    expect(sentenceCount).toBe(4);
    expect(prompt).toContain("[S2] Dr. Fake says they rest _____.");
    expect(prompt).toContain("Correct answer: 3");
    expect(prompt).toMatch(/blankRole: required/);
    expect(prompt).toMatch(/grammarPoints: leave empty/);
  });
});

describe("checkTagging", () => {
  it("accepts a consistent tagging", () => {
    expect(checkTagging(blankItem, 4, base)).toEqual([]);
  });

  it("flags out-of-range sentences, a trap on the answer, missing distractors and missing required fields", () => {
    const bad = { ...base, evidenceSentenceIndexes: [9], distractorTraps: base.distractorTraps.slice(0, 2).concat({ option: 3, trap: "other" as const, note: "x" }), blankRole: null };
    expect(checkTagging(blankItem, 4, bad)).toEqual([
      "evidence sentence 9 is outside 1..4",
      "trap given for the correct answer 3",
      "traps missing for options 4, 5",
      "blankRole is required",
    ]);
  });

  it("flags fields filled for the wrong item type", () => {
    expect(checkTagging(blankItem, 4, { ...base, orderCues: ["connective"] })).toEqual(["orderCues must be empty for this item"]);
  });
});

describe("parseClaudeResult", () => {
  it("returns the structured output and usage", () => {
    const out = JSON.stringify({
      is_error: false,
      structured_output: base,
      modelUsage: { "claude-x": {} },
      usage: { input_tokens: 3, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 900 },
    });
    expect(parseClaudeResult(out)).toEqual({
      ok: true,
      tagging: base,
      model: "claude-x",
      usage: { inputTokens: 3, outputTokens: 40, cacheReadInputTokens: 0, cacheCreationInputTokens: 900 },
    });
  });

  it("recognises the usage limit so the run can stop instead of retrying", () => {
    const out = JSON.stringify({ is_error: true, result: "Claude AI usage limit reached|1762000000" });
    expect(parseClaudeResult(out)).toMatchObject({ ok: false, limitReached: true });
  });

  it("reports unparsable output", () => {
    expect(parseClaudeResult("not json")).toMatchObject({ ok: false, limitReached: false });
  });
});

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
