// Variant questions (DESIGN 4-2): same concept, new question.
export interface VariantCandidate {
  id: string;
  variantGroup?: string;
}

// First question of the group that is not excluded, or null when the group is used up.
export function pickVariant(pool: readonly VariantCandidate[], group: string, exclude: ReadonlySet<string>): string | null {
  return pool.find((q) => q.variantGroup === group && !exclude.has(q.id))?.id ?? null;
}
