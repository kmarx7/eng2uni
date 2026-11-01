import { describe, expect, it } from "vitest";
import type { TaggedItem } from "@/lib/schema/tagging";
import { parseReviewCsv, reviewCsv, sampleForReview, scoreReview } from "../scripts/tagging/review";

function record(examId: string, number: number, type: string): TaggedItem {
  return {
    examId,
    number,
    type: type as TaggedItem["type"],
    sentenceCount: 5,
    model: "fake-model",
    promptVersion: 2,
    attempts: 1,
    taggedAt: "2026-11-01T09:00:00+09:00",
    usage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    tagging: {
      evidenceSentenceIndexes: [2, 4],
      distractorTraps: [{ option: 1, trap: "keyword_reuse", note: "" }],
      grammarPoints: [],
      vocabTargets: [],
      blankRole: type === "blank_inference" ? "conclusion" : null,
      orderCues: [],
      insertionCues: [],
      topicDomain: "arts",
    },
  };
}

const records = [
  ...Array.from({ length: 25 }, (_, i) => record(`2099_m0${i % 2 ? 6 : 9}`, 31 + (i % 4), "blank_inference")),
  record("2099_csat", 29, "grammar"),
  record("2099_csat", 30, "contextual_vocab"),
];

describe("sampleForReview", () => {
  it("takes 10% of each type, at least one, and is repeatable for a seed", () => {
    const sample = sampleForReview(records, 0.1, 7);
    const byType = (t: string) => sample.filter((r) => r.type === t).length;
    expect([byType("blank_inference"), byType("grammar"), byType("contextual_vocab")]).toEqual([3, 1, 1]);
    expect(sampleForReview(records, 0.1, 7)).toEqual(sample);
    expect(sampleForReview(records, 0.1, 8)).not.toEqual(sample);
  });
});

describe("review CSV", () => {
  it("lists labels only, with empty correct and note columns, and round-trips", () => {
    const csv = reviewCsv([records[0]]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe("examId,number,type,evidence,traps,grammar,vocab,blankRole,cues,topicDomain,correct,note");
    expect(row).toBe('2099_m09,31,blank_inference,2 4,1:keyword_reuse,,,conclusion,,arts,,');
    expect(parseReviewCsv(csv)).toEqual([{ examId: "2099_m09", number: 31, type: "blank_inference", correct: "", note: "" }]);
  });

  it("keeps commas and quotes inside a note", () => {
    const csv = 'examId,number,type,evidence,traps,grammar,vocab,blankRole,cues,topicDomain,correct,note\n2099_csat,29,grammar,,,,,,,arts,n,"trap 3, ""wrong"""\n';
    expect(parseReviewCsv(csv)[0]).toMatchObject({ correct: "n", note: 'trap 3, "wrong"' });
  });
});

describe("scoreReview", () => {
  it("reports accuracy per type and counts rows not yet reviewed", () => {
    const rows = [
      { examId: "a", number: 31, type: "blank_inference", correct: "y", note: "" },
      { examId: "b", number: 32, type: "blank_inference", correct: "N", note: "" },
      { examId: "c", number: 33, type: "blank_inference", correct: "o", note: "" },
      { examId: "d", number: 29, type: "grammar", correct: "", note: "" },
    ];
    expect(scoreReview(rows)).toEqual([
      { type: "blank_inference", reviewed: 3, correct: 2, accuracy: 0.6667, pending: 0 },
      { type: "grammar", reviewed: 0, correct: 0, accuracy: null, pending: 1 },
    ]);
  });

  it("rejects values it cannot read", () => {
    expect(() => scoreReview([{ examId: "a", number: 31, type: "gist", correct: "maybe", note: "" }])).toThrow(/a #31/);
  });
});
