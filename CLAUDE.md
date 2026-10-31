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
