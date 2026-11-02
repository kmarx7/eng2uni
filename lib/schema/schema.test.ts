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
  AnnotatedSentence,
  Question,
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
    schemaVersion: 2,
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
    expect(LocalProgress.safeParse({ ...progress, schemaVersion: 1 }).success).toBe(false);
    expect(LocalProgress.safeParse({ ...progress, schemaVersion: 3 }).success).toBe(false);
    expect(LocalProgress.safeParse({ ...progress, profile: { ...progress.profile, nickname: "가".repeat(21) } }).success).toBe(false);
    expect(LocalProgress.safeParse({ ...progress, days: { "11/02": { reviewed: 0, learned: 0 } } }).success).toBe(false);
  });
});

describe("LocalProgress v2 learning state", () => {
  const base = { schemaVersion: 2, profile: null, cards: [], days: {} };

  it("defaults lessons, skills and shortages to empty", () => {
    const parsed = LocalProgress.parse(base);
    expect(parsed.lessons).toEqual({});
    expect(parsed.skills).toEqual({});
    expect(parsed.shortages).toEqual([]);
  });

  it("parses a lesson in progress with attempts", () => {
    const lesson = {
      unitId: "FIXTURE-U01",
      status: "in_progress",
      phase: "main",
      blockIndex: 3,
      queue: ["FIXTURE-Q-001"],
      round: 0,
      attempts: [{ questionId: "FIXTURE-Q-001", correct: false, hintLevel: 2, misconception: "FIXTURE_subject_as_verb", phase: "main", round: 0, at }],
      analyzerPassed: true,
      updatedAt: at,
    };
    const parsed = LocalProgress.parse({
      ...base,
      lessons: { "FIXTURE-U01": lesson },
      skills: { FIXTURE_verb_identification: { delayedCheckPassed: false, misconceptionCounts: { FIXTURE_subject_as_verb: 1 } } },
      shortages: [{ at, unitId: "FIXTURE-U01", variantGroup: "FIXTURE-VG-verb" }],
    });
    expect(parsed.lessons["FIXTURE-U01"].attempts[0].hintLevel).toBe(2);
  });

  it("rejects an unknown lesson phase and a hint level above 3", () => {
    const lesson = { unitId: "U", status: "in_progress", phase: "main", blockIndex: 0, queue: [], round: 0, attempts: [], analyzerPassed: false, updatedAt: at };
    expect(LocalProgress.safeParse({ ...base, lessons: { U: { ...lesson, phase: "warmup" } } }).success).toBe(false);
    const attempt = { questionId: "Q", correct: true, hintLevel: 4, phase: "main", round: 0, at };
    expect(LocalProgress.safeParse({ ...base, lessons: { U: { ...lesson, attempts: [attempt] } } }).success).toBe(false);
  });
});

describe("hints and glosses", () => {
  const question = {
    id: "FIXTURE-Q-900",
    type: "multiple_choice",
    difficulty: 1,
    prompt: "동사는?",
    options: [{ id: "A", text: "a" }, { id: "B", text: "b" }],
    answer: "A",
    skills: ["s"],
    explanation: { summary: "요약" },
    source: { type: "original", generatedBy: "human" },
    reviewStatus: "draft",
    version: 1,
  };

  it("accepts a question with or without hints", () => {
    expect(Question.safeParse(question).success).toBe(true);
    expect(Question.safeParse({ ...question, hints: { direction: "동작을 찾아보세요.", range: [1, 2] } }).success).toBe(true);
    expect(Question.safeParse({ ...question, hints: { direction: "" } }).success).toBe(false);
  });

  it("accepts a span gloss and rejects an empty one", () => {
    const sentence = {
      id: "FIXTURE-S-900",
      level: "L0",
      text: "Cats run.",
      tokens: ["Cats", "run", "."],
      spans: [{ id: "subj", role: "SUBJECT", range: [0, 0], gloss: "고양이들이" }],
      translation: "고양이들이 달린다.",
      skills: ["s"],
      reviewStatus: "draft",
    };
    expect(AnnotatedSentence.safeParse(sentence).success).toBe(true);
    expect(AnnotatedSentence.safeParse({ ...sentence, spans: [{ ...sentence.spans[0], gloss: "" }] }).success).toBe(false);
  });
});
