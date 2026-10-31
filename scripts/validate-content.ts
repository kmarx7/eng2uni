// Validates everything under content/ before a build. Exits 1 on any issue.
import path from "node:path";
import { validateContentTree } from "@/lib/schema/content-tree";

const contentDir = path.resolve(process.cwd(), "content");
const reports = validateContentTree(contentDir);
let failed = 0;

for (const report of reports) {
  const status = report.issues.length ? "FAIL" : "ok";
  console.log(`${status}  ${report.root}: ${report.fileCount} files, ${report.itemCount} items`);
  for (const issue of report.issues) {
    const item = issue.itemId ? ` [${issue.itemId}]` : "";
    console.error(`  ${issue.path}${item}: ${issue.message}`);
  }
  failed += report.issues.length;
}

if (failed) {
  console.error(`\ncontent validation failed: ${failed} issue(s)`);
  process.exit(1);
}
console.log("content validation passed");
