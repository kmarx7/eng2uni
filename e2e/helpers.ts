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
