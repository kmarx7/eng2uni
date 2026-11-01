"""Plain data types shared by the layout and question parsers.

Coordinates follow pdfplumber: origin at the top-left, y grows downward.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Char:
    text: str
    x0: float
    x1: float
    top: float
    bottom: float
    size: float
    # Set by layout: which underline group this char sits on, or None.
    underline: int | None = None
    # Synthetic char standing for an empty underline (a blank to fill in).
    blank: bool = False


@dataclass
class Segment:
    """A straight vector line (or a hairline rect)."""

    x0: float
    x1: float
    top: float
    bottom: float

    @property
    def horizontal(self) -> bool:
        return (self.bottom - self.top) < 2 and (self.x1 - self.x0) >= 2

    @property
    def vertical(self) -> bool:
        return (self.x1 - self.x0) < 2 and (self.bottom - self.top) >= 2


@dataclass
class Box:
    col: int
    x0: float
    x1: float
    top: float
    bottom: float

    def contains(self, x: float, y: float) -> bool:
        return self.x0 - 1 <= x <= self.x1 + 1 and self.top - 1 <= y <= self.bottom + 1


@dataclass
class Line:
    page: int
    col: int
    chars: list[Char] = field(default_factory=list)
    box: int | None = None  # index into PageLayout.boxes, page-local

    @property
    def top(self) -> float:
        return min(c.top for c in self.chars)

    @property
    def x0(self) -> float:
        return min(c.x0 for c in self.chars)

    @property
    def max_size(self) -> float:
        return max(c.size for c in self.chars)


@dataclass
class PageInput:
    """Everything the layout step needs from one PDF page."""

    number: int
    width: float
    height: float
    chars: list[Char]
    segments: list[Segment]
