// The spec's note and misconceptions for a question's variant group, handed to
// revision and pre-review so both judge a draft by the unit's own instructions.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Question } from "@/lib/schema/question";
import { UnitSpec } from "@/lib/schema/spec";
import { CATALOG_FILES, readJsonArray } from "./draft-store";

export interface GroupContext {
  note: string;
  misconceptions: { id: string; description: string }[];
}

export type GroupContextOf = (question: Question) => GroupContext | undefined;

export function readSpec(contentDir: string, unitId: string): UnitSpec | undefined {
  const file = path.join(contentDir, "specs", `${unitId}.json`);
  return existsSync(file) ? UnitSpec.parse(JSON.parse(readFileSync(file, "utf8"))) : undefined;
}

// Misconceptions come from the approved catalogue first, then the drafted one.
export function groupContextFor(contentDir: string, spec: UnitSpec | undefined): GroupContextOf {
  const known = [contentDir, path.join(contentDir, "drafts")].flatMap((dir) =>
    readJsonArray<{ id: string; description: string }>(path.join(dir, CATALOG_FILES.misconceptions)),
  );
  return (question) => {
    const group = spec?.generation.variantGroups.find((g) => g.id === question.variantGroup);
    if (!group) return undefined;
    const misconceptions = group.misconceptionIds.flatMap((id) => {
      const m = known.find((k) => k.id === id);
      return m ? [{ id: m.id, description: m.description }] : [];
    });
    return { note: group.note, misconceptions };
  };
}
