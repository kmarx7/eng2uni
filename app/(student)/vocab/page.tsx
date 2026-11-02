import { VocabSession } from "@/components/learning/VocabSession";
import { loadStudentVocabulary } from "@/lib/content/vocabulary";

export default function VocabPage() {
  return <VocabSession words={loadStudentVocabulary()} />;
}
