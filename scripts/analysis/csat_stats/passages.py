"""Passage-level counts: paragraphs, discourse markers, ordering/insertion cues."""

from __future__ import annotations

import re

# Discourse markers counted per type (stage 4 item 4). Multi-word markers are
# matched as phrases, so "for example" is not also counted as "example".
DISCOURSE_MARKERS = [
    "however", "therefore", "thus", "hence", "consequently", "as a result",
    "for example", "for instance", "in addition", "moreover", "furthermore",
    "besides", "in contrast", "on the other hand", "on the contrary",
    "nevertheless", "nonetheless", "instead", "in other words", "that is",
    "in fact", "indeed", "similarly", "likewise", "otherwise", "meanwhile",
    "in short", "in conclusion", "after all", "rather", "in particular",
]
_MARKER_RE = {m: re.compile(r"(?<![A-Za-z])" + re.escape(m).replace(r"\ ", r"\s+") + r"(?![A-Za-z])", re.I) for m in DISCOURSE_MARKERS}

DEMONSTRATIVES = {"this", "that", "these", "those", "such"}
ARTICLES = {"a", "an", "the"}
# Single-word connectives used as ordering/insertion cues.
CONNECTIVES = {m for m in DISCOURSE_MARKERS if " " not in m} | {"but", "yet", "also", "then", "so"}
SEGMENT_START_WORDS = 5


def paragraph_count(text: str) -> int:
    """The extractor starts a new line at each indented paragraph."""
    return sum(1 for line in text.split("\n") if line.strip())


def count_markers(text: str) -> dict[str, int]:
    found = {}
    for marker, pattern in _MARKER_RE.items():
        n = len(pattern.findall(text))
        if n:
            found[marker] = n
    return found


def cue_class(token) -> str | None:
    word = token.lower_
    if word in ARTICLES and token.pos_ == "DET":
        return "article"
    # "that" as a conjunction or relative pronoun is not a reference word.
    if word in DEMONSTRATIVES and (token.tag_ in ("DT", "PDT") or word == "such"):
        return "demonstrative"
    if word in CONNECTIVES and token.pos_ in ("ADV", "CCONJ", "SCONJ"):
        return "connective"
    return None
