from csat.layout import BLANK_TEXT, find_boxes, find_frame, layout_page, line_text

from fake_page import BODY, LEFT_X, RIGHT_X, FakePage, end_x


def test_frame_uses_divider_and_header_rule():
    frame = find_frame(FakePage().build())
    assert abs(frame.split_x - 421.5) < 1
    assert round(frame.header_y) == 147
    assert frame.footer_y > 1067  # slack keeps a last line hanging just below the divider


def test_left_column_is_read_before_right_column():
    page = FakePage().text(RIGHT_X, 200, "Fake right top.").text(LEFT_X, 400, "Fake left bottom.")
    lines, _ = layout_page(page.build())
    assert [line_text(l) for l in lines] == ["Fake left bottom.", "Fake right top."]


def test_header_and_footer_text_is_dropped():
    page = FakePage().text(LEFT_X, 300, "Fake body.").text(400, 1090, "8")
    lines, _ = layout_page(page.build())
    assert [line_text(l) for l in lines] == ["Fake body."]


def test_chars_a_few_points_apart_share_a_line():
    page = FakePage().text(LEFT_X, 300, "가나다", 11.5).text(end_x(LEFT_X, "가나다 ", 11.5), 298.5, "fake")
    lines, _ = layout_page(page.build())
    assert len(lines) == 1
    assert line_text(lines[0]) == "가나다 fake"


def test_underline_marks_the_chars_above_it():
    page = FakePage().text(LEFT_X, 300, "fake word here")
    x0, x1 = end_x(LEFT_X, "fake "), end_x(LEFT_X, "fake word")
    page.underline(x0, x1, 300 + BODY)
    lines, _ = layout_page(page.build())
    marked = "".join(c.text for c in lines[0].chars if c.underline is not None)
    assert marked == "word"


def test_empty_underline_becomes_a_blank():
    page = FakePage().text(LEFT_X, 300, "fake text").underline(250, 380, 300 + BODY)
    lines, _ = layout_page(page.build())
    assert BLANK_TEXT in line_text(lines[0])


def test_full_column_rule_is_not_an_underline():
    page = FakePage().text(LEFT_X, 300, "fake text")
    page.underline(88, 406, 300 + BODY)
    lines, _ = layout_page(page.build())
    assert all(c.underline is None for c in lines[0].chars)
    assert BLANK_TEXT not in line_text(lines[0])


def test_box_is_found_and_its_lines_are_tagged():
    page = FakePage().box(99, 406, 180, 230).text(110, 195, "Fake boxed sentence.").text(LEFT_X, 260, "Fake after.")
    built = page.build()
    boxes, _ = find_boxes(built.segments, find_frame(built))
    assert len(boxes) == 1 and boxes[0].col == 0
    lines, _ = layout_page(built)
    assert [l.box for l in lines] == [0, None]


def test_line_text_adds_spaces_at_gaps_only():
    page = FakePage().text(LEFT_X, 300, "ab").text(LEFT_X + 40, 300, "cd")
    lines, _ = layout_page(page.build())
    assert line_text(lines[0]) == "ab cd"
