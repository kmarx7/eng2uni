승인된 콘텐츠(JSON). 직접 작성 금지 — 파이프라인과 사람 검수로만 들어온다.

모든 JSON 파일은 한 종류 항목의 배열이다. 위치가 종류를 정한다.

| 위치 | 종류 |
| --- | --- |
| levels.json, skills.json, misconceptions.json, traps.json | Level, Skill, Misconception, TrapType |
| units/, sentences/, passages/, questions/, vocabulary/, blueprints/ | Unit, AnnotatedSentence, Passage, Question, Vocabulary, Blueprint |

`npm run validate:content`(빌드 전 자동 실행) 검사 범위:
- content/ (drafts·_fixtures 제외): 스키마, id 중복, 정답·오답 태그, span·chunk 범위, 참조 무결성, approved만 허용
- drafts/: 같은 폴더 구조, 스키마만 검사
- _fixtures/<세트>/: 세트 단위로 스키마·무결성 검사, 모든 id에 FIXTURE 필요(approved 검사 제외)
