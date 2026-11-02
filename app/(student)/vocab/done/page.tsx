import { VocabDone } from "@/components/learning/VocabDone";
import { loadStudentUnits } from "@/lib/content/learning";

export default function VocabDonePage() {
  return <VocabDone units={loadStudentUnits().map(({ id, title }) => ({ id, title }))} />;
}
