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

## 전체 태깅 (2026-11-01~02)

- 1,133문항 전부 태깅(프롬프트 v2). 2018 이후 784문항: 실패 0, 재시도 5. 2014~2017 321문항: 138개 처리 뒤 한도에 걸림 → 한도 초기화 후 나머지 183개 실패 0.
- **사고 기록**: 2014~2017 실행 중 claude가 "monthly spend limit"(월 지출 한도) 메시지를 냈다. claude.ai의 추가 사용량이 켜져 있어 5시간 한도를 넘긴 뒤 유료 사용이 일어났을 가능성이 있다. 한도 감지 규칙이 "spend limit"을 몰라 멈추지 않고 남은 문항을 계속 시도했다(실패 호출). 규칙을 "limit"이 들어간 모든 메시지로 넓혀 고침(`81f2104`). 대량 실행 전에는 추가 사용량이 꺼져 있는지 사용자 확인을 받는다.
- 표본 검수 파일 `corpus/tagged/review.csv`: 122문항(유형별 10%, seed 20261101). 사람 검수 대기.

## 집계·블루프린트 (2026-11-02)

- `npm run analyze:tags` → `analysis/tagging_stats.json`(전체·2018 이후), `docs/analysis/GRAMMAR_PRIORITY.md`(14-6 가설과 비교). 유출 검사·스키마 검증 포함.
- 블루프린트: 사용자 결정으로 **초안 스키마 `BlueprintDraft`**를 새로 두고 `content/drafts/blueprint-drafts/{type}.json` 19개 생성(`npm run blueprints:draft`). 기존 `Blueprint`는 그대로. 수치는 2018 이후 통계에서만 가져오고 `sourceStats`에 출처를, 통계로 못 정하는 것(requiredSkills, 정답 근거 서술, 함정 id 연결)은 `pending`에 적었다.
- 함정 정의 초안 `content/drafts/traps.json`(6개, 14-4 정의 + 2018 이후 비율). `content/traps.json`은 보호 파일이라 사람이 승인해야 옮긴다.
- 확인할 점: 빈칸 역할 "other"가 약 34%(분류 부족 가능성), 함정 "no_textual_basis"가 43%(AI 과다 사용 가능성). 표본 검수에서 특히 볼 것.

## 남은 일

- [ ] 사람 표본 검수: `corpus/tagged/review.csv`의 correct 열 → `npm run tag:review -- score` → 정확도 낮은 유형 재태깅 → `analyze:tags`, `blueprints:draft` 재실행.
- [ ] 초안 → 최종 Blueprint: traps.json·skills.json 승인 후 requiredSkills·answerBasis를 채워 `content/blueprints/`로.
- [ ] 확정 함정 유형을 `content/traps.json`에 추가: 이 파일은 승인본 보호 대상이라 훅이 막는다. 초안은 `content/drafts/`에 두고 사람이 검수 화면으로 승인한다.
- [ ] `blankRole`이 4문항 중 2개 `other`. 빈칸 위치 분류(주제문·결론·중간 재진술)가 부족한지 전체 결과를 보고 판단.
