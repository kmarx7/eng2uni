// Stage 8: send reported questions back to review. Run by a person before the
// next build; each reported approved question is retired (hidden from students)
// and returns to /admin/review-queue as flagged.
//
//   npm run content:reports
import path from "node:path";
import { applyReports, REPORTS_FILE } from "@/lib/pipeline/reports";

const root = process.cwd();
const reportsDir = process.env.REPORTS_DIR ?? path.join(root, "data/reports");
const count = applyReports(path.join(root, "content"), path.join(reportsDir, REPORTS_FILE), new Date());
process.stdout.write(`신고된 문항 ${count}개를 검수 대기로 돌렸습니다\n`);
