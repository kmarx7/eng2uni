# 어휘 SRS·오늘의 학습 (단계 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생이 첫 화면에서 목표 시간을 고르고, 오늘의 어휘(복습 → 신규)를 끝까지 진행하고, 새로고침해도 진도가 유지된다.

**Architecture:** 순수 로직은 `lib/`(srs 래퍼, 진도 저장소, 오늘 계획, 커버리지)에 두고 테스트로 고정한다. 화면은 서버 컴포넌트가 approved 어휘만 읽어 클라이언트 컴포넌트에 넘기고, 진도는 브라우저 localStorage에 저장한다. 실제 어휘 목록이 없으므로 화면·e2e는 `CONTENT_DIR`로 `content/_fixtures/valid`를 읽는다.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind, Zod, ts-fsrs 6.0.0(이미 설치), Vitest, Playwright.

**Spec:** `docs/CLAUDE_CODE_PROMPTS.md` 단계 6, `docs/DESIGN_v2.md` 3-3·5-4·9-2·13-2·14-5. 사용자 결정(2026-11-02): ① 어휘 CSV 없이 뼈대만(가져오기 스크립트는 만들되 실제 데이터는 나중), ② 가져온 단어는 `content/drafts/vocabulary/`에 draft → 사람이 승인, ③ 발음(TTS)은 나중(오디오 없으면 버튼 숨김).

## Global Constraints

- UI 문구는 한국어, 코드·커밋은 영어. 스키마의 단일 원천은 `lib/schema`(Zod), 타입은 `z.infer`로만.
- `lib/engine`, `lib/srs`, `lib/repositories`는 순수 함수/주입된 저장소만(브라우저 전역 직접 접근 금지 — `Storage`를 인자로 받는다). 엔진은 ts-fsrs를 직접 import하지 않는다(`lib/srs`만).
- `lib/` 테스트 먼저, 라인 커버리지 80% 이상. UI는 Playwright 흐름 테스트.
- 학생 화면은 approved 어휘만 읽는다. 에이전트는 approved로 바꾸지 않는다(승인 스크립트는 사람이 실행).
- 뜻·예문을 지어내지 않는다. `content/_fixtures/`에만 직접 작성 가능, id에 FIXTURE, 기출 문장 금지.
- 작동하지 않는 기능을 완성된 것처럼 표시하지 않는다: 예문 없는 단어는 예문 빈칸·문맥 판별 카드를 숨기고, 오디오 없는 단어는 발음 버튼을 숨기고, 커버리지는 `analysis/vocab_frequency.json`이 없으면 숨긴다.
- 목표 시간 15·30·60분 → 신규 단어 10·15·20개. 평가 4단계 다시·어려움·보통·쉬움, 키보드 1~4·Space, 탭 모두 지원.
- 브라우저 음성 합성 금지. 새 의존성 추가 금지(필요하면 먼저 승인).
- **승인 필요(이 계획 승인으로 함께 승인)**: 스키마 변경 2건 — `Vocabulary.example`을 선택으로(단계 6 "예문은 비워 둔다"), 새 `LocalProgress` 스키마.

## Review Focus

1. localStorage를 쓸 수 없음(사파리 개인 정보 보호 모드, 저장소 꽉 참) → 학습은 메모리로 계속되고 "진도가 저장되지 않습니다" 안내가 보여야 한다. → Task 3 테스트.
2. 저장된 진도가 깨짐(JSON 아님, 스키마 불일치, 옛 schemaVersion) → 백업 키에 원본을 남기고 새로 시작, 화면은 정상. → Task 3 테스트.
3. 날짜 경계: "오늘"은 학생 기기의 현지 날짜, 자정 넘어 이어 하면 새 날의 계획. 복습 기한은 `now` 기준. → Task 4 테스트.
4. approved 어휘가 0개(실데이터 승인 전 운영 빌드) → 대시보드가 "아직 학습할 단어가 없습니다"를 보이고 시작 버튼을 비활성. → Task 7 e2e.
5. 평가 키를 빠르게 연타 → 카드 하나에 평가 한 번만 기록. → Task 7 컴포넌트 로직(평가 중 잠금) + e2e.

---

### Task 1: 스키마와 테스트용 어휘

**Files:**
- Modify: `lib/schema/vocabulary.ts`(example 선택), `lib/schema/progress.ts`(LocalProgress 추가), `lib/schema/schema.test.ts`
- Modify: `content/_fixtures/valid/vocabulary/FIXTURE-V.json`(FIXTURE-V-002~012 추가: 직접 작성한 쉬운 단어, 002~006은 예문 있음, 007~012는 예문·audio 없음, csatFrequencyRank는 일부만)

**Interfaces:**
- Produces: `Vocabulary`(example?: {en, ko}), `DailyMinutes = z.union([z.literal(15), z.literal(30), z.literal(60)])`, `LocalProgress = { schemaVersion: 1, profile: { anonId: uuid string, nickname: string(1..20), dailyMinutes: DailyMinutes, createdAt: IsoDateTime } | null, cards: ReviewCard[], days: Record<"YYYY-MM-DD", { reviewed: int≥0, learned: int≥0 }> }`.

- [ ] Step 1: 테스트 — example 없는 Vocabulary 통과, LocalProgress 정상 통과, dailyMinutes 45 거부, schemaVersion 2 거부, nickname 21자 거부.
- [ ] Step 2: 실행 → 실패 확인 (`npx vitest run lib/schema/schema.test.ts`).
- [ ] Step 3: 구현 + fixture 단어 추가.
- [ ] Step 4: `npx vitest run lib/schema` 통과, `npm run validate:content` 통과.
- [ ] Step 5: Commit `feat: make vocabulary examples optional and add local progress schema`.

### Task 2: lib/srs — ts-fsrs 래퍼

**Files:** Create `lib/srs/index.ts`, `lib/srs/index.test.ts`

**Interfaces:**
- Produces: `type Grade = "again" | "hard" | "good" | "easy"`; `newCardState(now: Date): FsrsState`; `gradeCard(state: FsrsState, grade: Grade, now: Date): FsrsState`; `isDue(state: FsrsState, now: Date): boolean`; `isMastered(state: FsrsState): boolean` = state "Review" 이고 stability ≥ 21(일).

- [ ] Step 1: 테스트 — 새 카드는 now에 기한(isDue true); "again"은 "easy"보다 다음 기한이 이르다; 결과는 `FsrsState` 스키마 통과(날짜 ISO 문자열); 같은 입력 → 같은 출력; isMastered 경계(stability 20.9 false, 21 true, state Learning이면 false).
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현 — ts-fsrs `fsrs()` 기본 파라미터, `createEmptyCard`, `Rating.Again..Easy` 매핑, Date↔ISO 변환은 이 파일 안에서만.
- [ ] Step 4: 통과.
- [ ] Step 5: Commit `feat: wrap ts-fsrs for word review scheduling`.

### Task 3: lib/repositories — 진도 저장소

**Files:** Create `lib/repositories/progress.ts`, `lib/repositories/progress.test.ts`

**Interfaces:**
- Consumes: `LocalProgress`(Task 1).
- Produces: `interface ProgressRepository { load(): LocalProgress; save(p: LocalProgress): void; readonly persistent: boolean }`; `class LocalStorageProgressRepository implements ProgressRepository { constructor(storage: Storage | null, key = "english90.progress") }`; `emptyProgress(): LocalProgress`; 백업 키 `${key}.corrupt.${ISO 시각}`.

- [ ] Step 1: 테스트(가짜 Storage 객체) — 비어 있으면 emptyProgress; save→load 왕복; JSON 아님 → 원문이 백업 키에 남고 emptyProgress; 스키마 불일치·schemaVersion 2 → 같은 처리; storage null → persistent false, load/save가 메모리로 동작; setItem이 던지면(QuotaExceeded) persistent false로 바뀌고 예외를 밖으로 던지지 않음.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현.
- [ ] Step 4: 통과.
- [ ] Step 5: Commit `feat: add local progress repository with corruption recovery`.

### Task 4: lib/engine/planToday — 오늘 할 일

**Files:** Create `lib/engine/planToday.ts`, `lib/engine/planToday.test.ts`

**Interfaces:**
- Consumes: `isDue`(Task 2), `ReviewCard`, `DailyMinutes`.
- Produces: `planToday(input: { dailyMinutes: DailyMinutes; now: Date; cards: ReviewCard[]; wordOrder: string[]; learnedToday: number }): { reviews: string[]; newWords: string[]; estimatedMinutes: number }`. 상수(가정, 파일 상단 주석에 "파일럿 데이터로 조정"): `NEW_WORDS = {15: 10, 30: 15, 60: 20}`, `REVIEW_SECONDS = 10`, `NEW_WORD_SECONDS = 30`, 어휘에 쓰는 시간 = 목표 시간의 50%(나머지는 단원 학습 몫, 단원은 단계 7).

- [ ] Step 1: 테스트 — 복습: 기한 지난 카드만, 기한 오래된 순; 신규: 카드 없는 단어를 wordOrder 순으로 최대 NEW_WORDS개, 이미 오늘 배운 수(learnedToday)만큼 줄임; 복습 시간이 어휘 몫(15분→450초)을 넘으면 신규 0; 경계(복습 시간 + 신규 1개가 정확히 몫과 같으면 포함); 단어가 모자라면 있는 만큼; estimatedMinutes는 올림 정수.
- [ ] Step 2: 실패 확인.
- [ ] Step 3: 구현.
- [ ] Step 4: 통과.
- [ ] Step 5: Commit `feat: plan today's reviews and new words within the time goal`.

### Task 5: 어휘 읽기와 커버리지 지표

**Files:** Create `lib/content/vocabulary.ts`(서버 전용, fs 사용 — lib/engine 아님), `lib/content/vocabulary.test.ts`, `lib/engine/coverage.ts`에 `masteredCoverage` 추가 + 테스트.

**Interfaces:**
- Produces: `loadStudentVocabulary(contentDir = process.env.CONTENT_DIR ?? "content"): Vocabulary[]` — `vocabulary/*.json`에서 approved만, 순서는 csatFrequencyRank 오름차순(있는 것 먼저) 그다음 파일·배열 순서; `loadCoverageEntries(rootDir = process.cwd()): CoverageEntry[] | null` — `analysis/vocab_frequency.json` 없으면 null; `masteredCoverage(cards: ReviewCard[], lemmaById: Record<string, string>, entries: CoverageEntry[]): number`(isMastered인 word 카드의 lemma로 `coverage` 호출).

- [ ] Step 1: 테스트 — 임시 폴더에 draft·approved 섞어 두면 approved만; 순위 정렬; 폴더 없으면 []; 빈도 파일 없으면 null; masteredCoverage가 숙달 카드만 셈.
- [ ] Step 2~4: 실패 확인 → 구현 → 통과. vitest coverage include에 `lib/content/**` 추가.
- [ ] Step 5: Commit `feat: load approved vocabulary and compute mastered coverage`.

### Task 6: 어휘 가져오기·승인 스크립트

**Files:** Create `scripts/vocab/import.ts`(순수: CSV 파싱·변환), `scripts/import-vocab.ts`(CLI), `scripts/approve-vocab.ts`(CLI, 사람 전용), `tests/import-vocab.test.ts`.

**Interfaces:**
- Produces: `parseVocabCsv(text: string): { rows: { word; pos; meaning }[]; errors: string[] }`; `toDraftVocabulary(rows, opts: { source: string; level: LevelId; rankByLemma: Map<string, number> }): Vocabulary[]`(id `V-{source}-{0001}`, meanings는 meaning을 `;`·`,`로 나눈 원문 그대로, example 없음, isPolysemous = 뜻이 2개 이상, reviewStatus "draft"); CLI `npm run vocab:import -- --source middle --level L0` → `content/drafts/vocabulary/middle.json`; `npm run vocab:approve -- middle`(사람이 실행) → `content/vocabulary/middle.json`에 approved로 복사.
- pos 매핑: n/noun/명사→noun, v/verb/동사→verb, a/adj/형용사→adjective, ad/adv/부사→adverb, prep/전치사→preposition, conj/접속사→conjunction, pron/대명사→pronoun, det/한정사→determiner, int/감탄사→interjection, phr/구/숙어→phrase; 모르는 값은 errors에 행 번호와 함께.

- [ ] Step 1: 테스트 — 헤더 대소문자·BOM 허용; 따옴표 안 쉼표; 빈 뜻·모르는 품사는 errors; 순위 반영; 같은 lemma+pos 중복은 첫 행만 + errors; 결과가 Vocabulary 스키마 통과.
- [ ] Step 2~4: 실패 확인 → 구현 → 통과.
- [ ] Step 5: approve 스크립트 첫 줄 주석과 실행 시 출력에 "사람이 실행하는 승인 명령" 명시. CLAUDE.md 명령 목록에 두 명령 추가. Commit `feat: import vocabulary CSV into drafts and add human approval command`.

### Task 7: 화면 (ui-craft로 진행)

**Files:** Create `app/(student)/start/page.tsx`, `app/(student)/vocab/page.tsx`, `app/(student)/vocab/done/page.tsx`; Modify `app/(student)/dashboard/page.tsx`, `app/page.tsx`(있으면 리디렉션 규칙); Create `components/learning/ProgressProvider.tsx`(클라이언트, repository·planToday 연결), `components/learning/VocabularyCard.tsx`, `components/dashboard/TodayPlan.tsx`.

**Interfaces:**
- Consumes: Task 1~5 전부. 서버 페이지가 `loadStudentVocabulary()`·`loadCoverageEntries()` 결과를 props로 넘긴다.
- Produces: `/` → 프로필 없으면 `/start`, 있으면 `/dashboard`. `/start`: 닉네임(1~20자), 15·30·60 선택, 시작 시 `crypto.randomUUID()`로 anonId. `/dashboard`: "오늘 학습 시작" 버튼 하나, 복습 n·신규 n·예상 m분, 커버리지(entries 있을 때만, "수능 지문 어휘 커버리지 x%"), 어휘 0개면 안내+버튼 비활성, `persistent false`면 저장 불가 안내. `/vocab`: 카드 앞(lemma, 품사) → Space/탭으로 뜻 공개 → 1~4/버튼으로 평가 → 저장 → 다음; 예문 빈칸·문맥 판별 카드는 example 있을 때만; 발음 버튼(P)은 audio 있을 때만(재생 실패 시 숨김); 평가 처리 중 입력 잠금; 남은 카드 수 표시; 중간 새로고침 시 남은 계획부터 이어 감(계획은 매번 저장소 상태로 다시 계산). `/vocab/done`: 오늘 복습·신규 수, 내일 기한 카드 수.

- [ ] Step 1: ui-craft 발견 단계(기존 `app/tokens.css`·`components/ui/button.tsx` 사용) 후 화면 구현.
- [ ] Step 2: `npm run lint`, `npm run typecheck`, `npm run build` 통과.
- [ ] Step 3: Commit `feat: add start, dashboard, vocabulary review and done screens`.

### Task 8: e2e 흐름

**Files:** Modify `playwright.config.ts`(webServer에 `CONTENT_DIR=content/_fixtures/valid`), `e2e/dashboard.spec.ts`(새 리디렉션에 맞춤); Create `e2e/vocab-flow.spec.ts`.

- [ ] Step 1: 테스트 — 시작(닉네임 "테스트", 15분) → 대시보드 "신규 10" → 시작 → 키보드로 5개 평가 → 새로고침 → 대시보드/어휘에서 남은 5개부터 → 탭으로 5개 → 완료 화면 "신규 10"; 평가 키 연타 시 카드가 1개만 넘어감; localStorage 막힌 컨텍스트에서 안내 문구 표시; 모바일·데스크톱 가로 넘침 0.
- [ ] Step 2: `npm run test:e2e` 통과.
- [ ] Step 3: Commit `test: cover the start-to-resume vocabulary flow end to end`.

### Task 9: 마무리

- [ ] `docs/progress/stage-6.md`(한 것·못 한 것·결정·남은 일: 실제 CSV, 승인, TTS 비교표, 단원 슬롯은 단계 7), `npm run lint/typecheck/test:coverage/validate:content/build/test:e2e` 전부 통과 확인, 푸시.
