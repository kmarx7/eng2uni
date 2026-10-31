import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  checkContent,
  type CheckOptions,
  type ContentFile,
  type ContentIssue,
  type ContentKind,
} from "./content-rules";

export const DRAFTS_DIR = "drafts";
export const FIXTURES_DIR = "_fixtures";

const ROOT_FILES: Record<string, ContentKind> = {
  "levels.json": "level",
  "skills.json": "skill",
  "misconceptions.json": "misconception",
  "traps.json": "trap",
};

const KIND_DIRS: Record<string, ContentKind> = {
  units: "unit",
  sentences: "sentence",
  passages: "passage",
  questions: "question",
  vocabulary: "vocabulary",
  blueprints: "blueprint",
};

// Maps a path relative to a content root to the kind of item it holds.
export function kindForPath(relativePath: string): ContentKind | null {
  const parts = relativePath.split(/[\\/]/);
  if (parts.length === 1) return ROOT_FILES[parts[0]] ?? null;
  return KIND_DIRS[parts[0]] ?? null;
}

function listJsonFiles(dir: string, skipDirs: Set<string>, base = dir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === base && skipDirs.has(entry.name)) continue;
      files.push(...listJsonFiles(full, skipDirs, base));
    } else if (entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files.sort();
}

export interface LoadResult {
  files: ContentFile[];
  issues: ContentIssue[];
}

// Reads every JSON file under root, skipping the given top-level directories.
export function loadContentRoot(root: string, skipDirs: string[] = [], displayBase = root): LoadResult {
  const files: ContentFile[] = [];
  const issues: ContentIssue[] = [];
  for (const full of listJsonFiles(root, new Set(skipDirs))) {
    const display = path.relative(displayBase, full);
    const kind = kindForPath(path.relative(root, full));
    if (!kind) {
      issues.push({ path: display, message: "unknown content file location" });
      continue;
    }
    try {
      files.push({ path: display, kind, data: JSON.parse(readFileSync(full, "utf8")) });
    } catch (error: unknown) {
      issues.push({ path: display, message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return { files, issues };
}

export interface RootReport {
  root: string;
  fileCount: number;
  itemCount: number;
  issues: ContentIssue[];
}

function checkRoot(root: string, label: string, displayBase: string, skipDirs: string[], options: CheckOptions): RootReport {
  const { files, issues } = loadContentRoot(root, skipDirs, displayBase);
  return {
    root: label,
    fileCount: files.length,
    itemCount: files.reduce((sum, file) => sum + (Array.isArray(file.data) ? file.data.length : 0), 0),
    issues: [...issues, ...checkContent(files, options)],
  };
}

// Validates a whole content/ tree:
// - the student root (everything except drafts/ and _fixtures/) gets every rule, approved only;
// - drafts/ gets schema checks only;
// - each _fixtures/<set>/ is a self-contained set checked for integrity and FIXTURE ids.
export function validateContentTree(contentDir: string): RootReport[] {
  const displayBase = path.dirname(contentDir);
  const reports = [
    checkRoot(contentDir, path.basename(contentDir), displayBase, [DRAFTS_DIR, FIXTURES_DIR], {
      mode: "full",
      requireApproved: true,
      requireFixtureIds: false,
    }),
  ];

  const drafts = path.join(contentDir, DRAFTS_DIR);
  if (existsSync(drafts)) {
    reports.push(
      checkRoot(drafts, path.relative(displayBase, drafts), displayBase, [], {
        mode: "schema",
        requireApproved: false,
        requireFixtureIds: false,
      }),
    );
  }

  const fixtures = path.join(contentDir, FIXTURES_DIR);
  if (existsSync(fixtures)) {
    for (const entry of readdirSync(fixtures, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const setDir = path.join(fixtures, entry.name);
      reports.push(
        checkRoot(setDir, path.relative(displayBase, setDir), displayBase, [], {
          mode: "full",
          requireApproved: false,
          requireFixtureIds: true,
        }),
      );
    }
  }
  return reports;
}
