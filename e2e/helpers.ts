import { expect, type Page } from "@playwright/test";

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
}

export async function startAs(page: Page, nickname: string, minutes: 15 | 30 | 60): Promise<void> {
  await page.goto("/");
  // The dev server compiles /start on first use; the client redirect waits for it.
  await expect(page).toHaveURL(/\/start$/, { timeout: 20_000 });
  await page.getByLabel("닉네임").fill(nickname);
  await page.getByText(`${minutes}분`, { exact: true }).click();
  await page.getByRole("button", { name: "시작하기" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export function remaining(page: Page) {
  return page.getByText(/^남은 카드 \d+$/);
}

// Puts a lesson into the stored progress, as if the student had got that far.
export async function seedLesson(page: Page, unitId: string, lesson: Record<string, unknown>): Promise<void> {
  await page.evaluate(
    ({ unitId, lesson }) => {
      const key = "english90.progress";
      const progress = JSON.parse(localStorage.getItem(key)!);
      progress.lessons[unitId] = {
        unitId,
        status: "in_progress",
        phase: "main",
        blockIndex: 0,
        queue: [],
        round: 0,
        attempts: [],
        analyzerPassed: true,
        updatedAt: new Date().toISOString(),
        ...lesson,
      };
      localStorage.setItem(key, JSON.stringify(progress));
    },
    { unitId, lesson },
  );
}

export async function storedProgress(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("english90.progress")!));
}

export function remainingQuestions(page: Page) {
  return page.getByTestId("remaining-questions");
}

// Picks an option by its text and submits.
export async function answer(page: Page, option: string): Promise<void> {
  await page.locator("label").filter({ hasText: new RegExp(`^.?${option}$`) }).click();
  await page.getByRole("button", { name: "제출" }).click();
}
