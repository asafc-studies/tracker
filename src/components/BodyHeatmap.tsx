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
import type { HeatMode } from "@/lib/muscle-tonnage";

type MuscleRow = {
  muscle: MuscleGroup;
  label: string;
  value: number;
  intensity: number;
};

type Props = {
  mode: HeatMode;
  muscles: MuscleRow[];
  regionCounts?: Partial<Record<BodyRegion, number>>;
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

const HEAT_COLORS = ["#c45c3e", "#e07050", "#f09070"] as const;

function heatColor(intensity: number): string {
  if (intensity <= 0) return "transparent";
  const t = Math.min(1, intensity);
  const r = Math.round(90 + t * 165);
  const g = Math.round(90 - t * 55);
  const b = Math.round(95 - t * 70);
  return `rgb(${r}, ${g}, ${b})`;
}

function formatValue(mode: HeatMode, value: number): string {
  if (mode === "sets") {
    return `${Math.round(value)} set${Math.round(value) === 1 ? "" : "s"}`;
  }
  if (value >= 1000) return `${(value / 1000).toFixed(1)}t`;
  return `${Math.round(value)} kg`;
}

export function BodyHeatmap({
  mode,
  muscles,
  regionCounts = {},
  dateLabel,
}: Props) {
  const slugIntensity = useMemo(() => {
    const map = new Map<Slug, number>();
    for (const row of muscles) {
      for (const slug of MUSCLE_TO_SLUG[row.muscle] ?? []) {
        map.set(slug, Math.max(map.get(slug) ?? 0, row.intensity));
      }
    }
    return map;
  }, [muscles]);

  const bodyData = useMemo((): ExtendedBodyPart[] => {
    const parts: ExtendedBodyPart[] = [];
    for (const [slug, t] of slugIntensity) {
      if (t <= 0) continue;
      parts.push({
        slug,
        intensity: t > 0.66 ? 3 : t > 0.33 ? 2 : 1,
        color: heatColor(t),
      });
    }
    return parts;
  }, [slugIntensity]);

  const topMuscles = muscles
    .filter((m) => m.muscle !== "cardiovascular")
    .slice(0, 6);

  const activeRegions = (
    Object.entries(regionCounts) as [BodyRegion, number][]
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const regionMax = Math.max(1, ...activeRegions.map(([, n]) => n), 0);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Worked {dateLabel ?? "today"}
        </p>
        <p className="text-[10px] text-[var(--muted)] text-right max-w-[11rem] leading-snug">
          {mode === "sets"
            ? "Redder = closer to your recent best day for that muscle"
            : "Redder = closer to your recent best volume day"}
        </p>
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
        {topMuscles.length > 0 ? (
          topMuscles.map((m) => (
            <span
              key={m.muscle}
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: heatColor(m.intensity),
                color: m.intensity > 0.45 ? "#fff" : "var(--foreground)",
              }}
            >
              {m.label || MUSCLE_LABELS[m.muscle]} ·{" "}
              {formatValue(mode, m.value)}
            </span>
          ))
        ) : activeRegions.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">
            No muscles logged for this day
          </span>
        ) : (
          activeRegions.map(([r, n]) => (
            <span
              key={r}
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: heatColor(n / regionMax),
                color: n / regionMax > 0.45 ? "#fff" : "var(--foreground)",
              }}
            >
              {BODY_REGION_LABELS[r]} · {formatValue(mode, n)}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
