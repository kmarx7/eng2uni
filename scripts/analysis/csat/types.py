"""Reading item types by number (DESIGN_v2 14-2) and instruction keywords to cross-check them.

Type ids match ReadingType in lib/schema/common.ts.
"""

from __future__ import annotations

import re

READING_FIRST = 18
READING_LAST = 45

_RANGES: list[tuple[int, int, str]] = [
    (18, 18, "purpose"),
    (19, 19, "mood"),
    (20, 20, "claim"),
    (21, 21, "implication"),
    (22, 22, "gist"),
    (23, 23, "topic"),
    (24, 24, "title"),
    (25, 25, "chart"),
    (26, 26, "content_match"),
    (27, 28, "notice"),
    (29, 29, "grammar"),
    (30, 30, "contextual_vocab"),
    (31, 34, "blank_inference"),
    (35, 35, "irrelevant_sentence"),
    (36, 37, "ordering"),
    (38, 39, "insertion"),
    (40, 40, "summary"),
    (41, 42, "long_title_vocab"),
    (43, 45, "long_narrative"),
]


def type_by_number(number: int) -> str | None:
    for lo, hi, t in _RANGES:
        if lo <= number <= hi:
            return t
    return None


# Checked in order; the first match wins. Long-passage items are recognised by
# "윗글" (the passage above) before the single-passage keywords are tried.
_KEYWORDS: list[tuple[str, str]] = [
    ("long_narrative", r"윗글에관한내용|가리키는대상|순서에맞게배열"),
    ("long_title_vocab", r"윗글의제목"),
    ("purpose", r"목적"),
    ("mood", r"심경|분위기"),
    ("claim", r"주장"),
    ("implication", r"의미하는"),
    ("gist", r"요지"),
    ("topic", r"주제"),
    ("title", r"제목"),
    ("chart", r"도표|다음표의"),
    ("notice", r"안내문"),
    ("content_match", r"내용과일치"),
    ("grammar", r"어법"),
    ("contextual_vocab", r"낱말의쓰임"),
    ("blank_inference", r"빈칸에들어갈"),
    ("irrelevant_sentence", r"관계없는"),
    ("ordering", r"순서"),
    ("insertion", r"주어진문장이들어가기"),
    ("summary", r"요약"),
]


def type_by_instruction(instruction: str, number: int) -> str | None:
    """Best guess at the item type from its instruction text."""
    # Patterns are written without spaces because PDF text often splits Korean words.
    text = re.sub(r"\s+", "", instruction)
    if not text:
        return None
    for t, pattern in _KEYWORDS:
        if re.search(pattern, text):
            # 42 and 30 share wording; the long-passage version is decided by number.
            if t == "contextual_vocab" and number >= 41:
                return "long_title_vocab"
            # Some notices are worded "다음 <title>의 내용과 일치하지 않는 것은?".
            if t == "content_match" and number in (27, 28):
                return "notice"
            if t == "title" and number >= 41:
                return "long_title_vocab"
            if t == "ordering" and number >= 43:
                return "long_narrative"
            # Older papers had a single-passage reference item (e.g. 2018 no. 30).
            # It has no ReadingType yet; stage 4/5 decide whether to add one.
            if t == "long_narrative" and number < 41:
                return "reference"
            return t
    return None


# Types whose ①~⑤ markers sit inside the passage instead of in a list below it.
INLINE_OPTION_TYPES = {"chart", "grammar", "contextual_vocab", "irrelevant_sentence", "insertion"}
UNDERLINE_TYPES = {"implication", "grammar", "contextual_vocab"}
