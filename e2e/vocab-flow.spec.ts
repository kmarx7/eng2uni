import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, remaining, startAs } from "./helpers";

test("start, learn 5 words by keyboard, reload, finish 5 by tap", async ({ page }) => {
  await startAs(page, "테스트", 15);
  const newWords = page.getByRole("definition").filter({ hasText: "개" }).nth(1);
  await expect(newWords).toHaveText("10개");

  await page.getByRole("link", { name: "오늘 학습 시작" }).click();
  await expect(page).toHaveURL(/\/vocab$/);
  await expect(remaining(page)).toHaveText("남은 카드 10");
  // Meanings are not in the DOM before the card is revealed.
  await expect(page.getByRole("list", { name: "뜻" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  for (let left = 10; left > 5; left--) {
    await expect(remaining(page)).toHaveText(`남은 카드 ${left}`);
    await page.keyboard.press("Space");
    await expect(page.getByRole("list", { name: "뜻" })).toBeVisible();
    await page.keyboard.press("3");
  }
  await expect(remaining(page)).toHaveText("남은 카드 5");

  await page.reload();
  await expect(remaining(page)).toHaveText("남은 카드 5");

  for (let left = 5; left > 0; left--) {
    await expect(remaining(page)).toHaveText(`남은 카드 ${left}`);
    await page.getByRole("button", { name: /^(뜻|단어) 보기/ }).click();
    await page.getByRole("button", { name: /^보통/ }).click();
  }

  await expect(page).toHaveURL(/\/vocab\/done$/);
  await expect(page.getByText("오늘 새 단어")).toBeVisible();
  await expect(page.getByRole("definition").nth(1)).toHaveText("10개");
  await expectNoHorizontalOverflow(page);

  // Vocabulary is done; the unit is what is left for today.
  await expect(page.getByRole("link", { name: "단원 학습 계속: FIXTURE 주어와 동사" })).toBeVisible();
  await page.getByRole("link", { name: "대시보드로" }).click();
  await expect(page.getByRole("list", { name: "오늘 할 일" })).toHaveText(/단원 학습FIXTURE 주어와 동사/);
  await expect(page.getByRole("link", { name: "오늘 학습 시작" })).toHaveAttribute("href", "/learn/FIXTURE-U01");
});

test("a burst of rating keys rates one card once", async ({ page }) => {
  await startAs(page, "테스트", 15);
  await page.goto("/vocab");
  await expect(remaining(page)).toHaveText("남은 카드 10");
  await page.keyboard.press("Space");
  await expect(page.getByRole("list", { name: "뜻" })).toBeVisible();
  // Two key events in the same task, before React re-renders.
  await page.evaluate(() => {
    for (const key of ["1", "4", "1"]) window.dispatchEvent(new KeyboardEvent("keydown", { key }));
  });
  await expect(remaining(page)).toHaveText("남은 카드 9");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("english90.progress") ?? "{}"));
  expect(stored.cards).toHaveLength(1);
});

test("a word whose audio file fails to load shows no audio button", async ({ page }) => {
  await startAs(page, "테스트", 15);
  await page.goto("/vocab");
  // FIXTURE-V-001 "drink" names an audio file that does not exist.
  for (let i = 0; i < 10; i++) {
    if (await page.getByRole("heading", { name: "drink" }).isVisible()) break;
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
  }
  await expect(page.getByRole("heading", { name: "drink" })).toBeVisible();
  await expect(page.getByRole("button", { name: "발음 듣기" })).toHaveCount(0);
});

test.describe("when the browser blocks storage", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
  });

  test("learning still works and says progress is not saved", async ({ page }) => {
    await startAs(page, "테스트", 15);
    await expect(page.getByRole("status")).toHaveText(/진도가 저장되지 않습니다/);
    await page.getByRole("link", { name: "오늘 학습 시작" }).click();
    await expect(remaining(page)).toHaveText("남은 카드 10");
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
    await expect(remaining(page)).toHaveText("남은 카드 9");
  });
});

test.describe("past local midnight", () => {
  async function gradeByKeyboard(page: import("@playwright/test").Page, count: number) {
    for (let i = 0; i < count; i++) {
      await expect(page.getByRole("button", { name: /^(뜻|단어) 보기/ })).toBeVisible();
      await page.keyboard.press("Space");
      await expect(page.getByRole("list", { name: "뜻" })).toBeVisible();
      await page.keyboard.press("3");
    }
  }

  test("a dashboard left open overnight shows the new day's plan", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 2, 23, 40) });
    await startAs(page, "테스트", 15);
    await page.getByRole("link", { name: "오늘 학습 시작" }).click();
    await gradeByKeyboard(page, 10);
    await expect(page).toHaveURL(/\/vocab\/done$/);
    await page.getByRole("link", { name: "대시보드로" }).click();
    const start = page.getByRole("link", { name: "오늘 학습 시작" });
    await expect(start).toHaveAttribute("href", "/learn/FIXTURE-U01");

    await page.clock.fastForward("40:00"); // 00:20 the next day: new words again
    await expect(start).toHaveAttribute("href", "/vocab");
  });

  test("a session that crosses midnight re-plans for the new day", async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 2, 23, 58) });
    await startAs(page, "테스트", 15);
    await page.getByRole("link", { name: "오늘 학습 시작" }).click();
    await gradeByKeyboard(page, 2);
    await expect(remaining(page)).toHaveText("남은 카드 8");

    await page.clock.fastForward("03:00"); // 00:01 the next day
    await gradeByKeyboard(page, 1);
    // New day: 1 learned so far, 9 more new words (12 fixture words - 3 seen).
    await expect(remaining(page)).toHaveText("남은 카드 9");
  });
});
