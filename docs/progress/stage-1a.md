# 단계 1-A 진행 기록: 멀티 에이전트 협업 체계

브랜치: `feat/agent-workflow` (`feat/corpus-structuring` 위). 마지막 갱신: 2026-11-01.

## 끝난 것

- 에이전트 정의: `.claude/agents/curriculum-architect.md`, `research-content.md`(새로), `content-reviewer.md`(추가 항목).
- CLAUDE.md "에이전트 협업" 절, `docs/AGENT_WORKFLOW.md`, `docs/templates/`(unit-spec, review-report), `docs/specifications/DATA_CONTRACT_ADDENDUM.md`.
- 승인본 보호 훅: `scripts/hooks/protect-content-rules.ts`(판정), `protect-content.ts`(stdin → exit 2), `.claude/settings.json` PreToolUse(`Edit|Write|MultiEdit|NotebookEdit|Bash`). 테스트 `tests/protect-content.test.ts` 30개.
- 메인 세션 실측: Write(`content/questions/`)와 Bash(`echo > content/units/`) 모두 차단, 흔적 없음.
- 검사기: `content/specs/`, `content/curriculum/`을 검사 대상에서 제외(`HANDOFF_DIRS`).
- 보호 범위 확장(2026-11-01, 사용자 승인): `content/passages/`와 `content/{levels,skills,misconceptions,traps}.json`도 차단. `_fixtures/`·`drafts/` 안의 같은 이름 파일은 허용. 테스트 44개. 메인 세션 실측: Write(`content/skills.json`)와 Bash 리다이렉트(passages 폴더) 모두 차단, 흔적 없음.
- 알려진 오탐: Bash 명령 문자열 검사라서, 명령 안의 문서 텍스트에 "echo … > 보호 경로" 같은 글자가 들어 있어도 막는다(heredoc으로 문서를 고칠 때). 이럴 때는 Edit 도구를 쓴다.

## 남은 것

**2026-11-01 재시작 후에도 막힘.** Claude Code 2.1.316 새 세션에서도 프로젝트 에이전트 3개가 목록에 없고, `Agent(subagent_type: curriculum-architect)` 호출이 "Agent type not found"로 실패했다. 사용자 수준 에이전트(`~/.claude/agents/`)는 보이고 같은 폴더의 `.claude/settings.json` 훅은 동작한다. 에이전트 파일 frontmatter(name·description·tools)는 형식상 문제 없음. 원인 미확인 — 사용자가 `/agents`로 목록을 확인해야 한다. 일반 에이전트로 대신하지 않았다(정의·도구 제한을 시험하는 게 아니므로).

에이전트가 보이게 되면 다음을 실행한다.

1. 에이전트 목록에 curriculum-architect, research-content, content-reviewer가 보이는지 확인(`/agents`).
2. curriculum-architect: `content/specs/L0-U05.json` 명세 초안 + `content/curriculum/unit-status.json`(L0-U05: specified). 문항은 만들지 않는다.
3. 같은 에이전트가 `content/units/HOOK-TEST-AGENT.json` Write를 한 번 시도해 서브에이전트 호출에도 훅이 걸리는지 확인. 남은 파일이 없는지 확인.
4. content-reviewer: L0-U05 명세 검수 → 메인 세션이 `docs/reviews/L0-U05-{날짜}.md`로 저장.
5. 보고: 만든 파일, 각 에이전트가 한 일, 훅 차단 결과, 미검증 항목, 사용자 승인 사항.
