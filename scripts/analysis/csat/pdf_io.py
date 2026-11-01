"""The only module that touches pdfplumber: converts PDF pages to PageInput."""

from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

from .model import Char, PageInput, Segment


def _page_input(page, number: int) -> PageInput:
    chars = [
        Char(
            text=c["text"],
            x0=float(c["x0"]),
            x1=float(c["x1"]),
            top=float(c["top"]),
            bottom=float(c["bottom"]),
            size=float(c["size"]),
        )
        for c in page.chars
    ]
    segments = [Segment(float(s["x0"]), float(s["x1"]), float(s["top"]), float(s["bottom"])) for s in page.lines]
    # Hairline rects are drawn rules too (the column divider is one).
    for r in page.rects:
        w, h = float(r["x1"]) - float(r["x0"]), float(r["bottom"]) - float(r["top"])
        if w < 2.5 or h < 2.5:
            segments.append(Segment(float(r["x0"]), float(r["x1"]), float(r["top"]), float(r["bottom"])))
    return PageInput(number=number, width=float(page.width), height=float(page.height), chars=chars, segments=segments)


def _header_form(page, header_ratio: float = 0.18) -> str | None:
    head = page.crop((0, 0, page.width, page.height * header_ratio)).extract_text() or ""
    if re.search(r"홀\s*수\s*형", head):
        return "odd"
    if re.search(r"짝\s*수\s*형", head):
        return "even"
    return None


def read_question_pages(path: Path) -> tuple[list[PageInput], list[int]]:
    """Return the odd-form pages of a question paper, plus page numbers skipped as even form."""
    pages: list[PageInput] = []
    skipped: list[int] = []
    with pdfplumber.open(path) as pdf:
        even = False
        for i, page in enumerate(pdf.pages, start=1):
            # Forms are printed one after another, so everything after the
            # first even-form page belongs to the even form.
            even = even or _header_form(page) == "even"
            if even:
                skipped.append(i)
                continue
            pages.append(_page_input(page, i))
    return pages, skipped


def read_page_texts(path: Path) -> list[str]:
    with pdfplumber.open(path) as pdf:
        return [p.extract_text() or "" for p in pdf.pages]
