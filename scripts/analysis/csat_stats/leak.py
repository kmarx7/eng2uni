"""Check that stage 4 outputs hold no exam sentences.

Any 8-word run shared with corpus/structured fails the check. Hits report the
file, the location and how many 8-grams overlap, never the words themselves.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

NGRAM = 8
_WORD = re.compile(r"[a-z0-9]+(?:'[a-z]+)?")


@dataclass(frozen=True)
class Hit:
    file: str
    where: str
    overlaps: int

    def __repr__(self) -> str:  # keep matched words out of any printout
        return f"Hit({self.file}, {self.where}, overlaps={self.overlaps})"


def words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def ngrams(tokens: list[str]) -> Iterator[tuple[str, ...]]:
    for i in range(len(tokens) - NGRAM + 1):
        yield tuple(tokens[i:i + NGRAM])


def corpus_ngrams(texts: Iterable[str]) -> set[tuple[str, ...]]:
    found: set[tuple[str, ...]] = set()
    for text in texts:
        found.update(ngrams(words(text)))
    return found


def exam_texts(exam: dict) -> Iterator[str]:
    for q in exam["questions"]:
        yield q.get("passage") or ""
        yield q.get("givenSentence") or ""
        yield q.get("summary") or ""
        yield from (q.get("orderParts") or {}).values()
        yield from (o.get("text") or "" for o in q.get("options", []))
        yield from q.get("footnotes", [])


def _strings(value, where: str = "") -> Iterator[tuple[str, str]]:
    if isinstance(value, str):
        yield where or "$", value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from _strings(v, f"{where}.{k}" if where else str(k))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from _strings(v, f"{where}[{i}]")


def scan_file(path: Path, index: set[tuple[str, ...]]) -> list[Hit]:
    text = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        pieces = list(_strings(json.loads(text)))
    else:
        pieces = [(f"line {n}", line) for n, line in enumerate(text.splitlines(), 1)]
    hits = []
    for where, piece in pieces:
        overlaps = sum(1 for g in ngrams(words(piece)) if g in index)
        if overlaps:
            hits.append(Hit(path.name, where, overlaps))
    return hits
