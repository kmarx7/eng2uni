// docs/analysis/GRAMMAR_PRIORITY.md: grammar points in item 29 by frequency,
// compared with the DESIGN 14-6 hypothesis list.
import type { GrammarPoint, TaggingStats } from "@/lib/schema/tagging";

export const KO: Record<GrammarPoint, string> = {
  subject_verb_agreement: "주어·동사 수 일치",
  finite_vs_nonfinite: "동사와 준동사 구별",
  relative_pronoun: "관계대명사(what·that·which)",
  relative_adverb: "관계부사",
  active_passive: "능동·수동",
  pronoun_reflexive: "대명사·재귀대명사",
  adjective_adverb: "형용사·부사",
  parallelism: "병렬 구조",
  pro_verb: "대동사",
  inversion: "도치",
  participle_form: "분사 형태(현재·과거분사)",
  infinitive_gerund: "to부정사·동명사",
  conjunction_vs_preposition: "접속사·전치사 구별",
  tense_mood: "시제·법",
  comparison: "비교 구문",
  other: "기타",
};

// DESIGN 14-6 "분석 전 가설 목록", in the order written there.
export const HYPOTHESIS: GrammarPoint[] = [
  "subject_verb_agreement", "finite_vs_nonfinite", "relative_pronoun", "relative_adverb", "active_passive",
  "pronoun_reflexive", "adjective_adverb", "parallelism", "pro_verb", "inversion",
];

export function renderGrammarReport(stats: TaggingStats): string {
  const rows = (scope: "all" | "since2018") => stats.byScope[scope].grammarPoints;
  const recent = new Map(rows("since2018").map((g, i) => [g.point, { rank: i + 1, ...g }]));
  const lines = [
    "# 어법 포인트 출제 순위 (29번)",
    "",
    "`npm run analyze:tags`가 만드는 파일이다. 직접 고치지 않는다.",
    "",
    `- 출처: \`analysis/tagging_stats.json\`의 \`byScope.*.grammarPoints\`. 어법 문항(밑줄 5개 또는 네모 3개)의 각 선택지가 묻는 포인트를 AI가 태깅한 것(${stats.meta.models.join(", ")}).`,
    `- 사람 표본 검수: ${stats.meta.reviewed ? "반영됨" : "아직 안 됨. 순위는 검수 결과에 따라 바뀔 수 있다"}.`,
    "- \"가설\" 열: 설계서 14-6의 분석 전 가설 목록에 있는지. 가설 순위는 목록에 적힌 순서다.",
    "",
    "| 순위 | 포인트 | 전체 횟수 | 비율 | 2018 이후 순위 | 2018 이후 횟수 | 가설 | 가설 순위 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  rows("all").forEach((g, i) => {
    const r = recent.get(g.point);
    const h = HYPOTHESIS.indexOf(g.point);
    lines.push(`| ${i + 1} | ${KO[g.point]} | ${g.count} | ${(g.share * 100).toFixed(1)}% | ${r?.rank ?? "-"} | ${r?.count ?? 0} | ${h >= 0 ? "있음" : "없음(새로 확인)"} | ${h >= 0 ? h + 1 : "-"} |`);
  });
  const seen = new Set(rows("all").map((g) => g.point));
  const missing = HYPOTHESIS.filter((p) => !seen.has(p));
  lines.push("", "## 가설과 다른 점", "");
  lines.push(`- 가설에 없었지만 출제된 포인트: ${rows("all").filter((g) => !HYPOTHESIS.includes(g.point) && g.point !== "other").map((g) => KO[g.point]).join(", ") || "없음"}`);
  lines.push(`- 가설에 있었지만 태깅되지 않은 포인트: ${missing.map((p) => KO[p]).join(", ") || "없음"}`);
  lines.push("- 순위 차이는 위 표의 \"순위\"와 \"가설 순위\"를 비교한다. 가설 목록은 순위를 매긴 것이 아니라 나열한 것이므로, 순서 차이보다 빠지거나 새로 나온 포인트가 더 중요하다.", "");
  return lines.join("\n");
}
