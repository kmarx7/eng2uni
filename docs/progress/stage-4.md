# 단계 4 진행 기록: 기출 통계 분석

브랜치: `feat/corpus-stats` (`feat/corpus-full-scope` 위). 마지막 갱신: 2026-11-01.

`/clear` 뒤 이어서 할 때는 이 파일, `docs/analysis/REPORT.md`, `scripts/analysis/README.md` 순서로 읽는다.

## 사용자 결정 (2026-11-01)

- 의존성: spaCy 3.8 + `en_core_web_sm` 3.8.0을 Python 분석 환경(`scripts/analysis`, uv)에만 추가. 앱 번들에는 들어가지 않는다.
- 범위: 전체 41회와 2018학년도 이후 29회를 따로 계산.
- 커버리지: 고유명사·숫자는 분모에서 제외.

## 한 일

1. `analysis/vocab_frequency.json`: lemma, kind(content·function·proper·number), pos, totalCount, examCount, itemTypes, inAnswerOptions, 2018 이후 수치, 커버리지 곡선.
2. 커버리지: `lib/engine/coverage.ts`(앱)와 `csat_stats/lexicon.py`(분석)가 같은 규칙을 쓴다. 공유 사례 `lib/engine/coverage.cases.json`, 규칙 문서 `docs/analysis/LEMMA_RULES.md`. 실제 빈도표에서도 두 구현의 곡선이 같은지 `tests/analysis-files.test.ts`가 확인한다.
3. `analysis/syntax_stats.json`: 유형별 문장 길이 분포, 문장당 절 수, 절 중첩 깊이 분포, 관계절·분사구·to부정사·명사절·도치 빈도.
4. `analysis/passage_stats.json`: 유형별 지문 단어 수·문단 수, 담화 표지어, 36~39번 지시어·관사·연결어(전체와 구간 시작).
5. `docs/analysis/REPORT.md`: 스크립트가 생성. 예문은 "예시(자체 작성)"만 쓴다.
6. Zod 스키마 `lib/schema/analysis.ts`, 검증 `scripts/validate-analysis.ts`.
7. `npm run analyze` = 통계(`analyze:stats`) → 유출 검사(`analyze:leaks`) → 스키마 검증(`validate:analysis`).
8. 유출 검사 `check_leaks.py`: 기출과 8-gram 이상 겹치면 실패. 결과: 5개 파일, 0건.

## 단계 3 추출기 버그 수정 (이번에 발견)

- 지칭 문항(가리키는 대상) 16개 중 5개(2014 수능 26, 2015 6월 29, 2017 수능 30, 2018 6월·9월 30)의 지문이 잘려 있었다. 지문 줄이 "①"로 시작하면 선택지 목록으로 읽었기 때문이다. 신뢰도는 high로 나와 단계 3 보고에서 놓쳤다.
- `reference`를 지문 속 선택지 유형(INLINE_OPTION_TYPES)과 밑줄 유형에 넣어 고침. 재추출 후 16개 모두 정상 길이, 다른 유형에서 중앙값 60% 미만 지문 없음.

## 결과 요약

- 41회, 지문 1,010개(장문 묶음은 한 번), 단어 토큰 164,863.
- 커버리지(전체): 상위 1,000 lemma 81.5%, 2,000 → 90.0%, 3,000 → 94.0%, 4,000 → 96.2%, 5,000 → 97.6%. 정확한 값은 REPORT.md 1절.
- 절 중첩 깊이(전체 문장): 깊이 1 약 49%, 2 약 38%, 3 약 11%, 4 이상 약 2%.

## 남은 일

- [ ] 사람 표본 검수: 추출(단계 3)과 함께, 구문 판정이 맞는지 문장 몇 개를 직접 확인. 소형 모델이라 절 깊이·구문 빈도는 근사치다.
- [ ] research-content의 결과 해석(`docs/research/`): 프로젝트 에이전트가 이 세션에서 로드되지 않아 못 함(stage-1a.md 참고).
- [ ] 다의어 여부(14-3 표)는 계산하지 않음. 단계 5 태깅이나 별도 작업으로.
- [ ] 단계 5(AI 태깅·블루프린트): `.env.local`에 API 키·모델 필요, 외부 API 비용이 드는 대량 호출이라 사용자 승인 필요.
