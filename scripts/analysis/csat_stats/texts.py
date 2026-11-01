"""Turn corpus/structured exams into passage units for counting.

A unit is one passage as a student reads it: a shared long passage (41~42,
43~45) is one unit, and an ordering intro, insertion sentence or summary box is
part of its item's unit.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

_MARKERS = re.compile(r"[①②③④⑤]")
_BLANK = re.compile(r"_{3,}")
_LABEL = re.compile(r"\((?:[A-E]|[a-e])\)")
_POINTS = re.compile(r"\[\s*3\s*점\s*\]")
_SPACES = re.compile(r"[ \t]+")
_HANGUL = re.compile(r"[가-힣]")
_ENGLISH_WORD = re.compile(r"[A-Za-z]{2,}")


@dataclass
class Unit:
    exam_id: str
    year: int
    numbers: tuple[int, ...]
    item_type: str
    text: str
    options: list[str] = field(default_factory=list)
    # Ordering parts and insertion sentences: where reference words and
    # connectives at the start of a segment matter (36~39).
    segments: list[str] = field(default_factory=list)
    paragraphs: int = 1


def clean_passage(raw: str) -> str:
    """Drop option markers, blanks, part labels, [3점] and footnote stars; keep paragraph breaks."""
    text = _POINTS.sub(" ", raw)
    for pattern in (_MARKERS, _BLANK, _LABEL):
        text = pattern.sub(" ", text)
    text = text.replace("*", " ")
    lines = (_SPACES.sub(" ", line).strip() for line in text.split("\n"))
    return "\n".join(line for line in lines if line)


def _english_option(text: str) -> bool:
    return bool(_ENGLISH_WORD.search(text)) and len(_HANGUL.findall(text)) == 0


def _paragraphs(q: dict, order: dict) -> int:
    # Ordering passages break lines inside parts, so count the parts instead.
    if order:
        return len(order)
    return max(1, sum(1 for line in clean_passage(q["passage"]).split("\n") if line))


def units_from_exam(exam: dict) -> list[Unit]:
    units: list[Unit] = []
    groups: dict[str, Unit] = {}
    for q in exam["questions"]:
        options = [o["text"] for o in q["options"] if o.get("kind") == "listed" and _english_option(o["text"])]
        group = q.get("sharedPassageGroup")
        if group and group in groups:
            unit = groups[group]
            unit.numbers += (q["number"],)
            unit.options += options
            continue
        order = q.get("orderParts") or {}
        pieces = [order.get("intro"), q.get("givenSentence"), q["passage"], q.get("summary")]
        segments = [order[k] for k in sorted(order) if k != "intro"]
        if q.get("givenSentence"):
            segments.append(q["givenSentence"])
        unit = Unit(
            exam_id=exam["examId"],
            year=int(exam["year"]),
            numbers=(q["number"],),
            item_type=q["type"],
            text=clean_passage("\n".join(p for p in pieces if p)),
            options=options,
            segments=[clean_passage(s) for s in segments],
            paragraphs=_paragraphs(q, order),
        )
        units.append(unit)
        if group:
            groups[group] = unit
    return units


def load_exams(structured_dir: Path) -> list[dict]:
    """Exams in corpus/structured, ordered by id (the report and fixes/ are skipped)."""
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(structured_dir.glob("[0-9]*_*.json"))]
