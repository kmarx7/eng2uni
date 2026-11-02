import { describe, expect, it } from "vitest";
import {
  LocalProgress,
  Attempt,
  Blueprint,
  Id,
  LearningEvent,
  LessonProgress,
  ReviewCard,
  SkillMastery,
  SkillPrerequisite,
  Vocabulary,
} from "./index";

const at = "2026-11-01T09:00:00+09:00";

const fsrs = {
  due: at,
  stability: 0,
  difficulty: 0,
  scheduled_days: 0,
  learning_steps: 0,
  reps: 0,
  lapses: 0,
  state: "New",
};

describe("Id", () => {
  it("accepts letters, digits, underscore and dash", () => {
    expect(Id.safeParse("FIXTURE-S-001").success).toBe(true);
    expect(Id.safeParse("verb_identification").success).toBe(true);
  });

  it("rejects spaces and empty strings", () => {
    expect(Id.safeParse("has space").success).toBe(false);
    expect(Id.safeParse("").success).toBe(false);
  });
});

describe("progress models", () => {
  it("parses a review card with FSRS state", () => {
    expect(ReviewCard.parse({ userId: "anon-1", itemType: "word", itemId: "V-0001", fsrs })).toBeTruthy();
  });

  it("rejects an unknown FSRS state and a non-ISO due date", () => {
    expect(ReviewCard.safeParse({ userId: "u", itemType: "word", itemId: "V", fsrs: { ...fsrs, state: "Done" } }).success).toBe(false);
    expect(ReviewCard.safeParse({ userId: "u", itemType: "word", itemId: "V", fsrs: { ...fsrs, due: "tomorrow" } }).success).toBe(false);
  });

  it("defaults attempt hint level to 0 and caps it at 3", () => {
    const attempt = { id: "a1", userId: "u", questionId: "Q-1", answer: "C", correct: true, durationMs: 4200, at };
    expect(Attempt.parse(attempt).hintLevel).toBe(0);
    expect(Attempt.safeParse({ ...attempt, hintLevel: 4 }).success).toBe(false);
  });

  it("parses lesson progress and rejects a score above 1", () => {
    const progress = { userId: "u", lessonId: "L0-U05", status: "in_progress", evidenceCount: 3, updatedAt: at };
    expect(LessonProgress.parse(progress)).toBeTruthy();
    expect(LessonProgress.safeParse({ ...progress, score: 1.2 }).success).toBe(false);
  });

  it("fills skill mastery defaults", () => {
    const mastery = SkillMastery.parse({ userId: "u", skillId: "verb_identification", status: "learning", evidenceCount: 2, updatedAt: at });
    expect(mastery).toMatchObject({ analyzerTaskPassed: false, delayedCheckPassed: false, misconceptionCounts: {} });
  });

  it("parses a learning event with interaction and hint level", () => {
    const event = LearningEvent.parse({ anonId: "anon-1", type: "analyzer_action", interaction: "role_tagging", hintLevel: 1, at });
    expect(event.payload).toEqual({});
  });

  it("rejects an unknown learning event type", () => {
    expect(LearningEvent.safeParse({ anonId: "a", type: "listening_play", at }).success).toBe(false);
  });

  it("parses a prerequisite edge", () => {
    expect(SkillPrerequisite.parse({ skillId: "b", prerequisiteId: "a" })).toEqual({ skillId: "b", prerequisiteId: "a" });
  });
});

describe("content models", () => {
  it("rejects a vocabulary audio path outside /audio", () => {
    const vocab = {
      id: "V-1",
      lemma: "run",
      pos: "verb",
      meanings: ["달리다"],
      example: { en: "I run.", ko: "나는 달린다." },
      level: "L0",
      isPolysemous: false,
      reviewStatus: "draft",
    };
    expect(Vocabulary.safeParse({ ...vocab, audio: "/audio/words/run.mp3" }).success).toBe(true);
    expect(Vocabulary.safeParse({ ...vocab, audio: "https://example.com/run.mp3" }).success).toBe(false);
  });

  it("rejects a blueprint with an inverted word-count range or bad item range", () => {
    const blueprint = {
      id: "BP-1",
      type: "ordering",
      items: "36-37",
      passage: {
        wordCount: { min: 100, max: 150 },
        avgSentenceLength: 17,
        maxClauseDepth: { min: 1, max: 2 },
        vocabBand: { source: "csat_frequency", topN: 3000 },
        topicDomains: {},
      },
      distractors: { count: 4, traps: ["opposite_claim"] },
      requiredSkills: ["reference_tracking"],
    };
    expect(Blueprint.safeParse(blueprint).success).toBe(true);
    expect(Blueprint.safeParse({ ...blueprint, items: "36~37" }).success).toBe(false);
    expect(
      Blueprint.safeParse({ ...blueprint, passage: { ...blueprint.passage, wordCount: { min: 200, max: 100 } } }).success,
    ).toBe(false);
  });
});

describe("Vocabulary example", () => {
  it("is optional until the content pipeline adds one", () => {
    const word = { id: "FIXTURE-V-900", lemma: "fake", pos: "noun", meanings: ["가짜"], level: "L0", isPolysemous: false, reviewStatus: "draft" };
    expect(Vocabulary.safeParse(word).success).toBe(true);
  });
});

describe("LocalProgress", () => {
  const progress = {
    schemaVersion: 1,
    profile: { anonId: "0b7e9c1e-2f4a-4c1d-9a8b-1c2d3e4f5a6b", nickname: "학생", dailyMinutes: 30, createdAt: at },
    cards: [{ userId: "0b7e9c1e-2f4a-4c1d-9a8b-1c2d3e4f5a6b", itemType: "word", itemId: "FIXTURE-V-001", fsrs }],
    days: { "2026-11-02": { reviewed: 3, learned: 10 } },
  };

  it("accepts saved browser progress, with or without a profile", () => {
    expect(LocalProgress.safeParse(progress).success).toBe(true);
    expect(LocalProgress.safeParse({ ...progress, profile: null, cards: [], days: {} }).success).toBe(true);
  });

  it("rejects other daily goals, other schema versions, long nicknames and bad day keys", () => {
    expect(LocalProgress.safeParse({ ...progress, profile: { ...progress.profile, dailyMinutes: 45 } }).success).toBe(false);
    expect(LocalProgress.safeParse({ ...progress, schemaVersion: 2 }).success).toBe(false);
    expect(LocalProgress.safeParse({ ...progress, profile: { ...progress.profile, nickname: "가".repeat(21) } }).success).toBe(false);
    expect(LocalProgress.safeParse({ ...progress, days: { "11/02": { reviewed: 0, learned: 0 } } }).success).toBe(false);
  });
});
