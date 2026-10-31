# Claude Code 단계별 프롬프트

각 단계의 코드 블록을 그대로 복사해 Claude Code에 붙여 넣는다. 한 단계가 끝나면 완료 기준을 확인하고 커밋한 뒤 `/clear`로 대화를 비우고 다음 단계로 넘어간다.

## 사용법과 단계 0: 준비

### 전체 순서

| 단계 | 내용 | 결과물 | 필요한 준비 |
| --- | --- | --- | --- |
| 0 | 폴더·설계서·CLAUDE.md 준비 | 빈 프로젝트 | 설계서 Markdown 내보내기 |
| 1 | 프로젝트 초기화 | 실행되는 빈 앱 | — |
| 2 | 스키마·콘텐츠 검증 | 데이터 규칙과 검사기 | — |
| 3 | 기출 구조화 | 문항 JSON(비공개) | 기출 PDF를 `corpus/raw/`에 넣기 |
| 4 | 기출 통계 분석 | 어휘·구문 통계 | — |
| 5 | AI 태깅·블루프린트 | 유형별 출제 사양 | Anthropic API 키 |
| 6 | 어휘 SRS·대시보드 | 매일 쓰는 어휘 학습 | 어휘 목록 파일 |
| 7 | 문장 분석기·단원 학습 | UNIT 0-05 학습 화면 | — |
| 8 | 콘텐츠 생성·검수 | 자체 문항 생산 도구 | Anthropic API 키 |
| 9 | 학습 로그·배포 | 파일럿용 배포 주소 | Supabase·Vercel 계정 |
| 10 | 파일럿 전 점검 | 점검 보고서 | 테스트 학생 확보 |

단계 3\~5(기출 분석)와 단계 6\~7(학습 화면)은 서로 의존하지 않는다. 기출 PDF 준비가 늦어지면 6\~7을 먼저 해도 된다.

### 매 단계 공통 규칙

1. 프롬프트를 붙이기 전에 `Shift+Tab`으로 계획 모드(Plan mode)로 바꾼다. Claude가 계획을 보여주면 설계서와 맞는지 확인하고 승인한다.
2. 끝나면 Claude의 완료 보고에서 lint·typecheck·test·build 결과를 확인한다.
3. 직접 `npm run dev`로 화면을 열어 본다.
4. 커밋하고 `/clear`로 대화를 비운 뒤 다음 단계로 간다.

### 단계 0: 터미널에서 직접 실행

설계서 본문 탭을 Markdown으로 내보내 `DESIGN_v2.md`로 저장해 둔다. 그다음 터미널에서:

```bash
# 작업 폴더: ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_eng2uni
cd ~/Documents/01_Kmarx_PROJECT/02_AI_PROJECT/00_eng2uni
git init
mkdir -p docs corpus/raw .claude/agents
# 내려받은 설계서·프롬프트 파일을 docs/ 로 옮긴다
mv ~/Downloads/DESIGN_v2.md docs/DESIGN_v2.md
mv ~/Downloads/CLAUDE_CODE_PROMPTS.md docs/CLAUDE_CODE_PROMPTS.md
printf "corpus/\n.env*\n!.env.example\nnode_modules/\n.next/\n" > .gitignore
claude
```

Claude Code가 열리면 아래를 그대로 붙여 넣는다. CLAUDE.md와 검수 서브에이전트를 만드는 준비 프롬프트다.

```markdown
# 단계 0: 프로젝트 규칙 파일 만들기

코드는 아직 만들지 마라. 다음 두 파일만 만든다.

1. 프로젝트 루트에 CLAUDE.md:

# English 90
설계 기준: docs/DESIGN_v2.md. 설계와 다른 구현이 필요하면 먼저 제안하고 승인을 받는다.

## 현재 범위
- 읽기 트랙(어휘·문법·구문·독해)만 개발한다. 듣기·음성 기능은 만들지 않는다.

## 명령
- npm run dev / lint / typecheck / test / validate:content / build

## 규칙
- 스키마의 단일 원천은 lib/schema (Zod). 타입은 z.infer로만 만든다.
- lib/engine 은 순수 함수만. 브라우저·DB에 의존하지 않는다.
- content/ 의 문항·정답·해설·예문을 직접 작성하거나 수정하지 않는다. 콘텐츠는 파이프라인과 사람 검수로만 들어온다.
- AI 초안은 content/drafts/ 에만 저장한다. 학생 화면은 approved만 읽는다.
- corpus/ 는 기출 원문이다. 분석 스크립트만 읽을 수 있고, 그 문장을 content/, 코드, 테스트, 커밋, 화면에 복사하지 않는다.
- 제출 전에는 정답·해설을 DOM에 렌더링하지 않는다.
- 작동하지 않는 기능을 완성된 것처럼 표시하지 않는다.
- API 키는 환경 변수로만 읽고, 모델 이름은 ANTHROPIC_MODEL 환경 변수로 받는다.
- UI 문구는 한국어, 코드·커밋 메시지는 영어.

## 완료 기준
- lib/ (schema, engine, srs, repositories)는 테스트 먼저 작성, 라인 커버리지 80% 이상. UI 컴포넌트는 Playwright 흐름 테스트로 검증한다.
- lint, typecheck, test, validate:content, build 가 모두 통과한 뒤 구현한 것·못한 것·테스트 결과·다음 할 일을 보고한다.

2. .claude/agents/content-reviewer.md:

---
name: content-reviewer
description: content/ 또는 draft 콘텐츠의 정답·해설·문장 주석 오류를 점검할 때 사용
tools: Read, Grep, Glob
---
너는 중고등 영어 교육 콘텐츠 검수자다. 각 항목에 대해 확인하고 표로 보고한다.
- 정답이 하나뿐이고 해설과 일치하는가
- 오답 선택지의 misconception·trap 태그가 실제 오답 이유와 맞는가
- 문장 주석의 역할(S·V·O·C·M, 절)이 문법적으로 맞는가
- 한국어 해석이 자연스럽고 정확한가
- 해당 단계의 어휘 범위를 넘는 단어가 있는가
파일은 수정하지 말고 문제 항목 id와 이유만 보고한다.

두 파일을 만든 뒤 docs/DESIGN_v2.md를 읽고, 설계서와 CLAUDE.md 사이에 충돌하는 내용이 있으면 목록으로 알려라.
```

## 단계 1: 프로젝트 초기화

완료 기준: `npm run dev`로 빈 대시보드가 뜨고, lint·typecheck·test·build가 통과한다.

```markdown
# 단계 1: 프로젝트 초기화

CLAUDE.md와 docs/DESIGN_v2.md의 7장(기술 아키텍처)을 따른다.

1. 현재 폴더에 Next.js(App Router) + TypeScript + Tailwind CSS 프로젝트를 만든다. 기존 docs/, corpus/, .claude/, CLAUDE.md, .gitignore는 지우거나 덮어쓰지 않는다.
2. 패키지 버전은 현재 안정 버전으로 고정하고 lockfile을 만든다.
3. shadcn/ui를 설정하고, Zod, ts-fsrs, Vitest, Playwright를 설치한다.
4. 설계서 7-2의 폴더 구조를 만든다. 빈 폴더에는 README 한 줄로 용도를 적는다. 듣기 관련 폴더는 만들지 않는다.
5. package.json 스크립트: dev, build, lint, typecheck(tsc --noEmit), test(vitest run), test:e2e(playwright), validate:content(아직은 "no content yet" 출력 후 0 종료).
6. 공통 레이아웃: 한국어 폰트, 모바일 우선, 상단 앱 이름 "English 90", 빈 /dashboard 페이지.
7. 디자인 토큰(색상·간격·글자 크기)을 한 곳에 정의한다. 문장 역할 색상(S·V·O·C·M)도 여기에 넣되, 색맹을 고려해 구분이 잘 되는 조합으로 고른다.
8. .env.example에 ANTHROPIC_API_KEY, ANTHROPIC_MODEL, ANTHROPIC_CROSSCHECK_MODEL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY를 빈 값으로 적는다.
9. 테스트가 실제로 도는지 확인할 샘플 테스트 1개씩(Vitest, Playwright)을 만든다.

기능은 만들지 않는다. 끝나면 완료 기준에 따라 보고하라.
```

## 단계 2: 스키마와 콘텐츠 검증

완료 기준: 검증 규칙마다 통과·실패 테스트가 있고, `npm run build` 전에 `validate:content`가 자동 실행된다. 이 단계가 끝나면 콘텐츠 검증 훅을 켠다(아래 두 번째 블록).

```markdown
# 단계 2: 데이터 스키마와 콘텐츠 검증기

docs/DESIGN_v2.md의 4장(핵심 데이터 모델), 13-5, 14-4를 읽고 구현한다.

1. lib/schema/ 에 Zod 스키마를 만든다:
   Level, Unit, LessonBlock, Skill, SkillPrerequisite, Misconception, TrapType,
   AnnotatedSentence(tokens, spans, chunks, expansionSteps, translation, chunkedTranslation),
   Passage(text, sentences, evidenceSpans, topicDomain),
   Question(type, options[misconception|trap], answer, explanation.summary, explanation.byOption, variantGroup, source, reviewStatus, version),
   Vocabulary(lemma, pos, meanings, example, level, isPolysemous, csatFrequencyRank),
   ReviewCard, Attempt, LessonProgress, SkillMastery,
   LearningEvent(anonId, type, interaction, hintLevel, payload, at),
   Blueprint(14-4 구조).
2. reviewStatus는 draft | auto_checked | flagged | approved | retired.
3. 타입은 z.infer로만 만들어 lib/schema/index.ts에서 내보낸다.
4. scripts/validate-content.ts가 content/ 아래 모든 JSON을 검사한다:
   - 스키마 유효성, id 중복
   - Question.answer가 options에 있고 정답이 하나뿐인지
   - 정답이 아닌 모든 선택지에 misconception 또는 trap이 있고, 그 id가 정의 파일에 존재하는지
   - span range가 tokens 범위 안인지, parent·modifies가 존재하는 span을 가리키는지, 자식 span이 부모 범위 안에 있는지
   - chunks 경계가 토큰 범위 안인지
   - 학생용 빌드에는 approved만 포함되는지
   - 참조 무결성(lessonId, skills, sentenceId, variantGroup)
   실패 시 파일 경로와 항목 id, 이유를 출력하고 1로 종료한다.
5. content/_fixtures/ 에 테스트 전용 가짜 데이터를 두고, 규칙마다 통과·실패 사례를 Vitest로 테스트한다. fixture 문장은 테스트용임을 id에 표시한다(예: FIXTURE-S-001).
6. package.json에 prebuild로 validate:content를 연결한다.

화면은 만들지 않는다. 끝나면 완료 기준에 따라 보고하라.
```

단계 2 완료 후 붙여 넣는 훅 설정 프롬프트:

```markdown
.claude/settings.json을 만들어 PostToolUse 훅을 설정하라. Edit 또는 Write 도구로 파일이 바뀔 때마다 npm run validate:content --silent 를 실행한다. 현재 Claude Code 버전의 훅 형식을 확인해서 작성하고, 설정 후 /hooks에서 확인할 방법을 알려라.
```

## 단계 3: 기출 구조화

준비: 평가원에서 내려받은 문제지·정답 PDF를 `corpus/raw/`에 아래 이름 규칙으로 넣는다. 처음에는 최근 3개년(수능 + 6·9월 모평 = 9회분)으로 시작하고, 파이프라인이 안정되면 2018학년도까지 늘린다.

```
corpus/raw/2026_csat_q.pdf      2026학년도 수능 문제지
corpus/raw/2026_csat_a.pdf      2026학년도 수능 정답
corpus/raw/2026_m06_q.pdf       2026학년도 6월 모평 문제지
corpus/raw/2026_m09_q.pdf       2026학년도 9월 모평 문제지
```

완료 기준: 시험마다 18\~45번 28문항이 JSON으로 추출되고, 추출이 불확실한 문항은 보고서에 표시된다.

```markdown
# 단계 3: 기출 PDF 구조화 (읽기 18~45번)

목적: docs/DESIGN_v2.md 14-3의 1~2단계. corpus/ 는 비공개 폴더이며 git에 올라가지 않는다. 결과물도 corpus/ 안에만 둔다.

1. scripts/analysis/ 를 만든다. PDF 처리는 Python(uv로 환경 관리, pdfplumber 등)을 써도 된다. 사용 이유를 README에 적는다.
2. corpus/raw/ 의 파일 이름 규칙: {학년도}_{csat|m06|m09}_{q|a}.pdf. 규칙에 맞지 않는 파일은 건너뛰고 보고한다.
3. 문제지 PDF는 2단 편집이다. 단 순서를 올바르게 읽고, 페이지 머리말·꼬리말·쪽 번호를 제거한다.
4. 18~45번만 추출한다. 문항마다:
   examId, number, instruction(발문), passage, options(①~⑤), points(2 또는 3, 발문에 [3점] 표시 확인),
   underlines(밑줄 친 부분 표시가 있으면), blanks(빈칸 위치), givenSentence(삽입 문항의 주어진 문장),
   orderParts((A)(B)(C)), sharedPassageGroup(41~42, 43~45 장문 묶음)
5. 정답 PDF에서 정답을 읽어 연결한다.
6. 유형은 번호 기준으로 1차 지정한다(설계서 14-2 표). 시험마다 번호 배치가 다르면 발문 문구로 확인하고, 불일치는 보고서에 남긴다.
7. 각 문항에 extractionConfidence(high|medium|low)를 붙인다. 선택지 개수 ≠ 5, 빈 지문, 깨진 기호가 있으면 low.
8. 결과: corpus/structured/{examId}.json, 요약 보고서 corpus/structured/REPORT.md(시험별 문항 수, low 문항 목록).
9. low 문항을 내가 직접 고칠 수 있도록 corpus/structured/fixes/{examId}.json 덮어쓰기 파일 구조를 만들고, 다음 실행 때 반영되게 한다.
10. 추출 로직의 단위 테스트는 corpus 원문이 아니라 직접 만든 가짜 2단 텍스트로 작성한다.

기출 문장을 화면, content/, 테스트, 커밋 메시지에 쓰지 않는다. 끝나면 시험별 추출 결과와 low 문항 수를 보고하라.
```

## 단계 4: 기출 통계 분석

완료 기준: 어휘 빈도표, 구문 복잡도, 유형별 지문 특성이 `analysis/`에 생성된다. 이 폴더에는 원문 문장이 없어야 한다.

```markdown
# 단계 4: 기출 통계 분석

목적: docs/DESIGN_v2.md 14-3의 4단계와 14-5. 입력은 corpus/structured/, 출력은 analysis/ (커밋 가능, 원문 문장 금지).

1. 어휘 빈도표 analysis/vocab_frequency.json:
   lemma, pos, totalCount, examCount(등장한 시험 수), itemTypes(등장한 유형), inAnswerOptions(선택지 등장 여부).
   표제어 추출은 spaCy 등 표준 도구를 쓴다. 고유명사·숫자·기능어는 별도 표시한다.
2. 커버리지 계산 함수: "알고 있는 lemma 집합"을 넣으면 기출 지문 토큰 중 몇 %를 아는지 계산한다. lib/engine/coverage.ts(앱용)와 분석 스크립트가 같은 규칙을 쓰도록 lemma 정규화 규칙을 문서화한다.
3. 구문 복잡도 analysis/syntax_stats.json: 유형별 문장 길이 분포, 문장당 절 수, 절 중첩 깊이 분포, 관계절·분사구·to부정사·명사절·도치 구문의 빈도.
4. 지문 특성 analysis/passage_stats.json: 유형별 지문 단어 수 분포, 문단 수, 담화 표지어(however, therefore, for example 등) 빈도, 36~39번의 지시어·관사·연결어 빈도.
5. 보고서 docs/analysis/REPORT.md: 각 통계의 핵심 결과를 표로 요약한다. 예문이 필요하면 원문이 아니라 직접 만든 예시를 쓰고 "예시(자체 작성)"라고 표시한다.
6. analysis/ 파일들을 Zod로 검증하는 스키마를 lib/schema에 추가한다.
7. 스크립트 하나로 전체를 다시 계산할 수 있게 한다: npm run analyze.
8. analysis/ 에 원문 문장이 섞이지 않았는지 검사하는 스크립트를 만든다(corpus 문장과 8-gram 이상 겹치면 실패).

끝나면 상위 50개 lemma, 유형별 평균 지문 길이, 절 중첩 깊이 분포를 요약 보고하라.
```

## 단계 5: AI 태깅과 블루프린트

준비: `.env.local`에 `ANTHROPIC_API_KEY`와 `ANTHROPIC_MODEL`을 넣는다.
완료 기준: 유형별 블루프린트 JSON이 `content/blueprints/`에 생기고, 태깅 정확도를 사람이 표본 검수한 기록이 남는다.

```markdown
# 단계 5: 기출 AI 태깅과 유형별 블루프린트

목적: docs/DESIGN_v2.md 14-3의 3·5단계, 14-4, 14-6.

1. scripts/analysis/tag-items 를 만든다. Claude API(모델은 ANTHROPIC_MODEL)로 corpus/structured/의 문항마다 다음을 JSON으로 태깅한다. 출력은 Zod로 검증하고, 실패하면 1회 재시도 후 실패 목록에 남긴다.
   - evidenceSentenceIndexes: 정답 근거 문장 번호
   - distractorTraps: 오답 선택지마다 함정 유형(opposite_claim, partial_detail, over_generalization, keyword_reuse, no_textual_basis, scope_shift, other+설명)
   - grammarPoint: 29번의 각 밑줄이 묻는 문법 포인트
   - vocabTarget: 30번의 각 밑줄 어휘와 판단 근거 유형(반의어, 문맥 논리 등)
   - blankRole: 31~34번 빈칸이 글에서 하는 역할(주제문, 결론, 재진술 등)
   - orderCues / insertionCues: 36~39번에서 쓰인 단서 종류(지시어, 연결어, 관사, 시간 흐름 등)
   - topicDomain: 소재 분야
2. 비용 통제: --limit, --exam, --dry-run 옵션. 결과를 캐시해 같은 문항을 다시 보내지 않는다. 실행 전 예상 호출 수를 출력한다.
3. 태깅 결과는 corpus/tagged/ 에 저장한다(비공개).
4. 표본 검수: 유형별 10%를 무작위로 뽑아 corpus/tagged/review.csv로 만든다. 내가 correct 열을 채우면 유형별 태깅 정확도를 계산하는 스크립트를 만든다.
5. 집계: 함정 유형 분포, 어법 포인트 빈도 순위, 빈칸 역할 분포, 순서·삽입 단서 분포를 analysis/tagging_stats.json에 저장한다(원문 없음).
6. 블루프린트 생성: analysis/ 의 통계로 유형별 블루프린트를 content/blueprints/{type}.json에 만든다. 14-4 구조를 따르고, 모든 수치는 통계에서 계산한 값이어야 하며 출처 통계 파일과 필드를 sourceStats에 적는다. 원문 문장은 넣지 않는다.
7. content/ 의 misconceptions·traps 정의 파일에 확정된 함정 유형을 추가한다.
8. 어법 포인트 빈도 순위를 docs/analysis/GRAMMAR_PRIORITY.md로 정리한다. 설계서 14-6의 가설 목록과 비교해 차이를 표시한다.

끝나면 유형별 블루프린트 목록과 태깅 실패 수, 예상 대비 실제 API 호출 수를 보고하라.
```

## 단계 6: 어휘 SRS와 오늘의 학습

준비: 보유한 중학 필수 어휘 목록을 `data/vocab-source/middle.csv`로 저장한다. 열은 최소한 `word, pos, meaning`이 있어야 한다. 단계 4를 먼저 했다면 기출 빈도 순위가 자동으로 반영된다.

완료 기준: 첫 화면에서 목표 시간을 고르고, 오늘의 어휘 복습을 끝까지 진행할 수 있으며, 새로고침해도 진도가 유지된다.

```markdown
# 단계 6: 어휘 SRS와 오늘의 학습 대시보드

docs/DESIGN_v2.md 3-3, 5-4, 9-2, 13-2(단어 카드 4단), 14-5를 따른다.

1. scripts/import-vocab.ts: data/vocab-source/*.csv를 읽어 content/vocabulary/*.json으로 변환한다.
   - 뜻은 원본 목록의 값만 쓴다. 뜻이나 예문을 지어내지 않는다.
   - analysis/vocab_frequency.json이 있으면 csatFrequencyRank를 채우고, 없으면 비워 둔다.
   - 예문은 비워 두고 reviewStatus는 approved(뜻 카드만 사용). 예문은 단계 8 파이프라인에서 채운다.
2. lib/srs/: ts-fsrs 래퍼. 엔진 코드는 ts-fsrs를 직접 import하지 않는다.
3. lib/repositories/: ProgressRepository 인터페이스 + LocalStorageProgressRepository(schemaVersion 포함, 손상된 데이터는 백업 후 초기화).
4. lib/engine/planToday.ts: 목표 시간(15·30·60분)에 따라 기한 지난 복습 → 신규 어휘(10·15·20개) → 현재 단원 순서로 오늘 할 일을 만든다. 복습량이 시간을 넘으면 신규 학습을 줄인다. 순수 함수 + 경계값 테스트.
5. 신규 단어 순서: csatFrequencyRank가 있으면 그 순서, 없으면 원본 목록 순서.
6. lib/engine/coverage.ts: 숙달 단어 집합으로 수능 지문 어휘 커버리지를 계산한다(analysis가 없으면 지표를 숨긴다).
7. 화면:
   - /start: 닉네임, 목표 시간 선택, 익명 ID(uuid) 발급
   - /dashboard: "오늘 학습 시작" 버튼 하나, 오늘 할 일과 예상 시간, 커버리지 지표(있을 때만)
   - /vocab: VocabularyCard. 지금은 뜻 확인 카드만 활성화하고, 예문 빈칸·문맥 판별 카드는 예문이 있는 단어에만 나타난다. 평가 4단계(다시·어려움·보통·쉬움). 키보드(1~4, Space)와 탭 모두 지원.
   - 완료 화면: 오늘 학습량, 내일 복습 예정 수
8. 발음 듣기(사전 생성 TTS):
   - scripts/generate-audio.ts: content/vocabulary/의 단어마다 TTS로 발음 파일을 한 번 생성해 저장하고 Vocabulary.audio에 경로를 기록한다. 이미 있는 파일은 다시 만들지 않는다. --limit, --dry-run, 예상 호출 수·비용 출력. API 키는 환경 변수로만 읽는다.
   - TTS 공급자와 파일 저장 위치는 구현 전에 비교표(비용·음질·라이선스·상업적 이용)로 제안하고 승인을 받는다.
   - 모든 단어 카드에 발음 재생 버튼을 둔다(키보드 P). audio가 없거나 재생에 실패하면 버튼을 숨긴다. 브라우저 음성 합성으로 대체하지 않는다.
9. 테스트: planToday, coverage, 저장소 복구, Playwright로 "시작 → 어휘 10개 → 새로고침 → 이어하기".

끝나면 완료 기준에 따라 보고하라.
```

## 단계 7: 문장 분석기와 단원 학습

완료 기준: 테스트용 데모 단원으로 "개념 → 역할 태깅 → 문장 조립 → 문항 → 힌트 → 피드백 → 평가 → 통과/보충" 흐름이 끝까지 작동한다. 실제 UNIT 0-05 콘텐츠는 단계 8에서 만든다.

```markdown
# 단계 7: SentenceAnalyzer, 문항, 단원 학습 흐름

docs/DESIGN_v2.md 5장, 9장, 13장(P1 인터랙션)을 따른다. 콘텐츠는 content/_fixtures/의 데모 단원(FIXTURE-UNIT)만 쓴다.

1. SentenceAnalyzer(역할 태깅 모드):
   - AnnotatedSentence를 받아 토큰을 탭으로 선택(연속 범위는 첫 토큰·끝 토큰 탭)하고 S·V·O 중 역할을 지정한다.
   - 정답 span과 비교해 역할별로 피드백. 틀린 부분만 흔들림 + 색 표시, 맞은 부분은 역할 기호와 해석 조각이 고정된다.
   - 색과 함께 기호(S, V, O)를 항상 표시. 드래그 없이 탭만으로 완료 가능. 키보드 조작 지원.
   - 이후 모드(화살표, 접기)를 추가할 수 있게 mode prop 구조로 만든다.
2. SentenceBuilder(문장 조립): 섞인 단어 칩을 순서대로 탭해 문장을 만든다. 되돌리기 지원.
3. PracticeQuestion: 객관식·참거짓. 제출 전 정답·해설을 DOM에 렌더링하지 않는다(테스트로 확인).
4. 3단계 힌트: 방향 → 범위(후보 구간 강조) → 정답과 근거. 사용한 힌트 단계를 Attempt에 기록하고, 3단계 힌트로 맞힌 문항은 정답으로 세지 않는다.
5. FeedbackPanel: 선택지의 explanation.byOption과 misconception 메시지, 보충 블록 링크.
6. lib/engine/grade.ts, mastery.ts: 5-2 숙달 기준(문항 8개 미만이면 판정 보류, 지연 확인 예약 포함)을 그대로 구현하고 표 기반 테스트를 작성한다.
7. 오답 skill은 ReviewCard(itemType=skill)로 등록하고, 복습은 같은 variantGroup의 안 푼 문항을 우선 낸다. 남은 문항이 없으면 "문항 부족"으로 기록한다.
8. /learn/[unitId]: LessonBlock 순서 렌더링, 중간 이탈 후 이어하기, 평가 결과에 따라 다음 단원 해금 또는 보충 블록 이동.
9. 대시보드의 "오늘 할 일"에 단원 학습과 skill 복습이 들어가게 연결한다.
10. Playwright: 데모 단원 전체 흐름(오답 → 힌트 → 해설 → 동형 문항 재시도 → 통과).

끝나면 완료 기준에 따라 보고하라.
```

## 단계 8: 콘텐츠 생성·검수 파이프라인

완료 기준: 명세 파일 하나로 UNIT 0-05 문항·주석 초안이 생성되고, 자동 검증과 교차 풀이를 거쳐 검수 화면에서 승인한 것만 학습 화면에 나타난다.

이 단계 뒤에 실제 콘텐츠 작업은 다음 순서로 반복한다: 명세 작성 → `npm run content:generate` → 검수 화면에서 승인·수정·폐기 → `content-reviewer` 서브에이전트로 승인분 재점검.

```markdown
# 단계 8: 콘텐츠 생성·검수 파이프라인

docs/DESIGN_v2.md 6장, 14-4, 14-7을 따른다.

1. content/specs/ 명세 형식(Zod 스키마 포함): unitId, skills, misconceptions, 난이도, 허용 어휘 범위(vocab level 또는 빈도 순위 상한), 생성할 문장 수·문항 수, 사용할 blueprint(있으면).
2. scripts/content-pipeline/generate: Claude API(ANTHROPIC_MODEL)로 AnnotatedSentence, Question 초안을 만든다. 출력은 Zod 스키마 JSON으로 강제하고 reviewStatus=draft, source.generatedBy=ai_draft로 저장한다(content/drafts/).
3. 자동 검증(통과 시 auto_checked, 실패 시 flagged + 사유):
   - validate-content 규칙 전체
   - 허용 어휘 범위 초과 단어 검사(content/vocabulary + 빈도표 기준)
   - 오답 선택지의 misconception/trap 누락
   - 기출 유사도: corpus/structured 지문과 8-gram 이상 겹치면 flagged (corpus가 없으면 건너뛰고 경고)
4. 교차 풀이: 정답을 가린 문항을 별도 API 호출(ANTHROPIC_CROSSCHECK_MODEL, 비어 있으면 ANTHROPIC_MODEL)로 풀게 해서 정답이 다르면 flagged.
5. 같은 개념의 동형 문항은 같은 variantGroup으로 묶고, 그룹당 최소 6문항을 목표로 생성한다.
6. 비용 통제: --limit, --dry-run, 예상 호출 수 출력, 결과 캐시.
7. /admin/review-queue:
   - flagged 우선 정렬, 사유 표시
   - 문항을 학생 화면과 같은 컴포넌트로 미리보기
   - 승인·수정(JSON 편집 + 즉시 스키마 검증)·폐기
   - 승인 시 content/ 해당 위치로 이동, reviewedBy와 시각 기록
   - 접근은 ADMIN_PASSWORD 환경 변수로 막는다(P2에서 정식 인증으로 교체). 프로덕션 빌드에서는 기본적으로 비활성화한다.
8. 단계 6의 어휘 예문 생성도 같은 파이프라인으로 처리한다(뜻은 원본 유지, 예문만 생성).
9. 첫 실행용 명세 content/specs/L0-U05.json을 설계서 4-1, 4-2, 9장, 12장의 오개념 예시를 바탕으로 작성한다. 명세는 내가 검토한 뒤 생성을 실행한다.
10. 학습 화면에 "문제 오류 신고" 버튼을 추가하고, 신고된 문항은 다음 빌드 전에 flagged로 되돌리는 스크립트를 만든다.

명세 작성까지만 하고 생성은 실행하지 마라. 내가 명세를 승인하면 --limit 5로 시험 실행한다. 끝나면 완료 기준에 따라 보고하라.
```

## 단계 9: 학습 로그와 파일럿 배포

준비: Supabase 프로젝트와 Vercel 계정을 만들고 URL·키를 `.env.local`에 넣는다.

완료 기준: 배포 주소에서 학습하면 9-3의 이벤트가 Supabase에 쌓이고, 익명 사용자는 읽을 수 없다.

```markdown
# 단계 9: 익명 학습 로그와 배포

docs/DESIGN_v2.md 9-3, 9-4, 11장을 따른다.

1. supabase/migrations/: learning_events(id, anon_id, type, interaction, hint_level, payload jsonb, created_at).
   RLS: anon 역할은 insert만 가능, select·update·delete 불가. payload 크기 제한.
2. lib/analytics/track.ts: 이벤트를 Zod로 검증하고 묶어서 전송한다. 실패하면 로컬에 잠시 보관했다가 재전송하고, 학습 흐름은 절대 막지 않는다.
3. 9-3 표의 이벤트(session_start/end, card_review, block_view, question_answer, analyzer_action, report_error)를 각 화면에 연결한다. 이름·이메일 등 식별 정보는 보내지 않는다. 닉네임도 보내지 않는다.
4. 첫 화면에 "학습 기록은 익명으로 수집되어 서비스 개선에만 쓰입니다" 안내와 동의 체크를 둔다. 동의하지 않으면 로그를 보내지 않는다.
5. scripts/pilot-report: Supabase에서 이벤트를 내려받아 9-4 성공 지표(학습일수, 평균 학습 시간, 단원 통과율, 7일 지연 정답률, 어휘 정답률, 오류 신고)를 계산해 Markdown 보고서로 만든다. 서비스 키는 로컬 스크립트에서만 쓴다.
6. Vercel 배포 설정: 환경 변수 목록 문서화, 프로덕션에서 /admin 비활성화 확인.
7. 오프라인·네트워크 오류 상황을 Playwright로 테스트한다.

끝나면 배포 절차와 환경 변수 목록을 포함해 보고하라.
```

## 단계 10: 파일럿 전 점검

완료 기준: 점검 보고서의 "차단" 항목이 0개다.

```markdown
# 단계 10: 파일럿 전 전체 점검

코드를 고치기 전에 먼저 점검 보고서만 만든다. docs/PILOT_CHECK.md에 항목별 결과를 "통과 / 경고 / 차단"으로 적는다.

1. 설계서 9-1의 P1 범위가 모두 구현됐는지, 범위 밖 기능(듣기, 로그인, 결제)이 화면에 노출되지 않는지
2. 학생용 빌드에 approved가 아닌 콘텐츠, corpus 원문, _fixtures가 포함되지 않는지
3. 제출 전 정답 비노출(DOM 검사), 3단계 힌트 기록, 숙달 판정이 설계서 5-2와 일치하는지
4. 모바일(375px 폭) 레이아웃과 탭만으로 전체 흐름 완료 가능 여부
5. 키보드 조작, 색 외 기호 표시, 대비 등 기본 접근성
6. 새로고침·뒤로가기·네트워크 끊김·저장 데이터 손상 시 동작
7. 이벤트 로그가 9-3과 일치하는지, 식별 정보가 섞이지 않는지
8. lint, typecheck, test, test:e2e, validate:content, build 결과

보고서를 보여준 뒤, 차단 항목부터 고칠 계획을 제안하고 내 승인을 기다려라.
```

## 막혔을 때 쓰는 보조 프롬프트

**테스트가 계속 실패할 때**

```markdown
테스트를 통과시키려고 테스트 자체를 바꾸거나 건너뛰지 마라. 실패 원인을 먼저 설명하고, 테스트가 틀렸다고 판단되면 그 근거를 보여준 뒤 내 승인을 받아라.
```

**설계와 다르게 구현된 것 같을 때**

```markdown
docs/DESIGN_v2.md의 [섹션 번호]와 현재 구현을 비교해 다른 점을 표로 정리하라. 고치지 말고 차이와 각 차이의 영향만 보고하라.
```

**콘텐츠 품질을 점검할 때**

```markdown
content-reviewer 서브에이전트로 content/questions/[단원 폴더]의 approved 문항을 전부 점검하라. 문제가 있는 문항 id와 이유를 표로 보고하고, 파일은 수정하지 마라.
```

**대화가 길어져 맥락이 흐려졌을 때**

```markdown
지금까지 이 단계에서 한 일, 남은 일, 바꾼 파일 목록을 docs/progress/[단계 번호].md에 정리하라. 내가 /clear 한 뒤 이 파일을 읽고 이어서 진행할 수 있게 써라.
```

**다음 단계를 시작하기 전에**

```markdown
docs/progress/ 와 git log를 읽고 지난 단계에서 끝나지 않은 일이 있는지 확인하라. 있으면 목록으로 보여주고, 없으면 "준비 완료"라고만 답하라.
```
