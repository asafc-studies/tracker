import { Suspense } from "react";
import { ExercisesPage } from "@/components/ExercisesPage";

export default function ExercisesRoute() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-[var(--muted)]">Loading…</div>
      }
    >
      <ExercisesPage />
    </Suspense>
  );
}
