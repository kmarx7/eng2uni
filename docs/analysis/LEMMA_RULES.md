# 표제어(lemma) 정규화와 커버리지 규칙

앱(`lib/engine/coverage.ts`)과 분석 스크립트(`scripts/analysis/csat_stats/lexicon.py`)가 같은 규칙을 쓴다. 두 구현은 같은 사례 파일 `lib/engine/coverage.cases.json`으로 테스트하고, `tests/analysis-files.test.ts`가 실제 빈도표에서 두 쪽의 커버리지 곡선이 같은지 확인한다. 규칙을 바꾸면 사례 파일부터 고친다.

## 1. 단어 토큰

- spaCy(`en_core_web_sm`)가 나눈 토큰 중 글자나 숫자가 하나라도 있고 문장부호가 아닌 것만 단어로 센다.
- 축약형은 spaCy가 나눈 대로 센다. 예시(자체 작성): "don't" → do + n't, n't의 lemma는 not.
- 하이픈 낱말은 spaCy가 나눈 대로 센다(대개 하이픈 앞뒤가 따로 토큰).
- 세지 않는 것: 선택지 번호(①~⑤), 빈칸 밑줄, 단락 표시 (A)~(E)·(a)~(e), [3점], 각주 표시(*), 각주 본문, 선택지.

## 2. 정규화 (`normalizeLemma` / `normalize_lemma`)

1. 유니코드 NFKC 정규화(전각 글자 → 반각).
2. 둥근 작은따옴표(‘ ’ ʼ)를 `'`로.
3. 앞뒤 공백 제거.
4. 소문자로.

lemma 자체는 spaCy가 정한다. 학생이 아는 단어 목록을 넣을 때도 같은 정규화를 거친다.

## 3. 구분(kind)

| kind | 기준 | 커버리지 분모 |
| --- | --- | --- |
| number | 숫자(0~9)가 들어 있는 토큰 | 제외 |
| proper | 품사가 PROPN | 제외 |
| function | 품사가 DET·ADP·AUX·CCONJ·SCONJ·PRON·PART | 포함 |
| content | 나머지 | 포함 |

- 위에서부터 차례로 판정한다.
- 같은 lemma가 기능어와 내용어로 모두 쓰이면(예: be가 조동사와 본동사) 빈도표에서 한 항목으로 합치고, kind는 더 많이 쓰인 쪽이다.
- 고유명사와 숫자는 같은 철자의 내용어와 별도 항목이다.
- 숫자 단어(one, three)는 숫자가 아니라 내용어로 센다.

## 4. 커버리지

```
커버리지 = (아는 lemma에 해당하는 content·function 토큰 수) / (content·function 토큰 수)
```

- 고유명사·숫자를 분모에서 빼는 것은 사용자 결정(2026-11-01)이다. 독해 연구에서 95%·98% 기준을 쓸 때 흔히 쓰는 방식이다.
- 분모가 0이면 0이다.
- 빈도표 `analysis/vocab_frequency.json`의 `totalCount`가 토큰 수다. 앱은 이 표만 있으면 커버리지를 계산할 수 있다.

## 5. 알려진 한계

- 문장 첫머리의 대문자 일반 명사가 PROPN으로 잘못 붙으면 분모에서 빠진다.
- 소형 모델이라 lemma가 가끔 틀린다(드문 불규칙 변화형 등).
- 다의어는 구분하지 않는다. 한 lemma의 모든 뜻을 한 항목으로 센다.
