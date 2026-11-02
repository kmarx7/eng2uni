// Turns corpus/tagged records into analysis/tagging_stats.json (counts only).
import type { TaggedItem, TaggingScopeStats, TaggingStats } from "@/lib/schema/tagging";

const SINCE = 2018;

function bump<K extends string>(counts: Partial<Record<K, number>>, key: K, by = 1): void {
  counts[key] = (counts[key] ?? 0) + by;
}

// Evidence position in thirds of the passage (1-based sentence numbers).
function third(index: number, total: number): "early" | "middle" | "late" {
  const at = total <= 1 ? 0 : (index - 1) / (total - 1);
  return at < 1 / 3 ? "early" : at <= 2 / 3 ? "middle" : "late";
}

function scopeStats(records: readonly TaggedItem[]): TaggingScopeStats {
  const s: TaggingScopeStats = {
    items: records.length,
    trapsByType: {},
    grammarPoints: [],
    vocabBasis: {},
    blankRoles: {},
    orderCues: {},
    insertionCues: {},
    topicDomainsByType: {},
    evidenceByType: {},
  };
  const grammar: Record<string, number> = {};
  for (const r of records) {
    const t = r.tagging;
    for (const d of t.distractorTraps) bump((s.trapsByType[r.type] ??= {}), d.trap);
    for (const g of t.grammarPoints) bump(grammar, g.point);
    for (const v of t.vocabTargets) bump(s.vocabBasis, v.basis);
    if (t.blankRole) bump(s.blankRoles, t.blankRole);
    for (const c of t.orderCues) bump(s.orderCues, c);
    for (const c of t.insertionCues) bump(s.insertionCues, c);
    bump((s.topicDomainsByType[r.type] ??= {}), t.topicDomain);
    if (t.evidenceSentenceIndexes.length) {
      const e = (s.evidenceByType[r.type] ??= { items: 0, meanSpans: 0, position: { early: 0, middle: 0, late: 0 } });
      e.meanSpans = e.meanSpans * e.items + t.evidenceSentenceIndexes.length;
      e.items++;
      e.meanSpans /= e.items;
      for (const i of t.evidenceSentenceIndexes) e.position[third(i, r.sentenceCount)]++;
    }
  }
  for (const e of Object.values(s.evidenceByType)) if (e) e.meanSpans = Math.round(e.meanSpans * 100) / 100;
  const total = Object.values(grammar).reduce((a, b) => a + b, 0);
  s.grammarPoints = Object.entries(grammar)
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
    .map(([point, count]) => ({ point: point as TaggingScopeStats["grammarPoints"][number]["point"], count, share: Math.round((count / total) * 10000) / 10000 }));
  return s;
}

export function aggregateTags(records: readonly TaggedItem[], opts: { generator: string; reviewed: boolean }): TaggingStats {
  const year = (r: TaggedItem) => Number(r.examId.slice(0, 4));
  const exams = [...new Set(records.map((r) => r.examId))].sort();
  const recent = records.filter((r) => year(r) >= SINCE);
  return {
    meta: {
      generator: opts.generator,
      promptVersion: Math.max(...records.map((r) => r.promptVersion)),
      models: [...new Set(records.map((r) => r.model))].sort(),
      exams,
      since2018Exams: exams.filter((e) => Number(e.slice(0, 4)) >= SINCE),
      reviewed: opts.reviewed,
    },
    byScope: { all: scopeStats(records), since2018: scopeStats(recent) },
  };
}
