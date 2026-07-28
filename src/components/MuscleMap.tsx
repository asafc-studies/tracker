"use client";

import {
  BODY_REGION_LABELS,
  type BodyRegion,
  type MuscleGroup,
} from "@/lib/exercises";

type Props = {
  regions: BodyRegion[];
  muscles: Array<{ muscle: MuscleGroup; sets: number; label: string }>;
  title?: string;
};

const REGION_ORDER: BodyRegion[] = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "glutes",
  "legs",
  "full_body",
  "cardio",
];

export function MuscleMap({ regions, muscles, title = "Muscle detail" }: Props) {
  const maxSets = muscles.reduce((m, x) => Math.max(m, x.sets), 0);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
        {title}
      </p>

      <div className="flex flex-wrap gap-2">
        {REGION_ORDER.filter((r) => regions.includes(r)).map((r) => (
          <span
            key={r}
            className="rounded-full px-3 py-1 text-xs font-medium bg-[var(--accent-soft)] text-[var(--accent)]"
          >
            {BODY_REGION_LABELS[r]}
          </span>
        ))}
        {regions.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">No muscles logged yet</span>
        ) : null}
      </div>

      {muscles.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted)]">Muscle groups</p>
          <ul className="space-y-1.5">
            {muscles.slice(0, 12).map((m) => {
              const intensity = maxSets > 0 ? m.sets / maxSets : 0;
              return (
                <li key={m.muscle} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-[var(--muted)] truncate">
                    {m.label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] transition-all"
                      style={{ width: `${Math.max(12, intensity * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--muted)] w-12 text-right">
                    {m.sets} sets
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
