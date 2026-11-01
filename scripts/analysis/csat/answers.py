"""Read answer keys: the official 정답표 PDF text, or a hand-transcribed JSON sidecar."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

CIRCLED = {"①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5}
# One table cell triple: item number, circled answer, points.
_TRIPLE = re.compile(r"(?<!\d)(\d{1,2})\s+([①②③④⑤])\s+([23])(?!\d)")


def parse_answer_text(text: str) -> dict[int, tuple[int, int]]:
    """Map item number to (answer, points) from the text of one 정답표 page."""
    out: dict[int, tuple[int, int]] = {}
    for m in _TRIPLE.finditer(text):
        number = int(m.group(1))
        if 1 <= number <= 45 and number not in out:
            out[number] = (CIRCLED[m.group(2)], int(m.group(3)))
    return out


def odd_form_page(pages: list[str]) -> str | None:
    """Pick the odd-form (홀수형) page; a single-form key has only one page."""
    for text in pages:
        if re.search(r"홀\s*수", text):
            return text
    return pages[0] if len(pages) == 1 else None


def load_answer_json(path: Path) -> dict[int, tuple[int, int]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {int(k): (int(v["answer"]), int(v["points"])) for k, v in data["answers"].items()}


ANSWER_CSV_HEADER = ["examId", "number", "answer"]


def load_answer_csv(path: Path) -> tuple[dict[str, dict[int, int]], list[str]]:
    """Read answers.csv (examId, number, answer). Returns answers by exam and row problems.

    The answer may be written as 1~5 or as ①~⑤.
    """
    answers: dict[str, dict[int, int]] = {}
    problems: list[str] = []
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or [h.strip() for h in reader.fieldnames] != ANSWER_CSV_HEADER:
            return {}, [f"{path.name}: header must be {','.join(ANSWER_CSV_HEADER)}"]
        for row_no, row in enumerate(reader, start=2):
            exam = (row["examId"] or "").strip()
            number = (row["number"] or "").strip()
            answer = (row["answer"] or "").strip()
            if not exam and not number and not answer:
                continue
            answer = str(CIRCLED.get(answer, answer))
            if not re.fullmatch(r"\d{4}_(csat|m06|m09)", exam) or not number.isdigit() or answer not in {"1", "2", "3", "4", "5"}:
                problems.append(f"{path.name} line {row_no}: invalid row")
                continue
            per_exam = answers.setdefault(exam, {})
            n = int(number)
            if n in per_exam and per_exam[n] != int(answer):
                problems.append(f"{path.name} line {row_no}: {exam} {n} listed twice with different answers")
            per_exam[n] = int(answer)
    return answers, problems


def compare_answers(official: dict[int, tuple[int, int]], manual: dict[int, int]) -> list[str]:
    """List items where the answer key and answers.csv disagree."""
    return [
        f"{n}: key={official[n][0]} csv={manual[n]}"
        for n in sorted(set(official) & set(manual))
        if official[n][0] != manual[n]
    ]
