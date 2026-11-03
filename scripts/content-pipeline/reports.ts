// Stage 8: student error reports. By default this only lists the pending reports;
// with --apply, each reported approved question is retired (hidden from students)
// and returns to /admin/review-queue as flagged. Run by a person before a build.
//
//   npm run content:reports            (list)
//   npm run content:reports -- --apply (send them back to review)
import path from "node:path";
import { parseArgs } from "node:util";
import { applyReports, REPORTS_FILE, summarizeReports } from "@/lib/pipeline/reports";

const { values } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
const root = process.cwd();
const file = path.join(process.env.REPORTS_DIR ?? path.join(root, "data/reports"), REPORTS_FILE);
const pending = summarizeReports(file);
if (pending.length === 0) {
  process.stdout.write("새 신고가 없습니다\n");
  process.exit(0);
}
for (const p of pending) {
  process.stdout.write(`${p.questionId}: ${p.count}건 (${p.reasons.join(", ")})${p.notes.length ? ` 메모: ${p.notes.join(" / ")}` : ""}\n`);
}
if (!values.apply) {
  process.stdout.write("확인했으면 `npm run content:reports -- --apply`로 위 문항을 학생 화면에서 내리고 검수 대기로 돌립니다\n");
  process.exit(0);
}
const count = applyReports(path.join(root, "content"), file, new Date());
process.stdout.write(`신고된 문항 ${count}개를 검수 대기로 돌렸습니다\n`);
