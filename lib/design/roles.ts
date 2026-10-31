// Sentence-role display metadata. Colors live in app/tokens.css; this file
// pairs each role with the letter symbol that must always accompany the color.

export const SENTENCE_ROLES = ["S", "V", "O", "C", "M"] as const;

export type SentenceRoleSymbol = (typeof SENTENCE_ROLES)[number];

export const ROLE_DISPLAY: Record<
  SentenceRoleSymbol,
  { label: string; token: string }
> = {
  S: { label: "주어", token: "role-s" },
  V: { label: "동사", token: "role-v" },
  O: { label: "목적어", token: "role-o" },
  C: { label: "보어", token: "role-c" },
  M: { label: "수식어", token: "role-m" },
};
