from pathlib import Path

from csat.answers import compare_answers, load_answer_csv, odd_form_page, parse_answer_text
from csat.types import reading_first, type_by_instruction, type_by_number
from structure_exams import render_report, scan_raw, write_csv_template

FAKE_KEY = """2099학년도 가짜 시험
영어 영역 정답표
( 홀수 ) 형
문항 정답 배점 문항 정답 배점
18 ② 2 30 ⑤ 3
19 ① 2 31 ③ 2
"""


def test_parse_answer_text_reads_number_answer_points():
    assert parse_answer_text(FAKE_KEY) == {18: (2, 2), 30: (5, 3), 19: (1, 2), 31: (3, 2)}


def test_odd_form_page_is_picked():
    even = FAKE_KEY.replace("홀수", "짝수")
    assert odd_form_page([FAKE_KEY, even]) == FAKE_KEY
    assert odd_form_page([even, FAKE_KEY]) == FAKE_KEY
    assert odd_form_page([even, even]) is None
    assert odd_form_page(["no label"]) == "no label"


def write(tmp_path: Path, text: str) -> Path:
    path = tmp_path / "answers.csv"
    path.write_text(text, encoding="utf-8")
    return path


def test_answer_csv_accepts_digits_and_circled_numbers(tmp_path):
    path = write(tmp_path, "examId,number,answer\n2099_csat,18,2\n2099_csat,19,④\n,,\n")
    answers, problems = load_answer_csv(path)
    assert answers == {"2099_csat": {18: 2, 19: 4}}
    assert problems == []


def test_answer_csv_reports_bad_rows_and_header(tmp_path):
    path = write(tmp_path, "examId,number,answer\nbad,18,2\n2099_csat,x,2\n2099_csat,20,12\n2099_csat,21,6\n")
    answers, problems = load_answer_csv(path)
    assert answers == {}
    assert len(problems) == 4
    _, header = load_answer_csv(write(tmp_path, "exam,no,ans\n"))
    assert header and "header" in header[0]


def test_answer_csv_conflicting_duplicate_is_reported(tmp_path):
    _, problems = load_answer_csv(write(tmp_path, "examId,number,answer\n2099_csat,18,2\n2099_csat,18,3\n"))
    assert len(problems) == 1


def test_compare_answers_lists_disagreements_only():
    official = {18: (2, 2), 19: (1, 2), 20: (5, 3)}
    assert compare_answers(official, {18: 2, 19: 3, 45: 1}) == ["19: key=1 csv=3"]


def test_csv_template_is_header_only_and_never_overwritten(tmp_path):
    path = tmp_path / "answers.csv"
    write_csv_template(path)
    assert path.read_text(encoding="utf-8") == "examId,number,answer\n"
    path.write_text("examId,number,answer\n2099_csat,18,1\n", encoding="utf-8")
    write_csv_template(path)
    assert "2099_csat" in path.read_text(encoding="utf-8")


def test_scan_raw_groups_files_and_reports_bad_names(tmp_path):
    for name in ["2099_csat_q.pdf", "2099_csat_a.pdf", "2099_m06_a.json", "answers.csv", "scan 2.pdf", "2099_csat_q.json"]:
        (tmp_path / name).write_bytes(b"")
    (tmp_path / "_unused").mkdir()
    exams, skipped = scan_raw(tmp_path)
    assert sorted(exams) == ["2099_csat", "2099_m06"]
    assert exams["2099_csat"].question.name == "2099_csat_q.pdf"
    assert exams["2099_m06"].answer_json.name == "2099_m06_a.json"
    assert skipped == ["2099_csat_q.json", "scan 2.pdf"]


def test_report_has_no_passage_text():
    q = {
        "number": 18, "type": "purpose", "typeByNumber": "purpose", "typeByInstruction": "purpose",
        "extractionConfidence": "low", "issues": ["options=4"], "answer": 1,
        "passage": "Fake secret passage text",
    }

    class R:
        exam_id = "2099_csat"
        questions = [q]
        notes: list = []
        answer_mismatches = ["18: key=1 csv=2"]

    report = render_report([R()], ["scan 2.pdf"], ["answers.csv line 3: invalid row"])
    assert "Fake secret" not in report
    assert "options=4" in report and "18: key=1 csv=2" in report and "invalid row" in report


def test_type_by_number_and_instruction():
    assert type_by_number(31) == "blank_inference"
    assert type_by_number(17) is None
    assert type_by_instruction("다음 글의 요지로 가장 적절한 것은?", 21) == "gist"
    assert type_by_instruction("밑줄 친 fake가 다음 글에서 의미 하는 바로", 21) == "implication"
    assert type_by_instruction("다음 표의 내용과 일치하지 않는 것은?", 25) == "chart"
    assert type_by_instruction("다음 Fake Day의 내용과 일치하지 않는 것은?", 27) == "notice"
    assert type_by_instruction("Fake에 관한 다음 글의 내용과 일치하지 않는 것은?", 26) == "content_match"
    assert type_by_instruction("밑줄 친 (a)～(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?", 42) == "long_title_vocab"
    assert type_by_instruction("밑줄 친 (a)～(e) 중에서 가리키는 대상이 나머지 넷과 다른 것은?", 30) == "reference"
    assert type_by_instruction("", 18) is None


def test_older_instruction_wordings():
    # Boxed (A)(B)(C) choices, two-blank items, and long-passage detail items.
    assert type_by_instruction("(A), (B), (C)의 각 네모 안에서 문맥에 맞는 낱말로 가장 적절한 것은?", 29) == "contextual_vocab"
    assert type_by_instruction("(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?", 28) == "grammar"
    assert type_by_instruction("다음 글의 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?", 36) == "blank_inference"
    assert type_by_instruction("윗글의 빈칸 (a), (b)에 들어갈 말로 가장 적절한 것은?", 42) == "long_title_vocab"
    assert type_by_instruction("윗글의 내용으로 적절하지 않은 것은?", 45) == "long_narrative"
    assert type_by_instruction("윗글의 Fake에 관한 내용으로 적절하지 않은 것은?", 45) == "long_narrative"


def test_2014_reading_starts_at_23_and_has_no_number_layout():
    assert reading_first(2014) == 23
    assert reading_first(2015) == 18
    assert type_by_number(23, 2014) is None
    assert type_by_number(23, 2015) == "topic"


def test_more_older_wordings():
    assert type_by_instruction("위 글의 Fake에 관한 내용과 일치하지 않는 것은?", 45) == "long_narrative"
    assert type_by_instruction("밑줄 친 (a)～(e) 중에서 문맥상 쓰임이 적절하지 않은 것은?", 42) == "long_title_vocab"
    assert type_by_instruction("밑줄 친 ①～⑤ 중에서 문맥상 쓰임이 적절하지 않은 것은?", 30) == "contextual_vocab"


def test_summary_wins_over_blank_and_long_sets_map_by_number():
    summary = "다음 글의 내용을 한 문장으로 요약하고자 한다. 빈칸 (A), (B)에 들어갈 말로 가장 적절한 것은?"
    assert type_by_instruction(summary, 40) == "summary"
    assert type_by_instruction("윗글의 주제로 가장 적절한 것은?", 41) == "long_title_vocab"
    assert type_by_instruction("(D)에 드러난 Fake의 심경으로 가장 적절한 것은?", 43) == "long_narrative"
