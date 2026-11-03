// Example sentences for vocabulary cards through the same pipeline (stage 8 §7):
// meanings come from the source list and stay as they are; only the example is generated.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { ReviewRecord } from "@/lib/schema/review-record";
import { Vocabulary } from "@/lib/schema/vocabulary";
import type { ClaudeRunner } from "./claude-cli";
import type { SimilarityResult } from "./checks";
import { readDrafts, readJsonArray, writeDrafts, writeJsonAtomic, mergeById, draftFile } from "./draft-store";
import { allowedLemmas, outOfRange, type FrequencyTable } from "./vocab-range";

export const WORDS_PER_CALL = 20;
const TIMEOUT_MS = 300_000;

const VOCAB_PROMPT = `You write example sentences for vocabulary cards in "English 90", a Korean high-school English course for beginners.
For each word, write one short original English sentence that uses the word in the given meaning, and its natural Korean translation.
Keep id, lemma, pos and meanings exactly as given. Use only common words a beginner knows besides the target word.
Never reproduce sentences from real CSAT or mock exams, textbooks or other published material.`;

const ItemOut = z.object({
  id: z.string(),
  lemma: z.string(),
  pos: z.string(),
  meanings: z.array(z.string()),
  example: z.object({ en: z.string().min(1), ko: z.string().min(1) }),
});
const Output = z.object({ items: z.array(ItemOut) });

export interface VocabExampleOptions {
  root: string;
  level: string;
  limit?: number;
  dryRun: boolean;
  runner: ClaudeRunner;
  similarity: (items: { id: string; text: string }[]) => Promise<Map<string, SimilarityResult>>;
  now: Date;
  log: (line: string) => void;
  model?: string;
  vocabRankMax?: number;
}

function vocabularyFiles(dir: string): string[] {
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".json") && !f.endsWith("-examples.json"))
        .map((f) => path.join(dir, f))
    : [];
}

export async function runVocabExamples(opts: VocabExampleOptions): Promise<{ calls: number; written: number; flagged: number; failed: number }> {
  const contentDir = path.join(opts.root, "content");
  const unitId = `${opts.level}-examples`;
  const done = new Set(readDrafts(contentDir, unitId).records.map((r) => r.id));
  const words = [...vocabularyFiles(path.join(contentDir, "vocabulary")), ...vocabularyFiles(path.join(contentDir, "drafts/vocabulary"))]
    .flatMap((f) => readJsonArray<unknown>(f))
    .flatMap((raw) => {
      const parsed = Vocabulary.safeParse(raw);
      return parsed.success ? [parsed.data] : [];
    })
    .filter((w, i, all) => w.level === opts.level && !w.example && !done.has(w.id) && all.findIndex((o) => o.id === w.id) === i);
  const batches = Array.from({ length: Math.ceil(words.length / WORDS_PER_CALL) }, (_, i) => words.slice(i * WORDS_PER_CALL, (i + 1) * WORDS_PER_CALL));
  opts.log(`예상 호출 ${batches.length}회 (단어 ${words.length}개)`);
  const result = { calls: 0, written: 0, flagged: 0, failed: 0 };
  if (opts.dryRun) return { ...result, calls: batches.length };

  const freqFile = path.join(opts.root, "analysis/vocab_frequency.json");
  const freq: FrequencyTable = existsSync(freqFile) ? JSON.parse(readFileSync(freqFile, "utf8")) : { lemmas: [] };
  const allowed = allowedLemmas(freq, opts.vocabRankMax ?? 2000);
  const at = opts.now.toISOString();

  for (const batch of batches) {
    if (opts.limit !== undefined && result.calls >= opts.limit) break;
    result.calls += 1;
    const response = await opts.runner({
      model: opts.model ?? process.env.CLAUDE_CONTENT_MODEL ?? "opus",
      schema: z.toJSONSchema(Output, { target: "draft-2020-12" }) as Record<string, unknown>,
      systemPrompt: VOCAB_PROMPT,
      input: JSON.stringify({ task: "vocab_examples", level: opts.level, items: batch.map(({ id, lemma, pos, meanings }) => ({ id, lemma, pos, meanings })) }),
      timeoutMs: TIMEOUT_MS,
    });
    const parsed = response.ok ? Output.safeParse(response.json) : null;
    if (!parsed?.success) {
      result.failed += 1;
      opts.log(`어휘 예문: 실패 (${response.ok ? "출력이 스키마와 맞지 않음" : response.error})`);
      continue;
    }
    const outputs = new Map(parsed.data.items.map((i) => [i.id, i]));
    const generated = batch.flatMap((w) => {
      const out = outputs.get(w.id);
      return out ? [{ word: w, out }] : [];
    });
    const similarity = await opts.similarity(generated.map(({ word, out }) => ({ id: word.id, text: out.example.en })));
    const drafts = generated.map(({ word, out }) => ({ ...word, example: out.example, reviewStatus: "draft" as const }));
    const records: ReviewRecord[] = generated.map(({ word, out }) => {
      const reasons: string[] = [];
      const changed = out.lemma !== word.lemma || out.pos !== word.pos || JSON.stringify(out.meanings) !== JSON.stringify(word.meanings);
      if (changed) reasons.push("뜻 변경 시도");
      const extra = outOfRange(out.example.en.split(/\s+/).map((t) => t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, "")), new Set([...allowed, word.lemma.toLowerCase()]));
      if (extra.length) reasons.push(`허용 어휘 밖: ${extra.join(", ")}`);
      const sim = similarity.get(word.id) ?? "skipped";
      if (sim === "fail") reasons.push("기출 유사");
      if (sim === "skipped") reasons.push("유사도 미검사");
      const bad = changed || extra.length > 0 || sim === "fail";
      return {
        id: word.id,
        kind: "vocabulary",
        unitId,
        status: bad ? "flagged" : "auto_checked",
        reasons,
        checks: { rules: changed ? "fail" : "pass", vocab: extra.length ? "fail" : "pass", tags: "n/a", similarity: sim },
        generatedAt: at,
        reports: [],
      };
    });
    const file = draftFile(contentDir, "vocabulary", unitId);
    writeJsonAtomic(file, mergeById(readJsonArray<{ id: string }>(file), drafts));
    writeDrafts(contentDir, unitId, { records });
    result.written += drafts.length;
    result.flagged += records.filter((r) => r.status === "flagged").length;
  }
  opts.log(`완료: 호출 ${result.calls}회, 새 예문 ${result.written}개, 문제 있음 ${result.flagged}개, 실패 ${result.failed}회`);
  return result;
}
