import json
from pathlib import Path

import pytest

from csat_stats.lexicon import coverage, coverage_curve, normalize_lemma

CASES = json.loads((Path(__file__).parents[3] / "lib/engine/coverage.cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize(("raw", "expected"), CASES["normalize"])
def test_normalize_matches_the_app(raw, expected):
    assert normalize_lemma(raw) == expected


@pytest.mark.parametrize("case", CASES["coverage"], ids=lambda c: c["name"])
def test_coverage_matches_the_app(case):
    assert coverage(set(case["known"]), case["entries"]) == pytest.approx(case["expected"])


def test_coverage_curve_ranks_counted_lemmas():
    entries = [
        {"lemma": "b", "kind": "content", "totalCount": 2},
        {"lemma": "a", "kind": "function", "totalCount": 6},
        {"lemma": "x", "kind": "proper", "totalCount": 50},
        {"lemma": "c", "kind": "content", "totalCount": 2},
    ]
    assert coverage_curve(entries, [1, 2, 10]) == [
        {"topN": 1, "coverage": pytest.approx(0.6)},
        {"topN": 2, "coverage": pytest.approx(0.8)},
        {"topN": 10, "coverage": pytest.approx(1.0)},
    ]


def test_lemma_key_merges_content_and_function_uses():
    from csat_stats.lexicon import lemma_key

    assert lemma_key("be", "function") == lemma_key("be", "content") == ("be", "counted")
    assert lemma_key("paris", "proper") == ("paris", "proper")
    assert lemma_key("1990", "number") == ("1990", "number")
