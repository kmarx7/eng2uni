"""Turn the chars and vector lines of one two-column exam page into ordered text lines.

Steps: find the column divider and the header/footer bands, find drawn boxes,
attach underlines to the chars above them (or record an empty underline as a
blank), then cluster chars into lines and return them left column first.
"""

from __future__ import annotations

from dataclasses import dataclass

from .model import Box, Char, Line, PageInput, Segment

# Chars whose tops differ by at most this many points share a line. Korean and
# English runs on one printed line sit 1-2pt apart because of font metrics.
LINE_TOLERANCE = 3.0
# A drawn underline sits this close below the baseline of the text it marks.
UNDERLINE_REACH = 6.0
BLANK_TEXT = "_____"
FOOTER_SLACK = 12.0
# Rules this close to a full column width are separators, not underlines.
FULL_COLUMN_RATIO = 0.9


@dataclass
class Frame:
    split_x: float
    header_y: float
    footer_y: float


def find_frame(page: PageInput) -> Frame:
    """Locate the column divider and the header/footer bands."""
    divider = None
    for s in page.segments:
        if s.vertical and (s.bottom - s.top) > page.height * 0.5 and 0.4 * page.width < s.x0 < 0.6 * page.width:
            divider = s
            break
    header_y = page.height * 0.12
    for s in page.segments:
        if s.horizontal and (s.x1 - s.x0) > page.width * 0.7 and s.top < page.height * 0.25:
            header_y = s.top
            break
    split_x = (divider.x0 + divider.x1) / 2 if divider else page.width / 2
    # The last text line can hang a few points below the divider's end; the
    # page-number box starts well below that.
    footer_y = divider.bottom + FOOTER_SLACK if divider else page.height * 0.92
    return Frame(split_x=split_x, header_y=header_y, footer_y=footer_y)


def column_width(page: PageInput, frame: Frame) -> float:
    left = min((c.x0 for c in page.chars if c.top > frame.header_y), default=0.0)
    return frame.split_x - left


def column_of(x: float, frame: Frame) -> int:
    return 0 if x < frame.split_x else 1


def find_boxes(segments: list[Segment], frame: Frame) -> tuple[list[Box], set[int]]:
    """Find rectangles drawn as a left edge plus top and bottom edges.

    Returns the boxes and the indexes of the horizontal segments used as edges.
    """
    horizontals = [(i, s) for i, s in enumerate(segments) if s.horizontal and s.top > frame.header_y + 1]
    boxes: list[Box] = []
    edges: set[int] = set()
    for v in segments:
        if not v.vertical or (v.bottom - v.top) < 10 or abs(v.x0 - frame.split_x) < 3:
            continue
        if v.top < frame.header_y or v.bottom > frame.footer_y:
            continue
        top = [(i, h) for i, h in horizontals if abs(h.top - v.top) < 2 and h.x0 - 2 <= v.x0 <= h.x1 + 2]
        bottom = [(i, h) for i, h in horizontals if abs(h.top - v.bottom) < 2 and h.x0 - 2 <= v.x0 <= h.x1 + 2]
        if not top or not bottom:
            continue
        x0 = min(h.x0 for _, h in top + bottom)
        x1 = max(h.x1 for _, h in top + bottom)
        box = Box(col=column_of((x0 + x1) / 2, frame), x0=x0, x1=x1, top=v.top, bottom=v.bottom)
        if not any(abs(b.top - box.top) < 2 and abs(b.x0 - box.x0) < 2 for b in boxes):
            boxes.append(box)
        edges.update(i for i, _ in top + bottom)
    return boxes, edges


def merge_underlines(segments: list[Segment]) -> list[Segment]:
    """Join horizontal pieces that continue each other on the same y."""
    merged: list[Segment] = []
    for s in sorted(segments, key=lambda s: (round(s.top), s.x0)):
        last = merged[-1] if merged else None
        if last and abs(last.top - s.top) < 1.5 and s.x0 - last.x1 < 3:
            merged[-1] = Segment(last.x0, max(last.x1, s.x1), last.top, max(last.bottom, s.bottom))
        else:
            merged.append(Segment(s.x0, s.x1, s.top, s.bottom))
    return merged


def attach_underlines(chars: list[Char], underlines: list[Segment], frame: Frame) -> list[Char]:
    """Mark chars that sit on an underline; turn empty underlines into blank chars.

    Returns the synthetic blank chars to add to the page.
    """
    blanks: list[Char] = []
    for group, u in enumerate(underlines):
        col = column_of((u.x0 + u.x1) / 2, frame)
        hit = False
        for c in chars:
            if not c.text.strip() or column_of(c.x0, frame) != col:
                continue
            mid = (c.x0 + c.x1) / 2
            if u.x0 - 1 <= mid <= u.x1 + 1 and u.top - UNDERLINE_REACH <= c.bottom <= u.top + 1.5:
                c.underline = group
                hit = True
        if not hit:
            size = 12.0
            blanks.append(Char(BLANK_TEXT, u.x0, u.x1, u.top - size, u.top, size, blank=True))
    return blanks


def cluster_lines(chars: list[Char], page_no: int, col: int) -> list[Line]:
    lines: list[Line] = []
    for c in sorted(chars, key=lambda c: (c.top, c.x0)):
        for line in reversed(lines[-3:]):
            if abs(line.chars[0].top - c.top) <= LINE_TOLERANCE:
                line.chars.append(c)
                break
        else:
            lines.append(Line(page=page_no, col=col, chars=[c]))
    for line in lines:
        line.chars.sort(key=lambda c: c.x0)
    return lines


def _box_of(line: Line, boxes: list[Box], col: int) -> int | None:
    """The box holding most of the line's chars (an item number may sit just outside it)."""
    visible = [c for c in line.chars if not c.text.isspace()]
    for bi, b in enumerate(boxes):
        if b.col != col:
            continue
        inside = sum(1 for c in visible if b.contains((c.x0 + c.x1) / 2, c.top + c.size / 2))
        if visible and inside * 2 > len(visible):
            return bi
    return None


def layout_page(page: PageInput) -> tuple[list[Line], list[Box]]:
    """Return the page's content lines in reading order and its boxes."""
    frame = find_frame(page)
    boxes, edges = find_boxes(page.segments, frame)
    candidates = [
        s
        for i, s in enumerate(page.segments)
        if s.horizontal
        and i not in edges
        and frame.header_y + 1 < s.top < frame.footer_y
        and (s.x1 - s.x0) < column_width(page, frame) * FULL_COLUMN_RATIO
    ]
    content = [c for c in page.chars if frame.header_y < c.top and c.bottom < frame.footer_y]
    blanks = attach_underlines(content, merge_underlines(candidates), frame)
    content = content + blanks

    ordered: list[Line] = []
    for col in (0, 1):
        col_chars = [c for c in content if column_of((c.x0 + c.x1) / 2, frame) == col]
        for line in cluster_lines(col_chars, page.number, col):
            line.box = _box_of(line, boxes, col)
            ordered.append(line)
    return ordered, boxes


def line_text(line: Line) -> str:
    """Rebuild the text of a line, inserting spaces at visible gaps."""
    out: list[str] = []
    prev: Char | None = None
    for c in line.chars:
        if c.text.isspace():
            if out and out[-1] != " ":
                out.append(" ")
            prev = c
            continue
        if prev is not None and not prev.text.isspace():
            gap = c.x0 - prev.x1
            if gap > 0.18 * min(c.size, prev.size) and out and out[-1] != " ":
                out.append(" ")
        out.append(c.text)
        prev = c
    return "".join(out).strip()
