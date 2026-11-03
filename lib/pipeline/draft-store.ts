// Files the content pipeline owns under content/drafts/ and its call cache.
// Every write is atomic (temp file + rename) and merges items by id.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Unit } from "@/lib/schema/curriculum";
import type { Question } from "@/lib/schema/question";
import type { ReviewRecord } from "@/lib/schema/review-record";
import type { AnnotatedSentence } from "@/lib/schema/sentence";
import type { SpecCatalog } from "@/lib/schema/spec";

export interface Drafts {
  sentences: AnnotatedSentence[];
  questions: Question[];
  units: Unit[];
  records: ReviewRecord[];
}

const DRAFT_DIRS: Record<keyof Drafts, string> = {
  sentences: "sentences",
  questions: "questions",
  units: "units",
  records: "records",
};

export const CATALOG_FILES = {
  levels: "levels.json",
  skills: "skills.json",
  misconceptions: "misconceptions.json",
  traps: "traps.json",
} as const;

export function readJsonArray<T>(file: string): T[] {
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T[]) : [];
}

export function writeJsonAtomic(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, file);
}

// Replaces items with the same id in place and appends new ones.
export function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const byId = new Map(incoming.map((item) => [item.id, item]));
  const merged = existing.map((item) => byId.get(item.id) ?? item);
  const known = new Set(existing.map((item) => item.id));
  return [...merged, ...incoming.filter((item) => !known.has(item.id))];
}

export const draftFile = (contentDir: string, dir: string, unitId: string) => path.join(contentDir, "drafts", dir, `${unitId}.json`);

export function readDrafts(contentDir: string, unitId: string): Drafts {
  return {
    sentences: readJsonArray(draftFile(contentDir, DRAFT_DIRS.sentences, unitId)),
    questions: readJsonArray(draftFile(contentDir, DRAFT_DIRS.questions, unitId)),
    units: readJsonArray(draftFile(contentDir, DRAFT_DIRS.units, unitId)),
    records: readJsonArray(draftFile(contentDir, DRAFT_DIRS.records, unitId)),
  };
}

export function writeDrafts(contentDir: string, unitId: string, update: Partial<Drafts>): void {
  for (const key of Object.keys(update) as (keyof Drafts)[]) {
    const items = update[key] as { id: string }[] | undefined;
    if (!items) continue;
    const file = draftFile(contentDir, DRAFT_DIRS[key], unitId);
    writeJsonAtomic(file, mergeById(readJsonArray<{ id: string }>(file), items));
  }
}

export function writeCatalogDrafts(contentDir: string, catalog: SpecCatalog): void {
  const lists: [string, { id: string }[]][] = [
    [CATALOG_FILES.levels, catalog.level ? [catalog.level] : []],
    [CATALOG_FILES.skills, catalog.skills],
    [CATALOG_FILES.misconceptions, catalog.misconceptions],
    [CATALOG_FILES.traps, catalog.traps],
  ];
  for (const [name, items] of lists) {
    if (!items.length) continue;
    const file = path.join(contentDir, "drafts", name);
    writeJsonAtomic(file, mergeById(readJsonArray<{ id: string }>(file), items));
  }
}

const cacheFile = (cacheDir: string, key: string) => path.join(cacheDir, `${key}.json`);

export function cacheGet(cacheDir: string, key: string): unknown {
  const file = cacheFile(cacheDir, key);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : undefined;
}

export function cachePut(cacheDir: string, key: string, value: unknown): void {
  writeJsonAtomic(cacheFile(cacheDir, key), value);
}
