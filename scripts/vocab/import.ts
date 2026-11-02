// Turns the owner's vocabulary CSV (word, pos, meaning) into draft Vocabulary
// items. Meanings are copied as written; nothing is made up (no examples).
import type { LevelId } from "@/lib/schema/common";
import type { PartOfSpeech, Vocabulary } from "@/lib/schema/vocabulary";
import { splitCsvLine } from "../csv";

export interface VocabRow {
  line: number;
  word: string;
  pos: PartOfSpeech;
  meaning: string;
}

const POS: Record<string, PartOfSpeech> = {
  n: "noun", noun: "noun", 명사: "noun",
  v: "verb", verb: "verb", 동사: "verb",
  a: "adjective", adj: "adjective", adjective: "adjective", 형용사: "adjective",
  ad: "adverb", adv: "adverb", adverb: "adverb", 부사: "adverb",
  prep: "preposition", preposition: "preposition", 전치사: "preposition",
  conj: "conjunction", conjunction: "conjunction", 접속사: "conjunction",
  pron: "pronoun", pronoun: "pronoun", 대명사: "pronoun",
  det: "determiner", determiner: "determiner", 한정사: "determiner",
  int: "interjection", interjection: "interjection", 감탄사: "interjection",
  phr: "phrase", phrase: "phrase", 구: "phrase", 숙어: "phrase",
};

export function parseVocabCsv(text: string): { rows: VocabRow[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((h) => h.trim().toLowerCase());
  const missing = ["word", "pos", "meaning"].filter((c) => !header.includes(c));
  if (missing.length) return { rows: [], errors: missing.map((c) => `missing column: ${c}`) };
  const at = (cells: string[], name: string) => (cells[header.indexOf(name)] ?? "").trim();

  const rows: VocabRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  lines.slice(1).forEach((raw, i) => {
    if (!raw.trim()) return;
    const line = i + 2;
    const cells = splitCsvLine(raw);
    const word = at(cells, "word");
    const meaning = at(cells, "meaning");
    const pos = POS[at(cells, "pos").toLowerCase()];
    if (!meaning) return void errors.push(`line ${line}: empty meaning`);
    if (!pos) return void errors.push(`line ${line}: unknown pos "${at(cells, "pos")}"`);
    const key = `${word.toLowerCase()}|${pos}`;
    if (seen.has(key)) return void errors.push(`line ${line}: duplicate of ${word} (${pos})`);
    seen.add(key);
    rows.push({ line, word, pos, meaning });
  });
  return { rows, errors };
}

// Stable id from the word and part of speech: re-importing an edited CSV keeps
// every other word's id, so students' review history stays on the same word.
function wordId(source: string, row: VocabRow): string {
  const slug = row.word.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `V-${source}-${slug}-${row.pos}`;
}

export function toDraftVocabulary(
  rows: readonly VocabRow[],
  opts: { source: string; level: LevelId; rankByLemma: ReadonlyMap<string, number> },
): Vocabulary[] {
  const lines = new Map<string, number>();
  return rows.map((row) => {
    const id = wordId(opts.source, row);
    const other = lines.get(id);
    if (other !== undefined) throw new Error(`line ${row.line}: same id as line ${other} (${id})`);
    lines.set(id, row.line);
    const meanings = row.meaning.split(/[;,]/).map((m) => m.trim()).filter(Boolean);
    const rank = opts.rankByLemma.get(row.word.toLowerCase());
    return {
      id,
      lemma: row.word,
      pos: row.pos,
      meanings,
      level: opts.level,
      isPolysemous: meanings.length > 1,
      ...(rank ? { csatFrequencyRank: rank } : {}),
      reviewStatus: "draft",
    };
  });
}
