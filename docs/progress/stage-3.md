# 단계 3 진행 기록: 기출 PDF 구조화

브랜치: `feat/corpus-structuring` (`feat/content-schema` 위에서 분기). 마지막 갱신: 2026-11-01.

`/clear` 뒤 이어서 할 때는 이 파일, `docs/CLAUDE_CODE_PROMPTS.md`의 "단계 3", `scripts/analysis/README.md` 순서로 읽는다.

## 현재 상태 요약

- 추출기(`scripts/analysis/`) 완성. 2018~2026 수능 9회분 × 28문항 = 252문항 추출, 정답 252/252 연결, 신뢰도 전부 high, low 0.
- Python 테스트 33개 통과(`uv run pytest -q`, 가짜 2단 페이지만 사용). lint·typecheck·test(79)·validate:content·build 통과.
- **사용자 승인 대기 2건**(아래 "결정 대기"). 승인 전에는 단계 4로 넘어가지 않는다.

## 한 일

1. 정답표 확보: 평가원 기출 게시판(suneung.re.kr, boardID=1500234)에서 2014~2026 공식 영어 정답표 PDF를 내려받음. 2018~2026은 `corpus/raw/{학년도}_csat_a.pdf`, 2014~2017은 `corpus/raw/_pre2018/`.
   - 2025 정답표는 이미지 PDF(텍스트 없음) → 쪽 이미지를 보고 18~45번을 `corpus/raw/2025_csat_a.json`으로 옮겨 적음.
2. 문제지 보충: 없던 2022 수능 홀수형을 같은 게시판에서 받아 `corpus/raw/2022_csat_q.pdf`로 둠.
3. `corpus/raw/` 정리(**사용자 승인 전에 이미 실행함**, 되돌릴 수 있음): 홀수형 문제지를 이름 규칙으로 바꾸고, 중복본·짝수형·듣기 파일은 `_unused/`, 2017 이전은 `_pre2018/`로 옮김. 삭제한 파일 없음. 모든 이동은 `corpus/raw/_unused/MOVES.tsv`(from → to)에 기록.
4. 추출기 구현: 2단 읽기 순서, 머리말·꼬리말 제거, 홀수형 쪽만 읽기, 발문·지문·선택지·배점([3점])·밑줄·빈칸·주어진 문장(상자)·순서 단락 (A)~(D)·요약문 상자·장문 묶음(41~42, 43~45)·각주(11.2pt 이하 글자) 추출, 정답 연결, 신뢰도(high/medium/low)와 사유.
5. 유형은 발문으로 정하고 번호 기준 유형은 `typeByNumber`로 남김. 2018은 번호 배치가 달라(함축 의미 문항 없음, 30번이 지칭 문항) 보고서 "유형 불일치"에 10건 기록.
6. `corpus/raw/answers.csv`(열 `examId,number,answer`) 지원: 정답표와 둘 다 있으면 대조해 불일치를 `REPORT.md`에 기록. 빈 양식(머리글만) 생성됨.
7. `fixes/{examId}.json` 덮어쓰기 구조: 시험마다 빈 파일 생성, 다음 실행 때 반영.

## 결정 대기 (사용자)

1. **파일 이름 변경 승인**: 위 3번의 이동을 그대로 둘지, `MOVES.tsv`로 되돌릴지. 판별 표는 이번 단계 보고 메시지에 있음. 판별이 불확실한 파일:
   - `2025_csat_a.pdf`: 텍스트가 없어 자동 판별 불가. 쪽 이미지로 "2025학년도 / 홀수형 정답표"를 직접 확인함.
   - `_pre2018/2014_csat_q_typeB.pdf`: 2014는 A/B형 시절. 문제지 첫 쪽에서 B형 표시를 자동으로 읽지 못함(원래 파일명 `영어B-홀수형_문제.pdf`와 정답표의 "B형"으로 판단).
   - `_pre2018/2016_csat_q_even.pdf`: 2016은 짝수형 문제지만 있음.
2. **분석 범위**: 2018학년도 이후만 쓸지(현재), 2014~2017도 넣을지. 6·9월 모의평가는 하나도 없음. 평가원 게시판에서 받아 넣을지.

## 남은 일

- [ ] 위 결정 2건 반영. 2014~2017을 넣기로 하면 `_pre2018/`의 파일을 `corpus/raw/`로 옮기고 번호 배치 차이(2014 B형 등)를 확인.
- [ ] 모평을 넣기로 하면 `{학년도}_m06_q.pdf` 등으로 받아 넣고 재실행.
- [ ] 사람 표본 검수: 추출 신뢰도 high는 자동 검사 기준일 뿐이다. 시험마다 몇 문항을 원본 PDF와 대조하는 검수가 아직 없다. 단계 5 표본 검수(`review.csv`)와 함께 해도 됨.
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
