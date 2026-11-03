import { defineConfig, devices } from "@playwright/test";

// Dedicated ports so e2e never reuses another local app on :3000.
// :3090 serves the test vocabulary in content/_fixtures/valid; :3092 has no
// vocabulary at all (a missing folder) for the empty state.
const PORT = 3090;
const EMPTY_PORT = 3092;
const ADMIN_PORT = 3094;
const baseURL = `http://localhost:${PORT}`;
export const emptyBaseURL = `http://localhost:${EMPTY_PORT}`;
// :3094 is the admin review screen over a scratch copy of e2e/fixtures/admin-content,
// which each admin test resets (e2e/admin-review.spec.ts).
export const adminBaseURL = `http://localhost:${ADMIN_PORT}`;
export const ADMIN_CONTENT_DIR = ".e2e-admin-content";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone SE"], defaultBrowserType: "chromium" }, testIgnore: /admin-review/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT}`,
      url: baseURL,
      env: { CONTENT_DIR: "content/_fixtures/valid", ENABLE_REPORTS: "1", REPORTS_DIR: ".e2e-reports" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // A second dev server needs its own build folder.
      command: `npm run dev -- --port ${EMPTY_PORT}`,
      url: emptyBaseURL,
      env: { CONTENT_DIR: "e2e/no-content", NEXT_DIST_DIR: ".next-e2e-empty" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `rm -rf ${ADMIN_CONTENT_DIR} && cp -R e2e/fixtures/admin-content ${ADMIN_CONTENT_DIR} && npm run dev -- --port ${ADMIN_PORT}`,
      url: `${adminBaseURL}/admin/login`,
      env: { CONTENT_DIR: ADMIN_CONTENT_DIR, NEXT_DIST_DIR: ".next-e2e-admin", ADMIN_PASSWORD: "test", REVIEWER_NAME: "e2e" },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
