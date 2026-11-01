"""Stage 3: extract reading items 18~45 from CSAT question papers into JSON.

Reads corpus/raw/{year}_{csat|m06|m09}_{q|a}.pdf (plus an optional
{year}_{kind}_a.json transcription for answer keys without a text layer) and
writes corpus/structured/{examId}.json and corpus/structured/REPORT.md.
Answers can also be typed into corpus/raw/answers.csv (examId,number,answer);
when an answer key file exists too, the two are compared and disagreements are
reported. Manual corrections in corpus/structured/fixes/{examId}.json are
applied on every run.

Usage: uv run python structure_exams.py [--exam 2026_csat] [--raw DIR] [--out DIR]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from csat.answers import (
    ANSWER_CSV_HEADER,
    compare_answers,
    load_answer_csv,
    load_answer_json,
    odd_form_page,
    parse_answer_text,
)
from csat.layout import layout_page
from csat.pdf_io import read_page_texts, read_question_pages
from csat.questions import assess, parse_questions
from csat.types import READING_FIRST, READING_LAST

ROOT = Path(__file__).resolve().parents[2]
FILE_NAME = re.compile(r"^(\d{4})_(csat|m06|m09)_(q|a)\.(pdf|json)$")
ANSWER_CSV = "answers.csv"
FIX_HELP = (
    "Override extracted fields per item number, e.g. "
    '{"29": {"options": [...], "extractionConfidence": "high"}}. '
    "Keys starting with _ are ignored. Applied on every run of structure_exams.py."
)


@dataclass
class ExamFiles:
    exam_id: str
    question: Path | None = None
    answer_pdf: Path | None = None
    answer_json: Path | None = None


@dataclass
class ExamResult:
    exam_id: str
    questions: list[dict] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    answer_mismatches: list[str] = field(default_factory=list)


def scan_raw(raw: Path) -> tuple[dict[str, ExamFiles], list[str]]:
    """Group raw files by exam id; return names that do not follow the naming rule."""
    exams: dict[str, ExamFiles] = {}
    skipped: list[str] = []
    for path in sorted(raw.iterdir()):
        if path.is_dir() or path.name.startswith(".") or path.name == ANSWER_CSV:
            continue
        m = FILE_NAME.match(path.name)
        if not m or (m.group(3) == "q" and m.group(4) == "json"):
            skipped.append(path.name)
            continue
        exam_id = f"{m.group(1)}_{m.group(2)}"
        files = exams.setdefault(exam_id, ExamFiles(exam_id))
        if m.group(3) == "q":
            files.question = path
        elif m.group(4) == "pdf":
            files.answer_pdf = path
        else:
            files.answer_json = path
    return exams, skipped


def load_answers(
    files: ExamFiles, csv_answers: dict[int, int], result: ExamResult
) -> dict[int, tuple[int, int | None]]:
    """Answer key PDF first, then the JSON transcription, then answers.csv.

    answers.csv is compared with whichever key file was used.
    """
    notes = result.notes
    answers: dict[int, tuple[int, int]] = {}
    if files.answer_pdf:
        page = odd_form_page(read_page_texts(files.answer_pdf))
        if page is None:
            notes.append(f"{files.answer_pdf.name}: no odd-form page found")
        else:
            answers = parse_answer_text(page)
            if not answers:
                notes.append(f"{files.answer_pdf.name}: no text layer or no answers parsed")
    if files.answer_json:
        from_json = load_answer_json(files.answer_json)
        reading = [n for n in range(READING_FIRST, READING_LAST + 1)]
        if not all(n in answers for n in reading):
            notes.append(f"answers taken from {files.answer_json.name}")
            answers = {**answers, **from_json}
    if answers and csv_answers:
        result.answer_mismatches = compare_answers(answers, csv_answers)
        notes.append(f"answers.csv checked against key: {len(result.answer_mismatches)} mismatch(es)")
    merged: dict[int, tuple[int, int | None]] = dict(answers)
    filled = [n for n in csv_answers if n not in merged]
    for n in filled:
        merged[n] = (csv_answers[n], None)
    if filled:
        notes.append(f"answers.csv supplied {len(filled)} answer(s) (no points)")
    if not merged:
        notes.append("no answers: add an answer key PDF or rows to answers.csv")
    return merged


def apply_fixes(questions: list[dict], fix_path: Path, notes: list[str]) -> None:
    if not fix_path.exists():
        return
    data = json.loads(fix_path.read_text(encoding="utf-8"))
    by_number = {q["number"]: q for q in questions}
    for key, override in data.get("questions", {}).items():
        if key.startswith("_"):
            continue
        q = by_number.get(int(key))
        if q is None:
            notes.append(f"fixes: item {key} not found in extraction")
            continue
        fields = {k: v for k, v in override.items() if not k.startswith("_")}
        q.update(fields)
        q["fixedFields"] = sorted(fields)


def structure_exam(files: ExamFiles, out_dir: Path, csv_answers: dict[int, int] | None = None) -> ExamResult:
    result = ExamResult(files.exam_id)
    if files.question is None:
        result.notes.append("no question paper")
        return result
    pages, even = read_question_pages(files.question)
    if even:
        result.notes.append(f"skipped even-form pages {even[0]}-{even[-1]}")
    lines = []
    for page in pages:
        page_lines, _ = layout_page(page)
        lines.extend(page_lines)
    questions = parse_questions(lines)
    answers = load_answers(files, csv_answers or {}, result)

    found = {q["number"] for q in questions}
    missing = [n for n in range(READING_FIRST, READING_LAST + 1) if n not in found]
    if missing:
        result.notes.append(f"items not found: {missing}")

    for q in questions:
        q["examId"] = files.exam_id
        if q["number"] in answers:
            q["answer"], q["answerPoints"] = answers[q["number"]]
        else:
            q["answerPoints"] = None

    apply_fixes(questions, out_dir / "fixes" / f"{files.exam_id}.json", result.notes)
    for q in questions:
        if "extractionConfidence" in q.get("fixedFields", []):
            q.setdefault("issues", [])
            continue
        q["extractionConfidence"], q["issues"] = assess(q)
    result.questions = questions
    return result


def write_exam(result: ExamResult, files: ExamFiles, out_dir: Path) -> None:
    year, kind = result.exam_id.split("_")
    doc = {
        "examId": result.exam_id,
        "year": int(year),
        "kind": kind,
        "form": "odd",
        "source": {
            "question": files.question.name if files.question else None,
            "answer": [p.name for p in (files.answer_pdf, files.answer_json) if p],
            "answerMismatches": result.answer_mismatches,
        },
        "notes": result.notes,
        "questions": result.questions,
    }
    (out_dir / f"{result.exam_id}.json").write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fix_path = out_dir / "fixes" / f"{result.exam_id}.json"
    if not fix_path.exists():
        fix_path.write_text(json.dumps({"examId": result.exam_id, "_help": FIX_HELP, "questions": {}}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_csv_template(path: Path) -> None:
    if not path.exists():
        path.write_text(",".join(ANSWER_CSV_HEADER) + "\n", encoding="utf-8")


def render_report(results: list[ExamResult], skipped: list[str], csv_problems: list[str]) -> str:
    """Summary with counts and issue labels only: no passage text."""
    out = ["# 기출 구조화 보고서", "", "`structure_exams.py`가 생성한다. 원문 문장은 넣지 않는다.", ""]
    out += ["| 시험 | 문항 수 | high | medium | low | 정답 연결 | 비고 |", "| --- | --- | --- | --- | --- | --- | --- |"]
    for r in results:
        c = Counter(q["extractionConfidence"] for q in r.questions)
        answered = sum(1 for q in r.questions if q["answer"] is not None)
        note = "; ".join(r.notes) or "-"
        out.append(f"| {r.exam_id} | {len(r.questions)} | {c['high']} | {c['medium']} | {c['low']} | {answered}/{len(r.questions)} | {note} |")
    for level in ("low", "medium"):
        out += ["", f"## {level} 문항", ""]
        rows = [(r.exam_id, q) for r in results for q in r.questions if q["extractionConfidence"] == level]
        if not rows:
            out.append("없음")
            continue
        out += ["| 시험 | 번호 | 유형 | 사유 |", "| --- | --- | --- | --- |"]
        out += [f"| {e} | {q['number']} | {q['type']} | {', '.join(q['issues'])} |" for e, q in rows]
    out += ["", "## 유형 불일치(번호 기준 vs 발문, 발문 기준으로 지정)", ""]
    mismatches = [
        (r.exam_id, q)
        for r in results
        for q in r.questions
        if q["typeByInstruction"] and q["typeByInstruction"] != q["typeByNumber"]
    ]
    out += [f"- {e} {q['number']}번: 번호={q['typeByNumber']}, 발문={q['typeByInstruction']}" for e, q in mismatches] or ["없음"]
    out += ["", "## 정답표와 answers.csv 불일치", ""]
    out += [f"- {r.exam_id} {m}" for r in results for m in r.answer_mismatches] or ["없음"]
    out += ["", "## answers.csv 형식 오류", ""]
    out += [f"- {p}" for p in csv_problems] or ["없음"]
    out += ["", "## 이름 규칙에 맞지 않아 건너뛴 파일", ""]
    out += [f"- {name}" for name in skipped] or ["없음"]
    return "\n".join(out) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--raw", type=Path, default=ROOT / "corpus" / "raw")
    parser.add_argument("--out", type=Path, default=ROOT / "corpus" / "structured")
    parser.add_argument("--exam", action="append", help="only these exam ids, e.g. 2026_csat")
    args = parser.parse_args(argv)

    exams, skipped = scan_raw(args.raw)
    (args.out / "fixes").mkdir(parents=True, exist_ok=True)
    csv_path = args.raw / ANSWER_CSV
    write_csv_template(csv_path)
    csv_answers, csv_problems = load_answer_csv(csv_path)
    for problem in csv_problems:
        print(problem)
    for exam_id in csv_answers:
        exams.setdefault(exam_id, ExamFiles(exam_id))
    results = []
    for exam_id in sorted(exams):
        if args.exam and exam_id not in args.exam:
            continue
        files = exams[exam_id]
        result = structure_exam(files, args.out, csv_answers.get(exam_id))
        write_exam(result, files, args.out)
        results.append(result)
        c = Counter(q["extractionConfidence"] for q in result.questions)
        print(f"{exam_id}: {len(result.questions)} items, high={c['high']} medium={c['medium']} low={c['low']}")
    if not args.exam:
        (args.out / "REPORT.md").write_text(render_report(results, skipped, csv_problems), encoding="utf-8")
    if skipped:
        print(f"skipped {len(skipped)} file(s) not matching the naming rule (see REPORT.md)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
