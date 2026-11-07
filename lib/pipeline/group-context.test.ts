import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJsonAtomic } from "./draft-store";
import { groupContextFor } from "./group-context";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "group-context-"));
  writeJsonAtomic(path.join(dir, "misconceptions.json"), [{ id: "verb_as_subject", description: "승인된 설명" }]);
  writeJsonAtomic(path.join(dir, "drafts/misconceptions.json"), [{ id: "new_one", description: "초안 설명" }]);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const spec = { generation: { variantGroups: [{ id: "VG-A", note: "주어·목적어만", misconceptionIds: ["new_one", "verb_as_subject", "missing"] }] } } as never;

describe("groupContextFor", () => {
  it("gives a question its group's note and the known misconceptions, approved or drafted", () => {
    const context = groupContextFor(dir, spec);
    expect(context({ variantGroup: "VG-A" } as never)).toEqual({
      note: "주어·목적어만",
      misconceptions: [
        { id: "new_one", description: "초안 설명" },
        { id: "verb_as_subject", description: "승인된 설명" },
      ],
    });
    expect(context({ variantGroup: "VG-OTHER" } as never)).toBeUndefined();
    expect(groupContextFor(dir, undefined)({ variantGroup: "VG-A" } as never)).toBeUndefined();
  });
});
