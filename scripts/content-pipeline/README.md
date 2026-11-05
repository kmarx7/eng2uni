콘텐츠 생성·자동 검증·교차 풀이 스크립트 (단계 8).

모든 모델 호출은 claude.ai 구독 로그인의 `claude -p`로 한다(API 키 사용 안 함, CLAUDE.md 2026-11-03 예외).
모델: CLAUDE_CONTENT_MODEL(기본 opus, 생성·사전 검수), CLAUDE_CROSSCHECK_MODEL(기본 sonnet, 교차 풀이).

순서:
1. 명세 `content/specs/{unitId}.json` (curriculum-architect 작성, 사람 검토)
2. `npm run content:generate -- --spec L0-U05 --dry-run` → 예상 호출 수 확인
3. `npm run content:generate -- --spec L0-U05 [--limit N]` → content/drafts/ 에 문장·문항·단원·기초 목록 초안과 검수 기록
4. `npm run content:crosscheck -- --unit L0-U05 [--dry-run|--limit N]` → 교차 풀이(정답 가림) + 사전 검수
5. `npm run content:revise -- --unit L0-U05 [--dry-run|--limit N|--rounds 2]` → 사전 검수·교차 풀이·자동 검사에서 지적된 문항을 생성 모델이 고치고(문항 버전 +1, 최대 2회), 교차 풀이·사전 검수를 다시 받음. 그래도 남는 것만 사람이 봄
6. `ADMIN_PASSWORD=… REVIEWER_NAME=… npm run dev` → http://localhost:3000/admin/review-queue 에서 사람이 승인·수정·폐기
   (기초 목록 → 문장 → 문항 → 단원 순서로 승인. 깨끗한 묶음은 표본을 모두 열어 본 뒤 일괄 승인)
7. 어휘 예문: `npm run content:generate -- --vocab L0 [--dry-run|--limit N]` → 검수 화면 "어휘" 탭
8. 학생 신고(`ENABLE_REPORTS=1`일 때만 버튼 표시): `npm run content:reports`로 목록 확인 → `npm run content:reports -- --apply`로 신고 문항을 학생 화면에서 내리고 검수 대기로

같은 호출 결과는 `.cache/content-pipeline/`에 캐시되어 다시 실행해도 호출하지 않는다.
어떤 스크립트도 approved로 바꾸지 않는다. 승인은 검수 화면에서 사람만 한다.
