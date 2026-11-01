from pathlib import Path

from csat.answers import compare_answers, load_answer_csv, odd_form_page, parse_answer_text
from csat.types import type_by_instruction, type_by_number
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
