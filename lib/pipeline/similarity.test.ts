import { describe, expect, it } from "vitest";
import { similarityStatus } from "./similarity";

describe("similarityStatus", () => {
  it("maps overlaps to fail and the rest to pass", async () => {
    const run = async () => JSON.stringify({ status: "checked", results: [{ id: "A", score: 2, overlap: true }, { id: "B", score: 0, overlap: false }] });
    const result = await similarityStatus([{ id: "A", text: "x" }, { id: "B", text: "y" }], run);
    expect(Object.fromEntries(result)).toEqual({ A: "fail", B: "pass" });
  });

  it("marks everything skipped without a corpus", async () => {
    const run = async () => JSON.stringify({ status: "skipped", results: [] });
    expect(Object.fromEntries(await similarityStatus([{ id: "A", text: "x" }], run))).toEqual({ A: "skipped" });
  });

  it("marks everything skipped when the checker cannot run", async () => {
    const run = async () => {
      throw new Error("uv missing");
    };
    expect(Object.fromEntries(await similarityStatus([{ id: "A", text: "x" }], run))).toEqual({ A: "skipped" });
  });

  it("sends the items as JSON", async () => {
    let sent = "";
    const run = async (input: string) => {
      sent = input;
      return JSON.stringify({ status: "skipped", results: [] });
    };
    await similarityStatus([{ id: "A", text: "x" }], run);
    expect(JSON.parse(sent)).toEqual([{ id: "A", text: "x" }]);
  });
});
