import { z } from "zod";
import { Id, IsoDateTime, ReviewStatus } from "./common";

const CheckResult = z.enum(["pass", "fail"]);

// Pipeline state of one draft item, kept beside the drafts in
// content/drafts/records/{unitId}.json so approved-content schemas stay unchanged.
// id is the draft item's id.
export const ReviewRecord = z
  .object({
    id: Id,
    kind: z.enum(["sentence", "question", "unit", "vocabulary", "catalog"]),
    unitId: Id,
    status: ReviewStatus,
    reasons: z.array(z.string().min(1)).default([]),
    checks: z.object({
      rules: CheckResult,
      vocab: CheckResult,
      tags: z.enum(["pass", "fail", "n/a"]),
      similarity: z.enum(["pass", "fail", "skipped"]),
    }),
    crossSolve: z.object({ answer: Id.nullable(), agrees: z.boolean() }).optional(),
    preReview: z.object({ issues: z.array(z.string().min(1)) }).optional(),
    generatedAt: IsoDateTime,
    reviewedBy: z.string().min(1).optional(),
    reviewedAt: IsoDateTime.optional(),
    reports: z
      .array(z.object({ at: IsoDateTime, reason: z.string().min(1), note: z.string().optional() }))
      .default([]),
  })
  .refine((r) => r.status !== "approved" || (r.reviewedBy && r.reviewedAt), {
    message: "approved records need reviewedBy and reviewedAt",
    path: ["reviewedBy"],
  });

export type ReviewRecord = z.infer<typeof ReviewRecord>;
