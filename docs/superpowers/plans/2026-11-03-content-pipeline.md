# Content Generation and Review Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One unit spec file produces draft sentences, questions and a draft unit. The drafts go through automatic checks, a cross-solve and an AI pre-review, and a person approves them in `/admin/review-queue`. Only approved items reach `content/` and the student screens.

**Architecture:**
- Testable logic lives in `lib/pipeline/`: pure functions plus filesystem helpers that take a root directory.
- Thin CLIs live in `scripts/content-pipeline/`. Every model call goes through one subscription-only `claude -p` runner, which is moved out of `scripts/tagging/`.
- Pipeline state per draft item is a `ReviewRecord` JSON file in `content/drafts/records/`. Approved-content schemas do not change.
- The admin screen is a local-only App Router segment with server actions that write `content/`.

**Tech Stack:** Next.js 16 App Router (cacheComponents), React 19, TS, Zod 4 (`z.toJSONSchema`), Vitest, Playwright, Python (uv) for the similarity checker. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-content-pipeline-design.md` (approved 2026-11-03). Also `docs/specifications/DATA_CONTRACT_ADDENDUM.md` §3 (UnitSpec fields) and `docs/templates/unit-spec.template.json`.

## Global Constraints

- Model calls only via `claude -p` on the claude.ai subscription:
  - Strip `ANTHROPIC_*` from the child environment.
  - Never pass `--bare`.
  - Abort unless `claude auth status` reports `authMethod: "claude.ai"`.
- Models: `CLAUDE_CONTENT_MODEL` (default `opus`) for generation and pre-review, and `CLAUDE_CROSSCHECK_MODEL` (default `sonnet`) for the cross-solve.
- One generation call per variantGroup (target ≥ 6 questions plus their sentences). The call timeout is 600 000 ms.
- `--limit` and `--dry-run` count calls. Results are cached by `(spec hash, group id, prompt version)`.
- Ids follow DESIGN 4-2: `Q-L0-U05-001` and `S-L0-U05-001`.
- Drafts go to `content/drafts/{sentences,questions,units,vocabulary}/{unitId}.json`. Records go to `content/drafts/records/{unitId}.json`, one array per unit, which is the "content file holds an array" rule.
- Approved files are `content/{questions,sentences}/{unitId}.json`. Approval appends an item, or replaces one with the same id. Writes are atomic (temp file + rename).
- No script or agent sets `reviewStatus: "approved"`. Only the admin server action does, after a person clicks.
- The admin screen is dev-only: `/admin/*` returns `notFound()` when `NODE_ENV === "production"`. Access needs the `ADMIN_PASSWORD` env and an httpOnly cookie. Approval needs the `REVIEWER_NAME` env, and is refused without it.
- A batch sample has `max(3, ceil(20%))` items. Every sample item must be opened before the batch button enables. Any edit or reject inside the sample sends the whole batch to individual review.
- Allowed vocabulary: `analysis/vocab_frequency.json` lemmas with rank ≤ 2000 (position in the `lemmas` list), plus every `kind: "function"` lemma. Proper nouns (capitalized tokens not at sentence start) are exempt.
- Similarity:
  - 8-gram overlap means flagged.
  - Only a score and an overlap boolean are ever printed.
  - Without `corpus/structured`, the status is `skipped`, the item gets the reason "유사도 미검사", and it is excluded from the clean batch.
- Error reports go to `data/reports/reports.jsonl` (git-ignored).
  - The button renders only when `ENABLE_REPORTS === "1"`.
  - `npm run content:reports` flags the reported items.
- UI copy is Korean; code and commits are English. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never read or print `corpus/` text. Never copy exam sentences into prompts, content, tests or logs.

## Review Focus

1. **Model output that parses as JSON but breaks a schema or content rule.** For example, a span outside the tokens or an answer id that is not among the options. The item must be saved as `flagged` with the reasons, never dropped silently and never `auto_checked`. (Task 5 test)
2. **Approving a question whose sentence is still a draft, or a unit whose questions are not all approved.** Refuse with a Korean message and change nothing. (Task 7 test)
3. **A cross-solve or pre-review call that fails or times out.** The item becomes `flagged` with reason "교차 풀이 실패" or "사전 검수 실패". It must not stay `auto_checked` and must not be treated as clean. (Task 6 test)
4. **Re-running generate after partial success.** Cached groups make no new calls, and existing record files and ids are kept: no duplicate ids, no renumbering. (Task 5 test)
5. **Admin screen in a production build.** `/admin/review-queue` returns 404 even when `ADMIN_PASSWORD` is set. (Task 8 test)

---

### Task 1: Shared subscription runner and CLAUDE.md exception

**Files:**
- Create: `lib/pipeline/claude-cli.ts`
- Delete: `scripts/tagging/claude.ts`
- Modify: `scripts/tag-items.ts`, any other importer, `tests/tagging.test.ts` imports, `CLAUDE.md`, `vitest.config.ts` (coverage include `lib/pipeline/**`)
- Test: `lib/pipeline/claude-cli.test.ts`

**Interfaces:**
- Produces:
  - `subscriptionEnv(env)`, `assertSubscriptionAuth(statusJson)` and `authStatus()`, unchanged.
  - `claudeArgs({ model, schema, systemPrompt })`, unchanged.
  - `runClaude(args, input, timeoutMs = 300_000)`, unchanged.
  - New: `type ClaudeRunner = (req: { model: string; schema: Record<string, unknown>; systemPrompt: string; input: string; timeoutMs: number }) => Promise<{ ok: true; json: unknown } | { ok: false; error: string }>` and `subscriptionRunner: ClaudeRunner`. The runner parses `--output-format json` and returns `structured_output`. Every later task takes a `ClaudeRunner` so tests pass a fake.
- [ ] Step 1: Move the existing tagging tests for `subscriptionEnv`, `assertSubscriptionAuth` and `claudeArgs` to `lib/pipeline/claude-cli.test.ts`. Add `parseRunnerOutput(stdout)` tests:
  - `{"structured_output":{"a":1}}` → `{ok:true,json:{a:1}}`
  - `{"is_error":true,"result":"x"}` → `{ok:false,error:"x"}`
  - invalid JSON → `{ok:false}`
- [ ] Step 2: Run `npx vitest run lib/pipeline/claude-cli.test.ts`. Expected: FAIL (module missing).
- [ ] Step 3: Move the module and add `parseRunnerOutput` and `subscriptionRunner`. The neutral cwd becomes `os.tmpdir()/eng2uni-claude`. Update the tagging imports.
- [ ] Step 4: Add the CLAUDE.md exception line under the tagging exception: "예외(2026-11-03 사용자 승인): 콘텐츠 생성·교차 풀이·사전 검수(단계 8, `npm run content:*`)도 구독 로그인의 `claude -p`로 돌린다. 같은 안전장치(ANTHROPIC_* 제거, `--bare` 금지, 구독 로그인 아니면 중단). 모델은 CLAUDE_CONTENT_MODEL(기본 opus), CLAUDE_CROSSCHECK_MODEL(기본 sonnet)."
- [ ] Step 5: Run `npm test && npm run typecheck`. Expected: all pass.
- [ ] Step 6: Commit with "refactor: share the subscription claude runner for the content pipeline".

### Task 2: UnitSpec and ReviewRecord schemas; validate specs and records

**Files:**
- Create: `lib/schema/spec.ts`, `lib/schema/review-record.ts`
- Modify: `lib/schema/index.ts`, `lib/schema/content-rules.ts` (`CONTENT_SCHEMAS` add `record`), `lib/schema/content-tree.ts`
- Test: `lib/schema/spec.test.ts`, `lib/schema/content-tree.test.ts`

**Interfaces:**
- Produces:
  - `UnitSpec`: the DATA_CONTRACT §3 fields, plus `families` (default `[]`) and a `generation` object:
    ```
    generation: {
      difficulty: 1..5,
      vocabRankMax: int ≥ 1,
      sentenceCount: int ≥ 1,
      variantGroups: { id: Id, skillId: Id, misconceptionIds: Id[], questionType: "multiple_choice"|"true_false", count: int ≥ 6, sentenceUse: "tagging"|"building"|"question", note: string }[] (min 1),
    }
    ```
  - `catalog: { level?: Level, skills: Skill[], misconceptions: Misconception[], traps: TrapType[] }` (draft catalogue entries, default empty).
  - A spec file holds one object, not an array.
  - `ReviewRecord`:
    ```
    {
      itemId: Id,
      kind: "sentence"|"question"|"unit"|"vocabulary"|"catalog",
      unitId: Id,
      status: ReviewStatus,
      reasons: string[],
      checks: { rules: "pass"|"fail", vocab: "pass"|"fail", tags: "pass"|"fail"|"n/a", similarity: "pass"|"fail"|"skipped" },
      crossSolve?: { answer: Id | null, agrees: boolean },
      preReview?: { issues: string[] },
      generatedAt: IsoDateTime,
      reviewedBy?: string,
      reviewedAt?: IsoDateTime,
      reports: { at: IsoDateTime, reason: string, note?: string }[] (default []),
    }
    ```
  - `content-tree`:
    - Remove `specs` from `HANDOFF_DIRS`.
    - `specs/*.json` is validated as one `UnitSpec` each, and an issue is reported if `unitId` ≠ the file basename.
    - Under drafts, `records/` maps to kind `record`.
- [ ] Step 1: Write the tests:
  - The template file `docs/templates/unit-spec.template.json`, with a `generation` block added in the test, parses.
  - `count: 5` fails with "count".
  - A record with `status: "approved"` and no `reviewedBy` fails.
  - `kindForPath("records/L0-U05.json")` is `"record"`.
  - `validateContentTree` on a temp dir with `specs/L0-U05.json` whose unitId is `L0-U06` reports "unitId must match file name".
- [ ] Step 2: Run `npx vitest run lib/schema`. Expected: FAIL.
- [ ] Step 3: Implement it. A ReviewRecord refine requires `reviewedBy` and `reviewedAt` when the status is `approved`.
- [ ] Step 4: Run `npm test && npm run validate:content`. Expected: pass. `content/specs` does not exist yet, so nothing changes there.
- [ ] Step 5: Commit with "feat: add unit spec and review record schemas".

### Task 3: Automatic checks (pure)

**Files:**
- Create: `lib/pipeline/checks.ts`, `lib/pipeline/vocab-range.ts`
- Test: `lib/pipeline/checks.test.ts`, `lib/pipeline/vocab-range.test.ts`

**Interfaces:**
- Consumes: `checkContent`, `CheckOptions` from `lib/schema/content-rules.ts`; `ReviewRecord`.
- Produces:
  - `allowedLemmas(freq: { lemmas: { lemma: string; kind: string }[] }, rankMax: number): Set<string>`
  - `outOfRange(tokens: string[], allowed: Set<string>): string[]`. Lowercases. Accepts a token when it or a simple inflection base is allowed: strip `s`, `es`, `ed`, `ing`, `ies`→`y`, doubled consonant + `ed`/`ing`. Skips punctuation, numbers and capitalized non-initial tokens.
  - `missingDistractorTags(q: Question): string[]` returns ids of wrong options that have neither `misconception` nor `trap`.
  - `checkDraftGroup(input: { sentences: AnnotatedSentence[]; questions: Question[]; catalog: ContentFile[]; allowed: Set<string>; similarity: Map<string, "pass"|"fail"|"skipped"> }): Map<string, Pick<ReviewRecord,"status"|"reasons"|"checks">>`
    - Runs `checkContent` in `"full"` mode with `requireApproved: false` over the drafts plus the catalogue.
    - Maps issues to items by `itemId`.
    - Status is `auto_checked` only when every check is `pass`; `flagged` otherwise.
    - Korean reasons: "규칙 위반: {message}", "허용 어휘 밖: {words}", "오답 오개념 누락: {optionIds}", "기출 유사", "유사도 미검사".
  - `isClean(r: ReviewRecord): boolean` is true when `status === "auto_checked"`, `checks.similarity === "pass"`, `crossSolve?.agrees === true`, and `preReview` exists with zero issues.
- [ ] Step 1: Write table tests for each function. Include:
  - "goes"/"went": "went" is out of range unless allowed, which is accepted.
  - A question whose answer is not an option is flagged with "규칙 위반".
  - `isClean` is false when `similarity: "skipped"`.
- [ ] Step 2: Run them. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run `npx vitest run lib/pipeline`. Expected: PASS.
- [ ] Step 5: Commit with "feat: add automatic draft checks".

### Task 4: Similarity checker for drafts

**Files:**
- Create: `scripts/analysis/check_text.py`, `scripts/analysis/tests/test_check_text.py`, `lib/pipeline/similarity.ts`
- Test: `lib/pipeline/similarity.test.ts`

**Interfaces:**
- Produces:
  - `check_text.py` reads JSON `[{id, text}]` on stdin and prints JSON `{status: "checked"|"skipped", results: [{id, score, overlap}]}`. It never prints matched words. It reuses `leak.words`, `leak.ngrams`, `leak.corpus_ngrams` and `leak.exam_texts`. A missing `corpus/structured` gives `{status:"skipped", results:[]}` with exit 0.
  - `similarityStatus(items: {id: string; text: string}[], run?: (input: string) => Promise<string>): Promise<Map<string,"pass"|"fail"|"skipped">>`. The default `run` spawns `uv run python check_text.py` in `scripts/analysis`.
- [ ] Step 1: Write the pytest tests with a temp corpus written by the test using invented text, never exam text:
  - An 8-word overlap gives `overlap: true`.
  - 7 words gives false.
  - The output does not contain the overlapping words.
  - A missing corpus gives skipped.
- [ ] Step 2: Write the vitest test with a fake `run`. Map `overlap` to fail and `skipped` to all skipped.
- [ ] Step 3: Run `cd scripts/analysis && uv run pytest tests/test_check_text.py` and `npx vitest run lib/pipeline/similarity.test.ts`. Expected: FAIL.
- [ ] Step 4: Implement.
- [ ] Step 5: Rerun both. Expected: PASS.
- [ ] Step 6: Commit with "feat: add score-only similarity check for drafts".

### Task 5: Generator

**Files:**
- Create: `lib/pipeline/generate.ts`, `lib/pipeline/prompts.ts`, `lib/pipeline/draft-store.ts`, `scripts/content-pipeline/generate.ts`
- Modify: `package.json` (`"content:generate": "tsx scripts/content-pipeline/generate.ts"`), `.gitignore` (`.cache/content-pipeline/`)
- Test: `lib/pipeline/generate.test.ts`, `lib/pipeline/draft-store.test.ts`

**Interfaces:**
- Consumes:
  - `ClaudeRunner` (Task 1)
  - `UnitSpec` and `ReviewRecord` (Task 2)
  - `checkDraftGroup` and `allowedLemmas` (Task 3)
  - `similarityStatus` (Task 4)
- Produces:
  - `groupOutputSchema()`: the JSON Schema of `{ sentences: AnnotatedSentence-without-id-and-reviewStatus[], questions: Question-without-id/source/reviewStatus/version, with sentenceIndex: int }`, built with `z.toJSONSchema` (draft-7, no `$schema`).
  - `unitOutputSchema()`: the schema for the unit-assembly call. It returns `blocks`, where question and sentence references are given as existing draft ids.
  - `PROMPT_VERSION = "content-v1"`, `SYSTEM_PROMPT`, `buildGroupPrompt(spec, group)` and `buildUnitPrompt(spec, draftIds)`. The prompts contain only spec data, never corpus text.
  - `planCalls(spec, cache): { groupId: string; cached: boolean }[]`, with one extra entry with `groupId: "unit"`.
  - `assignIds(unitId, existing: string[], n, prefix: "Q"|"S"): string[]` continues after the highest existing number.
  - `draft-store`:
    - `readDrafts(root, unitId)` and `writeDrafts(root, unitId, {sentences, questions, units, records})`. Both are atomic and merge by id.
    - `cacheGet` and `cachePut(root, key)` under `.cache/content-pipeline/`.
  - `runGenerate(opts: { root: string; specPath: string; limit?: number; dryRun: boolean; runner: ClaudeRunner; similarity: typeof similarityStatus; now: Date; log: (line: string) => void }): Promise<{ calls: number; written: number; flagged: number }>`
    - Draft items get `reviewStatus: "draft"`, `source: { type: "original", generatedBy: "ai_draft" }`, `version: 1`, `variantGroup: group.id`.
    - The record status comes from `checkDraftGroup`.
    - The unit call runs only after all groups exist.
    - Before any call, `spec.catalog` entries are copied into draft catalogue files (`content/drafts/{levels,skills,misconceptions,traps}.json`) with `kind: "catalog"` records, so the admin "기초 목록" tab can approve them first. A dry run writes nothing.
  - The CLI:
    - `npm run content:generate -- --spec L0-U05 [--limit N] [--dry-run] [--model opus]` asserts subscription auth before any call, except in dry runs.
    - A dry run prints "예상 호출 {n}회 (캐시 {m}회 제외)".
- [ ] Step 1: Write the tests with a fake runner returning a fixed valid group (invented sentences), and a temp root:
  - `dryRun` makes 0 runner calls and returns the planned count.
  - `limit: 1` makes 1 call.
  - Output with an answer not among the options is saved and flagged with "규칙 위반" (Review Focus 1).
  - A runner `{ok:false}` writes nothing for that group and the run reports it.
  - Running twice makes 0 calls the second time, keeps ids and duplicates no records (Review Focus 4).
  - Ids are `Q-L0-U05-001…`.
  - `assignIds` continues from `Q-L0-U05-007`.
- [ ] Step 2: Run `npx vitest run lib/pipeline/generate.test.ts lib/pipeline/draft-store.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them again. Expected: PASS. Then run `npm run content:generate -- --spec FIXTURE-SPEC --dry-run` against a test spec in `content/_fixtures/specs/`. Expected: the planned-call line, with no calls made.
- [ ] Step 5: Commit with "feat: generate draft sentences, questions and units from a unit spec".

### Task 6: Cross-solve and AI pre-review

**Files:**
- Create: `lib/pipeline/crosscheck.ts`, `scripts/content-pipeline/crosscheck.ts`
- Modify: `package.json` (`content:crosscheck`)
- Test: `lib/pipeline/crosscheck.test.ts`

**Interfaces:**
- Consumes: `ClaudeRunner`, the draft store, and the `ReviewRecord` type.
- Produces:
  - `maskQuestion(q, sentence?)` returns `{prompt, options:{id,text}[], sentenceText?}`. It never includes answer, explanation, hints, misconception or trap. Tests assert this.
  - `runCrossCheck({ root, unitId, runner, model, limit?, now, log })`:
    - Applies to every question record whose status is `draft`, `auto_checked` or `flagged` and that has no `crossSolve`.
    - Sets `crossSolve`. A disagreement sets `flagged` with "교차 풀이 불일치(고른 답: {id})". A failure sets `flagged` with "교차 풀이 실패".
  - `runPreReview({ root, unitId, runner, model, limit?, now, log })`:
    - Sends the full question, its sentence and the reviewer criteria from `.claude/agents/content-reviewer.md` (the body after the frontmatter) as the system prompt.
    - Sets `preReview.issues`. Non-empty issues set `flagged` with "사전 검수: {issue}". A failure sets `flagged` with "사전 검수 실패".
  - The CLI is `npm run content:crosscheck -- --unit L0-U05 [--limit N] [--dry-run]` and runs the cross-solve, then the pre-review.
- [ ] Step 1: Write the tests:
  - The masked JSON string contains no answer id field and no explanation text.
  - Agreement keeps `auto_checked`.
  - Disagreement → flagged.
  - Runner failure → flagged "교차 풀이 실패" (Review Focus 3).
  - Pre-review issues → flagged.
  - The status can never become `approved`: no code path writes it. Assert over all outcomes.
- [ ] Step 2: Run the tests. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run them again. Expected: PASS.
- [ ] Step 5: Commit with "feat: cross-solve and pre-review drafts".

### Task 7: Review store (approve, edit, reject, batch)

**Files:**
- Create: `lib/pipeline/review-store.ts`
- Test: `lib/pipeline/review-store.test.ts`

**Interfaces:**
- Consumes: the draft store, `isClean`, `checkContent`, and `CONTENT_SCHEMAS`.
- Produces:
  - `listQueue(root): QueueEntry[]`:
    - `QueueEntry = { record: ReviewRecord; item: unknown }`.
    - Sort order: flagged first, then auto_checked, then draft; then by unit and id. Approved and retired are excluded.
  - `cleanBatch(root, unitId): string[]` returns the ids where `isClean` holds.
  - `pickSample(ids: string[], seed: string): string[]`:
    - Size is `max(3, ceil(ids.length * 0.2))`, capped at the length.
    - Deterministic seeded shuffle.
  - `approve(root, itemId, reviewer: string, now): { ok: true } | { ok: false; error: string }`:
    - Refuses when `reviewer` is empty ("REVIEWER_NAME이 없습니다").
    - Refuses a question whose `sentenceId` is not approved ("문장 {id}을 먼저 승인하세요").
    - Refuses a unit with an unapproved referenced id ("단원이 쓰는 {id}가 아직 승인되지 않았습니다").
    - Refuses a catalog item list until the referenced level and skill are approved.
    - Moves the item to `content/{kind dir}/{unitId}.json` (catalog kinds go to the root files) with `reviewStatus: "approved"`. Questions also get `source.reviewedBy`.
    - Sets the record to `approved`, `reviewedBy` and `reviewedAt`, and removes the draft item.
    - Re-runs `checkContent` in full mode on the resulting student root, and rolls back if any new issue appears.
  - `approveBatch(root, unitId, sampleSeen: string[], reviewer, now)` refuses unless `sampleSeen` ⊇ `pickSample(cleanBatch, unitId)`. Then it approves sentences before questions.
  - `editItem(root, itemId, json: string): { ok: true } | { ok: false; errors: string[] }` validates against the kind schema and the draft rules. On success it saves the draft and re-marks the record as `auto_checked` with "사람이 수정함"; the cross-solve is kept.
  - `reject(root, itemId, reviewer, now)` sets the record to `retired` and keeps the draft item with `reviewStatus: "retired"`.
  - `sendBatchToIndividual(root, unitId)` adds the reason "표본에서 수정·폐기 발생" and sets the batch's records to `flagged`.
- [ ] Step 1: Write the tests on a temp root:
  - Approving a question before its sentence is refused and changes no files (Review Focus 2).
  - Approving a sentence, then the question, writes `content/questions/L0-U05.json` with `reviewedBy`, and `validateContentTree` on the root has no new issues.
  - Approving the same id twice keeps one copy.
  - `pickSample` gives 3 of 10 and 5 of 25, and is stable for the same seed.
  - `approveBatch` with a missing sample id is refused.
  - `editItem` with bad JSON returns errors and does not save.
  - An empty reviewer is refused.
- [ ] Step 2: Run `npx vitest run lib/pipeline/review-store.test.ts`. Expected: FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run it again. Expected: PASS.
- [ ] Step 5: Commit with "feat: add the review store for human approval".

### Task 8: Admin review screen

**Files:**
- Create:
  - `app/(admin)/layout.tsx`
  - `app/(admin)/admin/review-queue/page.tsx`
  - `app/(admin)/admin/login/page.tsx`
  - `app/(admin)/admin/actions.ts`
  - `components/admin/ReviewQueue.tsx`
  - `components/admin/ItemPreview.tsx`
  - `components/admin/JsonEditor.tsx`
  - `components/admin/BatchApproval.tsx`
  - `e2e/admin-review.spec.ts`
  - `content/_fixtures/admin/` (a draft tree for e2e: 1 FIXTURE sentence, 2 FIXTURE questions with records, one flagged, plus a clean batch of 3)
- Delete: `app/(admin)/review-queue/README.md`
- Modify: `playwright.config.ts` (a third server on `:3094` with `CONTENT_DIR` set to a temp copy of `content/_fixtures/admin` made by global setup, `ADMIN_PASSWORD=test`, `REVIEWER_NAME=e2e`)

**Interfaces:**
- Consumes: Task 7 functions; `PracticeQuestion`'s option rendering is not reused for the answer view; `FeedbackPanel` and `roleStyles` are reused for the preview.
- Produces:
  - Route `/admin/review-queue?unit=&tab=items|batch|catalog|vocab`.
  - Server actions: `login`, `approveItem`, `rejectItem`, `saveEdit`, `approveBatchAction` and `sendToIndividual`. Each checks the cookie and `NODE_ENV`, and then calls `revalidatePath`.
  - `ItemPreview` shows:
    - the sentence tokens with role badges
    - the question with the correct option marked ✓
    - the explanation by option
    - the misconception or trap of each option
    - the record reasons, cross-solve answer and pre-review issues
  - Keyboard:
    - `A` approves.
    - `R` rejects.
    - `E` edits.
    - `J`/`K` move to the next/previous item.
    - Keys are ignored while the editor has focus.
  - `BatchApproval`: the sample items are collapsed. "모두 승인 ({n}개)" stays disabled until every sample is expanded.
- [ ] Step 1: Write the e2e tests:
  - Without the cookie, `/admin/review-queue` redirects to login.
  - A wrong password shows "비밀번호가 맞지 않습니다".
  - After login, the flagged item is listed first with its reason.
  - Approving a question whose sentence is a draft shows "문장 FIXTURE-S-…을 먼저 승인하세요".
  - Approving the sentence and then the question removes both from the queue.
  - The batch button is disabled until 3 samples are opened, then approves all 3.
  - An edit with invalid JSON shows the error, and the item is unchanged.
- [ ] Step 2: Write a vitest test, `tests/admin-guard.test.ts`, for `assertAdmin({ nodeEnv: "production", password: "x", cookie: "x" })`, which throws a not-found signal (Review Focus 5). Export `assertAdmin` from `lib/pipeline/admin-guard.ts`.
- [ ] Step 3: Run `npx playwright test e2e/admin-review.spec.ts` and `npx vitest run tests/admin-guard.test.ts`. Expected: FAIL.
- [ ] Step 4: Implement. Request data is read inside `<Suspense>` (cacheComponents). The cookie is the SHA-256 of the password, compared in constant time.
- [ ] Step 5: Run both again. Expected: PASS. Then run `npm run build`. Expected: the build succeeds and `/admin` is dynamic.
- [ ] Step 6: Commit with "feat: add the local admin review queue".

### Task 9: Vocabulary example generation

**Files:**
- Modify: `lib/pipeline/generate.ts`, `lib/pipeline/prompts.ts`, `scripts/content-pipeline/generate.ts`, `lib/pipeline/review-store.ts`, `components/admin/ReviewQueue.tsx`
- Test: `lib/pipeline/generate.test.ts`, `lib/pipeline/review-store.test.ts`

**Interfaces:**
- Produces:
  - `runVocabExamples({ root, level, limit?, dryRun, runner, now, log })`:
    - Input: drafted or approved vocabulary of that level without an `example`.
    - Batches 20 words per call.
    - Output: the same items with only `example` set. Any change to lemma, meanings or pos is rejected, and the item is flagged "뜻 변경 시도".
    - Writes `content/drafts/vocabulary/{level}-examples.json`.
  - Records with `kind: "vocabulary"`. The example sentence must pass `outOfRange` with the level's rank.
  - `approve` for vocabulary replaces the approved item by id, so only the example is added.
  - The CLI flag is `--vocab L0`.
- [ ] Step 1: Write the tests. The fake runner returns an example. A returned meaning change is flagged. Approval keeps the original meanings.
- [ ] Step 2: Run the tests. Expected: FAIL.
- [ ] Step 3: Implement it and add the "어휘" tab.
- [ ] Step 4: Run the tests. Expected: PASS.
- [ ] Step 5: Commit with "feat: generate vocabulary examples through the pipeline".

### Task 10: Problem error reports

**Files:**
- Create: `lib/pipeline/reports.ts`, `components/question/ReportButton.tsx`, `scripts/content-pipeline/reports.ts`
- Modify:
  - `app/(student)/learn/actions.ts` (`reportQuestion`)
  - `components/question/PracticeQuestion.tsx` (renders `ReportButton` only when the `reportsEnabled` prop is true)
  - `app/(student)/learn/[unitId]/page.tsx` and the review page (pass `process.env.ENABLE_REPORTS === "1"`)
  - `package.json` (`content:reports`)
  - `.gitignore` (`data/reports/`)
  - `e2e/unit-flow.spec.ts`
- Test: `lib/pipeline/reports.test.ts`

**Interfaces:**
- Produces:
  - `appendReport(dir, { questionId, reason: "answer"|"explanation"|"sentence"|"other", note?, at })`. The note is trimmed to 300 characters, and the question must be an approved id.
  - `applyReports(root, reportsFile, now)`:
    - For each reported approved question, sets the record to `flagged` with "학생 신고: {reason}" and pushes to `reports`.
    - Sets the approved item's `reviewStatus` to `retired`, so it leaves student screens.
    - Returns the count. The processed file is renamed to `reports-{timestamp}.processed.jsonl`.
  - `ReportButton`:
    - The "문제 오류 신고" link opens an inline form with 4 radio options and an optional note, and a "보내기" button.
    - It shows "신고했습니다" after sending.
- [ ] Step 1: Write the tests:
  - An unknown question id is refused.
  - `applyReports` retires the item, and `loadUnitBundle` no longer returns it.
  - The report file is rotated.
- [ ] Step 2: Write the e2e test. The `:3090` server env gets `ENABLE_REPORTS=1` and `REPORTS_DIR` set to a temp dir. A student sends a report and sees "신고했습니다". The `:3092` server has no button.
- [ ] Step 3: Run the tests. Expected: FAIL.
- [ ] Step 4: Implement.
- [ ] Step 5: Run the tests. Expected: PASS.
- [ ] Step 6: Commit with "feat: let students report a broken question".

### Task 11: L0-U05 spec and catalogue drafts, docs, full verification

**Files:**
- Create (by the `curriculum-architect` subagent): `content/specs/L0-U05.json`
- Create (main session): `docs/progress/stage-8.md`
- Modify: `content/drafts/README.md` (records note), `scripts/content-pipeline/README.md` (the run order)

**Interfaces:**
- Consumes: the `UnitSpec` schema (Task 2).
- [ ] Step 1: Dispatch `curriculum-architect` with these instructions:
  - Sources: DESIGN 4-1, 4-2, 5, 12, 13, `docs/analysis/GRAMMAR_PRIORITY.md` and the template.
  - Output: `content/specs/L0-U05.json` with a `generation` block. Use at least 3 variantGroups of ≥ 6 each. Include a tagging group and a building group. Set `vocabRankMax: 2000`.
  - The `catalog` must list the L0 level, the skills and the misconceptions the spec references, with `remedialBlockId` omitted.
  - Mark unverified judgments in `unverified`.
  - Do not write items, drafts or approved files.
- [ ] Step 2: Run `npm run validate:content`. Expected: pass, including the spec. Then run `npm run content:generate -- --spec L0-U05 --dry-run`. Expected: "예상 호출 N회", with N = the number of groups + 1.
- [ ] Step 3: Write `docs/progress/stage-8.md` covering what was built, the decisions, the tests, and what was not done (no real generation run).
- [ ] Step 4: Run `npm run lint && npm run typecheck && npm run test:coverage && npm run validate:content && npm run build && npm run test:e2e`. Expected: all pass, with coverage ≥ 80% for `lib/pipeline`.
- [ ] Step 5: Commit with "docs: add the L0-U05 spec and record stage 8 progress".
