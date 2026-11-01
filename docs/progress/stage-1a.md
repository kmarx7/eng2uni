# 단계 1-A 진행 기록: 멀티 에이전트 협업 체계

브랜치: `feat/agent-workflow` (`feat/corpus-structuring` 위). 마지막 갱신: 2026-11-01.

## 끝난 것

- 에이전트 정의: `.claude/agents/curriculum-architect.md`, `research-content.md`(새로), `content-reviewer.md`(추가 항목).
- CLAUDE.md "에이전트 협업" 절, `docs/AGENT_WORKFLOW.md`, `docs/templates/`(unit-spec, review-report), `docs/specifications/DATA_CONTRACT_ADDENDUM.md`.
- 승인본 보호 훅: `scripts/hooks/protect-content-rules.ts`(판정), `protect-content.ts`(stdin → exit 2), `.claude/settings.json` PreToolUse(`Edit|Write|MultiEdit|NotebookEdit|Bash`). 테스트 `tests/protect-content.test.ts` 30개.
- 메인 세션 실측: Write(`content/questions/`)와 Bash(`echo > content/units/`) 모두 차단, 흔적 없음.
- 검사기: `content/specs/`, `content/curriculum/`을 검사 대상에서 제외(`HANDOFF_DIRS`).

## 남은 것 (Claude Code 재시작 후)

이 세션에서는 `.claude/agents/`의 프로젝트 에이전트가 목록에 없었다(기존 content-reviewer 포함). 새 세션에서 다음을 실행한다.

1. 에이전트 목록에 curriculum-architect, research-content, content-reviewer가 보이는지 확인(`/agents`).
2. curriculum-architect: `content/specs/L0-U05.json` 명세 초안 + `content/curriculum/unit-status.json`(L0-U05: specified). 문항은 만들지 않는다.
3. 같은 에이전트가 `content/units/HOOK-TEST-AGENT.json` Write를 한 번 시도해 서브에이전트 호출에도 훅이 걸리는지 확인. 남은 파일이 없는지 확인.
4. content-reviewer: L0-U05 명세 검수 → 메인 세션이 `docs/reviews/L0-U05-{날짜}.md`로 저장.
5. 보고: 만든 파일, 각 에이전트가 한 일, 훅 차단 결과, 미검증 항목, 사용자 승인 사항.
