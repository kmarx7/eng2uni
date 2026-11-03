import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCookieValue, assertAdmin } from "@/lib/pipeline/admin-guard";

describe("assertAdmin", () => {
  it("is not found in a production build, even with the right password", () => {
    const run = () => assertAdmin({ nodeEnv: "production", password: "x", cookie: adminCookieValue("x") });
    expect(run).toThrow();
    try {
      run();
    } catch (error: unknown) {
      expect(String((error as { digest?: string }).digest)).toContain("404");
    }
  });

  it("asks for a login without the right cookie or without a password set", () => {
    expect(assertAdmin({ nodeEnv: "development", password: "x", cookie: undefined })).toBe("login");
    expect(assertAdmin({ nodeEnv: "development", password: "x", cookie: adminCookieValue("y") })).toBe("login");
    expect(assertAdmin({ nodeEnv: "development", password: undefined, cookie: adminCookieValue("") })).toBe("login");
  });

  it("lets the right cookie in", () => {
    expect(assertAdmin({ nodeEnv: "development", password: "x", cookie: adminCookieValue("x") })).toBe("ok");
  });

  it("never stores the password itself in the cookie", () => {
    expect(adminCookieValue("secret")).not.toContain("secret");
  });
});

describe("proxy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("answers 404 for /admin in production before any page renders", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { proxy } = await import("@/proxy");
    expect(proxy().status).toBe(404);
  });

  it("lets /admin through on a dev server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { proxy } = await import("@/proxy");
    expect(proxy().headers.get("x-middleware-next")).toBe("1");
  });
});
