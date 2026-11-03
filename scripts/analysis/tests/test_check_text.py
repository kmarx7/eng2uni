import json

from check_text import check
from csat_stats.leak import NGRAM

SOURCE = "fake alpha bravo charlie delta echo foxtrot golf hotel india juliet"


def corpus(tmp_path):
    d = tmp_path / "structured"
    d.mkdir()
    exam = {"questions": [{"passage": SOURCE, "options": []}]}
    (d / "2099_csat.json").write_text(json.dumps(exam), encoding="utf-8")
    return d


def test_eight_shared_words_overlap_and_seven_do_not(tmp_path):
    eight = " ".join(SOURCE.split()[1:1 + NGRAM])
    seven = " ".join(SOURCE.split()[1:NGRAM])
    out = check([{"id": "A", "text": "x " + eight}, {"id": "B", "text": seven}], corpus(tmp_path))
    assert out == {"status": "checked", "results": [{"id": "A", "score": 1, "overlap": True}, {"id": "B", "score": 0, "overlap": False}]}


def test_output_never_carries_the_matched_words(tmp_path):
    out = check([{"id": "A", "text": SOURCE}], corpus(tmp_path))
    assert "alpha" not in json.dumps(out)


def test_missing_corpus_is_skipped(tmp_path):
    assert check([{"id": "A", "text": SOURCE}], tmp_path / "none") == {"status": "skipped", "results": []}
