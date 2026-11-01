# 에이전트 협업 흐름

## 역할

| 담당 | 하는 일 | 쓰기 가능 | 하지 않는 일 |
| --- | --- | --- | --- |
| 메인 세션 | 오케스트레이터, 개발, QA, 검수 보고서 저장 | app/, components/, lib/, tests/, scripts/, e2e/, docs/reviews/ 등 | approved 전환 |
| curriculum-architect | 단원·skill·오개념 설계, 단원 명세 | content/specs/, content/curriculum/, docs/curriculum/, docs/decisions/ | 코드, 초안·승인본, 문항 작성 |
| research-content | 기출 분석 해석, 블루프린트, 문항·주석·예문 초안 | analysis/, content/blueprints/, content/drafts/, docs/research/ | 코드, 명세, 승인본, corpus/ 직접 읽기 |
| content-reviewer | 명세·블루프린트·초안 검수(읽기 전용) | 없음(보고서를 응답으로 반환) | 파일 수정, 승인 |
| 사람 | 최종 승인, 단원 ID·스키마 변경 승인 | 검수 화면 | — |

## 단원 인계 흐름

```
curriculum-architect      research-content       자동 검증           content-reviewer        사람              메인 세션
  명세 작성        →      초안 생성        →   validate:content  →   검수 보고서     →   승인(검수 화면)  →  구현·테스트
  content/specs/          content/drafts/       (훅·빌드 전)          docs/reviews/          approved           app/, lib/
  [specified]             [drafted]                                   [reviewed]             [approved]         [implemented]
```

단원 상태는 `content/curriculum/unit-status.json` 한 곳에서 관리한다.

## 지켜지는 방식

| 규칙 | 강제 수단 | 한계 |
| --- | --- | --- |
| 승인본(content/units·sentences·questions·vocabulary) 수정 금지 | PreToolUse 훅 `scripts/hooks/protect-content.ts`(Edit·Write·NotebookEdit 경로, Bash 명령 문자열 검사) | Bash 안에서 다른 프로그램(Python·Node 한 줄 등)이 쓰는 것은 못 막는다 |
| 콘텐츠 형식 | PostToolUse 훅 `validate:content`, prebuild | — |
| 에이전트별 쓰기 폴더 | 에이전트 프롬프트 지시 | 도구 수준 강제 없음. 위반은 검수와 git diff로 잡는다 |
| approved 전환은 사람만 | 프롬프트 지시 + 검사기(approved에는 reviewedBy 필요) | reviewedBy 값 자체는 검증하지 않는다 |

## 단계별 담당 (CLAUDE_CODE_PROMPTS.md 단계 3~10)

| 단계 | 내용 | 주 담당 | 보조 |
| --- | --- | --- | --- |
| 3 | 기출 구조화 | 메인 세션(스크립트) | — |
| 4 | 기출 통계 분석 | 메인 세션(스크립트) | research-content(결과 해석, docs/research/) |
| 5 | AI 태깅·블루프린트 | 메인 세션(태깅 스크립트) | research-content(블루프린트), curriculum-architect(교육적 적합성 의견) |
| 6 | 어휘 SRS·대시보드 | 메인 세션 | research-content(예문 초안), content-reviewer |
| 7 | 문장 분석기·단원 학습 | 메인 세션 | curriculum-architect(L0-U05 명세), research-content(문장 주석 초안), content-reviewer |
| 8 | 콘텐츠 생성·검수 파이프라인 | 메인 세션 | research-content(생성 프롬프트·초안), content-reviewer(검수 기준) |
| 9 | 학습 로그·배포 | 메인 세션 | — |
| 10 | 파일럿 전 점검 | 메인 세션 | content-reviewer(콘텐츠 전수 점검), curriculum-architect(단원 흐름 점검) |

## 병렬 규칙

- 서로 다른 단원이나 서로 다른 폴더 작업만 동시에 맡긴다. 같은 파일을 두 에이전트가 동시에 고치지 않는다.
- 검수되지 않은 콘텐츠에 기대는 작업은 검수 후에 시작한다.
- 의견 충돌은 `docs/decisions/`에 ADR(배경, 선택지, 결정, 근거)로 남긴다.

## 사용자 승인이 필요한 일

콘텐츠 approved 전환, 단원 ID 변경, 스키마 변경, 외부 API 비용이 드는 대량 생성, 의존성 추가.
