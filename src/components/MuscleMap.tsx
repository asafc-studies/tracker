"use client";

import {
  BODY_REGION_LABELS,
  type BodyRegion,
  type MuscleGroup,
} from "@/lib/exercises";
import type { HeatMode } from "@/lib/muscle-tonnage";

type MuscleRow = {
  muscle: MuscleGroup;
  label: string;
  value: number;
  intensity: number;
};

type Props = {
  mode: HeatMode;
  regions: BodyRegion[];
  muscles: MuscleRow[];
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

/** Absolute day totals for the bar list (not vs historical max). */
function formatValue(mode: HeatMode, value: number): string {
  if (mode === "sets") {
    return `${Math.round(value)}`;
  }
  // Volume work in kg; ≥1000 shown as t (1000 kg of volume).
  if (value >= 1000) return `${(value / 1000).toFixed(1)}t`;
  return `${Math.round(value)} kg`;
}

export function MuscleMap({
  mode,
  regions,
  muscles,
  title = "Muscle detail",
}: Props) {
  const rows = muscles
    .filter((m) => m.muscle !== "cardiovascular")
    .slice(0, 12);
  const maxValue = Math.max(1, ...rows.map((m) => m.value), 0);

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

      {rows.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-[var(--muted)]">
            {mode === "sets"
              ? "Sets today (bar = share of day’s max)"
              : "Volume today · kg (bar = share of day’s max)"}
          </p>
          <ul className="space-y-1.5">
            {rows.map((m) => (
              <li key={m.muscle} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-[var(--muted)] truncate">
                  {m.label}
                </span>
                <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all"
                    style={{
                      width: `${Math.min(100, (m.value / maxValue) * 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-[var(--muted)] w-14 text-right tabular-nums">
                  {formatValue(mode, m.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
