"use client";

import { useActionState } from "react";
import { type LoginState, login } from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="text-title font-bold tracking-tight">검수 로그인</h1>
      <label className="flex flex-col gap-2">
        <span>비밀번호</span>
        <input name="password" type="password" autoComplete="current-password" required className="h-12 rounded-lg border px-3 text-base" />
      </label>
      {state.error && (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 text-base">
        들어가기
      </Button>
    </form>
  );
}
