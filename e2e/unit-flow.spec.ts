import { expect, type Page, test } from "@playwright/test";
import { answer, expectNoHorizontalOverflow, remainingQuestions, seedLesson, startAs, storedProgress } from "./helpers";

const UNIT = "FIXTURE-U01";
// Flow blocks of the demo unit: concept, tagging, building, practice, assessment.
const ASSESSMENT_INDEX = 4;
const ASSESSMENT = ["FIXTURE-Q-002", "FIXTURE-Q-004", "FIXTURE-Q-005", "FIXTURE-Q-006", "FIXTURE-Q-009", "FIXTURE-Q-010", "FIXTURE-Q-011", "FIXTURE-Q-012"];
// Right answers in assessment order; the full-flow test picks "a book" instead of "Tom" once.
const RIGHT = ["plays", "kicks", "reads", "build", "The boy", "Tom", "Birds", "아니다"];

const role = (page: Page, symbol: string) => page.getByRole("group", { name: "역할 고르기" }).getByRole("button", { name: new RegExp(`^${symbol}`) });
const token = (page: Page, text: string) => page.getByRole("region", { name: "문장 성분 표시" }).getByRole("button", { name: text, exact: true });

async function answerAndNext(page: Page, option: string) {
  await answer(page, option);
  await expect(page.getByRole("region", { name: "해설" })).toBeVisible();
  await page.getByRole("button", { name: /^(다음|비슷한 문제 풀기)$/ }).click();
}

test("the demo unit, from concept to a pass that opens the next unit", async ({ page }) => {
  await startAs(page, "테스트", 15);
  await expect(page.getByRole("list", { name: "오늘 할 일" })).toContainText("FIXTURE 주어와 동사");
  await page.goto(`/learn/${UNIT}`);

  // Concept
  await expect(page.getByText("동사는 동작이나 상태를 나타낸다.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "다음" }).click();

  // Role tagging by tap, with one wrong tag first.
  await token(page, "milk").click();
  await role(page, "V").click();
  await expect(page.getByText("다시 골라 보세요. 고른 부분은 동사가 아닙니다.")).toBeVisible();
  await token(page, "drinks").click();
  await role(page, "V").click();
  await token(page, "The").click();
  await token(page, "cat").click();
  await role(page, "S").click();
  await token(page, "milk").click();
  await role(page, "O").click();
  await expect(page.getByText("고양이가 우유를 마신다.")).toBeVisible();
  await expect(page.getByText("고양이가", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "다음" }).click();

  // Role tagging by keyboard: the head noun alone counts as the subject.
  for (const [word, key] of [["boy", "s"], ["kicks", "v"]] as const) {
    await token(page, word).focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press(key);
  }
  await token(page, "the").focus();
  await page.keyboard.press("Enter");
  await token(page, "ball").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("o");
  await expect(page.getByText("소년이 공을 찬다.")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();

  // Sentence building with one undo.
  const chips = page.getByRole("group", { name: "단어 칩" });
  for (const word of ["We", "eat", "lunch", "at"]) await chips.getByRole("button", { name: word, exact: true }).click();
  await page.getByRole("button", { name: "되돌리기" }).click();
  for (const word of ["at", "noon"]) await chips.getByRole("button", { name: word, exact: true }).click();
  await expect(page.getByText("맞았어요.", { exact: false })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "다음" }).click();

  // Practice: hints 1 and 2, no explanation before submitting, wrong answer, then a variant.
  await expect(page.getByRole("heading", { name: "이 문장의 동사는 무엇인가요?" })).toBeVisible();
  await page.getByRole("button", { name: "방향 힌트" }).click();
  await expect(page.getByText("동작을 나타내는 단어를 찾아보세요.")).toBeVisible();
  await page.getByRole("button", { name: "범위 힌트" }).click();
  await expect(page.getByText("문장에서 강조된 부분을 살펴보세요.")).toBeVisible();
  const body = page.locator("body");
  await expect(body).not.toContainText("마신다'는 동작");
  await expect(body).not.toContainText("주어를 동사로 고른다.");
  await answer(page, "cat");
  await expect(page.getByText("아쉬워요")).toBeVisible();
  await expect(page.getByText("주어를 동사로 고른다.")).toBeVisible();
  await expect(page.getByText("cat은 동작을 하는 주어입니다.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: "비슷한 문제 풀기" }).click();
  await expect(page.getByText("My father washes the car.")).toBeVisible();
  await answer(page, "washes");
  await expect(page.getByText("정답입니다")).toBeVisible();
  await page.getByRole("button", { name: "다음" }).click();

  // Assessment: 7 of 8.
  await expect(remainingQuestions(page)).toHaveText("8");
  for (const [i, right] of RIGHT.entries()) await answerAndNext(page, i === 5 ? "a book" : right);

  await expect(page.getByRole("heading", { name: "통과했습니다" })).toBeVisible();
  await expect(page.getByText("2일 뒤 확인 문제가 나옵니다.")).toBeVisible();
  await expect(page.getByText("7 / 8")).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("link", { name: "다음 단원: FIXTURE 목적어" })).toBeVisible();
  await page.getByRole("link", { name: "대시보드로" }).click();
  await expect(page.getByRole("list", { name: "오늘 할 일" })).toContainText("FIXTURE 목적어");
});

test.describe("in the middle of the assessment", () => {
  test.beforeEach(async ({ page }) => {
    await startAs(page, "테스트", 15);
    await seedLesson(page, UNIT, { blockIndex: ASSESSMENT_INDEX, queue: ASSESSMENT });
    await page.goto(`/learn/${UNIT}`);
    await expect(remainingQuestions(page)).toHaveText("8");
  });

  test("a reload resumes at the same question without counting answers twice", async ({ page }) => {
    await answerAndNext(page, RIGHT[0]);
    await answerAndNext(page, RIGHT[1]);
    await expect(page.getByText("Tom reads a book.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Tom reads a book.")).toBeVisible();
    await expect(remainingQuestions(page)).toHaveText("6");
    expect((await storedProgress(page)).lessons[UNIT].attempts).toHaveLength(2);
  });

  test("a double tap on submit records one answer", async ({ page }) => {
    await page.locator("label").filter({ hasText: /^.?plays$/ }).click();
    await page.getByRole("button", { name: "제출" }).dblclick();
    await expect(page.getByRole("region", { name: "해설" })).toBeVisible();
    expect((await storedProgress(page)).lessons[UNIT].attempts).toHaveLength(1);
    await page.getByRole("button", { name: "다음" }).click();
    await expect(remainingQuestions(page)).toHaveText("7");
  });
});

test("a locked unit says so, and an unknown unit is not found", async ({ page }) => {
  await startAs(page, "테스트", 15);
  await page.goto("/learn/FIXTURE-U02");
  await expect(page.getByText("아직 열리지 않은 단원입니다")).toBeVisible();
  await expect(page.getByRole("link", { name: "대시보드로" })).toBeVisible();
  await page.goto("/learn/FIXTURE-U99");
  await expect(page.getByText("404")).toBeVisible();
});

test("a wrong answer comes back as a skill review the next day", async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 2, 9, 0) });
  await startAs(page, "테스트", 15);
  await seedLesson(page, UNIT, { blockIndex: 3, queue: ["FIXTURE-Q-001"] });
  await page.goto(`/learn/${UNIT}`);
  await answer(page, "milk");
  await expect(page.getByText("아쉬워요")).toBeVisible();

  await page.clock.fastForward("24:00:00");
  await page.goto("/dashboard");
  await expect(page.getByRole("list", { name: "오늘 할 일" })).toContainText("개념 복습");
  await page.getByRole("link", { name: "오늘 학습 시작" }).click();
  await expect(page).toHaveURL(/\/review$/);
  await expect(page.getByRole("heading", { name: "이 문장의 동사는 무엇인가요?" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
