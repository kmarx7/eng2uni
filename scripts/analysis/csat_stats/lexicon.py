"""Lemma normalisation, token kinds and coverage.

Same rules as lib/engine/coverage.ts; both are tested against
lib/engine/coverage.cases.json. Rules are written up in docs/analysis/LEMMA_RULES.md.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Mapping

# Proper nouns and numbers are never "unknown words", so coverage leaves them out.
COUNTED_KINDS = {"content", "function"}
FUNCTION_POS = {"DET", "ADP", "AUX", "CCONJ", "SCONJ", "PRON", "PART"}
_QUOTES = re.compile("[‘’ʼ]")
_LETTER_OR_DIGIT = re.compile(r"[A-Za-z0-9]")


def normalize_lemma(lemma: str) -> str:
    return _QUOTES.sub("'", unicodedata.normalize("NFKC", lemma)).strip().lower()


def is_word(token) -> bool:
    """Tokens that count as words: they hold a letter or digit and are not punctuation."""
    return not (token.is_punct or token.is_space) and bool(_LETTER_OR_DIGIT.search(token.text))


def token_kind(token) -> str:
    if any(ch.isdigit() for ch in token.text):
        return "number"
    if token.pos_ == "PROPN":
        return "proper"
    if token.pos_ in FUNCTION_POS:
        return "function"
    return "content"


def lemma_key(lemma: str, kind: str) -> tuple[str, str]:
    """Frequency-table key. Content and function uses of one lemma ("be" as AUX
    and as VERB) are one entry; proper nouns and numbers stay separate."""
    return (lemma, "counted" if kind in COUNTED_KINDS else kind)


def coverage(known: Iterable[str], entries: Iterable[Mapping]) -> float:
    """Share of counted passage tokens whose lemma is in `known` (0..1)."""
    known_normalized = {normalize_lemma(k) for k in known}
    total = hit = 0
    for e in entries:
        if e["kind"] not in COUNTED_KINDS:
            continue
        total += e["totalCount"]
        if normalize_lemma(e["lemma"]) in known_normalized:
            hit += e["totalCount"]
    return 0.0 if total == 0 else hit / total


def coverage_curve(entries: list[Mapping], sizes: Iterable[int]) -> list[dict]:
    """Coverage reached by knowing the N most frequent counted lemmas."""
    ranked = sorted((e for e in entries if e["kind"] in COUNTED_KINDS), key=lambda e: -e["totalCount"])
    return [{"topN": n, "coverage": coverage((e["lemma"] for e in ranked[:n]), ranked)} for n in sizes]
