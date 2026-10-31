import { expect, test } from "@playwright/test";

test("root redirects to an empty dashboard with the app header", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("banner")).toContainText("English 90");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("오늘의 학습");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
