# 단계 8 설계: 콘텐츠 생성·검수 파이프라인

작성: 2026-11-03. 브랜치 `feat/content-pipeline`.
근거: `docs/CLAUDE_CODE_PROMPTS.md` 단계 8, `docs/DESIGN_v2.md` 6장·14-4·14-7.

## 목적

문항이 수천 개 필요하고, 사람 검수 시간이 전체 일정의 상한이다(DESIGN 6-1: 하루 50문항이면 4,000문항에 80일).
이 단계의 목표는 두 가지다.
- 명세 파일 하나로 단원 초안(주석 문장, 문항)을 만든다.
- 사람이 실제로 들이는 검수 시간을 줄인다. 단, "최종 승인은 사람만" 원칙은 깨지 않는다.

완료 기준(프롬프트 그대로): 명세 하나로 UNIT 0-05 초안이 생성되고, 자동 검증과 교차 풀이를 거쳐, 검수 화면에서 승인한 것만 학습 화면에 나타난다.
이번 단계에서는 실제 생성을 실행하지 않는다. 명세 작성까지만 하고, 사용자가 명세를 승인하면 `--limit 5`로 시험 실행한다.

## 사용자 결정 (2026-11-03)

1. **생성·교차 풀이·AI 사전 검수는 구독 로그인 `claude -p`로 돌린다.** API 키를 쓰지 않는다.
   - 단계 5 태깅과 같은 방식을 따른다: 자식 프로세스에서 `ANTHROPIC_*` 제거, `--bare` 금지, 구독 로그인이 아니면 중단.
   - `scripts/tagging/claude.ts`의 `subscriptionEnv`, `assertSubscriptionAuth`, `claudeArgs`, `runClaude`를 공용 모듈로 옮겨 재사용한다.
   - CLAUDE.md에 "2026-11-03 사용자 승인" 예외로 기록한다.
   - 모델 환경 변수(내 판단):
     - 생성: `CLAUDE_CONTENT_MODEL` (기본 `opus`)
     - 교차 풀이: `CLAUDE_CROSSCHECK_MODEL` (기본 `sonnet`, 생성과 다른 모델이 독립성에 유리)
2. **검수는 사용자가 노트북으로 직접 한다.** 시간을 줄이기 위해 다음 방식을 쓴다.
   - AI 사전 검수가 지적 사항을 문항 옆에 붙인다.
   - 세 관문을 모두 통과한 "깨끗한 묶음"은 무작위 표본만 보고 버튼 한 번으로 승인한다. 세 관문은 자동 검사 통과, 교차 풀이 정답 일치, AI 사전 검수 지적 없음이다.
   - 문제 있는 문항만 하나씩 자세히 본다.
   - 목표는 단원(약 30문항)당 10~15분이다(추정, 첫 시험 실행 후 측정).

## 흐름

```
명세(content/specs/L0-U05.json)
  → generate: 문장 주석 + 문항 초안 (claude -p, Zod JSON 스키마 강제)   → content/drafts/
  → 자동 검증: 스키마·콘텐츠 규칙, 허용 어휘 초과, 오답 오개념/함정 누락, 기출 8-gram 유사도
  → 교차 풀이: 정답을 가린 문항을 다른 모델로 풀기 → 불일치 시 flagged
  → AI 사전 검수: 정답 오류·애매함·수준 이탈 지적 (지적 있으면 flagged)
  → /admin/review-queue: 사람이 승인·수정·폐기 / 깨끗한 묶음은 표본 확인 후 일괄 승인
  → 승인본만 content/ 로 이동 (reviewedBy, 시각 기록) → 빌드 검증 → 학생 화면
```

## 부분별 설계

### 1. 명세 형식 (`lib/schema/spec.ts`, 새 스키마)
- 필드: unitId, levelId, skills, misconceptions(id + 학생이 하는 착각 설명), 난이도, 허용 어휘 범위(vocab level 또는 빈도 순위 상한), 생성할 문장 수, 문항 수, variantGroup 목록과 그룹당 목표 수(최소 6), blueprint id(선택).
- `content/specs/`는 스키마가 생기면 `validate:content` 검사 대상에 넣는다.

### 2. 생성 (`scripts/content-pipeline/generate.ts`, `npm run content:generate -- --spec L0-U05 [--limit N|--dry-run]`)
- 문장을 먼저 만들고, 그 문장을 쓰는 문항을 만든다. 출력은 기존 `AnnotatedSentence`·`Question` Zod 스키마를 JSON Schema로 바꿔 `--json-schema`로 강제한다.
- 저장: `content/drafts/{sentences,questions}/`, `reviewStatus: "draft"`, 문항은 `source.generatedBy: "ai_draft"`.
- 비용 통제(구독 사용량):
  - `--dry-run`은 예상 호출 수만 출력한다.
  - `--limit`은 호출 수에 상한을 둔다.
  - 결과 캐시: 명세 해시와 프롬프트 해시가 같으면 다시 부르지 않는다.
- id는 `{unitId}-S-###`, `{unitId}-Q-###` 형식이다. FIXTURE는 붙이지 않는다.

### 3. 검수 기록 (`lib/schema/review-record.ts`, 새 스키마)
- 승인본 스키마는 바꾸지 않는다. 파이프라인 기록은 초안 옆의 별도 기록 파일 `content/drafts/records/{id}.json`에 둔다. 기록 내용:
  - 자동 검사 결과(통과/사유 목록)
  - 교차 풀이 답
  - AI 사전 검수 지적
  - 상태(draft → auto_checked / flagged)
  - 오류 신고 이력
- 문장(`AnnotatedSentence`)에는 `source` 필드가 없다. 그래서 출처와 검수자도 이 기록에 남긴다.

### 4. 자동 검증 (`scripts/content-pipeline/check.ts`)
- `validate:content`의 스키마·콘텐츠 규칙 전체를 적용한다(span 범위, 정답 유일성, 힌트 범위 등).
- 허용 어휘 초과: `content/vocabulary`와 빈도표 기준으로 판정한다. 기본형 판정은 간단한 어형 규칙만 쓴다(내 판단).
- 오답 선택지에 misconception 또는 trap이 없으면 flagged.
- 기출 유사도:
  - 기존 Python 검사기(`scripts/analysis/csat_stats/leak.py`)를 호출한다. 출력은 점수와 겹침 여부만 받는다.
  - 8-gram 이상 겹치면 flagged.
  - `corpus/`가 없으면 건너뛰고 경고한다.

### 5. 교차 풀이와 AI 사전 검수 (`scripts/content-pipeline/crosscheck.ts`, `prereview.ts`)
- 교차 풀이:
  - 정답·해설·힌트·오개념을 뺀 문항만 보낸다.
  - 답이 다르면 flagged이고, 사유는 "교차 풀이 불일치(골라진 답)"이다.
- AI 사전 검수:
  - `.claude/agents/content-reviewer.md`의 검수 기준을 프롬프트로 쓴다.
  - 결과는 문항별 지적 목록(없으면 빈 목록)이다. 지적이 있으면 flagged.
  - 이 단계는 상태를 approved로 바꾸지 못한다. 코드에 그 경로가 없다.

### 6. 검수 화면 `/admin/review-queue`
- 접근:
  - `ADMIN_PASSWORD` 환경 변수로 막는다. 비교는 서버에서 하고 쿠키에 세션을 둔다.
  - 프로덕션 빌드에서는 `ENABLE_ADMIN=1`이 없으면 404를 낸다.
- 목록: 단원별로 flagged가 먼저 오고, 사유를 함께 보인다. 각 문항은 학생 화면과 같은 `PracticeQuestion`·`SentenceAnalyzer`로 미리 본다(정답·해설 펼침 포함).
- 개별 처리:
  - 승인
  - 수정: JSON 편집기, 입력 즉시 스키마 검증, 통과해야 저장된다.
  - 폐기: retired로 표시하고 기록은 남긴다.
  - 키보드: A 승인, R 폐기, E 수정, J/K 이동.
- **깨끗한 묶음 일괄 승인:**
  - 대상은 auto_checked 상태이고 교차 풀이가 일치하며 사전 검수 지적이 없는 문항이다.
  - 무작위 표본 `max(3, 20%)`개를 화면에 강제로 펼친다. 표본을 모두 열어 봐야 일괄 승인 버튼이 켜진다.
  - 표본 중 하나라도 폐기·수정하면 그 묶음 전체를 개별 검수로 돌린다(내 판단).
- 승인 처리(서버 액션):
  - 초안을 `content/{sentences,questions}/`의 단원 파일로 옮기고 `reviewStatus: "approved"`로 바꾼다.
  - 문항은 `source.reviewedBy`와 시각을 기록한다.
  - 문장이 쓰는 문장 id가 아직 승인 전이면 문항 승인을 막는다.
- 승인한 사람: `REVIEWER_NAME` 환경 변수를 쓰고, 없으면 승인을 거부한다.

### 7. 어휘 예문
- 같은 생성기에서 모드만 다르게 쓴다(`--vocab L0`). 뜻은 원본을 유지하고 예문만 만든다.
- 결과는 초안으로 저장하고, 같은 검수 화면의 "어휘" 탭에서 승인한다.

### 8. 문제 오류 신고
- 학습 화면의 문항 아래에 "문제 오류 신고" 버튼을 둔다. 사유는 정답 오류, 해설 오류, 문장 이상, 기타 중에서 고르고 짧은 메모를 덧붙일 수 있다.
- P1에는 서버 DB가 없다. 그래서 신고는 서버 액션으로 `content/reports/reports.jsonl`에 한 줄씩 추가한다.
  - 로컬과 자체 서버에서만 동작한다.
  - Vercel 같은 읽기 전용 배포에서는 버튼을 숨긴다. 작동하지 않는 기능을 보이지 않는다는 규칙에 따른 것이다. 단계 9에서 Supabase로 옮긴다.
- `npm run content:reports`는 신고된 approved 문항을 검수 기록에서 flagged로 되돌리고, 승인본에서는 retired로 표시한다. 다음 빌드 전에 사람이 실행한다.

### 9. L0-U05 명세
- 작성은 `curriculum-architect` 서브에이전트가 맡는다. `content/specs/`는 그 에이전트의 쓰기 영역이다.
- 근거는 DESIGN 4-1, 4-2, 9장, 12장의 오개념 예시다.
- 사용자가 검토·승인한 뒤 `--limit 5`로 시험 실행한다.

## 사용자 결정 추가 (2026-11-03)

3. **기초 목록도 초안으로 만든다.** 대상은 skill, 오개념, 함정, L0 단계, UNIT 0-05 단원 정보다.
   - `curriculum-architect`가 L0-U05 명세와 함께 초안으로 쓴다. 위치는 `content/curriculum/` 또는 `content/drafts/`이고, 승인본 폴더에는 쓰지 않는다.
   - 사용자가 명세와 함께 검토·승인한다.
   - 승인된 목록은 검수 화면의 "기초 목록" 탭에서 사람이 승인해 `content/`로 옮긴다. 문항보다 먼저 승인해야 한다. 참조 무결성 검사 때문이다.
4. **허용 어휘는 당분간 `analysis/vocab_frequency.json`의 빈도 순위 상위 2000으로 정한다.** 기능어와 고유명사는 제외한다. 승인된 어휘 목록이 생기면 명세의 어휘 범위를 그것으로 바꾼다.
5. **생성 모델 기본값은 opus다.** `--limit 5` 시험 실행에서 구독 사용량을 보고 조정한다.

## 빌더 점검 후 정한 것 (내 판단, 2026-11-03)

- **생성 단위:** 호출 한 번에 variantGroup 하나를 만든다. 문항 6개와 그 문항이 쓰는 문장이다.
  - `--limit`과 `--dry-run`은 이 호출 수를 센다.
  - 캐시 키는 (명세 해시, 그룹 id, 프롬프트 해시)이다.
  - 시간 제한은 600초다.
- **id 규칙:** DESIGN 4-2를 따른다. 문항은 `Q-L0-U05-001`, 문장은 `S-L0-U05-001`이다. 위 2절의 `{unitId}-Q-###`는 이것으로 대체한다.
- **승인 파일:** `content/questions/L0-U05.json`, `content/sentences/L0-U05.json`이다.
  - 배열에 추가하고, 같은 id가 있으면 교체한다.
  - 쓰기는 임시 파일에 쓴 뒤 이름을 바꾸는 방식으로 한다. 검수자는 한 명이므로 잠금은 두지 않는다.
- **검수 기록 위치:** `content/drafts/records/`로 둔다.
  - `lib/schema/content-tree.ts`의 `kindForPath`에 `records` 종류를 추가해, `validate:content`가 `ReviewRecord`로 검사하게 한다.
- **기출 유사도 실행 방법:**
  - `scripts/analysis/check_text.py`를 새로 만든다. 표준 입력으로 받은 문장마다 점수와 겹침 여부만 출력한다.
  - 기존 `leak.py`의 함수를 재사용한다.
  - `corpus/structured`가 없으면 "건너뜀" 상태를 반환하고 생성은 계속한다. 이때 검수 기록에 "유사도 미검사"를 남기고, 해당 문항은 깨끗한 묶음에서 빠진다.
- **오류 신고 위치와 반영:**
  - 신고는 `content/` 밖의 `data/reports/reports.jsonl`에 저장한다(git 제외). CLAUDE.md의 "content/는 파이프라인과 검수로만" 규칙을 지키기 위해서다.
  - 로컬과 자체 서버에서만 동작한다. P1 Vercel 배포에서는 버튼을 숨긴다.
  - 신고 문항을 flagged로 돌리는 것은 `npm run content:reports`를 손으로 실행해서 한다. DESIGN 6-3의 "자동"은 단계 9에서 Supabase 이벤트로 구현한다.
- **관리자 화면과 프로덕션:** 검수는 로컬 `npm run dev`에서만 한다. 프로덕션 빌드에서 `/admin`은 항상 404다. 위 6절의 `ENABLE_ADMIN`은 없앤다.
- **오개념 예시 근거:** "9장"이 아니라 DESIGN 4-2와 12장이다.

## 하지 않는 것 (비목표)
- 이번 단계에서 실제 대량 생성은 하지 않는다.
- 어떤 스크립트·에이전트도 approved로 바꾸지 않는다. 승인은 검수 화면에서 사람만 할 수 있다.
- 지문형(독해) 문항 생성은 하지 않는다. 블루프린트 기반 지문 생성은 L2 이후에 한다.
- 정식 관리자 인증은 P2에서 한다.

## 반대 목표 (동작해도 실패로 보는 것)
- 학생 화면에 검수되지 않은 문항이 한 개라도 나오는 경우
- 기출 원문이 초안, 로그, 화면에 찍히는 경우
- 구독이 아닌 API 과금으로 넘어가는 경우
- 일괄 승인이 사실상 "안 보고 승인"이 되는 경우: 표본 강제 열람으로 막는다.

## 사용자 승인이 필요한 변경
- 새 스키마 두 개(`ContentSpec`, `ReviewRecord`). 기존 승인본 스키마는 바꾸지 않는다.
- CLAUDE.md 예외 문구(구독 `claude -p`로 생성).
- 새 의존성은 없다. JSON Schema 변환은 Zod 4의 `z.toJSONSchema`를 쓴다.

## 빌더에게 맡기는 것
- 프롬프트 문구, 캐시 파일 위치, 화면 배치, 진행률 출력 형식.
