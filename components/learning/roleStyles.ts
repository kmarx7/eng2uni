import type { RoleSymbol } from "@/lib/engine/analyzer";

// Full class names so Tailwind keeps them; colors come from app/tokens.css.
// Ink on the soft tint keeps text at 4.5:1 or better.
export const ROLE_CLASS: Record<RoleSymbol, string> = {
  S: "bg-role-s-soft text-role-s-ink border-role-s",
  V: "bg-role-v-soft text-role-v-ink border-role-v",
  O: "bg-role-o-soft text-role-o-ink border-role-o",
};
