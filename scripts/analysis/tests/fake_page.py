"""Build synthetic two-column exam pages from made-up text (never corpus text).

Geometry mimics the real papers: 842x1191 page, header rule at y=147,
column divider at x=421 from y=147 to y=1067, left text from x=99,
right text from x=448.
"""

from __future__ import annotations

from csat.model import Char, PageInput, Segment

WIDTH, HEIGHT = 842.0, 1191.0
LEFT_X, RIGHT_X = 99.0, 448.0
BODY, INSTR, NUMBER, NOTE = 12.2, 11.5, 13.5, 11.0


def text_chars(x: float, top: float, text: str, size: float = BODY) -> list[Char]:
    """One char per code point, advancing by half the font size."""
    chars = []
    advance = size * 0.5
    for ch in text:
        chars.append(Char(ch, x, x + advance, top, top + size, size))
        x += advance
    return chars


def end_x(x: float, text: str, size: float = BODY) -> float:
    return x + len(text) * size * 0.5


class FakePage:
    def __init__(self, number: int = 1) -> None:
        self.number = number
        self.chars: list[Char] = []
        self.segments: list[Segment] = [
            Segment(88, 754, 147, 147.5),  # header rule
            Segment(421, 422, 147, 1067),  # column divider
        ]
        self.chars += text_chars(95, 116, "홀수형", 20.5)

    def text(self, x: float, top: float, text: str, size: float = BODY) -> FakePage:
        self.chars += text_chars(x, top, text, size)
        return self

    def number_line(self, x: float, top: float, number: int, rest: str = "", size: float = INSTR) -> FakePage:
        label = f"{number}."
        self.chars += text_chars(x - 11, top, label, NUMBER)
        if rest:
            self.chars += text_chars(x + 15, top + 2, rest, size)
        return self

    def underline(self, x0: float, x1: float, baseline: float) -> FakePage:
        self.segments.append(Segment(x0, x1, baseline + 0.7, baseline + 1.2))
        return self

    def box(self, x0: float, x1: float, top: float, bottom: float) -> FakePage:
        self.segments += [
            Segment(x0, x1, top, top + 0.4),
            Segment(x0, x1, bottom, bottom + 0.4),
            Segment(x0, x0 + 0.4, top, bottom),
            Segment(x1, x1 + 0.4, top, bottom),
        ]
        return self

    def build(self) -> PageInput:
        return PageInput(self.number, WIDTH, HEIGHT, list(self.chars), list(self.segments))
