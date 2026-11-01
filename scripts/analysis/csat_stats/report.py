"""docs/analysis/REPORT.md from the three stats files. Tables of numbers and lemmas only."""

from __future__ import annotations

TYPE_KO = {
    "purpose": "목적", "mood": "심경", "claim": "주장", "implication": "함축 의미", "gist": "요지",
    "topic": "주제", "title": "제목", "chart": "도표", "content_match": "내용 일치", "notice": "안내문",
    "grammar": "어법", "contextual_vocab": "문맥 어휘", "blank_inference": "빈칸 추론",
    "irrelevant_sentence": "무관한 문장", "ordering": "글의 순서", "insertion": "문장 삽입",
    "summary": "요약문", "long_title_vocab": "장문(41~42)", "long_narrative": "장문(43~45)",
    "reference": "지칭(단일 지문)", "all": "전체",
}
TYPE_ORDER = list(TYPE_KO)
CONS_KO = {
    "relativeClause": "관계절", "participlePhrase": "분사구", "toInfinitive": "to부정사",
    "nounClause": "명사절", "inversion": "도치",
}
KIND_KO = {"content": "내용어", "function": "기능어", "proper": "고유명사", "number": "숫자"}
SCOPE_KO = {"all": "전체", "since2018": "2018 이후"}


def _types(by_type: dict) -> list[str]:
    return [t for t in TYPE_ORDER if t in by_type]


def _pct(x: float) -> str:
    return f"{100 * x:.1f}%"


def _hist_pct(hist: list[dict]) -> list[str]:
    total = sum(h["count"] for h in hist) or 1
    return [f"{100 * h['count'] / total:.1f}" for h in hist]


def _lemma_table(rows: list[dict]) -> list[str]:
    out = ["| 순위 | lemma | 품사 | 구분 | 출현 수 | 출현 시험 수 | 선택지 등장 |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for i, e in enumerate(rows, 1):
        out.append(f"| {i} | {e['lemma']} | {e['pos']} | {KIND_KO[e['kind']]} | {e['totalCount']} | {e['examCount']} | {'예' if e['inAnswerOptions'] else ''} |")
    return out


def render_report(vocab: dict, syntax: dict, passages: dict) -> str:
    meta = vocab["meta"]
    out = [
        "# 기출 통계 분석 보고서 (단계 4)",
        "",
        "`npm run analyze`가 만드는 파일이다. 직접 고치지 않는다. 원문 문장은 넣지 않고, 예문이 필요하면 직접 만든 예시를 쓰고 \"예시(자체 작성)\"로 표시한다.",
        "",
        "## 범위와 방법",
        "",
        f"- 시험: 전체 {len(meta['exams'])}회(2014~2027 수능·6·9월 모의평가), 그중 2018학년도 이후 {len(meta['since2018Exams'])}회.",
        f"- 도구: spaCy {meta['spacy']}, 모델 {meta['model']}. 표제어·품사·구문 분석은 모델 결과이며 사람 검수 전이다.",
        "- 단위: 학생이 읽는 지문 하나. 장문(41~42, 43~45)은 묶음당 한 번만 센다. 순서 문항의 주어진 글, 삽입 문항의 주어진 문장, 요약문 상자는 그 지문에 포함한다. 선택지와 각주는 지문에서 뺀다.",
        "- 표제어 정규화와 커버리지 규칙: `docs/analysis/LEMMA_RULES.md`.",
        "",
        "| 범위 | 단어 토큰 | 커버리지 계산 토큰(고유명사·숫자 제외) | lemma 수 |",
        "| --- | --- | --- | --- |",
    ]
    for s in ("all", "since2018"):
        t = vocab["totals"][s]
        out.append(f"| {SCOPE_KO[s]} | {t['tokens']} | {t['countedTokens']} | {t['lemmas']} |")

    out += ["", "## 1. 어휘 커버리지 곡선 (14-5)", "", "빈도 상위 N개 lemma를 알 때 기출 지문 토큰 중 아는 비율.", "",
            "| 상위 N | " + " | ".join(SCOPE_KO[s] for s in ("all", "since2018")) + " |", "| --- | --- | --- |"]
    for i, c in enumerate(vocab["coverageCurve"]["all"]):
        out.append(f"| {c['topN']} | {_pct(c['coverage'])} | {_pct(vocab['coverageCurve']['since2018'][i]['coverage'])} |")

    counted = [e for e in vocab["lemmas"] if e["kind"] in ("content", "function")]
    content = [e for e in vocab["lemmas"] if e["kind"] == "content"]
    out += ["", "## 2. 상위 50개 lemma (전체, 고유명사·숫자 제외)", ""] + _lemma_table(counted[:50])
    out += ["", "## 3. 상위 50개 내용어 lemma (전체)", ""] + _lemma_table(content[:50])

    out += ["", "## 4. 유형별 지문 길이(단어 수)", "", "| 유형 | 지문 수 | 평균 | 중앙값 | 10~90% 범위 | 2018 이후 평균 | 2018 이후 중앙값 | 평균 문단 수 |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    pa, ps = passages["byScope"]["all"], passages["byScope"]["since2018"]
    for t in _types(pa):
        w, w2 = pa[t]["wordCount"], ps.get(t, {}).get("wordCount", {})
        out.append(f"| {TYPE_KO[t]} | {pa[t]['passages']} | {w['mean']} | {w['median']} | {w['p10']}~{w['p90']} | {w2.get('mean', '-')} | {w2.get('median', '-')} | {pa[t]['paragraphs']['mean']} |")

    sa, ss = syntax["byScope"]["all"], syntax["byScope"]["since2018"]
    depth_bins = [h["bin"] for h in sa["all"]["clauseDepthHistogram"]]
    out += ["", "## 5. 구문 복잡도", "",
            "절은 자기 주어가 있는 동사(또는 문장의 중심 동사)로 센다. 절 깊이는 문장 안에서 가장 깊이 안긴 절의 단계이고, 대등하게 이어진 절은 깊이를 늘리지 않는다.",
            "",
            "예시(자체 작성): \"She said that the man who lived next door had moved away.\" → 절 3개(said / moved / lived), 깊이 3.",
            "",
            "### 5-1. 문장당 절 중첩 깊이 분포(문장 비율 %)", "",
            "| 유형 | 문장 수 | " + " | ".join(f"깊이 {b}" for b in depth_bins) + " |",
            "| --- | --- | " + " | ".join("---" for _ in depth_bins) + " |"]
    for t in _types(sa):
        out.append(f"| {TYPE_KO[t]} | {sa[t]['sentences']} | " + " | ".join(_hist_pct(sa[t]["clauseDepthHistogram"])) + " |")
    out.append(f"| 전체(2018 이후) | {ss['all']['sentences']} | " + " | ".join(_hist_pct(ss["all"]["clauseDepthHistogram"])) + " |")

    out += ["", "### 5-2. 문장 길이·절 수·구문 빈도(전체)", "",
            "| 유형 | 평균 문장 길이 | 중앙값 | 90% | 문장당 절 수 | " + " | ".join(f"{CONS_KO[c]}/100문장" for c in CONS_KO) + " |",
            "| --- | --- | --- | --- | --- | " + " | ".join("---" for _ in CONS_KO) + " |"]
    for t in _types(sa):
        x = sa[t]
        out.append(f"| {TYPE_KO[t]} | {x['sentenceLength']['mean']} | {x['sentenceLength']['median']} | {x['sentenceLength']['p90']} | {x['clausesPerSentence']['mean']} | "
                   + " | ".join(str(x["constructions"][c]["per100Sentences"]) for c in CONS_KO) + " |")

    out += ["", "## 6. 담화 표지어(전체 지문, 1,000단어당)", "", "| 표지어 | 횟수 | 1,000단어당 |", "| --- | --- | --- |"]
    for m in pa["all"]["discourseMarkers"][:20]:
        out.append(f"| {m['marker']} | {m['count']} | {m['per1000Words']} |")

    out += ["", "## 7. 글의 순서·문장 삽입(36~39) 단서", "",
            "지시어(this·that·these·those·such), 관사(a·an·the), 연결어. \"구간 시작\"은 순서 문항의 (A)~(C) 각 단락과 삽입 문항의 주어진 문장의 처음 5단어.", "",
            "| 유형 | 범위 | 구간 수 | 지시어/1,000단어 | 관사/1,000단어 | 연결어/1,000단어 | 구간 시작 지시어 | 구간 시작 관사 | 구간 시작 연결어 |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    for s in ("all", "since2018"):
        for t, c in passages["cues"][s].items():
            o, st = c["overall"], c["atSegmentStart"]
            out.append(f"| {TYPE_KO[t]} | {SCOPE_KO[s]} | {c['segments']} | {o['demonstrative']['per1000Words']} | {o['article']['per1000Words']} | {o['connective']['per1000Words']} | "
                       f"{st['demonstrative']['perSegment']} | {st['article']['perSegment']} | {st['connective']['perSegment']} |")

    out += ["", "## 한계", "",
            "- 소형 모델(en_core_web_sm)의 품사·구문 분석이라 절 수·깊이·구문 빈도는 근사치다. 분포 비교용으로 쓰고, 개별 문장 판정에는 쓰지 않는다.",
            "- 도치는 \"조동사·be동사가 자기 주어보다 앞\"(의문문 제외)으로만 잡는다. 장소 부사구 도치(동사 앞 주어 뒤)는 세지 않는다.",
            "- 대화 인용 속 의문문이 문장 끝에 오지 않으면 도치로 잡힐 수 있다. 대화가 많은 장문(43~45)·심경 지문의 도치 수치는 부풀려졌을 수 있다.",
            "- 담화 표지어 rather는 rather than도 함께 센다.",
            "- 문장 첫 대문자 단어가 고유명사로 잘못 붙는 경우가 있다. 이 단어는 커버리지 분모에서 빠진다.",
            "- 안내문·도표 지문은 목록과 표 조각이 많아 문장 나누기가 부정확하다. 문장 길이 통계는 이 두 유형을 따로 보는 것이 낫다.",
            "- 문단 수는 추출기가 들여쓰기로 표시한 줄바꿈을 센다. 들여쓰기가 없는 문단 구분은 놓친다.",
            "- 다의어 여부(14-3 표)는 이 단계에서 계산하지 않았다.",
            ""]
    return "\n".join(out)
