# 단계 6 진행 기록: 어휘 SRS와 오늘의 학습

브랜치: `feat/vocab-srs` (`feat/item-tagging` 위). 마지막 갱신: 2026-11-02.
계획: `docs/superpowers/plans/2026-11-02-vocab-srs-dashboard.md`.

## 사용자 결정 (2026-11-02)

1. 실제 어휘 CSV가 아직 없다 → 뼈대만 만든다. 화면과 e2e는 `content/_fixtures/valid`의 FIXTURE 단어 12개로 돌린다(`CONTENT_DIR`).
2. 가져온 단어는 `content/drafts/vocabulary/`에 draft로 들어가고, 사람이 승인 명령으로 옮긴다.
3. 발음(TTS)은 나중에. 오디오가 없거나 재생에 실패하면 발음 버튼을 숨긴다.
4. 스키마 변경 2건(계획 승인으로 함께 승인): `Vocabulary.example` 선택 항목, 새 `LocalProgress`.

## 만든 것

| 영역 | 파일 | 내용 |
| --- | --- | --- |
| 스키마 | `lib/schema/progress.ts`, `vocabulary.ts` | `LocalProgress`(schemaVersion 1, 프로필·카드·날짜별 횟수), `DailyMinutes` 15·30·60 |
| SRS | `lib/srs/index.ts` | ts-fsrs 6.0.0 래퍼(fuzz 끔). 숙달 = Review 상태 + 안정도 21일 이상 |
| 저장소 | `lib/repositories/progress.ts` | localStorage 저장. 깨진 데이터는 백업 키에 남기고 새로 시작, 저장 불가면 메모리로 계속 |
| 엔진 | `lib/engine/planToday.ts` | 기한 지난 복습(오래된 순) → 신규 단어(15·30·60분 → 10·15·20개, 시간 예산 50%) |
| 엔진 | `lib/engine/applyGrade.ts` | 평가 1회 반영: 새 단어는 카드 생성·오늘 신규 +1, 기존 카드는 오늘 복습 +1 |
| 엔진 | `lib/engine/cardMode.ts` | 카드 면: 처음 뜻 확인 → 복습 1회 후 예문 빈칸 → 2회 이상 문맥 속 뜻. 예문이 단어를 포함할 때만 |
| 엔진 | `lib/engine/coverage.ts` | 익힌 단어 기준 수능 지문 커버리지. 분석 파일(3MB)은 서버가 목록 단어 가중치로 줄여 보낸다 |
| 콘텐츠 | `lib/content/vocabulary.ts` | approved 단어만, 수능 빈도 순위 → 원래 순서 |
| 가져오기 | `scripts/import-vocab.ts`, `scripts/approve-vocab.ts` | `npm run vocab:import -- --source x --level L0`(오류가 하나라도 있으면 아무것도 쓰지 않음), `npm run vocab:approve -- x`(사람 전용, Claude Code 안에서는 거부) |
| 화면 | `app/(student)/start`, `dashboard`, `vocab`, `vocab/done` | 아래 |

화면:

- `/start`: 닉네임(1~20자), 하루 목표 15·30·60분(새 단어 수 함께 표시), 시작 시 익명 ID(uuid) 발급.
- `/dashboard`: 프로필이 없으면 `/start`로. 복습·새 단어·예상 시간, "오늘 학습 시작" 버튼 하나. 단어가 0개면 "아직 학습할 단어가 없습니다"와 비활성 버튼, 다 했으면 오늘 한 양과 비활성 버튼. 커버리지는 분석 파일이 있을 때만.
- `/vocab`: 카드 → Space/탭으로 공개 → 1~4/탭으로 평가(다시·어려움·보통·쉬움, 버튼마다 다음 복습까지 간격 표시). 공개 전에는 뜻을 DOM에 넣지 않는다. 한 카드는 한 번만 평가된다. 새로고침하면 남은 계획부터.
- `/vocab/done`: 오늘 복습·새 단어 수, 내일까지 복습 예정 수.
- 저장이 안 되는 브라우저에서는 모든 화면에 "진도가 저장되지 않습니다" 안내.

## 테스트

- 단위: `npm run test:coverage` 221개 통과, 전체 라인 커버리지 99.26%(lib/repositories 89.65%).
- e2e: `npm run test:e2e` 12개 통과(모바일·데스크톱 × 6). 시작 → 키보드로 5개 → 새로고침 → 남은 5개 탭 → 완료 "새 단어 10개", 평가 키 연타 시 1회만 기록, 오디오 파일 404면 발음 버튼 없음, 저장소 차단 시 안내와 학습 계속, 단어 0개 대시보드, 가로 넘침 0.
- 단어 0개 화면을 보려고 e2e는 개발 서버를 하나 더 띄운다(:3092, `NEXT_DIST_DIR=.next-e2e-empty`). Next.js가 처음 실행 때 `tsconfig.json` include에 그 폴더를 추가했고, 그 상태로 커밋했다.

## 하지 않은 것

- 실제 어휘 목록: CSV가 오면 `vocab:import` → 검수 → 사람이 `vocab:approve`. 그 전까지 운영 빌드의 대시보드는 "아직 학습할 단어가 없습니다"를 보인다.
- 발음 오디오: TTS 공급자 비교표(비용·음질·라이선스·상업적 이용)를 먼저 제안하고 승인받는다. `scripts/generate-audio.ts`는 그 뒤.
- 강조색: `app/tokens.css`는 단계 6에서 정하기로 했지만 브랜드 색은 사용자 결정이라 중립(검정) 그대로 두었다.
- 오늘 계획의 단원 칸: 단원이 생기는 단계 7에서.
- 익명 이벤트 수집(`card_review` 등): 계획 범위 밖.

## 남은 일

1. 어휘 CSV 받기 → 가져오기·검수·승인.
2. TTS 비교표와 승인.
3. 신규 단어 수·카드 면 전환 기준(복습 1회/2회)·시간 가정(복습 10초, 신규 30초)을 시범 사용 데이터로 조정.
4. 단계 5에서 넘어온 사람 검수: `corpus/tagged/review.csv`, 함정·skill 초안 승인.
