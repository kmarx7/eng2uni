AI 초안. 학생용 빌드에 포함하지 않는다.

- `sentences/`, `questions/`, `units/`, `vocabulary/` 의 `{unitId}.json`: 콘텐츠 파이프라인 초안 (reviewStatus draft)
- `records/{unitId}.json`: 초안별 검수 기록(ReviewRecord). 자동 검사 결과, 교차 풀이, 사전 검수, 사유, 승인자
- `levels.json`, `skills.json`, `misconceptions.json`, `traps.json`: 명세에서 옮긴 기초 목록 초안
- 승인은 /admin/review-queue 에서 사람만 한다. 승인되면 content/ 해당 위치로 옮겨진다.
