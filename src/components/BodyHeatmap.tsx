"use client";

import { useMemo } from "react";
import Body, {
  type ExtendedBodyPart,
  type Slug,
} from "react-muscle-highlighter";
import {
  BODY_REGION_LABELS,
  MUSCLE_LABELS,
  type BodyRegion,
  type MuscleGroup,
} from "@/lib/exercises";

type MuscleRow = { muscle: MuscleGroup; sets: number; label: string };

type Props = {
  regionCounts: Partial<Record<BodyRegion, number>>;
  muscles?: MuscleRow[];
  dateLabel?: string;
};

/** Map catalog muscle groups → anatomical SVG slugs. */
const MUSCLE_TO_SLUG: Partial<Record<MuscleGroup, Slug[]>> = {
  pectorals: ["chest"],
  upper_chest: ["chest"],
  lats: ["upper-back"],
  mid_back: ["upper-back"],
  lower_back: ["lower-back"],
  traps: ["trapezius"],
  front_delts: ["deltoids"],
  side_delts: ["deltoids"],
  rear_delts: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
  abs: ["abs"],
  obliques: ["obliques"],
  hip_flexors: ["adductors"],
};

const REGION_TO_SLUG: Partial<Record<BodyRegion, Slug[]>> = {
  chest: ["chest"],
  back: ["upper-back", "lower-back", "trapezius"],
  shoulders: ["deltoids"],
  arms: ["biceps", "triceps", "forearm"],
  legs: ["quadriceps", "hamstring", "calves"],
  glutes: ["gluteal"],
  core: ["abs", "obliques"],
  full_body: ["chest", "upper-back", "quadriceps", "abs", "deltoids"],
};

const HEAT_COLORS = ["#c45c3e", "#e07050", "#f09070"] as const;

function heatColor(intensity: number): string {
  if (intensity <= 0) return "transparent";
  const t = Math.min(1, intensity);
  const r = Math.round(90 + t * 165);
  const g = Math.round(90 - t * 55);
  const b = Math.round(95 - t * 70);
  return `rgb(${r}, ${g}, ${b})`;
}

function slugCountsFromMuscles(
  muscles: MuscleRow[],
): Map<Slug, number> {
  const counts = new Map<Slug, number>();
  for (const { muscle, sets } of muscles) {
    for (const slug of MUSCLE_TO_SLUG[muscle] ?? []) {
      counts.set(slug, (counts.get(slug) ?? 0) + sets);
    }
  }
  return counts;
}

function slugCountsFromRegions(
  regionCounts: Partial<Record<BodyRegion, number>>,
): Map<Slug, number> {
  const counts = new Map<Slug, number>();
  for (const [region, n] of Object.entries(regionCounts) as [
    BodyRegion,
    number,
  ][]) {
    if (!n) continue;
    for (const slug of REGION_TO_SLUG[region] ?? []) {
      counts.set(slug, (counts.get(slug) ?? 0) + n);
    }
  }
  return counts;
}

export function BodyHeatmap({ regionCounts, muscles, dateLabel }: Props) {
  const slugCounts = useMemo(() => {
    if (muscles && muscles.length > 0) return slugCountsFromMuscles(muscles);
    return slugCountsFromRegions(regionCounts);
  }, [muscles, regionCounts]);

  const max = useMemo(
    () => Math.max(1, ...slugCounts.values(), 0),
    [slugCounts],
  );

  const bodyData = useMemo((): ExtendedBodyPart[] => {
    const parts: ExtendedBodyPart[] = [];
    for (const [slug, n] of slugCounts) {
      if (n <= 0) continue;
      const t = Math.min(1, n / max);
      parts.push({
        slug,
        intensity: t > 0.66 ? 3 : t > 0.33 ? 2 : 1,
        color: heatColor(t),
      });
    }
    return parts;
  }, [slugCounts, max]);

  const activeRegions = (
    Object.entries(regionCounts) as [BodyRegion, number][]
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const topMuscles = (muscles ?? [])
    .filter((m) => m.muscle !== "cardiovascular")
    .slice(0, 6);
  const muscleMax = Math.max(1, ...topMuscles.map((m) => m.sets), 0);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Worked {dateLabel ?? "today"}
        </p>
        <p className="text-[10px] text-[var(--muted)]">Redder = more sets</p>
      </div>

      <div className="grid grid-cols-2 gap-1 sm:gap-3 place-items-center w-full max-w-sm mx-auto">
        <div className="flex flex-col items-center gap-1 w-full min-w-0">
          <div className="w-full max-w-[150px] sm:max-w-[190px] mx-auto [&_svg]:!w-full [&_svg]:!h-auto">
            <Body
              data={bodyData}
              side="front"
              gender="male"
              scale={0.75}
              colors={[...HEAT_COLORS]}
              border="#5a5a62"
              defaultFill="#3a3a42"
              defaultStroke="none"
            />
          </div>
          <span className="text-[10px] text-[var(--muted)]">Front</span>
        </div>
        <div className="flex flex-col items-center gap-1 w-full min-w-0">
          <div className="w-full max-w-[150px] sm:max-w-[190px] mx-auto [&_svg]:!w-full [&_svg]:!h-auto">
            <Body
              data={bodyData}
              side="back"
              gender="male"
              scale={0.75}
              colors={[...HEAT_COLORS]}
              border="#5a5a62"
              defaultFill="#3a3a42"
              defaultStroke="none"
            />
          </div>
          <span className="text-[10px] text-[var(--muted)]">Back</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {topMuscles.length > 0
          ? topMuscles.map((m) => {
              const t = m.sets / muscleMax;
              return (
                <span
                  key={m.muscle}
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: heatColor(t),
                    color: t > 0.45 ? "#fff" : "var(--foreground)",
                  }}
                >
                  {m.label || MUSCLE_LABELS[m.muscle]} · {m.sets}
                </span>
              );
            })
          : activeRegions.length === 0
            ? (
              <span className="text-sm text-[var(--muted)]">
                No muscles logged for this day
              </span>
            )
            : activeRegions.map(([r, n]) => (
                <span
                  key={r}
                  className="rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{
                    background: heatColor(n / max),
                    color: n / max > 0.45 ? "#fff" : "var(--foreground)",
                  }}
                >
                  {BODY_REGION_LABELS[r]} · {n}
                </span>
              ))}
      </div>
    </div>
  );
}
