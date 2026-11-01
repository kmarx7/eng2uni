# 단계 3 진행 기록: 기출 PDF 구조화

브랜치: `feat/corpus-structuring` (`feat/content-schema` 위에서 분기). 범위 확장은 `feat/corpus-full-scope`(`feat/agent-workflow` 위). 마지막 갱신: 2026-11-01.

`/clear` 뒤 이어서 할 때는 이 파일, `docs/CLAUDE_CODE_PROMPTS.md`의 "단계 3", `scripts/analysis/README.md` 순서로 읽는다.

## 현재 상태 요약

- **분석 범위 확장(2026-11-01, `feat/corpus-full-scope`)**: 2014~2026 수능 13회 + 2014~2027 6·9월 모의평가 28회 = 41회분, 1,133문항(2014 3회 × 23 + 38회 × 28).
  - 정답 연결 1,132/1,133. 빠진 1개는 2015 수능 25번 복수 정답(④·⑤, `fixes/2015_csat.json`의 `acceptedAnswers`).
  - 신뢰도 high 1,132, medium 1(같은 문항, "no answer"), low 0.
- Python 테스트 40개 통과(`uv run pytest -q`, 가짜 2단 페이지만 사용).
- 결정 2건은 아래 "결정 기록"으로 정리됨. 남은 일은 사람 표본 검수와 단계 4.

## 한 일

1. 정답표 확보: 평가원 기출 게시판(suneung.re.kr, boardID=1500234)에서 2014~2026 공식 영어 정답표 PDF를 내려받음. 2018~2026은 `corpus/raw/{학년도}_csat_a.pdf`, 2014~2017은 `corpus/raw/_pre2018/`.
   - 2025 정답표는 이미지 PDF(텍스트 없음) → 쪽 이미지를 보고 18~45번을 `corpus/raw/2025_csat_a.json`으로 옮겨 적음.
2. 문제지 보충: 없던 2022 수능 홀수형을 같은 게시판에서 받아 `corpus/raw/2022_csat_q.pdf`로 둠.
3. `corpus/raw/` 정리(**사용자 승인 전에 이미 실행함**, 되돌릴 수 있음): 홀수형 문제지를 이름 규칙으로 바꾸고, 중복본·짝수형·듣기 파일은 `_unused/`, 2017 이전은 `_pre2018/`로 옮김. 삭제한 파일 없음. 모든 이동은 `corpus/raw/_unused/MOVES.tsv`(from → to)에 기록.
4. 추출기 구현: 2단 읽기 순서, 머리말·꼬리말 제거, 홀수형 쪽만 읽기, 발문·지문·선택지·배점([3점])·밑줄·빈칸·주어진 문장(상자)·순서 단락 (A)~(D)·요약문 상자·장문 묶음(41~42, 43~45)·각주(11.2pt 이하 글자) 추출, 정답 연결, 신뢰도(high/medium/low)와 사유.
5. 유형은 발문으로 정하고 번호 기준 유형은 `typeByNumber`로 남김. 2018은 번호 배치가 달라(함축 의미 문항 없음, 30번이 지칭 문항) 보고서 "유형 불일치"에 10건 기록.
6. `corpus/raw/answers.csv`(열 `examId,number,answer`) 지원: 정답표와 둘 다 있으면 대조해 불일치를 `REPORT.md`에 기록. 빈 양식(머리글만) 생성됨.
7. `fixes/{examId}.json` 덮어쓰기 구조: 시험마다 빈 파일 생성, 다음 실행 때 반영.

## 결정 기록

- 2026-11-01 사용자: "분석범위는 모든 데이터를 다 분석해줘. 모의평가 추가로 포함해줘."
  - 2014~2017 수능을 `_pre2018/`에서 `corpus/raw/`로 옮겨 넣음. 파일 이름 변경은 그대로 유지(되돌리지 않음).
  - 6·9월 모의평가: 평가원 "수능 모의평가" 게시판(boardID=1500236)에서 2014~2027학년도 영어 문제지·정답표 56개를 받음. 듣기 파일은 받지 않음. 2014는 B형(2014 수능 파일과 같은 형).
  - 2016 수능은 짝수형만 있었음 → 같은 게시판에서 홀수형을 받아 `2016_csat_q.pdf`로 두고 짝수형은 `_unused/`로.
  - 이동·다운로드는 모두 `corpus/raw/_unused/MOVES.tsv`에 덧붙임. 삭제한 파일 없음. `_pre2018/`은 이제 비어 있음.
  - 2014 이전(외국어 영역, 2013학년도 이전)은 넣지 않음. 시험 체계가 달라 이번 범위에서 뺌.

### 추출기 변경 (범위 확장 때문에)

- 2014학년도: 듣기·말하기가 1~22번 → 읽기 23~45번만 추출, 번호 기준 유형 없음.
- 옛 발문 형식 인식: 네모 선택형 어법·낱말("각 네모 안에서"), "문맥상 쓰임", 빈칸 (A)·(B), "위 글의 …내용과 일치".
- 41~42번은 `long_title_vocab`, 43~45번은 `long_narrative`로 번호가 정함(발문이 주제·심경·빈칸이어도).
- 요약문(40번) 발문의 "빈칸 (A), (B)"가 빈칸 추론으로 잡히지 않게 요약을 먼저 검사.
- 글자로 친 밑줄 빈칸(`____`) 인식(2022 9월 31번).
- 네모 선택형은 선택지를 지문 아래 목록에서 읽고 밑줄 검사를 하지 않음.
- 보고서 유형 불일치 목록에서 번호 기준이 없는 2014는 제외. 남은 불일치 134건은 2019 이전 번호 배치 차이(함축 의미 문항 없음 등)로 발문 기준을 따름.

## 이전 결정 대기 (해결됨)

1. **파일 이름 변경 승인**: 위 3번의 이동을 그대로 둘지, `MOVES.tsv`로 되돌릴지. 판별 표는 이번 단계 보고 메시지에 있음. 판별이 불확실한 파일:
   - `2025_csat_a.pdf`: 텍스트가 없어 자동 판별 불가. 쪽 이미지로 "2025학년도 / 홀수형 정답표"를 직접 확인함.
   - `_pre2018/2014_csat_q_typeB.pdf`: 2014는 A/B형 시절. 문제지 첫 쪽에서 B형 표시를 자동으로 읽지 못함(원래 파일명 `영어B-홀수형_문제.pdf`와 정답표의 "B형"으로 판단).
   - `_pre2018/2016_csat_q_even.pdf`: 2016은 짝수형 문제지만 있음.
2. **분석 범위**: 2018학년도 이후만 쓸지(현재), 2014~2017도 넣을지. 6·9월 모의평가는 하나도 없음. 평가원 게시판에서 받아 넣을지.

## 남은 일

- [x] 결정 2건 반영(위 "결정 기록").
- [ ] 사람 표본 검수(41회분으로 늘어 더 중요해짐): 추출 신뢰도 high는 자동 검사 기준일 뿐이다. 시험마다 몇 문항을 원본 PDF와 대조하는 검수가 아직 없다. 단계 5 표본 검수(`review.csv`)와 함께 해도 됨.
- [ ] 단계 4(기출 통계 분석) 시작.

## 바꾼 파일 (커밋 대상)

- `scripts/analysis/pyproject.toml`, `uv.lock`: uv 환경(pdfplumber, pytest)
- `scripts/analysis/README.md`: 사용법, 입력·출력 규칙, Python을 쓰는 이유
- `scripts/analysis/structure_exams.py`: CLI(스캔, 정답 연결, CSV 대조, fixes, 보고서)
- `scripts/analysis/csat/`: `model.py`, `pdf_io.py`, `layout.py`, `questions.py`, `answers.py`, `types.py`
- `scripts/analysis/tests/`: `fake_page.py`, `test_layout.py`, `test_questions.py`, `test_answers_and_cli.py`
- `.gitignore`: `.venv/`, `__pycache__/`, `.pytest_cache/`
- `docs/progress/stage-3.md`: 이 파일

## git 밖에서 바뀐 것 (corpus/, 커밋 안 됨)

- `corpus/raw/`: 이름 변경·이동(`_unused/MOVES.tsv`), 정답표 PDF 13개·2022 문제지 다운로드, `2025_csat_a.json`, `answers.csv`(빈 양식)
- `corpus/structured/`: `{examId}.json` 9개, `REPORT.md`, `fixes/` 9개

## 재실행 방법

```bash
cd scripts/analysis
uv run python structure_exams.py   # corpus/structured/ 갱신
uv run pytest -q
```
