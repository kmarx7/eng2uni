import { cookies } from "next/headers";
import { ADMIN_COOKIE, assertAdmin } from "@/lib/pipeline/admin-guard";

export const contentDir = () => process.env.CONTENT_DIR ?? "content";

export async function adminState(): Promise<"ok" | "login"> {
  const jar = await cookies();
  return assertAdmin({ nodeEnv: process.env.NODE_ENV, password: process.env.ADMIN_PASSWORD, cookie: jar.get(ADMIN_COOKIE)?.value });
}
