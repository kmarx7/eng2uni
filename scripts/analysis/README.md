# 기출 분석 스크립트 (단계 3~)

`corpus/`(비공개, git 제외)의 평가원 기출 PDF를 읽어 분석용 JSON을 만든다. 결과도 `corpus/` 안에만 둔다.

## 왜 Python인가

PDF의 글자 좌표·크기와 밑줄·상자 같은 벡터 선을 함께 읽어야 2단 편집, 밑줄 선택지, 빈칸, 주어진 문장 상자를 구분할 수 있다. `pdfplumber`가 이 정보를 가장 안정적으로 준다. 환경은 `uv`로 관리한다(`pyproject.toml`, `uv.lock`).

## 실행

```bash
cd scripts/analysis
uv run python structure_exams.py            # 모든 시험
uv run python structure_exams.py --exam 2026_csat
uv run pytest -q                            # 테스트(가짜 2단 페이지만 사용)
```

## 입력 규칙 (`corpus/raw/`)

| 파일 | 뜻 |
| --- | --- |
| `{학년도}_{csat|m06|m09}_q.pdf` | 문제지. 홀수형 쪽만 읽고, 첫 짝수형 쪽부터는 건너뛴다 |
| `{학년도}_{csat|m06|m09}_a.pdf` | 평가원 정답표. 홀수형 쪽을 읽는다 |
| `{학년도}_{csat|m06|m09}_a.json` | 텍스트가 없는 정답표 PDF를 손으로 옮긴 것(예: 2025) |
| `answers.csv` | 직접 입력하는 정답. 열: `examId,number,answer`(answer는 1~5 또는 ①~⑤) |

규칙에 맞지 않는 파일과 하위 폴더(`_unused/`)는 읽지 않는다. 2014학년도(A/B형)는 B형을 쓴다. 정답 우선순위는 정답표 PDF → JSON → `answers.csv`이고, 정답표와 CSV가 둘 다 있으면 대조해 불일치를 보고서에 적는다. CSV만 있는 문항은 배점(answerPoints)이 비어 있다.

## 출력 (`corpus/structured/`)

- `{examId}.json`: 18~45번 문항. 2014학년도는 듣기·말하기가 1~22번이어서 23~45번만 읽고 `typeByNumber`는 비운다. 주요 필드: `type`(발문 기준, `lib/schema/common.ts`의 ReadingType과 같은 이름. 예외로 2018 30번 같은 단일 지문 지칭 문항은 `reference`. 41~42번은 `long_title_vocab`, 43~45번은 `long_narrative`로 번호가 정한다), `typeByNumber`, `instruction`, `passage`, `options[{label,text,kind}]`, `points`, `answer`, `answerPoints`, `underlines[{text,start,end}]`, `blanks[{in,start,label}]`, `givenSentence`, `orderParts`, `summary`, `sharedPassageGroup`, `footnotes`, `extractionConfidence`, `issues`.
  - `start`/`end`는 `passage`(또는 `summary`) 문자열 안의 위치다.
  - 빈칸은 그려진 빈 밑줄과 글자로 친 밑줄(`____` 4자 이상) 둘 다 찾는다.
  - 네모 선택형 어법·낱말 문항("각 네모 안에서")은 선택지가 지문 아래 목록이고 밑줄이 없다.
  - 복수 정답 문항은 `answer`를 비우고 `fixes/`에 `acceptedAnswers`를 적는다(예: 2015 수능 25번 ④·⑤).
  - `options.kind`: `listed`(지문 아래 목록), `underlined`(지문 속 밑줄), `position`(삽입 위치), `inline`(지문 속 문장).
- `REPORT.md`: 시험별 문항 수·신뢰도·정답 연결, low/medium 목록, 번호 기준과 발문 기준 유형 불일치, CSV 대조 결과. 원문 문장은 넣지 않는다.
- `fixes/{examId}.json`: 직접 고칠 내용. `{"questions": {"29": {"options": [...], "extractionConfidence": "high"}}}`처럼 문항 번호별로 덮어쓸 필드를 적으면 다음 실행 때 반영된다. `_`로 시작하는 키는 무시한다.

## 구조

| 모듈 | 역할 |
| --- | --- |
| `csat/pdf_io.py` | pdfplumber를 쓰는 유일한 곳. 쪽을 `PageInput`(글자·선)으로 바꾼다 |
| `csat/layout.py` | 단 구분, 머리말·꼬리말 제거, 상자 찾기, 밑줄·빈칸 표시, 줄 묶기 |
| `csat/questions.py` | 줄 → 문항 분리, 발문·지문·선택지·각주·[3점] 추출, 신뢰도 평가 |
| `csat/answers.py` | 정답표 텍스트, JSON, `answers.csv` 읽기와 대조 |
| `csat/types.py` | 번호별 유형(설계서 14-2)과 발문 키워드 |

## 원문 취급

- 원문은 `corpus/` 밖으로 나가지 않는다. 테스트(`tests/`)는 `fake_page.py`로 만든 가짜 글자만 쓴다.
- 디버깅으로 구조를 볼 때도 영어 단어를 가린 출력만 쓴다.

## 단계 4: 기출 통계 (`analyze_corpus.py`, `check_leaks.py`)

```bash
npm run analyze        # 저장소 루트에서: 통계 → 유출 검사 → 스키마 검증
```

- 입력: `corpus/structured/`. 출력: `analysis/vocab_frequency.json`, `syntax_stats.json`, `passage_stats.json`, `docs/analysis/REPORT.md`. 출력은 커밋한다. 원문 문장은 넣지 않는다.
- spaCy `en_core_web_sm`(uv 환경에 고정). 표제어·커버리지 규칙은 `docs/analysis/LEMMA_RULES.md`. 앱의 `lib/engine/coverage.ts`와 같은 사례 파일로 테스트한다.
- 범위: 전체(`all`)와 2018학년도 이후(`since2018`)를 따로 낸다.
- `check_leaks.py`: `analysis/*.json`, `docs/analysis/*.md`가 기출과 8단어 이상 연속으로 겹치면 실패한다. 위치와 겹친 개수만 출력하고 원문은 출력하지 않는다.

| 모듈 | 역할 |
| --- | --- |
| `csat_stats/texts.py` | 구조화 JSON → 지문 단위(장문 묶음은 한 번), 표시 기호 제거 |
| `csat_stats/lexicon.py` | lemma 정규화, kind, 커버리지 |
| `csat_stats/syntax.py` | 절 수·깊이·구문 판정 규칙 |
| `csat_stats/passages.py` | 문단, 담화 표지어, 36~39 단서 |
| `csat_stats/summary.py` | 분포·히스토그램 |
| `csat_stats/report.py` | REPORT.md |
| `csat_stats/leak.py` | 8-gram 유출 검사 |
