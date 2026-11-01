import json

from csat_stats.leak import NGRAM, corpus_ngrams, scan_file, words

SOURCE = "fake alpha bravo charlie delta echo foxtrot golf hotel india juliet"


def index():
    return corpus_ngrams([SOURCE])


def test_words_ignore_case_and_punctuation():
    assert words("Fake, ALPHA bravo-charlie don't.") == ["fake", "alpha", "bravo", "charlie", "don't"]


def test_eight_shared_words_fail_and_seven_pass(tmp_path):
    eight = " ".join(SOURCE.split()[1:1 + NGRAM])
    seven = " ".join(SOURCE.split()[1:NGRAM])
    path = tmp_path / "stats.json"
    path.write_text(json.dumps({"ok": [seven, "fake"], "nested": {"bad": "x " + eight.upper() + " y"}}), encoding="utf-8")
    hits = scan_file(path, index())
    assert [(h.where, h.overlaps) for h in hits] == [("nested.bad", 1)]


def test_hits_never_carry_the_matched_text(tmp_path):
    path = tmp_path / "REPORT.md"
    path.write_text("| x |\n" + SOURCE + "\n", encoding="utf-8")
    hit = scan_file(path, index())[0]
    assert hit.where == "line 2"
    assert "alpha" not in repr(hit)


def test_separate_strings_are_not_joined(tmp_path):
    path = tmp_path / "lemmas.json"
    path.write_text(json.dumps({"lemmas": SOURCE.split()}), encoding="utf-8")
    assert scan_file(path, index()) == []
