import { SkillReviewSession } from "@/components/learning/SkillReviewSession";
import { loadReviewBundle } from "@/lib/content/learning";

export default function ReviewPage() {
  return <SkillReviewSession bundle={loadReviewBundle()} />;
}
