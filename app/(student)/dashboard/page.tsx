import { TodayPlan } from "@/components/dashboard/TodayPlan";
import { loadStudentUnits } from "@/lib/content/learning";
import { loadCoverageEntries, loadStudentVocabulary } from "@/lib/content/vocabulary";
import { coverageWeights } from "@/lib/engine/coverage";

export default function DashboardPage() {
  const words = loadStudentVocabulary();
  const entries = loadCoverageEntries();
  const lemmaById = Object.fromEntries(words.map((w) => [w.id, w.lemma]));
  return (
    <TodayPlan
      wordOrder={words.map((w) => w.id)}
      lemmaById={lemmaById}
      coverage={entries ? coverageWeights(entries, words.map((w) => w.lemma)) : null}
      units={loadStudentUnits().map(({ id, title }) => ({ id, title }))}
    />
  );
}
