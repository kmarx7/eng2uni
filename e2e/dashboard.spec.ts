import { expect, test } from "@playwright/test";
import { emptyBaseURL } from "../playwright.config";
import { expectNoHorizontalOverflow, startAs } from "./helpers";

test("a first visit goes to the start screen, then to today's plan", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/start$/, { timeout: 20_000 });
  await expect(page.getByRole("banner")).toContainText("English 90");
  await page.getByRole("button", { name: "시작하기" }).click();
  // Next.js adds its own role="alert" route announcer, so match by text.
  await expect(page.getByText("닉네임을 입력해 주세요.")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await startAs(page, "테스트", 30);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("오늘의 학습");
  await expect(page.getByText("테스트님, 하루 목표 30분")).toBeVisible();
  await expect(page.getByRole("link", { name: "오늘 학습 시작" })).toBeVisible();
  await expect(page.getByText("수능 지문 어휘 커버리지")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test.describe("without approved vocabulary", () => {
  test.use({ baseURL: emptyBaseURL });

  test("the dashboard says so and the start button is disabled", async ({ page }) => {
    await startAs(page, "테스트", 15);
    await expect(page.getByText("아직 학습할 단어가 없습니다.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "오늘 학습 시작" })).toBeDisabled();
  });
});
