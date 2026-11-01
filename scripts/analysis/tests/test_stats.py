"""Stage 4 rules on self-written sentences (no exam text)."""

import pytest

from csat_stats.lexicon import token_kind
from csat_stats.nlp import load_model
from csat_stats.passages import count_markers, paragraph_count
from csat_stats.syntax import sentence_features
from csat_stats.texts import clean_passage, units_from_exam


@pytest.fixture(scope="module")
def nlp():
    return load_model()


def first_sentence(nlp, text):
    return next(nlp(text).sents)


def test_token_kinds(nlp):
    kinds = {t.text: token_kind(t) for t in nlp("The farmer met Maria in 1998 and smiled.") if not t.is_punct}
    assert kinds == {
        "The": "function",
        "farmer": "content",
        "met": "content",
        "Maria": "proper",
        "in": "function",
        "1998": "number",
        "and": "function",
        "smiled": "content",
    }


def test_simple_sentence_has_one_clause(nlp):
    f = sentence_features(first_sentence(nlp, "The small dog slept under the table."))
    assert (f.words, f.clauses, f.max_depth) == (7, 1, 1)
    assert not any(f.constructions.values())


def test_relative_and_noun_clauses_nest(nlp):
    f = sentence_features(first_sentence(nlp, "She said that the man who lived next door had moved away."))
    assert f.clauses == 3
    assert f.max_depth == 3
    assert f.constructions["nounClause"] == 1
    assert f.constructions["relativeClause"] == 1


def test_coordinated_clauses_stay_at_the_same_depth(nlp):
    f = sentence_features(first_sentence(nlp, "The rain stopped, and the children went outside."))
    assert f.clauses == 2
    assert f.max_depth == 1


def test_to_infinitive_and_participle(nlp):
    f = sentence_features(first_sentence(nlp, "Students wanting better grades decided to study every night."))
    assert f.constructions["toInfinitive"] == 1
    assert f.constructions["participlePhrase"] == 1
    assert f.constructions["relativeClause"] == 0


def test_negative_inversion(nlp):
    assert sentence_features(first_sentence(nlp, "Never have I seen such a quiet town.")).constructions["inversion"] == 1
    assert sentence_features(first_sentence(nlp, "I have never seen such a quiet town.")).constructions["inversion"] == 0


def test_clean_passage_drops_markers_blanks_and_labels():
    raw = "(A) Fake ① text _____ goes [3점] here * .\nNext (a) part."
    assert clean_passage(raw) == "Fake text goes here .\nNext part."


def test_paragraphs_and_markers():
    assert paragraph_count("One.\nTwo.\n\nThree.") == 3
    counts = count_markers("However, it rained. For example, the roads flooded; however, we went.")
    assert counts == {"however": 2, "for example": 1}


def test_units_dedupe_shared_passages_and_keep_options():
    exam = {
        "examId": "2099_csat",
        "year": 2099,
        "questions": [
            {"number": 31, "type": "blank_inference", "passage": "Fake one.", "options": [{"kind": "listed", "text": "fake choice"}],
             "sharedPassageGroup": None, "orderParts": None, "givenSentence": None, "summary": None, "footnotes": []},
            {"number": 41, "type": "long_title_vocab", "passage": "Fake long.", "options": [{"kind": "listed", "text": "Fake Title"}],
             "sharedPassageGroup": "41-42", "orderParts": None, "givenSentence": None, "summary": None, "footnotes": []},
            {"number": 42, "type": "long_title_vocab", "passage": "Fake long.", "options": [{"kind": "listed", "text": "(a)"}],
             "sharedPassageGroup": "41-42", "orderParts": None, "givenSentence": None, "summary": None, "footnotes": []},
            {"number": 38, "type": "insertion", "passage": "Fake body.", "options": [], "sharedPassageGroup": None,
             "orderParts": None, "givenSentence": "Fake given.", "summary": None, "footnotes": []},
        ],
    }
    units = units_from_exam(exam)
    assert [(u.numbers, u.item_type) for u in units] == [((31,), "blank_inference"), ((41, 42), "long_title_vocab"), ((38,), "insertion")]
    assert units[1].options == ["Fake Title"]
    assert units[2].segments == ["Fake given."]
    assert units[2].text == "Fake given.\nFake body."
    assert units[2].paragraphs == 1


def test_ordering_paragraphs_come_from_its_parts():
    q = {"number": 36, "type": "ordering", "passage": "(A) Fake\na.\n(B) Fake\nb.\n(C) Fake c.", "options": [],
         "sharedPassageGroup": None, "givenSentence": None, "summary": None, "footnotes": [],
         "orderParts": {"intro": "Fake intro.", "A": "Fake a.", "B": "Fake b.", "C": "Fake c."}}
    unit = units_from_exam({"examId": "2099_csat", "year": 2099, "questions": [q]})[0]
    assert unit.paragraphs == 4
    assert unit.segments == ["Fake a.", "Fake b.", "Fake c."]
