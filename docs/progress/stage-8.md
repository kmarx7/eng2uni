# 단계 8 진행 기록: 콘텐츠 생성·검수 파이프라인

브랜치: `feat/content-pipeline` (`main` 위). 마지막 갱신: 2026-11-03.
설계: `docs/superpowers/specs/2026-11-03-content-pipeline-design.md`. 계획: `docs/superpowers/plans/2026-11-03-content-pipeline.md`.

## 사용자 결정 (2026-11-03)

1. 생성·교차 풀이·사전 검수는 API가 아니라 구독 로그인의 `claude -p`로 돌린다(CLAUDE.md 예외 추가). 생성 기본 모델은 opus, 교차 풀이는 sonnet.
2. 검수는 사용자가 노트북에서 직접 한다. 시간을 줄이기 위해 AI 사전 검수를 붙이고, 모든 관문을 통과한 "깨끗한 묶음"은 표본(최소 3개 또는 20%)을 모두 열어 본 뒤 일괄 승인한다.
3. 기초 목록(skill·오개념·함정·단계·단원)도 초안으로 만들고 사람이 승인한다.
4. 허용 어휘는 당분간 기출 빈도 상위 2000.
5. 이번 단계에서 실제 생성은 하지 않는다. 명세 승인 후 `--limit 5`로 시험 실행.

## 만든 것

| 영역 | 파일 | 내용 |
| --- | --- | --- |
| 실행기 | `lib/pipeline/claude-cli.ts` | 태깅에서 옮긴 구독 전용 `claude -p` 실행기. API 변수 제거, `--bare` 금지, 구독 로그인 아니면 중단 |
| 스키마 | `lib/schema/spec.ts`, `review-record.ts` | 단원 명세(UnitSpec + 생성 설정 + 기초 목록 초안), 초안별 검수 기록. `content/specs/`와 `drafts/records/`도 `validate:content` 검사 대상 |
| 자동 검사 | `lib/pipeline/checks.ts`, `vocab-range.ts` | 콘텐츠 규칙 전체, 허용 어휘 밖 단어, 오답 오개념 누락, 기출 유사. "깨끗한 항목" 판정 |
| 유사도 | `scripts/analysis/check_text.py`, `lib/pipeline/similarity.ts` | 기출 8-gram 겹침 점수만 출력(원문 출력 없음). 기출이 없으면 "유사도 미검사"로 묶음에서 제외 |
| 생성 | `lib/pipeline/generate.ts`, `prompts.ts`, `draft-store.ts`, `npm run content:generate` | 동형 묶음마다 호출 1번 + 단원 조립 1번. `--dry-run`, `--limit`, 결과 캐시, 다시 실행해도 id 유지 |
| 교차 풀이·사전 검수 | `lib/pipeline/crosscheck.ts`, `npm run content:crosscheck` | 정답·해설·힌트·오개념을 가린 문항을 다른 모델이 풀기, content-reviewer 기준으로 사전 검수. 둘 다 "문제 있음"만 표시할 수 있음 |
| 검수 처리 | `lib/pipeline/review-store.ts` | 승인(문장 먼저, 단원은 모든 항목 승인 후), 수정(스키마·규칙 검사), 폐기, 일괄 승인, 개별 검수로 돌리기. 승인 뒤 콘텐츠 검증이 새 오류를 내면 되돌림 |
| 검수 화면 | `/admin/login`, `/admin/review-queue`, `components/admin/*`, `proxy.ts` | 비밀번호(ADMIN_PASSWORD) 로그인, 개별 검수(A·R·E·J·K), 깨끗한 묶음, 기초 목록, 어휘 탭. 프로덕션은 `proxy.ts`가 404 |
| 어휘 예문 | `lib/pipeline/vocab-examples.ts`, `--vocab L0` | 20단어씩 예문만 생성. 뜻을 바꾸려 하면 "문제 있음". 승인 시 승인된 단어에 예문만 추가 |
| 오류 신고 | `components/question/ReportButton.tsx`, `lib/pipeline/reports.ts`, `npm run content:reports` | `ENABLE_REPORTS=1`일 때만 버튼. 신고는 `data/reports/`에 저장. 명령 실행 시 해당 문항을 학생 화면에서 내리고(retired) 검수 대기로 |

## 판단 (계획과 다르거나 계획이 정하지 않은 것)

- 학생용 콘텐츠에 `retired` 상태를 허용했다(DESIGN 6-3: 폐기 기록은 유지). 화면은 여전히 approved만 읽는다. 신고된 문항을 그 자리에서 내려도 단원 참조가 깨지지 않는다.
- 프로덕션 404는 페이지 안의 `notFound()`만으로는 안 됐다(스트리밍 때문에 200이 먼저 나감). `proxy.ts`로 렌더링 전에 막는다. `next start`로 확인: `/admin/*` 404, `/dashboard` 200.
- 모델 출력이 스키마에 안 맞으면 "호출 실패"로 기록하고 저장하지 않는다. 스키마는 맞지만 콘텐츠 규칙을 어기면 "문제 있음"으로 저장한다.
- 교차 풀이·사전 검수가 실패한 문항은 다음 실행에서 자동으로 다시 부르지 않는다(사용량 절약). 사람이 검수 화면에서 본다.
- 깨끗한 묶음의 표본에 문제가 있으면 "표본에 문제 있음(개별 검수로)" 버튼으로 묶음 전체를 돌린다.
- 전체 판단 목록은 실행 기록(최종 보고)에 있다.

## 테스트

- 단위: `npm run test:coverage` 389개 통과, 전체 라인 95.2%, `lib/pipeline` 91.9%.
- e2e: `npm run test:e2e` 32개 통과(모바일·데스크톱). 검수 화면 4개(비밀번호, 문제 있음 먼저·문장 먼저 승인, 표본을 모두 열어야 일괄 승인, 잘못된 JSON 수정은 저장 안 됨), 학생 오류 신고 1개 추가.
- 프로덕션 빌드에서 `/admin/*` 404 확인. `npm run build` 뒤 `scripts/check-trace.ts`가 서버 번들에 기출·초안·픽스처·명세·신고 파일이 없는지 검사한다.

## 최종 검토 (2026-11-03)

새 맥락의 검토자(가장 좋은 모델)가 브랜치 전체를 봤다. Critical 2, Important 3, Minor 8. Minor 하나는 Important로 올렸다. 모두 실패하는 테스트를 먼저 쓰고 고쳤다.

- 승인한 뒤 생성을 다시 돌리면 승인된 문장·문항·단원이 초안으로 되살아나고 승인 기록이 덮이던 문제 → 묶음 존재와 다음 번호를 승인본과 모든 검수 기록 기준으로 판단, 기록이 있는 기초 목록은 건드리지 않음.
- 학생 서버 번들이 프로젝트 전체(기출 원문 1,217개, 초안, 픽스처)를 끌어오던 문제 → `outputFileTracingExcludes`와 빌드 후 검사(`postbuild`).
- 문장 번호가 범위 밖인 문항이 문장 없이 "검사 통과"되던 문제 → "문장 번호 범위 밖"으로 문제 있음.
- 수정 후 자동 검사가 다시 돌지 않아 문제 있던 항목이 깨끗한 묶음에 들어갈 수 있던 문제 → 수정 시 어휘·오개념 다시 검사, 유사도는 "미검사(수정 후)", 문항은 교차 풀이·사전 검수를 다시 받게. 깨끗한 묶음은 규칙·어휘·오개념도 통과해야 함.
- 신고 한 번으로 바로 문항이 내려가던 문제 → `content:reports`는 먼저 목록만 보여 주고 `--apply`로만 적용.
- 단원 규칙 검사가 단원 오류를 하나도 잡지 못하고(오류 id가 "단원/블록" 형식), 승인된 항목을 없는 것으로 보던 문제 → 둘 다 고침.
- 남긴 Minor: 승인·폐기된 항목에 대한 수정·폐기 거부, 단원 문장 과제에 질문 없는 문장 전달, crosscheck 예상 호출 수, `claude`가 없을 때 오류 메시지, 신고 파일 읽기와 이름 바꾸기 사이 경쟁, 승인 경로의 CLAUDECODE 차단, 관리자 쿠키 만료(P2).

## L0-U05 명세

`content/specs/L0-U05.json` (curriculum-architect 역할로 작성, status specified). 검증 통과, 예상 호출 5회(묶음 4개 + 단원 1).

- 묶음: 주어 찾기 8문항, 동사 찾기 8문항, 목적어 찾기(태깅용 문장) 6문항, 어순(문장 조립, 참/거짓) 6문항. 모두 28문항.
- 기초 목록 초안: skill 4개(주어·동사·목적어 찾기, 어순), 오개념 6개, 단계 L0("영어의 시작").
- 미검증 9개는 명세의 `unverified`에 있다. 생성 전에 사람이 정하면 좋은 것: 허용 어휘 상한(빈도 2000 vs 설계 3-3의 L0 400개), "3~5단어 문장" 제한을 생성에 반영할지.

## 하지 않은 것

- 실제 생성 실행(명세 승인 후 `--limit 5`로 시험).
- 신고 자동 처리(단계 9 Supabase 이벤트).
- 정식 관리자 인증(P2).
- 지문형 독해 문항 생성(L2 이후).

## 남은 일

1. L0-U05 명세 검토·승인 → `npm run content:generate -- --spec L0-U05 --limit 5`로 시험 실행, 구독 사용량과 검수 시간 측정.
2. 승인된 어휘 목록이 생기면 명세의 허용 어휘를 빈도 순위에서 어휘 목록으로 바꾸기.
3. 단계 7에서 넘어온 결정: 판정 보류 때 다음 단원 열기, 개념 복습 답 저장.
