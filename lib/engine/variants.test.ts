import { describe, expect, it } from "vitest";
import { pickVariant } from "./variants";

const pool = [
  { id: "Q1", variantGroup: "G" },
  { id: "Q2", variantGroup: "H" },
  { id: "Q3", variantGroup: "G" },
  { id: "Q4" },
];

describe("pickVariant", () => {
  it("returns the first question of the group not excluded", () => {
    expect(pickVariant(pool, "G", new Set(["Q1"]))).toBe("Q3");
  });

  it("returns null when the group is used up", () => {
    expect(pickVariant(pool, "G", new Set(["Q1", "Q3"]))).toBeNull();
  });
});
