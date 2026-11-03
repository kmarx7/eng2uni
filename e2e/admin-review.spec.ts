import { cpSync, rmSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ADMIN_CONTENT_DIR, adminBaseURL } from "../playwright.config";

// The admin screen writes content, so tests run one at a time (desktop project
// only, see playwright.config.ts) over a fresh copy of the fixture tree.
test.describe.configure({ mode: "serial" });
test.use({ baseURL: adminBaseURL });

const U = "FIXTURE-U05";
const S1 = `FIXTURE-S-${U}-001`;
const Q1 = `FIXTURE-Q-${U}-001`;

test.beforeEach(() => {
  rmSync(ADMIN_CONTENT_DIR, { recursive: true, force: true });
  cpSync("e2e/fixtures/admin-content", ADMIN_CONTENT_DIR, { recursive: true });
});

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("비밀번호").fill("test");
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page).toHaveURL(/\/admin\/review-queue/);
}

const current = (page: Page) => page.getByRole("region", { name: "검수 항목" });

test("asks for the password first", async ({ page }) => {
  await page.goto("/admin/review-queue");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("비밀번호").fill("wrong");
  await page.getByRole("button", { name: "들어가기" }).click();
  await expect(page.getByText("비밀번호가 맞지 않습니다")).toBeVisible();
});

test("shows flagged items first and approves a sentence before its question", async ({ page }) => {
  await login(page);
  await expect(current(page)).toContainText(Q1);
  await expect(current(page)).toContainText("교차 풀이 불일치(고른 답: b)");
  await page.getByRole("button", { name: "승인", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText(`문장 ${S1}을 먼저 승인하세요`);

  await page.getByRole("list", { name: "검수 목록" }).getByRole("button", { name: new RegExp(S1) }).click();
  await expect(current(page)).toContainText(S1);
  await page.keyboard.press("a");
  await expect(page.locator("main").getByRole("status")).toContainText(`${S1} 승인`);
  await page.getByRole("list", { name: "검수 목록" }).getByRole("button", { name: new RegExp(Q1) }).click();
  await page.getByRole("button", { name: "승인", exact: true }).click();
  await expect(page.locator("main").getByRole("status")).toContainText(`${Q1} 승인`);
  const list = page.getByRole("list", { name: "검수 목록" });
  await expect(list).not.toContainText(S1);
  await expect(list).not.toContainText(Q1);
});

test("approves a clean batch only after every sample is opened", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "깨끗한 묶음" }).click();
  const approveAll = page.getByRole("button", { name: "모두 승인 (3개)" });
  await expect(approveAll).toBeDisabled();
  const openers = page.getByRole("button", { name: /^표본 펼치기/ });
  await expect(openers).toHaveCount(3);
  for (let i = 0; i < 3; i++) await openers.first().click();
  await expect(approveAll).toBeEnabled();
  await approveAll.click();
  await expect(page.locator("main").getByRole("status")).toContainText("3개 승인");
  await expect(page.getByText("깨끗한 문항이 없습니다")).toBeVisible();
});

test("keeps an item unchanged when the edit is not valid JSON", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "수정", exact: true }).click();
  const editor = page.getByLabel("JSON");
  await editor.fill("{");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("JSON 형식 오류");
  await page.getByRole("button", { name: "취소" }).click();
  await expect(current(page)).toContainText("첫 문장의 주어는?");
});
