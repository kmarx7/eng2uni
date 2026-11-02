# 문장 분석기·단원 학습 (단계 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 테스트용 데모 단원(FIXTURE-U01)에서 "개념 → 역할 태깅 → 문장 조립 → 연습 문항(오답 → 힌트 → 해설 → 동형 재시도) → 평가 → 통과/보충" 흐름이 끝까지 작동하고, 통과하면 다음 단원이 열리며 대시보드 "오늘 할 일"에 단원 학습과 skill 복습이 들어간다.

**Architecture:** 판정·흐름·문항 선택은 `lib/engine`의 순수 함수(표 기반 테스트)로 만든다. 문항의 정답·해설·힌트·선택지 오개념은 서버에만 두고, 학생 화면은 그것을 뺀 `PublicQuestion`을 받아 제출·힌트 요청을 서버 액션으로 보낸다. 단원 진행 상태·시도 기록·skill 숙달은 단계 6의 localStorage 진도(`LocalProgress`)를 v2로 올려 함께 저장한다.

**Tech Stack:** Next.js 16 App Router(cacheComponents), React 19, TypeScript, Tailwind v4 토큰, Zod, ts-fsrs(`lib/srs`로만), lucide-react, Vitest, Playwright. 새 의존성 없음.

**Spec:** `docs/CLAUDE_CODE_PROMPTS.md` 단계 7, `docs/DESIGN_v2.md` 4-1·4-2·5-1~5-4·9-1·9-2·13-1~13-3. 사용자 결정(2026-11-02): 질문 없이 진행("그냥 진행"). 아래 판단은 모두 내 결정이며 계획 승인으로 확인받는다.

## Global Constraints

- UI 문구는 한국어, 코드·커밋은 영어. 스키마의 단일 원천은 `lib/schema`(Zod), 타입은 `z.infer`로만.
- `lib/engine`은 순수 함수만(브라우저·파일·시계 직접 접근 금지 — `now`는 인자). ts-fsrs는 `lib/srs`에서만 import.
- `lib/` 테스트 먼저, 라인 커버리지 80% 이상. UI는 Playwright 흐름 테스트.
- 제출 전에는 정답·해설을 DOM에 렌더링하지 않는다 → 이 계획은 한 단계 더 나아가 클라이언트 payload에도 넣지 않는다(서버 액션 채점).
- 학생 화면은 approved 단원·문장·문항만 읽는다. `content/_fixtures/`만 직접 작성(id에 FIXTURE, 기출 문장 금지). `content/` 승인본은 손대지 않는다.
- 색과 함께 역할 기호(S, V, O)를 항상 표시. 드래그 없이 탭만으로 완료, 키보드로도 완료. 흔들림 애니메이션은 `motion-reduce`에서 끈다.
- 3단계 힌트로 맞힌 문항은 정답으로 세지 않는다. 문항 8개 미만이면 정답률을 판정에 쓰지 않는다(5-2).
- 작동하지 않는 기능을 완성된 것처럼 표시하지 않는다: 힌트 데이터가 없는 단계는 버튼을 숨기고(3단계는 항상 가능), 동형 문항이 없으면 "문항 부족"으로 기록하고 그 사실을 화면에 말한다.
- 이벤트 서버 수집(9-3)은 단계 9. 이 단계는 기록을 localStorage에만 남긴다.
- **승인 필요(이 계획 승인으로 함께 승인)**: 스키마 변경 3건 — ① `Question.hints?: { direction?: string; range?: TokenRange }` ② `Span.gloss?: string`(맞힌 역할에 고정되는 해석 조각, 13-3) ③ `LocalProgress` schemaVersion 2(`lessons`, `skills`, `shortages` 추가, v1 데이터는 버리지 않고 이전).

## Review Focus

1. 정답 유출: 제출 전 페이지의 DOM과 RSC payload 어디에도 정답 id·해설·선택지 오개념이 없어야 한다. → Task 5 단위 테스트(`toPublicQuestion` 직렬화에 없음) + Task 8 e2e(제출 전 DOM에 해설 문구 없음).
2. 단원 중간 새로고침·이탈 후 재방문 → 같은 블록·같은 문항부터 이어지고, 이미 낸 답이 두 번 세지지 않는다. → Task 3 테스트 + Task 8 e2e.
3. 동형 문항 고갈(재시도·보충·재평가 풀이 바닥) → 흐름이 멈추거나 같은 문항을 다시 내지 않고 `shortages`에 기록, 재평가 문항이 8개 미만이면 "판정 보류". → Task 3 테스트.
4. 제출 버튼·평가 키 연타 → 시도 1회만 기록. → Task 6 잠금 + Task 8 e2e.
5. 잠긴 단원 URL 직접 입력 / 없는 단원 id → 잠김 안내와 대시보드 링크 / 404. 기존 v1 진도(단계 6 사용자) → 어휘 카드가 보존된 채 v2로 이전. → Task 1 테스트 + Task 8 e2e.

---

### Task 1: 스키마 변경과 진도 v2 이전

**Files:**
- Modify: `lib/schema/question.ts`, `lib/schema/sentence.ts`, `lib/schema/progress.ts`, `lib/schema/content-rules.ts`(hints.range가 문장 토큰 범위 안인지), `lib/schema/schema.test.ts`, `lib/schema/content-rules.test.ts`
- Modify: `lib/repositories/progress.ts`(+test), `lib/engine/applyGrade.ts`·테스트의 `emptyProgress` 사용처

**Interfaces:**
- Produces:
  - `QuestionHints = { direction?: string(min1); range?: TokenRange }`, `Question.hints?: QuestionHints`. `Span.gloss?: string(min1)`.
  - `LessonAttempt = { questionId: Id; correct: boolean; hintLevel: HintLevel; misconception?: Id; phase: LessonPhase; round: int≥0; at: IsoDateTime }`.
  - `LessonPhase = "main" | "contrast" | "remedial" | "foundation" | "reassessment"`.
  - `LessonState = { unitId: Id; status: LessonProgress["status"]; phase: LessonPhase | "result"; blockIndex: int≥0; queue: Id[]; round: int≥0; attempts: LessonAttempt[]; analyzerPassed: boolean; judgment?: MasteryStatus; focusMisconception?: Id; updatedAt: IsoDateTime }`.
  - `LocalProgress` v2 = v1 필드 + `schemaVersion: 2`, `lessons: Record<Id, LessonState>`(기본 {}), `skills: Record<Id, { delayedCheckPassed: boolean; misconceptionCounts: Record<Id, int≥0> }>`(기본 {}), `shortages: Shortage[]`(기본 []), `Shortage = { at: IsoDateTime; unitId?: Id; skillId?: Id; variantGroup?: Id }`.
  - `emptyProgress(): LocalProgress`(v2). 저장소는 schemaVersion 1 데이터를 읽으면 `{...v1, schemaVersion: 2, lessons: {}, skills: {}, shortages: []}`로 이전해 저장한다.
- [ ] Step 1: 테스트 — hints·gloss 있는/없는 문항·문장 통과, hints.range가 문장 토큰 수를 넘으면 content-rules 이슈 `hint range`; v2 정상 통과; v1 저장 데이터를 load → schemaVersion 2, cards·profile·days 보존, 백업 키 생기지 않음; schemaVersion 3은 기존처럼 백업 후 초기화.
- [ ] Step 2: 실패 확인 `npx vitest run lib/schema lib/repositories`.
- [ ] Step 3: 구현.
- [ ] Step 4: `npx vitest run lib` 통과, `npm run typecheck` 통과.
- [ ] Step 5: Commit `feat: add question hints, span glosses and progress v2 with v1 migration`.

### Task 2: 데모 단원 fixture

**Files:** Modify `content/_fixtures/valid/{units/FIXTURE-U01.json, sentences/FIXTURE-S.json, questions/FIXTURE-Q.json, misconceptions.json}` (기존 id 유지, 추가만 + 아래 변경)

내용(직접 작성, 쉬운 문장, 기출 문장 금지):
- 문장 FIXTURE-S-003~008 추가(S·V·O 문장, 각 span에 gloss). S-001 span에 gloss 추가.
- 오개념 추가: `FIXTURE_verb_as_subject`, `FIXTURE_object_as_subject`(skill `FIXTURE_subject_identification`).
- 문항 추가: 동사 그룹 `FIXTURE-VG-verb` = Q-001(기존), Q-002(기존), Q-004~Q-008. 주어 그룹 `FIXTURE-VG-subject` = Q-009~Q-014, 그중 Q-012·Q-014는 `true_false`(선택지 id "T"/"F"). Q-001에 `hints: { direction: "동작을 나타내는 단어를 찾아보세요.", range: [1, 2] }`, 그 밖에 절반 정도만 hints.
- FIXTURE-U01 blocks 순서: B01 concept → B02 role_tagging(S-001, S-003) → B07 sentence_building(S-004) → B03 practice[Q-001] → B06 assessment[Q-002, Q-004, Q-005, Q-006, Q-009, Q-010, Q-011, Q-012] → B04 remedial(subject_as_verb, questionIds [Q-007]) → B05 contrast. remedial·contrast는 흐름에서 판정이 부를 때만 쓰인다.
- FIXTURE-U02 "FIXTURE 목적어" 추가(order 2, skills [FIXTURE_verb_identification], blocks: concept 1개 + assessment[Q-013]). 해금 확인용.
- [ ] Step 1: `npm run validate:content` 와 `npx vitest run lib/schema` 실행 → 기존 테스트(content-rules가 fixture 개수를 계산) 그대로 통과해야 한다.
- [ ] Step 2: Commit `test: extend the fixture demo unit for unit learning`.

### Task 3: 엔진 — 채점, 숙달 판정, 동형 문항, 단원 흐름

**Files:** Create `lib/engine/grade.ts`, `mastery.ts`, `variants.ts`, `lesson.ts`, `analyzer.ts` + 각 `.test.ts`

**Interfaces:**
- `grade.ts`: `countsAsCorrect(a: {correct: boolean; hintLevel: number}): boolean`(correct && hintLevel < 3); `skillGrade(a: {correct; hintLevel; durationMs}): Grade` — 틀림 또는 힌트 3 → "again", 힌트 1~2 또는 30초 초과 → "hard", 나머지 → "good".
- `mastery.ts`: `MIN_EVIDENCE = 8`, `PASS_ACCURACY = 0.85`, `REMEDIAL_ACCURACY = 0.6`, `CONFUSION_COUNT = 3`, `DELAYED_CHECK_DAYS = 2`. `judgeMastery(input: { attempts: {correct; hintLevel; misconception?}[]; analyzerPassed: boolean; delayedCheckPassed: boolean }): { status: MasteryStatus; accuracy: number | null; evidenceCount: number; misconception?: string; needsAnalyzer?: true }`. 순서: 증거 < 8 → "learning"(accuracy null) / 정답률 ≥ 0.85: 분석기 미통과면 "learning"+needsAnalyzer, 지연 확인 통과면 "mastered", 아니면 "can_progress" / 같은 오개념 ≥ 3 → "confusion"(그 오개념) / ≥ 0.6 → "remedial"(가장 많은 오개념, 동률이면 먼저 나온 것) / 그 외 "foundation_check".
- `variants.ts`: `pickVariant(pool: {id; variantGroup?}[], group: string, exclude: ReadonlySet<string>): string | null` — 그룹 안에서 exclude에 없는 첫 문항.
- `analyzer.ts`: `TARGET_ROLES = { S: "SUBJECT", V: "MAIN_VERB", O: "OBJECT" }`; `targetSpans(s: AnnotatedSentence): Record<"S"|"V"|"O", Span | undefined>`; `checkRoleTag(s, symbol, range: [number, number]): { correct: boolean; span?: Span }` — 해당 역할 span과 범위가 같거나, S는 그 SUBJECT의 HEAD_NOUN 자식 범위여도 정답(정답 span을 돌려줌); `builderTokens(s): string[]`(마침표 등 문장부호 토큰 제외); `shuffled(tokens, seed: string): string[]`(seed 고정 결정적 섞기, 원래 순서와 같으면 한 번 회전); `checkBuild(expected: string[], built: string[]): boolean[]`(자리별 정오).
- `lesson.ts`:
  - `LessonContext = { unit: Unit; questions: { id; skills: string[]; variantGroup?: string }[]; misconceptions: { id; remedialBlockId?: string }[]; prerequisiteQuestionIds: string[]; seen: ReadonlySet<string> }` — seen = 이 학생이 이미 푼 모든 문항 id.
  - `LessonAction = { type: "blockDone" } | { type: "analyzerDone"; passed: boolean } | { type: "answered"; attempt: LessonAttempt }`.
  - `startLesson(unit: Unit, now: Date): LessonState`; `lessonReducer(state, action, ctx, now): { state: LessonState; shortages: Shortage[] }`; `currentStep(state, unit): { kind: "block"; block: LessonBlock } | { kind: "question"; questionId: string; block: LessonBlock | null } | { kind: "result" }`.
  - 규칙: 흐름 블록은 remedial·contrast를 뺀 순서. practice·assessment 블록에 들어가면 queue = questionIds 중 seen에 없는 것(이미 본 문항은 건너뛰고 기록). practice 오답 → 같은 그룹의 동형 문항(어떤 assessment 블록에도 없는 것, seen·이번 시도 제외)을 queue 앞에 넣음, 없으면 shortage. assessment·reassessment 큐가 비면 그 round의 시도로 `judgeMastery` → phase "result". 결과별 다음: remedial → 해당 오개념의 remedial 블록(단원 안 → misconception.remedialBlockId → 없으면 블록 없이) + 블록 questionIds와 동형 문항으로 최대 4문항 → reassessment(직전 평가 문항마다 같은 그룹 새 문항, 없으면 shortage) round+1; confusion → 그 오개념을 포함한 contrast 블록 후 remedial 경로; foundation_check → prerequisiteQuestionIds 중 안 푼 3문항, 2개 이상 맞으면 remedial 경로, 아니면 result 유지(judgment "foundation_check"); can_progress → status "awaiting_delayed_check"; mastered → "passed"; learning(needsAnalyzer) → 첫 role_tagging 블록으로.
- [ ] Step 1: 테스트(표 기반) — mastery: 7개 → learning; 8개 중 7 정답 → can_progress(0.875); 7 정답 + 지연 확인 → mastered; 8개 정답 + 분석기 미통과 → learning·needsAnalyzer; 6/8 → remedial(최빈 오개념); 4/8 → foundation_check; 같은 오개념 3회(정답률 0.6~) → confusion; 힌트 3 정답은 오답으로 계산(8개 중 힌트3 정답 2개 + 정답 6 → 0.75 remedial). grade: skillGrade 네 경우. analyzer: S 전체·머리명사 둘 다 정답, 틀린 범위 오답, 문장부호 제외, shuffled 결정적·원래와 다름. lesson: 전체 통과 경로; practice 오답 → 동형 재시도가 queue 맨 앞, 평가 문항은 재시도로 안 씀; 재시도 고갈 → shortage 1건·다음 블록; 보충 경로 → remedial 블록 → 최대 4문항 → 재평가 round 1; 재평가 문항 부족 → shortage, 8개 미만이면 learning; 같은 attempt 두 번(같은 questionId·round) 디스패치 → 두 번째 무시; seen에 있는 평가 문항 건너뜀.
- [ ] Step 2: 실패 확인 `npx vitest run lib/engine`.
- [ ] Step 3: 구현.
- [ ] Step 4: 통과 + `npm run test:coverage` lib 80% 이상.
- [ ] Step 5: Commit `feat: add grading, mastery judgment, variant picking and lesson flow engine`.

### Task 4: 진도 반영 — skill 카드, 지연 확인, 오늘 계획

**Files:** Create `lib/engine/skillProgress.ts`(+test); Modify `lib/engine/planToday.ts`(+test)

**Interfaces:**
- Consumes: Task 1 `LocalProgress` v2, Task 3 `skillGrade`, `countsAsCorrect`, `DELAYED_CHECK_DAYS`, `lib/srs`.
- Produces:
  - `recordLessonAnswer(p: LocalProgress, a: { attempt: LessonAttempt; skills: string[]; durationMs: number }, now): LocalProgress` — 틀린(또는 힌트 3) 답이면 문항의 skill마다 skill ReviewCard 생성/갱신(`skillGrade`), 오개념이면 `skills[skillId].misconceptionCounts` +1. 맞은 답은 기존 카드만 갱신.
  - `scheduleDelayedCheck(p, skillIds, now): LocalProgress` — skill 카드 due를 now + 2일로(없으면 생성).
  - `recordSkillReview(p, a: { skillId; correct; hintLevel; durationMs }, now): LocalProgress` — 카드 평가 + `countsAsCorrect`면 `delayedCheckPassed = true`; 그 skill을 가진 단원 중 awaiting_delayed_check이고 단원 skill이 모두 통과면 그 lesson status "passed".
  - `pickSkillReviewQuestion(skillId, questions: {id; skills; variantGroup?}[], seen: ReadonlySet<string>, lastWrongGroup?: string): string | null` — lastWrongGroup 그룹 우선, 그다음 같은 skill의 안 푼 문항.
  - `nextUnit(units: {id; title}[], lessons: Record<string, LessonState>): { id; title } | null` — 순서대로 첫 미완료 단원(앞 단원이 awaiting_delayed_check 또는 passed면 열림). `isUnlocked(unitId, units, lessons): boolean`.
  - `planToday` 입력에 `units?: {id; title}[]`, `lessons?`, 출력에 `skillReviews: string[]`(기한 된 skill 카드, 오래된 순), `unit: {id; title} | null` 추가. 예상 시간 = 기존 + skill 복습 1분/개 + 단원 10분. 기존 호출·테스트는 그대로 통과(새 입력 생략 시 빈 값).
- [ ] Step 1: 테스트 — 오답 → skill 카드 생성·오개념 카운트; 정답만 → 카드 없음; 지연 확인 due = now+2일; 지연 확인 통과 → 단원 passed; pickSkillReviewQuestion 그룹 우선·고갈 시 null; nextUnit/isUnlocked 첫 단원 열림·둘째 잠김·첫 단원 awaiting이면 둘째 열림; planToday skill 복습·단원 반영과 예상 시간.
- [ ] Step 2: 실패 확인. Step 3: 구현. Step 4: `npx vitest run lib` 통과.
- [ ] Step 5: Commit `feat: track skill review cards, delayed checks and units in today's plan`.

### Task 5: 서버 — 단원 읽기, 공개 문항, 채점·힌트 액션

**Files:** Create `lib/content/learning.ts`(+test), `app/(student)/learn/actions.ts`

**Interfaces:**
- Produces:
  - `loadStudentUnits(contentDir?): Unit[]`(approved, 단계 → order 순); `loadUnitBundle(unitId, contentDir?): UnitBundle | null` — `{ unit; sentences: AnnotatedSentence[]; questions: PublicQuestion[]; misconceptions: {id; remedialBlockId?}[]; prerequisiteQuestionIds: string[] }`. 단원 블록이 참조하는 문항 + 같은 variantGroup 문항 + 선수 skill 문항까지 포함(approved만).
  - `PublicQuestion = { id; type; prompt; sentenceId?; options: {id; text}[]; skills; variantGroup?; hintLevels: (1|2|3)[] }` — `toPublicQuestion(q)`는 answer·explanation·hints·option.misconception·trap을 뺀다. hintLevels: direction 있으면 1, range 있으면 2, 3은 항상.
  - `gradeAnswer(q: Question, optionId, misconceptions: Misconception[]): AnswerResult` = `{ correct; answerId; summary; chosen?: string(byOption); misconception?: { id; description } }`. 없는 optionId → throw.
  - `hintFor(q: Question, level: 1|2|3): Hint` = `{ level: 1; direction } | { level: 2; range } | { level: 3; answerId; summary }`. 데이터 없는 단계 → throw.
  - 서버 액션 `submitAnswer(questionId: string, optionId: string): Promise<AnswerResult>`, `requestHint(questionId: string, level: 1|2|3): Promise<Hint>` — approved 문항만, 입력은 Zod로 검증, 실패는 Error.
- [ ] Step 1: 테스트 — approved만 읽음(draft 단원·문항 제외); `JSON.stringify(toPublicQuestion(Q-001))`에 "answer", "explanation", 해설 문구, "FIXTURE_subject_as_verb"가 없음; hintLevels Q-001=[1,2,3], hints 없는 문항=[3]; gradeAnswer 정답·오답(byOption·오개념 설명); 없는 선택지 throw; hintFor 각 단계와 없는 단계 throw; 번들에 동형 문항 포함.
- [ ] Step 2: 실패 확인. Step 3: 구현(액션은 lib 함수를 감싸기만). Step 4: 통과.
- [ ] Step 5: Commit `feat: serve units without answers and grade answers on the server`.

### Task 6: 학습 컴포넌트

**Files:** Create `components/learning/SentenceAnalyzer.tsx`, `SentenceBuilder.tsx`, `ConceptBlock.tsx`, `components/question/PracticeQuestion.tsx`, `HintBar.tsx`, `FeedbackPanel.tsx`; 기존 README 갱신.

**Interfaces / 동작:**
- `SentenceAnalyzer({ sentence, mode: "role_tagging", onDone(passed: boolean) })` — 토큰은 버튼. 첫 탭 = 시작, 두 번째 탭 = 끝(같은 토큰 두 번이면 한 단어). 그다음 역할 버튼 S·V·O(키 s·v·o, 토큰은 Tab/Enter). `checkRoleTag`로 판정: 맞으면 그 범위에 역할 기호 + 역할 이름(주어·동사·목적어) + gloss가 고정, 틀리면 그 범위만 흔들림(`motion-reduce:animate-none`) + "다시 골라 보세요" 메시지. 세 역할(문장에 있는 것만) 완료 시 번역 표시 후 `onDone(passed)` — passed = 문장당 틀린 시도 2회 이하. 이후 모드를 위해 `mode` prop 유지.
- `SentenceBuilder({ sentence, seed, onDone })` — 섞인 칩 탭 → 답 줄에 추가, "되돌리기"(마지막 칩 복귀), 다 채우면 `checkBuild` → 틀린 자리만 표시하고 "다시 맞추기", 전부 맞으면 번역과 "다음".
- `PracticeQuestion({ question: PublicQuestion, sentence?, onAnswered(result: AnswerResult, hintLevel, durationMs) })` — 선택 후 "제출". 제출 중·제출 후 잠금(연타 1회). `HintBar`는 hintLevels만 버튼으로, 1→2→3 순서로 열림(이전 단계 연 뒤 다음); 2단계는 문장 토큰 범위 강조, 3단계는 정답 표시. 정답·해설은 `submitAnswer` 결과가 온 뒤에만 렌더.
- `FeedbackPanel({ result, onNext, nextLabel })` — 정오, chosen 해설, 오개념 설명, summary. 오답이면 버튼 문구 "비슷한 문제 풀기".
- [ ] Step 1: 이 Task의 검증은 Task 8 e2e로 한다(UI 컴포넌트 규칙). 여기서는 `npm run lint && npm run typecheck` 통과.
- [ ] Step 2: Commit `feat: add sentence analyzer, sentence builder and practice question components`.

### Task 7: 단원 화면, skill 복습, 대시보드 연결

**Files:** Create `app/(student)/learn/[unitId]/page.tsx`, `components/learning/LessonRunner.tsx`, `LessonResult.tsx`, `app/(student)/review/page.tsx`, `components/learning/SkillReviewSession.tsx`; Modify `components/dashboard/TodayPlan.tsx`, `app/(student)/dashboard/page.tsx`, `components/learning/VocabDone.tsx`, `components/learning/ProgressProvider.tsx`(필요 시). README 자리표시 파일 삭제.

- `/learn/[unitId]`: 서버가 `loadUnitBundle`(없으면 `notFound()`)과 `loadStudentUnits` 요약을 넘김. 클라이언트 `LessonRunner`: 프로필 없으면 /start, 잠김이면 "앞 단원을 먼저 마치세요" + 대시보드 링크. lesson 상태가 없으면 `startLesson`. `currentStep`대로 블록·문항 렌더, 모든 조작은 `updateProgress`로 `lessonReducer` + Task 4 함수 적용(새로고침 이어하기). 상단에 단원 제목과 블록 진행 표시.
- `LessonResult`: can_progress → "통과했습니다. 2일 뒤 확인 문제가 나옵니다." + 다음 단원 버튼(열렸으면); remedial/confusion → "보충 학습으로 이어갑니다" + 계속; foundation_check 실패 → "기초부터 다시 확인해요" + 선수 단원 링크(없으면 대시보드); learning(문항 부족) → "문항이 부족해 판정을 미뤘습니다" + 대시보드. 정답률은 판정이 있을 때만 숫자로.
- `/review`: 기한 된 skill 카드를 `pickSkillReviewQuestion`으로 문항 배정(없으면 shortage 기록 후 건너뜀) → PracticeQuestion → `recordSkillReview` → 끝나면 대시보드로.
- 대시보드: dl에 "복습"(단어+skill), "새 단어", "예상 시간" 유지, 아래에 오늘 할 일 목록(skill 복습 n개, 어휘 n개, 단원 제목). "오늘 학습 시작"은 skill 복습 → 어휘 → 단원 순으로 첫 남은 곳으로. 단어가 0개여도 단원이 있으면 시작 가능(단계 6의 "아직 학습할 단어가 없습니다" 문구는 단어 줄에만).
- VocabDone: 남은 단원이 있으면 "단원 학습 계속" 버튼 추가.
- [ ] Step 1: `npm run lint && npm run typecheck && npm run build` 통과(cacheComponents: 렌더 중 시계 읽지 않기 — `useNow` 재사용).
- [ ] Step 2: Commit `feat: add unit learning page, skill review and today's unit on the dashboard`.

### Task 8: e2e

**Files:** Create `e2e/unit-flow.spec.ts`; Modify `e2e/dashboard.spec.ts`(새 목록 반영), `e2e/helpers.ts`

- [ ] Step 1: 테스트 작성:
  - 데모 단원 전체: 시작 → 대시보드에 단원 "FIXTURE 주어와 동사" → 단원 진입 → 개념 다음 → 역할 태깅(탭으로 S·V·O, 한 번 틀려 흔들림 메시지 확인, S-003은 키보드로) → 문장 조립(한 칩 되돌리기 포함) → 연습 Q-001 오답 → 힌트 1·2 → 제출 전 DOM에 해설 문구 없음 → 해설에 오개념 설명 → "비슷한 문제 풀기" → 동형 문항 정답 → 평가 8문항 중 7개 정답 → "통과했습니다" → 대시보드에서 FIXTURE-U02가 다음 단원으로 보임.
  - 이어하기: 평가 3번째 문항에서 새로고침 → 같은 문항, 진행 표시 그대로.
  - 연타: 제출 버튼 빠르게 두 번 → 시도 1회(진행 표시 1칸만).
  - 잠긴 단원: FIXTURE-U02 직접 이동 → 잠김 안내; 없는 단원 id → 404.
  - skill 복습: 오답 낸 뒤 `page.clock`으로 하루 뒤 → 대시보드 복습에 skill 1개 → 시작 → /review 문항.
  - 모든 화면 가로 넘침 0(`expectNoHorizontalOverflow`).
- [ ] Step 2: `npm run test:e2e` 실행, 실패 원인이 기능 버그면 고친다(systematic-debugging). 모두 통과.
- [ ] Step 3: Commit `test: cover the demo unit flow end to end`.

### Task 9: 진행 기록

**Files:** Create `docs/progress/stage-7.md`; Modify `CLAUDE.md` 명령 목록 필요 시.
- [ ] Step 1: 만든 것·판단·테스트 결과·남은 일(단계 8 콘텐츠, 이벤트 수집 단계 9, 판정 숫자 파일럿 보정)을 단계 6 기록 형식으로 쓴다. `npm run lint && npm run typecheck && npm run test:coverage && npm run validate:content && npm run build && npm run test:e2e` 결과를 적는다.
- [ ] Step 2: Commit `docs: record stage 7 progress`.
