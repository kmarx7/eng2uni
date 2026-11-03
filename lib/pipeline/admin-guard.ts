// The admin review screen is local-only (stage 8 design §6): a production build
// answers 404, and a dev server needs ADMIN_PASSWORD. The cookie holds a hash,
// never the password.
import { createHash, timingSafeEqual } from "node:crypto";
import { notFound } from "next/navigation";

export const ADMIN_COOKIE = "english90-admin";

export function adminCookieValue(password: string): string {
  return createHash("sha256").update(`english90-admin:${password}`).digest("hex");
}

export interface AdminCheck {
  nodeEnv: string | undefined;
  password: string | undefined;
  cookie: string | undefined;
}

export function assertAdmin({ nodeEnv, password, cookie }: AdminCheck): "ok" | "login" {
  if (nodeEnv === "production") notFound();
  if (!password || !cookie) return "login";
  const expected = Buffer.from(adminCookieValue(password));
  const given = Buffer.from(cookie);
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "login";
}
