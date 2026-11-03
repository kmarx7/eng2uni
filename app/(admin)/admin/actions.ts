"use server";

// Admin review actions. Each one re-checks the session; approval needs
// REVIEWER_NAME so every approved item records the person who approved it.
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_COOKIE, adminCookieValue } from "@/lib/pipeline/admin-guard";
import { approve, approveBatch, editItem, reject, sendBatchToIndividual } from "@/lib/pipeline/review-store";
import { adminState, contentDir } from "./session";

export interface LoginState {
  error: string | null;
}

export async function login(_: LoginState, form: FormData): Promise<LoginState> {
  if (process.env.NODE_ENV === "production") notFound();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return { error: "ADMIN_PASSWORD가 설정되지 않았습니다" };
  if (adminCookieValue(String(form.get("password") ?? "")) !== adminCookieValue(password)) return { error: "비밀번호가 맞지 않습니다" };
  (await cookies()).set(ADMIN_COOKIE, adminCookieValue(password), { httpOnly: true, sameSite: "strict", path: "/admin" });
  redirect("/admin/review-queue");
}

export type AdminResult = { ok: true; message: string } | { ok: false; error: string };

const ItemId = z.string().regex(/^[A-Za-z0-9_-]+$/);
const reviewer = () => process.env.REVIEWER_NAME ?? "";

async function guarded(run: () => AdminResult): Promise<AdminResult> {
  if ((await adminState()) !== "ok") return { ok: false, error: "로그인이 필요합니다" };
  const result = run();
  revalidatePath("/admin/review-queue");
  return result;
}

export async function approveItem(id: string): Promise<AdminResult> {
  const itemId = ItemId.parse(id);
  return guarded(() => {
    const result = approve(contentDir(), itemId, reviewer(), new Date());
    return result.ok ? { ok: true, message: `${itemId} 승인` } : result;
  });
}

export async function rejectItem(id: string): Promise<AdminResult> {
  const itemId = ItemId.parse(id);
  return guarded(() => {
    const result = reject(contentDir(), itemId, reviewer(), new Date());
    return result.ok ? { ok: true, message: `${itemId} 폐기` } : result;
  });
}

export async function saveEdit(id: string, json: string): Promise<AdminResult> {
  const itemId = ItemId.parse(id);
  const text = z.string().max(200_000).parse(json);
  return guarded(() => {
    const result = editItem(contentDir(), itemId, text);
    return result.ok ? { ok: true, message: `${itemId} 저장` } : { ok: false, error: result.errors.join("; ") };
  });
}

export async function approveBatchAction(unitId: string, sampleSeen: string[]): Promise<AdminResult> {
  const unit = ItemId.parse(unitId);
  const seen = z.array(ItemId).max(1000).parse(sampleSeen);
  return guarded(() => {
    const result = approveBatch(contentDir(), unit, seen, reviewer(), new Date());
    if (!result.ok) return result;
    const message = `${result.approved}개 승인`;
    return result.errors.length ? { ok: false, error: `${message}, 실패: ${result.errors.join("; ")}` } : { ok: true, message };
  });
}

export async function sendToIndividual(unitId: string): Promise<AdminResult> {
  const unit = ItemId.parse(unitId);
  return guarded(() => {
    sendBatchToIndividual(contentDir(), unit);
    return { ok: true, message: `${unit} 묶음을 개별 검수로 보냈습니다` };
  });
}
