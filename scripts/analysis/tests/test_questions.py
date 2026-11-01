import re

from csat.layout import layout_page
from csat.model import Line
from csat.questions import BROKEN, _remove_marker, assess, parse_questions

from fake_page import BODY, INSTR, LEFT_X, NOTE, RIGHT_X, FakePage, end_x, text_chars

OPTION_STEP = 17


def lines_of(*pages: FakePage) -> list[Line]:
    out: list[Line] = []
    for p in pages:
        out += layout_page(p.build())[0]
    return out


def by_number(questions: list[dict]) -> dict[int, dict]:
    return {q["number"]: q for q in questions}


def options(page: FakePage, x: float, top: float, texts: list[str]) -> None:
    for i, t in enumerate(texts):
        page.text(x, top + i * OPTION_STEP, f"{'①②③④⑤'[i]} {t}", INSTR)


def single_and_shared_page(end_notice: bool = True) -> FakePage:
    page = FakePage()
    # Left column: item 18 with a footnote and a [3점] mark at the end of the passage.
    page.number_line(LEFT_X, 160, 18, "다음 글을 쓴 목적으로 가장 적절한 것은?")
    page.text(LEFT_X + 11, 200, "Fake opening line of a made up letter.")
    page.text(LEFT_X, 216, "Fake second line keeps going here.")
    page.text(LEFT_X, 232, "Fake closing line.")
    page.text(end_x(LEFT_X, "Fake closing line. "), 233, "[3점]", INSTR)
    page.text(300, 260, "*fakeword: 가짜 낱말", NOTE)
    options(page, LEFT_X, 290, ["축하하려고", "문의하려고", "항의하려고", "요청하려고", "안내하려고"])
    # Right column: a shared long passage for 41~42.
    page.text(437, 160, "[41～42] 다음 글을 읽고, 물음에 답하시오.", BODY)
    page.text(RIGHT_X + 11, 200, "Fake shared story starts here.")
    page.text(RIGHT_X, 216, "It has one (a) fake word in it.")
    page.underline(end_x(RIGHT_X, "It has one "), end_x(RIGHT_X, "It has one (a)"), 216 + BODY)
    page.text(600, 250, "*sharedfake: 가짜 공유", NOTE)
    page.number_line(RIGHT_X, 300, 41, "윗글의 제목으로 가장 적절한 것은?")
    options(page, RIGHT_X, 330, ["Fake Title One", "Fake Title Two", "Fake Title Three", "Fake Title Four", "Fake Title Five"])
    page.number_line(RIGHT_X, 440, 42, "밑줄 친 (a)～(e) 중에서 문맥상 낱말의 쓰임이 적절하지 않은 것은?")
    page.text(RIGHT_X, 470, "① (a) ② (b) ③ (c) ④ (d) ⑤ (e)", INSTR)
    if end_notice:
        page.text(RIGHT_X, 520, "* 확인 사항", NOTE)
        page.text(RIGHT_X, 540, "◦답안지를 확인하시오.", NOTE)
    return page


def test_single_item_parts():
    q = by_number(parse_questions(lines_of(single_and_shared_page())))[18]
    assert q["type"] == "purpose"
    assert q["instruction"] == "다음 글을 쓴 목적으로 가장 적절한 것은?"
    assert q["points"] == 3
    assert q["passage"].startswith("Fake opening line")
    assert "[3점]" not in q["passage"] and not re.search(r"[가-힣]", q["passage"])
    assert q["footnotes"] == ["*fakeword: 가짜 낱말"]
    assert [o["text"] for o in q["options"]] == ["축하하려고", "문의하려고", "항의하려고", "요청하려고", "안내하려고"]
    assert [o["kind"] for o in q["options"]] == ["listed"] * 5


def test_shared_passage_goes_to_every_item_in_the_group():
    qs = by_number(parse_questions(lines_of(single_and_shared_page())))
    for n in (41, 42):
        assert qs[n]["sharedPassageGroup"] == "41-42"
        assert qs[n]["passage"].startswith("Fake shared story")
        assert "가짜" not in qs[n]["passage"]
        assert qs[n]["footnotes"] == ["*sharedfake: 가짜 공유"]
    assert qs[41]["type"] == "long_title_vocab"
    assert qs[42]["type"] == "long_title_vocab"
    assert [u["text"] for u in qs[42]["underlines"]] == ["(a)"]
    assert [o["text"] for o in qs[42]["options"]] == ["(a)", "(b)", "(c)", "(d)", "(e)"]


def test_end_of_paper_notice_is_not_part_of_the_last_item():
    q = by_number(parse_questions(lines_of(single_and_shared_page())))[42]
    assert all("답안지" not in o["text"] for o in q["options"])


def test_nothing_after_the_end_of_paper_notice_is_read():
    qs = parse_questions(lines_of(single_and_shared_page(), marker_items_page()))
    assert [q["number"] for q in qs] == [18, 41, 42]


def marker_items_page() -> FakePage:
    page = FakePage(number=2)
    # Left: blank item 31.
    page.number_line(LEFT_X, 160, 31, "다음 빈칸에 들어갈 말로 가장 적절한 것은?")
    page.text(LEFT_X + 11, 200, "Fake claim about nothing and")
    page.underline(end_x(LEFT_X + 11, "Fake claim about nothing and "), 400, 200 + BODY)
    options(page, LEFT_X, 240, ["fake one", "fake two", "fake three", "fake four", "fake five"])
    # Left: grammar item 29 with underlined choices inside the passage.
    page.number_line(LEFT_X, 360, 29, "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?")
    first, second = "Fake ①went ②gone ③go", "more ④going ⑤goes now."
    page.text(LEFT_X + 11, 400, first)
    page.text(LEFT_X, 416, second)
    for line, x, top in ((first, LEFT_X + 11, 400), (second, LEFT_X, 416)):
        for m in re.finditer(r"[①-⑤](\w+)", line):
            page.underline(end_x(x, line[: m.start(1)]), end_x(x, line[: m.end(1)]), top + BODY)
    # Right: insertion item 38 with a boxed given sentence.
    page.text(437, 160, "[38～39] 글의 흐름으로 보아, 주어진 문장이 들어가기에 가장 적절한 곳을 고르시오.", BODY)
    page.box(RIGHT_X, 754, 190, 222)
    page.number_line(RIGHT_X - 11, 196, 38, "Fake given sentence.", BODY)
    page.text(RIGHT_X, 240, "( ① ) Fake one. ( ② ) Fake two. ( ③ )")
    page.text(RIGHT_X, 256, "Fake three. ( ④ ) Fake four. ( ⑤ )")
    # Right: ordering item 36 with a boxed intro and (A)~(C) parts.
    page.text(437, 300, "[36～37] 주어진 글 다음에 이어질 글의 순서로 가장 적절한 것을 고르시오.", BODY)
    page.number_line(RIGHT_X, 330, 36)
    page.box(RIGHT_X, 754, 350, 380)
    page.text(RIGHT_X + 11, 358, "Fake intro text.")
    page.text(RIGHT_X, 400, "(A) Fake part a goes")
    page.text(RIGHT_X, 416, "on here.")
    page.text(RIGHT_X, 432, "(B) Fake part b.")
    page.text(RIGHT_X, 448, "(C) Fake part c.")
    page.text(RIGHT_X, 480, "① (A) － (C) － (B) ② (B) － (A) － (C)", INSTR)
    page.text(RIGHT_X, 497, "③ (B) － (C) － (A) ④ (C) － (A) － (B)", INSTR)
    page.text(RIGHT_X, 514, "⑤ (C) － (B) － (A)", INSTR)
    return page


def test_blank_item_has_one_blank():
    q = by_number(parse_questions(lines_of(marker_items_page())))[31]
    assert q["type"] == "blank_inference"
    assert len(q["blanks"]) == 1 and q["blanks"][0]["in"] == "passage"
    assert q["passage"][q["blanks"][0]["start"]:].startswith("_____")


def test_grammar_options_come_from_underlines_inside_the_passage():
    q = by_number(parse_questions(lines_of(marker_items_page())))[29]
    assert [o["text"] for o in q["options"]] == ["went", "gone", "go", "going", "goes"]
    assert {o["kind"] for o in q["options"]} == {"underlined"}


def test_insertion_item_takes_the_box_as_given_sentence():
    q = by_number(parse_questions(lines_of(marker_items_page())))[38]
    assert q["type"] == "insertion"
    assert q["instruction"].startswith("글의 흐름으로 보아")
    assert q["givenSentence"] == "Fake given sentence."
    assert "given" not in q["passage"]
    assert [o["kind"] for o in q["options"]] == ["position"] * 5


def test_ordering_item_splits_intro_and_parts():
    q = by_number(parse_questions(lines_of(marker_items_page())))[36]
    assert q["orderParts"] == {
        "intro": "Fake intro text.",
        "A": "Fake part a goes on here.",
        "B": "Fake part b.",
        "C": "Fake part c.",
    }
    assert [o["text"] for o in q["options"]][0] == "(A) － (C) － (B)"
    assert len(q["options"]) == 5


def test_items_are_found_across_pages_in_reading_order():
    qs = parse_questions(lines_of(single_and_shared_page(end_notice=False), marker_items_page()))
    assert [q["number"] for q in qs] == [18, 41, 42, 31, 29, 38, 36]


def test_remove_marker_handles_spaced_chars():
    line = Line(page=1, col=0, chars=text_chars(0, 0, "fake [ 3 점 ] end"))
    kept, found = _remove_marker(line, "[3점]")
    assert found
    assert "".join(c.text for c in kept.chars).split() == ["fake", "end"]


def test_broken_glyph_pattern():
    assert BROKEN.search("fake  text")
    assert BROKEN.search("fake (cid:12) text")
    assert BROKEN.search("fake \U000f0802")
    assert not BROKEN.search("Fake plain text, ①②, 가나다 — “quotes”.")


def test_private_use_bullet_becomes_a_bullet():
    page = FakePage()
    page.number_line(LEFT_X, 160, 27, "Fake Fair에 관한 다음 안내문의 내용과 일치하지 않는 것은?")
    page.text(LEFT_X + 11, 200, "Fake notice title")
    page.text(LEFT_X, 216, "\U000f0802 Fake item one")
    page.text(LEFT_X, 232, "\U000f0802 Fake item two \U000f0802 Fake item three")
    options(page, LEFT_X, 270, ["가", "나", "다", "라", "마"])
    q = parse_questions(lines_of(page))[0]
    assert q["type"] == "notice"
    assert q["passage"].count("•") == 3
    assert assess(q)[0] != "low"


def test_assess_flags_missing_options_and_passes_complete_items():
    q = by_number(parse_questions(lines_of(single_and_shared_page())))[18]
    q["answer"], q["answerPoints"] = 2, 3
    assert assess(q) == ("high", [])
    q["options"] = q["options"][:4]
    level, issues = assess(q)
    assert level == "low" and "options=4" in issues


def test_underline_wrapping_onto_the_next_line_is_one_underline():
    page = FakePage()
    page.number_line(LEFT_X, 160, 21, "밑줄 친 부분이 다음 글에서 의미하는 바로 가장 적절한 것은?")
    first, second = "Fake text with a long", "phrase here and more."
    page.text(LEFT_X + 11, 200, first).text(LEFT_X, 216, second)
    page.underline(end_x(LEFT_X + 11, "Fake text with a "), end_x(LEFT_X + 11, first), 200 + BODY)
    page.underline(LEFT_X, end_x(LEFT_X, "phrase here"), 216 + BODY)
    options(page, LEFT_X, 250, ["fake a", "fake b", "fake c", "fake d", "fake e"])
    q = parse_questions(lines_of(page))[0]
    assert [u["text"] for u in q["underlines"]] == ["long phrase here"]


def test_2014_layout_skips_listening_items_and_number_types():
    qs = by_number(parse_questions(lines_of(single_and_shared_page()), year=2014))
    assert sorted(qs) == [41, 42]
    assert qs[41]["typeByNumber"] is None


def test_boxed_choices_do_not_need_underlines():
    page = FakePage()
    page.number_line(LEFT_X, 160, 29, "(A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?")
    page.text(LEFT_X + 11, 200, "Fake text with [go / went] and [a / b] and [c / d].")
    options(page, LEFT_X, 250, ["fake a", "fake b", "fake c", "fake d", "fake e"])
    q = parse_questions(lines_of(page))[0]
    assert q["type"] == "grammar"
    assert "no underline found" not in assess(q)[1]


def test_typed_underscore_blank_counts_as_a_blank():
    page = FakePage()
    page.number_line(LEFT_X, 160, 31, "다음 빈칸에 들어갈 말로 가장 적절한 것을 고르시오.")
    page.text(LEFT_X + 11, 200, "Fake text with a __________ in it.")
    options(page, LEFT_X, 250, ["fake a", "fake b", "fake c", "fake d", "fake e"])
    q = parse_questions(lines_of(page))[0]
    assert len(q["blanks"]) == 1
    assert q["passage"][q["blanks"][0]["start"]:].startswith("____")


def test_reference_item_keeps_a_line_that_starts_with_a_marker_in_the_passage():
    page = FakePage()
    page.number_line(LEFT_X, 160, 30, "밑줄 친 ①～⑤ 중에서 가리키는 대상이 나머지 넷과 다른 것은?")
    page.text(LEFT_X + 11, 200, "Fake story where the boy")
    page.text(LEFT_X, 216, "①he walked and ②he ran so ③he sat")
    page.text(LEFT_X, 232, "while ④he slept and finally ⑤she left the fake room.")
    q = parse_questions(lines_of(page))[0]
    assert q["type"] == "reference"
    assert q["passage"].endswith("fake room.")
    assert [o["kind"] for o in q["options"]] == ["inline"] * 5
