// Builds BlueprintDraft objects from the committed analysis/ statistics.
// Every number is read from a stats file and recorded in sourceStats.
import type { BlueprintDraft } from "@/lib/schema/blueprint";
import type { PassageStats, SyntaxStats, VocabFrequency } from "@/lib/schema/analysis";
import type { TaggingStats } from "@/lib/schema/tagging";

export interface Stats {
  vocab: VocabFrequency;
  syntax: SyntaxStats;
  passages: PassageStats;
  tagging: TaggingStats;
}

const SCOPE = "since2018" as const;
const TARGET_COVERAGE = 0.95;
const DEPTH_SHARE = 0.9;

// Item numbers in the current layout (DESIGN 14-2), in exam order.
const ITEMS: [BlueprintDraft["type"], string][] = [
  ["purpose", "18"], ["mood", "19"], ["claim", "20"], ["implication", "21"], ["gist", "22"],
  ["topic", "23"], ["title", "24"], ["chart", "25"], ["content_match", "26"], ["notice", "27-28"],
  ["grammar", "29"], ["contextual_vocab", "30"], ["blank_inference", "31-34"], ["irrelevant_sentence", "35"],
  ["ordering", "36-37"], ["insertion", "38-39"], ["summary", "40"], ["long_title_vocab", "41-42"], ["long_narrative", "43-45"],
];

const round = (x: number) => Math.round(x * 10000) / 10000;

function shares<K extends string>(counts: Partial<Record<string, number>> | undefined, key: K): ({ [P in K]: string } & { ratio: number })[] {
  const entries = Object.entries(counts ?? {}).filter(([, n]) => (n ?? 0) > 0) as [string, number][];
  const total = entries.reduce((a, [, n]) => a + n, 0);
  return entries
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([label, n]) => ({ [key]: label, ratio: round(n / total) }) as { [P in K]: string } & { ratio: number });
}

// From the shallowest depth any sentence has to the depth that covers 90% of sentences.
export function depthRange(hist: { bin: string; count: number }[]): { min: number; max: number } {
  const total = hist.reduce((a, h) => a + h.count, 0) || 1;
  const depth = (bin: string) => parseInt(bin, 10);
  const used = hist.filter((h) => h.count > 0 && depth(h.bin) > 0);
  let running = 0;
  let max = used.at(-1) ? depth(used.at(-1)!.bin) : 1;
  for (const h of hist) {
    running += h.count;
    if (running / total >= DEPTH_SHARE) {
      max = depth(h.bin);
      break;
    }
  }
  const min = used.length ? depth(used[0].bin) : 1;
  return { min, max: Math.max(min, max) };
}

export function buildBlueprintDrafts(stats: Stats): BlueprintDraft[] {
  const passages = stats.passages.byScope[SCOPE];
  const syntax = stats.syntax.byScope[SCOPE];
  const tags = stats.tagging.byScope[SCOPE];
  const curve = stats.vocab.coverageCurve[SCOPE];
  const band = curve.find((c) => c.coverage >= TARGET_COVERAGE) ?? curve.at(-1)!;
  const reviewed = stats.tagging.meta.reviewed;
  const drafts: BlueprintDraft[] = [];

  for (const [type, items] of ITEMS) {
    const p = passages[type];
    const s = syntax[type];
    if (!p || !s) continue;
    const src = (file: string, path: string) => ({ file: `analysis/${file}.json`, path: `byScope.${SCOPE}.${path}` });
    const sourceStats = [
      src("passage_stats", `${type}.wordCount`),
      src("passage_stats", `${type}.paragraphs`),
      src("syntax_stats", `${type}.sentenceLength`),
      src("syntax_stats", `${type}.clauseDepthHistogram`),
      src("syntax_stats", `${type}.constructions`),
      { file: "analysis/vocab_frequency.json", path: `coverageCurve.${SCOPE}` },
    ];
    const pending = [
      "requiredSkills: content/skills.json이 아직 없어 비워 둠",
      "answerBasis(정답 근거 서술): 통계로 정할 수 없어 사람이 작성",
    ];
    if (!reviewed) pending.push("AI 태그 표본 검수 전 수치(함정·어법·빈칸·단서·소재·근거 위치)");

    const draft: BlueprintDraft = {
      id: `BPD-${type}`,
      type,
      items,
      basis: { scope: SCOPE, passages: p.passages, taggedItems: tags.items, tagsReviewed: reviewed },
      passage: {
        wordCount: { min: p.wordCount.p25, max: p.wordCount.p75 },
        wordCountMedian: p.wordCount.median,
        paragraphsMean: p.paragraphs.mean,
        avgSentenceLength: s.sentenceLength.mean,
        maxClauseDepth: depthRange(s.clauseDepthHistogram),
        constructionsPer100Sentences: Object.fromEntries(Object.entries(s.constructions).map(([k, v]) => [k, v.per100Sentences])),
        vocabBand: { source: "csat_frequency", topN: band.topN, coverage: band.coverage },
        topicDomains: Object.fromEntries(shares(tags.topicDomainsByType[type], "domain").map((d) => [d.domain, d.ratio])),
      },
      sourceStats,
      pending,
    };
    if (tags.topicDomainsByType[type]) sourceStats.push(src("tagging_stats", `topicDomainsByType.${type}`));

    const ev = tags.evidenceByType[type];
    if (ev) {
      const total = ev.position.early + ev.position.middle + ev.position.late || 1;
      draft.evidence = {
        meanSpans: ev.meanSpans,
        position: { early: round(ev.position.early / total), middle: round(ev.position.middle / total), late: round(ev.position.late / total) },
      };
      sourceStats.push(src("tagging_stats", `evidenceByType.${type}`));
    }
    if (type === "blank_inference") {
      draft.blank = { positionDistribution: shares(tags.blankRoles, "position") as NonNullable<BlueprintDraft["blank"]>["positionDistribution"] };
      sourceStats.push(src("tagging_stats", "blankRoles"));
      pending.push("blank.positionDistribution은 빈칸이 있는 모든 문항(장문 빈칸 포함)의 합계");
    }
    const traps = tags.trapsByType[type];
    if (traps && Object.keys(traps).length) {
      draft.distractors = { count: 4, traps: shares(traps, "trap") };
      sourceStats.push(src("tagging_stats", `trapsByType.${type}`));
      pending.push("distractors.traps는 content/traps.json 승인 후 함정 id로 연결");
    }
    if (type === "grammar" && tags.grammarPoints.length) {
      draft.grammarPoints = tags.grammarPoints.map((g) => ({ point: g.point, ratio: g.share }));
      sourceStats.push(src("tagging_stats", "grammarPoints"));
    }
    if (type === "contextual_vocab") {
      draft.vocabBasis = shares(tags.vocabBasis, "basis");
      sourceStats.push(src("tagging_stats", "vocabBasis"));
      pending.push("vocabBasis는 30번과 장문 42번 어휘 문항의 합계");
    }
    if (type === "ordering" || type === "insertion") {
      const key = type === "ordering" ? "orderCues" : "insertionCues";
      draft.cues = shares(tags[key], "cue");
      sourceStats.push(src("tagging_stats", key));
    }
    drafts.push(draft);
  }
  return drafts;
}
