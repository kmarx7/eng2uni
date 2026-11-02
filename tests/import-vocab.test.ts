import { describe, expect, it } from "vitest";
import { Vocabulary } from "@/lib/schema/vocabulary";
import { parseVocabCsv, toDraftVocabulary } from "../scripts/vocab/import";

const csv = "﻿Word,POS,Meaning\nfake,n,가짜\n\"rest\",v,\"쉬다, 휴식하다\"\nbright,형용사,밝은; 영리한\n";

describe("parseVocabCsv", () => {
  it("reads a header in any case, a BOM, and quoted commas", () => {
    const { rows, errors } = parseVocabCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 2, word: "fake", pos: "noun", meaning: "가짜" },
      { line: 3, word: "rest", pos: "verb", meaning: "쉬다, 휴식하다" },
      { line: 4, word: "bright", pos: "adjective", meaning: "밝은; 영리한" },
    ]);
  });

  it("reports empty meanings, unknown parts of speech and repeated word+pos by line", () => {
    const { rows, errors } = parseVocabCsv("word,pos,meaning\nfake,n,\nfake,xyz,가짜\nfake,n,가짜\nfake,noun,또 가짜\n");
    expect(rows.map((r) => r.line)).toEqual([4]);
    expect(errors).toEqual(["line 2: empty meaning", 'line 3: unknown pos "xyz"', "line 5: duplicate of fake (noun)"]);
  });

  it("fails clearly without the required columns", () => {
    expect(parseVocabCsv("word,meaning\nfake,가짜\n").errors).toEqual(["missing column: pos"]);
  });
});

describe("toDraftVocabulary", () => {
  it("keeps the source meanings as written and marks every word draft", () => {
    const { rows } = parseVocabCsv(csv);
    const words = toDraftVocabulary(rows, { source: "middle", level: "L0", rankByLemma: new Map([["rest", 120]]) });
    expect(words.map((w) => [w.id, w.meanings, w.isPolysemous, w.csatFrequencyRank, w.reviewStatus, w.example])).toEqual([
      ["V-middle-fake-noun", ["가짜"], false, undefined, "draft", undefined],
      ["V-middle-rest-verb", ["쉬다", "휴식하다"], true, 120, "draft", undefined],
      ["V-middle-bright-adjective", ["밝은", "영리한"], true, undefined, "draft", undefined],
    ]);
    for (const w of words) expect(Vocabulary.safeParse(w).success).toBe(true);
  });

  it("gives ids from the word and part of speech, so editing other rows never moves them", () => {
    const opts = { source: "middle", level: "L0" as const, rankByLemma: new Map<string, number>() };
    const before = toDraftVocabulary(parseVocabCsv(csv).rows, opts);
    const after = toDraftVocabulary(parseVocabCsv("word,pos,meaning\nnew,adj,새로운\n" + csv.split("\n").slice(1).join("\n")).rows, opts);
    expect(after.slice(1).map((w) => w.id)).toEqual(before.map((w) => w.id));
    expect(toDraftVocabulary(parseVocabCsv("word,pos,meaning\nDon't,phr,하지 마\n").rows, opts)[0].id).toBe("V-middle-don-t-phrase");
  });

  it("refuses two words that would share an id", () => {
    const { rows } = parseVocabCsv("word,pos,meaning\nwell-being,n,행복\nwell being,n,행복\n");
    expect(() => toDraftVocabulary(rows, { source: "middle", level: "L0", rankByLemma: new Map() })).toThrow(/same id/);
  });
});
