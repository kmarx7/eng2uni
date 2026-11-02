import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LessonRunner } from "@/components/learning/LessonRunner";
import { loadStudentUnits, loadUnitBundle } from "@/lib/content/learning";

// The unit id is request data, so the unit loads inside a Suspense boundary.
export default function LearnPage({ params }: { params: Promise<{ unitId: string }> }) {
  return (
    <Suspense fallback={null}>
      <Lesson params={params} />
    </Suspense>
  );
}

async function Lesson({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const bundle = loadUnitBundle(unitId);
  if (!bundle) notFound();
  const units = loadStudentUnits().map(({ id, title }) => ({ id, title }));
  return <LessonRunner bundle={bundle} units={units} />;
}
