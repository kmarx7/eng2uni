import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cacheGet, cachePut, readDrafts, writeCatalogDrafts, writeDrafts } from "./draft-store";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "draft-store-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("draft store", () => {
  it("reads nothing for a new unit", () => {
    expect(readDrafts(dir, "L0-U05")).toEqual({ sentences: [], questions: [], units: [], records: [] });
  });

  it("merges by id and keeps the order of first appearance", () => {
    writeDrafts(dir, "L0-U05", { records: [{ id: "A", v: 1 }, { id: "B", v: 1 }] as never });
    writeDrafts(dir, "L0-U05", { records: [{ id: "A", v: 2 }, { id: "C", v: 1 }] as never });
    const file = path.join(dir, "drafts/records/L0-U05.json");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([{ id: "A", v: 2 }, { id: "B", v: 1 }, { id: "C", v: 1 }]);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });

  it("writes catalogue drafts as root files under drafts/", () => {
    writeCatalogDrafts(dir, { skills: [{ id: "s1", name: "주어", category: "syntax", prerequisiteIds: [] }], misconceptions: [], traps: [] });
    expect(JSON.parse(readFileSync(path.join(dir, "drafts/skills.json"), "utf8"))).toHaveLength(1);
    expect(existsSync(path.join(dir, "drafts/traps.json"))).toBe(false);
  });

  it("caches call output by key", () => {
    expect(cacheGet(dir, "k")).toBeUndefined();
    cachePut(dir, "k", { a: 1 });
    expect(cacheGet(dir, "k")).toEqual({ a: 1 });
  });
});
