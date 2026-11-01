"""Split ordered page lines into reading questions and pull out their parts.

Input is the line stream from layout.layout_page for every odd-form page, in
reading order. Output is one dict per question numbered 18~45.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .layout import BLANK_TEXT, line_text
from .model import Char, Line
from .types import (
    INLINE_OPTION_TYPES,
    READING_LAST,
    UNDERLINE_TYPES,
    is_boxed_choice,
    reading_first,
    type_by_instruction,
    type_by_number,
)

MARKERS = "①②③④⑤"
HANGUL = re.compile(r"[가-힣]")
GROUP_HEADER = re.compile(r"^\[(\d{1,2})\s*[~～∼\-]\s*(\d{1,2})\]")
THREE_POINTS = "[3점]"
END_OF_PAPER = re.compile(r"^\*\s*확인\s*사항")
# Number tokens ("18.") are set larger than body text.
NUMBER_MIN_SIZE = 13.0
FOOTNOTE_MAX_SIZE = 11.2
ORDER_LABEL = re.compile(r"^\(([A-D])\)\s*")
# A row holding only "(A) (B)" is a column header above the options table.
LABEL_ROW = re.compile(r"^(\([A-D]\)\s*){2,}$")
PRIVATE_USE = re.compile(r"[\ue000-\uf8ff]|[\U000f0000-\U0010ffff]")


@dataclass
class Block:
    kind: str  # "question" | "group"
    number: int = 0
    first: int = 0
    last: int = 0
    lines: list[Line] = field(default_factory=list)


def _number_prefix(line: Line) -> tuple[int, int] | None:
    """If the line starts with a large "NN." token, return (number, chars consumed)."""
    digits = ""
    for i, c in enumerate(line.chars[:4]):
        if c.text.isdigit() and c.size >= NUMBER_MIN_SIZE:
            digits += c.text
        elif c.text == "." and digits and c.size >= NUMBER_MIN_SIZE:
            return int(digits), i + 1
        else:
            return None
    return None


def _strip_chars(line: Line, start: int) -> Line:
    rest = line.chars[start:]
    while rest and rest[0].text.isspace():
        rest = rest[1:]
    return Line(page=line.page, col=line.col, chars=rest, box=line.box)


def _without(lines: list[Line], drop: list[Line]) -> list[Line]:
    ids = {id(l) for l in drop}
    return [l for l in lines if id(l) not in ids]


def split_blocks(lines: list[Line]) -> list[Block]:
    """Cut the line stream at question numbers and [NN~MM] group headers."""
    blocks: list[Block] = []
    current: Block | None = None
    ended = False
    for line in lines:
        text = line_text(line)
        if not text:
            continue
        if END_OF_PAPER.match(text):
            ended = True
        if ended:
            continue
        number = _number_prefix(line)
        group = GROUP_HEADER.match(text)
        if number:
            current = Block(kind="question", number=number[0])
            blocks.append(current)
            rest = _strip_chars(line, number[1])
            if rest.chars:
                current.lines.append(rest)
        elif group:
            current = Block(kind="group", first=int(group.group(1)), last=int(group.group(2)))
            blocks.append(current)
            current.lines.append(line)
        elif current is not None:
            current.lines.append(line)
    return blocks


def _remove_marker(line: Line, marker: str) -> tuple[Line, bool]:
    """Drop the chars spelling `marker` (spaces between them allowed)."""
    visible = [(i, c) for i, c in enumerate(line.chars) if not c.text.isspace()]
    starts: list[int] = []
    joined = ""
    for _, c in visible:
        starts.append(len(joined))
        joined += c.text
    target = marker.replace(" ", "")
    at = joined.find(target)
    if at < 0:
        return line, False
    end = at + len(target)
    drop = {visible[k][0] for k, st in enumerate(starts) if at <= st < end}
    kept = [c for i, c in enumerate(line.chars) if i not in drop]
    return Line(page=line.page, col=line.col, chars=kept, box=line.box), True


class TextBuilder:
    """Concatenates lines into one string while tracking underline and blank offsets."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.length = 0
        self.underlines: dict[tuple[int, int], list[int]] = {}
        self.blanks: list[int] = []

    def _push(self, s: str) -> None:
        self.parts.append(s)
        self.length += len(s)

    def add_line(self, line: Line, separator: str) -> None:
        if self.length and separator:
            last = self.parts[-1] if self.parts else ""
            if separator == " " and last.endswith("-") and len(last) > 1 and last[-2].isalpha():
                separator = ""
            self._push(separator)
        prev: Char | None = None
        for c in line.chars:
            word_start = prev is None or prev.text.isspace() or c.x0 - prev.x1 > 0.18 * c.size
            if word_start and PRIVATE_USE.fullmatch(c.text):
                # Notices use a private-use glyph as the list bullet, sometimes
                # with two bullet items side by side on one line.
                if self.parts and not self.parts[-1].endswith((" ", "\n")) and prev is not None:
                    self._push(" ")
                self._push("•")
                prev = c
                continue
            if c.text.isspace():
                if self.parts and not self.parts[-1].endswith((" ", "\n")):
                    self._push(" ")
                prev = c
                continue
            if prev is not None and not prev.text.isspace():
                if c.x0 - prev.x1 > 0.18 * min(c.size, prev.size) and not self.parts[-1].endswith(" "):
                    self._push(" ")
            if c.blank:
                self.blanks.append(self.length)
            if c.underline is not None:
                key = (line.page, c.underline)
                span = self.underlines.setdefault(key, [self.length, self.length])
                span[1] = self.length + len(c.text)
            self._push(c.text)
            prev = c

    @property
    def text(self) -> str:
        return "".join(self.parts)


def build_text(lines: list[Line]) -> TextBuilder:
    """Join lines; a line indented past its column's left edge starts a paragraph."""
    builder = TextBuilder()
    left: dict[tuple[int, int, int | None], float] = {}
    for line in lines:
        key = (line.page, line.col, line.box)
        left[key] = min(left.get(key, line.x0), line.x0)
    prev_key = None
    for line in lines:
        key = (line.page, line.col, line.box)
        indented = line.x0 - left[key] > 6
        boxed_change = prev_key is not None and prev_key[2] != key[2]
        labelled = ORDER_LABEL.match(line_text(line)) is not None
        builder.add_line(line, "\n" if (indented or boxed_change or labelled) else " ")
        prev_key = key
    return builder


def _clean(text: str) -> str:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    return text.strip()


def _is_decoration(text: str) -> bool:
    """Lone symbols such as the summary arrow."""
    return len(text) <= 2 and not any(ch.isalnum() for ch in text)


def _is_footnote(line: Line, text: str) -> bool:
    """Glossary lines ("*word: 뜻") are set smaller than body text and instructions.

    The asterisks are sometimes raised enough to form a line of their own.
    """
    visible = [c for c in line.chars if not c.text.isspace()]
    if not visible:
        return False
    small = sum(1 for c in visible if c.size <= FOOTNOTE_MAX_SIZE)
    if set(text) <= {"*", " "}:
        return True
    return small / len(visible) > 0.5 and (text.startswith("*") or ":" in text)


def _drop_footnotes(lines: list[Line]) -> tuple[list[Line], list[str]]:
    kept: list[Line] = []
    notes: list[str] = []
    for line in lines:
        text = line_text(line)
        if _is_footnote(line, text):
            if text.strip(" *"):
                notes.append(text)
        else:
            kept.append(line)
    return kept, notes


def _split_on_markers(text: str) -> list[str] | None:
    """Split "① a ② b ..." into five texts, or None when markers are not all there in order."""
    positions = []
    start = 0
    for m in MARKERS:
        at = text.find(m, start)
        if at < 0:
            return None
        positions.append(at)
        start = at + 1
    out = []
    for i, at in enumerate(positions):
        end = positions[i + 1] if i + 1 < len(positions) else len(text)
        out.append(_clean(text[at + 1:end]))
    return out


def _option_block_start(body: list[Line]) -> int | None:
    for i, line in enumerate(body):
        if line.box is None and line_text(line).startswith(MARKERS[0]):
            rest = " ".join(line_text(l) for l in body[i:])
            if _split_on_markers(rest) is not None:
                return i
    return None


def _inline_options(text: str, underlines: list[dict]) -> list[dict]:
    """Options for items whose ①~⑤ sit inside the passage."""
    options = []
    for label, m in enumerate(MARKERS, start=1):
        at = text.find(m)
        if at < 0:
            continue
        after = at + 1
        hit = next((u for u in underlines if 0 <= u["start"] - after <= 3), None)
        if hit:
            options.append({"label": label, "text": hit["text"], "kind": "underlined"})
            continue
        if re.search(r"\(\s*$", text[max(0, at - 3):at]) and re.match(r"\s*\)", text[after:]):
            options.append({"label": label, "text": "", "kind": "position"})
            continue
        nxt = [text.find(n, after) for n in MARKERS if text.find(n, after) >= 0]
        end = min(nxt) if nxt else len(text)
        sentence_end = re.search(r"[.?!][”\"’]?(\s|$)", text[after:end])
        if sentence_end:
            end = after + sentence_end.end()
        options.append({"label": label, "text": _clean(text[after:end]), "kind": "inline"})
    return options


def _box_groups(lines: list[Line]) -> list[list[Line]]:
    groups: list[list[Line]] = []
    last_key = None
    for line in lines:
        if line.box is None:
            last_key = None
            continue
        key = (line.page, line.box)
        if key != last_key:
            groups.append([])
            last_key = key
        groups[-1].append(line)
    return groups


def _order_parts(text: str) -> dict[str, str]:
    parts: dict[str, str] = {}
    for para in text.split("\n"):
        m = ORDER_LABEL.match(para)
        if m:
            parts[m.group(1)] = _clean(para[m.end():])
        elif parts:
            last = sorted(parts)[-1]
            parts[last] = _clean(parts[last] + " " + para)
    return parts


def _marks(builder: TextBuilder, where: str) -> tuple[list[dict], list[dict]]:
    """Return (blanks, underlines) found while building one text.

    A summary blank is printed as an underline with its label "(A)" inside it,
    so an underline covering only a label counts as a labelled blank.
    """
    text = builder.text
    blanks = []
    for at in builder.blanks:
        label = re.search(r"\(([A-B])\)\s*$", text[max(0, at - 6):at])
        blanks.append({"in": where, "start": at, "label": label.group(1) if label else None})
    spans: list[list[int]] = []
    for start, end in sorted(builder.underlines.values()):
        # An underlined phrase that wraps onto the next line is one underline.
        if spans and not text[spans[-1][1]:start].strip():
            spans[-1][1] = end
        else:
            spans.append([start, end])
    underlines = []
    for start, end in spans:
        covered = text[start:end]
        label = re.fullmatch(r"\(([A-C])\)", covered.strip())
        if label:
            blanks.append({"in": where, "start": start, "label": label.group(1)})
        else:
            underlines.append({"text": covered, "start": start, "end": end})
    # Some papers type the blank as underscores instead of drawing a line.
    drawn = [b["start"] for b in blanks]
    for m in re.finditer(r"_{4,}", text):
        if not any(abs(m.start() - at) <= len(BLANK_TEXT) for at in drawn):
            blanks.append({"in": where, "start": m.start(), "label": None})
    blanks.sort(key=lambda b: b["start"])
    return blanks, underlines


@dataclass
class Shared:
    instruction: str = ""
    lines: list[Line] = field(default_factory=list)
    group: str | None = None
    footnotes: list[str] = field(default_factory=list)


def _parse_group(block: Block) -> Shared:
    lines = [l for l in block.lines if not _is_decoration(line_text(l))]
    lines, footnotes = _drop_footnotes(lines)
    head: list[str] = []
    i = 0
    while i < len(lines) and HANGUL.search(line_text(lines[i])) and lines[i].box is None:
        head.append(line_text(lines[i]))
        i += 1
    instruction = GROUP_HEADER.sub("", " ".join(head)).strip()
    body = lines[i:]
    shared_passage = "다음 글을 읽고" in instruction
    return Shared(
        instruction=_clean(instruction),
        lines=body if shared_passage else [],
        group=f"{block.first}-{block.last}" if shared_passage else None,
        footnotes=footnotes if shared_passage else [],
    )


def parse_question(block: Block, shared: Shared | None, year: int | None = None) -> dict:
    number = block.number
    points = 2
    lines: list[Line] = []
    footnotes: list[str] = []
    for line in block.lines:
        line, found = _remove_marker(line, THREE_POINTS)
        if found:
            points = 3
        if not line.chars:
            continue
        text = line_text(line)
        if not text or _is_decoration(text):
            continue
        lines.append(line)
    lines, footnotes = _drop_footnotes(lines)

    instruction_lines: list[Line] = []
    while lines and lines[0].box is None and HANGUL.search(line_text(lines[0])) and not line_text(lines[0]).startswith(tuple(MARKERS)):
        instruction_lines.append(lines.pop(0))
    instruction = _clean(" ".join(line_text(l) for l in instruction_lines))
    if not instruction and shared is not None:
        instruction = shared.instruction

    # Number layouts changed over the years (e.g. no implication item before
    # 2019), so the instruction decides the type and the number is kept as a check.
    by_number = type_by_number(number, year)
    by_instruction = type_by_instruction(instruction, number)
    qtype = by_instruction or by_number

    inline = qtype in INLINE_OPTION_TYPES and not is_boxed_choice(instruction)
    cut = None if inline else _option_block_start(lines)
    body = lines if cut is None else lines[:cut]
    option_lines = [] if cut is None else lines[cut:]

    given_sentence = None
    summary = None
    summary_blanks: list[dict] = []
    boxes = _box_groups(body)
    if qtype == "insertion" and boxes:
        given_sentence = _clean(build_text(boxes[0]).text)
        body = _without(body, boxes[0])
    elif qtype == "summary" and boxes:
        sb = build_text(boxes[-1])
        summary = sb.text
        summary_blanks, _ = _marks(sb, "summary")
        body = _without(body, boxes[-1])
    intro = None
    if qtype == "ordering" and boxes:
        intro = _clean(build_text(boxes[0]).text)
        body = _without(body, boxes[0])

    shared_group = None
    if shared is not None and shared.group:
        shared_group = shared.group
        body = shared.lines + body
        footnotes = shared.footnotes + footnotes

    body = [l for l in body if not LABEL_ROW.match(line_text(l))]
    built = build_text(body)
    passage = built.text
    # Offsets refer to the raw text, so passage and summary are not normalised.
    blanks, underlines = _marks(built, "passage")
    blanks += summary_blanks

    if option_lines:
        split = _split_on_markers(" ".join(line_text(l) for l in option_lines)) or []
        options = [{"label": i + 1, "text": t, "kind": "listed"} for i, t in enumerate(split)]
    else:
        options = _inline_options(passage, underlines)

    order_parts = None
    if qtype in ("ordering", "long_narrative"):
        parts = _order_parts(passage)
        if parts:
            order_parts = ({"intro": intro} if intro else {}) | parts

    return {
        "number": number,
        "type": qtype,
        "typeByNumber": by_number,
        "typeByInstruction": by_instruction,
        "instruction": instruction,
        "passage": passage,
        "options": options,
        "points": points,
        "answer": None,
        "underlines": underlines,
        "blanks": blanks,
        "givenSentence": given_sentence,
        "orderParts": order_parts,
        "summary": summary,
        "sharedPassageGroup": shared_group,
        "footnotes": footnotes,
    }


def parse_questions(lines: list[Line], year: int | None = None) -> list[dict]:
    """Return the reading questions (18~45, or 23~45 in 2014) found in the line stream, in number order."""
    blocks = split_blocks(lines)
    shared_for: dict[int, Shared] = {}
    for b in blocks:
        if b.kind == "group":
            s = _parse_group(b)
            for n in range(b.first, b.last + 1):
                shared_for[n] = s
    out = []
    for b in blocks:
        if b.kind == "question" and reading_first(year) <= b.number <= READING_LAST:
            out.append(parse_question(b, shared_for.get(b.number), year))
    return out


BROKEN = re.compile(r"[\ue000-\uf8ff\ufffd]|[\U000f0000-\U0010ffff]|\(cid:\d+\)")


def assess(q: dict) -> tuple[str, list[str]]:
    """Rate how much to trust an extracted question and say why."""
    low: list[str] = []
    medium: list[str] = []
    if len(q["options"]) != 5:
        low.append(f"options={len(q['options'])}")
    elif any(not o["text"] for o in q["options"] if o["kind"] != "position"):
        medium.append("empty option text")
    needs_passage = q["type"] not in ("long_title_vocab", "long_narrative") or q["sharedPassageGroup"]
    if needs_passage and not q["passage"].strip():
        low.append("empty passage")
    fields = [q["instruction"], q["passage"], q["givenSentence"] or "", q["summary"] or ""]
    fields += [o["text"] for o in q["options"]]
    if any(BROKEN.search(f) for f in fields):
        low.append("broken glyphs")
    if q["answer"] is None:
        medium.append("no answer")
    if q.get("answerPoints") is not None and q["answerPoints"] != q["points"]:
        medium.append(f"points mismatch: paper={q['points']} key={q['answerPoints']}")
    if not q["instruction"]:
        medium.append("no instruction")
    elif q["typeByInstruction"] is None:
        medium.append("type not recognised from instruction")
    if q["type"] == "blank_inference" and not q["blanks"]:
        medium.append("no blank found")
    if q["type"] == "summary" and (not q["summary"] or len(q["blanks"]) < 2):
        medium.append("summary box or blanks missing")
    if q["type"] == "insertion" and not q["givenSentence"]:
        medium.append("no given sentence")
    if q["type"] == "ordering" and not (q["orderParts"] and {"A", "B", "C"} <= set(q["orderParts"])):
        medium.append("order parts missing")
    if q["type"] in UNDERLINE_TYPES and not q["underlines"] and not is_boxed_choice(q["instruction"]):
        medium.append("no underline found")
    if low:
        return "low", low + medium
    if medium:
        return "medium", medium
    return "high", []


__all__ = ["parse_questions", "assess", "split_blocks", "build_text", "BLANK_TEXT"]
