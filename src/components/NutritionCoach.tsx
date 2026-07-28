"use client";

import {
  buildNutritionCoach,
  type CoachTargets,
} from "@/lib/nutrition-coach";
import type { MacroTotals } from "@/lib/macros";

type Props = {
  intake: MacroTotals;
  targets: CoachTargets;
  compact?: boolean;
};

function statusAccent(status: ReturnType<typeof buildNutritionCoach>["status"]) {
  if (status === "on_track") return "text-[var(--accent)]";
  if (status === "incomplete") return "text-[var(--muted)]";
  return "text-[var(--foreground)]";
}

export function NutritionCoach({ intake, targets, compact }: Props) {
  const coach = buildNutritionCoach(intake, targets);
  const { timeline } = coach;

  return (
    <section
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] ${
        compact ? "p-4 space-y-4" : "p-5 space-y-5"
      }`}
    >
      <header className="space-y-1">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
          Recomp check
        </p>
        <h2
          className={`text-base font-semibold tracking-tight leading-snug ${statusAccent(coach.status)}`}
        >
          {coach.headline}
        </h2>
      </header>

      <div
        className={`rounded-lg border border-[var(--border)] bg-[var(--surface-2)] ${
          compact ? "px-3 py-3" : "px-4 py-3.5"
        } space-y-1`}
      >
        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Body fat timeline
        </p>
        <p className="text-sm leading-relaxed text-[var(--foreground)]">
          {timeline.summary}
        </p>
        {timeline.recheckWeeks != null ? (
          <p className="text-xs text-[var(--accent)] pt-1">
            Suggested BF recheck: ~{timeline.recheckWeeks} weeks
            {timeline.daysToHalfPoint != null
              ? ` (≈${timeline.daysToHalfPoint} days at today’s pace)`
              : ""}
          </p>
        ) : null}
      </div>

      {coach.why.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Why
          </p>
          <ul className="space-y-3">
            {coach.why.map((block) => (
              <li key={block.title} className="space-y-1">
                <p className="text-sm font-medium">{block.title}</p>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {block.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {coach.improvements.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            How to improve
          </p>
          <ul className="space-y-3">
            {coach.improvements.map((block) => (
              <li key={block.title} className="space-y-1">
                <p className="text-sm font-medium">{block.title}</p>
                <p className="text-sm text-[var(--muted)] leading-relaxed">
                  {block.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-[var(--muted)] leading-relaxed border-t border-[var(--border)] pt-3">
        {coach.closing}
      </p>
    </section>
  );
}
