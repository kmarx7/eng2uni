# English 90
설계 기준: docs/DESIGN_v2.md. 설계와 다른 구현이 필요하면 먼저 제안하고 승인을 받는다.

## 현재 범위
- 읽기 트랙(어휘·문법·구문·독해)만 개발한다. 듣기·음성 기능은 만들지 않는다.
- 예외: 어휘 카드의 단어 발음 오디오는 만든다(단어 단위 재생만). 오디오는 사전 생성 TTS 파일로 제공하고, 브라우저 음성 합성은 쓰지 않는다. 대화·문장 듣기, 받아쓰기, 배속 조절은 듣기 모듈로 보류한다.

## 명령
- npm run dev / lint / typecheck / test / validate:content / build

## 규칙
- 스키마의 단일 원천은 lib/schema (Zod). 타입은 z.infer로만 만든다.
- lib/engine 은 순수 함수만. 브라우저·DB에 의존하지 않는다.
- content/ 의 문항·정답·해설·예문을 직접 작성하거나 수정하지 않는다. 콘텐츠는 파이프라인과 사람 검수로만 들어온다.
- AI 초안은 content/drafts/ 에만 저장한다. 학생 화면은 approved만 읽는다.
- content/drafts/ 와 content/_fixtures/ 는 학생용 빌드에 포함하지 않고, validate:content의 "학생용 빌드는 approved만" 검사 대상에서도 제외한다(스키마 검사는 한다).
- 예외: content/_fixtures/ 의 테스트 전용 데이터는 직접 작성할 수 있다. 모든 id에 FIXTURE를 붙이고(예: FIXTURE-S-001), 기출 문장을 쓰지 않는다.
- corpus/ 는 기출 원문이다. 분석 스크립트와 콘텐츠 파이프라인의 기출 유사도 검사기만 읽을 수 있다. 유사도 검사기는 점수와 겹침 여부만 출력하고 겹친 원문을 출력하지 않는다. 그 문장을 content/, 코드, 테스트, 커밋, 화면에 복사하지 않는다.
- 제출 전에는 정답·해설을 DOM에 렌더링하지 않는다.
- 작동하지 않는 기능을 완성된 것처럼 표시하지 않는다.
- API 키는 환경 변수로만 읽고, 모델 이름은 ANTHROPIC_MODEL 환경 변수로 받는다. 교차 풀이는 ANTHROPIC_CROSSCHECK_MODEL(선택)을 쓰고, 비어 있으면 ANTHROPIC_MODEL로 별도 호출한다.
- UI 문구는 한국어, 코드·커밋 메시지는 영어.

## 완료 기준
- lib/ (schema, engine, srs, repositories)는 테스트 먼저 작성, 라인 커버리지 80% 이상. UI 컴포넌트는 Playwright 흐름 테스트로 검증한다.
- lint, typecheck, test, validate:content, build 가 모두 통과한 뒤 구현한 것·못한 것·테스트 결과·다음 할 일을 보고한다.

## 에이전트 협업
자세한 흐름과 단계별 담당: docs/AGENT_WORKFLOW.md

| 담당 | 역할 | 쓰기 가능 |
| --- | --- | --- |
| 메인 세션 | 오케스트레이터 + 개발·QA. 코드는 메인 세션만 작성 | app/, components/, lib/, tests/, scripts/, e2e/, docs/reviews/ |
| curriculum-architect | 단계·단원·skill·오개념 설계, 단원 명세 | content/specs/, content/curriculum/, docs/curriculum/, docs/decisions/ |
| research-content | 기출 분석 해석(스크립트 출력만, corpus/ 직접 읽기 금지), 블루프린트, 초안 | analysis/, content/blueprints/, content/drafts/, docs/research/ |
| content-reviewer | 명세·블루프린트·초안 검수, 읽기 전용 | 없음(보고서를 돌려주면 메인 세션이 docs/reviews/{unitId}-{날짜}.md로 저장) |

- 최종 승인(approved)은 사람만 한다. 어떤 에이전트도 reviewStatus를 approved로 바꾸지 않는다.
- 단원 인계: curriculum-architect(명세) → research-content(초안) → 자동 검증 → content-reviewer(검수 보고) → 사람 승인(검수 화면) → 메인 세션(구현·테스트).
- 단원 상태: specified → drafted → reviewed → approved → implemented. content/curriculum/unit-status.json 한 곳에서 관리한다.
- 병렬: 서로 다른 단원이나 서로 다른 폴더 작업만 동시에 맡긴다. 같은 파일을 두 에이전트가 동시에 수정하지 않는다.
- 검증되지 않은 콘텐츠에 의존하는 작업은 검수 후에 시작한다.
- 의견 충돌은 docs/decisions/ 에 ADR 형식(배경, 선택지, 결정, 근거)으로 기록한다.
- 보고 시 코드 품질(테스트 결과)과 콘텐츠 품질(검수 현황)을 따로 쓴다.
- 사용자 승인 필요: 콘텐츠 approved 전환, 단원 ID 변경, 스키마 변경, 외부 API 비용이 드는 대량 생성, 의존성 추가.
- 승인본(content/units·sentences·questions·vocabulary)은 PreToolUse 훅(scripts/hooks/protect-content.ts)이 Edit·Write와 Bash 쓰기 명령을 막는다. content/specs/, content/curriculum/ 은 스키마가 생길 때까지 validate:content 검사에서 빠진다.
