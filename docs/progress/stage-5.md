# 단계 5 진행 기록: AI 태깅과 블루프린트

브랜치: `feat/item-tagging` (`feat/corpus-stats` 위). 마지막 갱신: 2026-11-01.

## 설계 변경 (2026-11-01 사용자 승인)

- API(`ANTHROPIC_API_KEY`, 토큰당 과금) 대신 **claude.ai 구독 로그인의 `claude -p`**로 태깅한다. 사용량은 구독 한도에서 차감되고 따로 청구되지 않는다(claude.ai 설정의 추가 사용량이 꺼져 있을 때).
- 브라우저로 claude.ai 채팅을 자동 조작하는 방식은 쓰지 않는다(일반 사용자 약관의 자동 접근 제한, 출력 형식 불안정).
- 과금 방지 장치(`scripts/tagging/claude.ts`, 테스트 있음):
  - 자식 프로세스 환경에서 `ANTHROPIC_*`, `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY` 제거.
  - 실행 전 `claude auth status`의 authMethod가 `claude.ai`가 아니면 중단.
  - `--bare`를 쓰지 않는다. `--bare`는 API 키만 읽는다.
- 호출을 작게: 도구 끔(`--tools ""`), MCP 끔, 사용자 설정·플러그인·훅 끔(`--setting-sources project` + 중립 폴더에서 실행), 짧은 시스템 프롬프트.

## 만든 것

- 스키마 `lib/schema/tagging.ts`: `ItemTagging`(모델 출력), `TaggedItem`(저장 레코드), `taggingJsonSchema()`(`--json-schema`로 넘김). 함정 라벨 enum 이름은 기존 `TrapType`(정의 파일 스키마)과 겹치지 않게 `TrapLabel`.
- `scripts/tagging/prompt.ts`: 문장 번호 매기기, 유형별 필수 필드, 프롬프트. `PROMPT_VERSION`을 올리면 캐시가 무효가 되어 다시 태깅한다.
- `scripts/tagging/check.ts`: 결과 파싱(사용량 한도 감지 포함), 근거 문장 범위·정답에 함정 금지·오답 전부 태깅·필드 유형 일치 검사.
- `scripts/tag-items.ts` (`npm run tag:items`): `--exam`, `--limit`, `--dry-run`, `--model`, `--concurrency`, `--retag`. 실행 전 예상 호출 수 출력, 캐시(`corpus/tagged/{examId}/{번호}.json`), 실패 시 지적 사항을 붙여 1회 재시도, 실패 목록 `corpus/tagged/failures.json`, 실행 기록 `corpus/tagged/run-log.jsonl`. 사용량 한도에 닿으면 멈추고, 다시 실행하면 이어서 한다.
- 프롬프트에는 원문이 들어가므로 화면·로그에 출력하지 않는다.

## 시험 실행 (2026 수능 28문항)

| 회차 | 프롬프트 | 결과 | 시간 | 출력 토큰 |
| --- | --- | --- | --- | --- |
| 1 | v1 | 28/28 첫 시도 통과 | 1분 31초 | 13,310 |
| 2 | v2 | 28/28 첫 시도 통과 | 약 1분 30초 | 10,496 |

- v1에서 발견: "일치하지 않는 것" 문항(도표·내용 일치·안내문·장문 45)은 오답이 지문과 맞는 진술이라 함정 분류가 맞지 않아 전부 `other`가 나왔다. v2에서 부정형 발문은 함정을 요구하지 않고, 장문 43(순서 배열)은 순서 단서를 받게 바꿨다.
- 문항당 출력 약 375토큰, 캐시 읽기 약 3천 토큰. 구독 한도 대비 비율은 claude.ai 설정의 사용량 화면에서 확인해야 한다.

## 남은 일

- [ ] 사용자 결정: 나머지 1,105문항(40회분)을 돌릴 순서와 속도. Pro 한도 때문에 여러 번에 나눠 돌 가능성이 크다.
- [ ] 표본 검수: 유형별 10% 무작위 → `corpus/tagged/review.csv`, `correct` 열 → 유형별 정확도 스크립트.
- [ ] 집계 `analysis/tagging_stats.json`(원문 없음), 블루프린트 `content/blueprints/{type}.json`(sourceStats 필수), `docs/analysis/GRAMMAR_PRIORITY.md`.
- [ ] 확정 함정 유형을 `content/traps.json`에 추가: 이 파일은 승인본 보호 대상이라 훅이 막는다. 초안은 `content/drafts/`에 두고 사람이 검수 화면으로 승인한다.
- [ ] `blankRole`이 4문항 중 2개 `other`. 빈칸 위치 분류(주제문·결론·중간 재진술)가 부족한지 전체 결과를 보고 판단.
