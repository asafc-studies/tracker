"use client";

import { useMemo } from "react";
import {
  BODY_REGION_LABELS,
  type BodyRegion,
} from "@/lib/exercises";

type Props = {
  regionCounts: Partial<Record<BodyRegion, number>>;
  dateLabel?: string;
};

function heatColor(intensity: number): string {
  if (intensity <= 0) return "rgba(80, 80, 88, 0.45)";
  const t = Math.min(1, intensity);
  const r = Math.round(90 + t * 165);
  const g = Math.round(90 - t * 55);
  const b = Math.round(95 - t * 70);
  const a = 0.45 + t * 0.5;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function intensityFor(
  region: BodyRegion,
  counts: Partial<Record<BodyRegion, number>>,
  max: number,
): number {
  if (max <= 0) return 0;
  let n = counts[region] ?? 0;
  if (region === "legs" || region === "core") {
    n += (counts.full_body ?? 0) * 0.4;
  }
  if (region === "legs") {
    n += (counts.cardio ?? 0) * 0.5;
  }
  return Math.min(1, n / max);
}

function Region({
  fill,
  children,
}: {
  fill: string;
  children: React.ReactNode;
}) {
  return (
    <g className="heat-region" style={{ fill, transition: "fill 0.7s ease" }}>
      {children}
    </g>
  );
}

export function BodyHeatmap({ regionCounts, dateLabel }: Props) {
  const max = useMemo(() => {
    const vals = Object.values(regionCounts).filter(
      (n): n is number => typeof n === "number",
    );
    return Math.max(1, ...vals, 0);
  }, [regionCounts]);

  const c = useMemo(
    () => ({
      chest: heatColor(intensityFor("chest", regionCounts, max)),
      shoulders: heatColor(intensityFor("shoulders", regionCounts, max)),
      arms: heatColor(intensityFor("arms", regionCounts, max)),
      core: heatColor(intensityFor("core", regionCounts, max)),
      glutes: heatColor(intensityFor("glutes", regionCounts, max)),
      legs: heatColor(intensityFor("legs", regionCounts, max)),
      back: heatColor(intensityFor("back", regionCounts, max)),
    }),
    [regionCounts, max],
  );

  const activeRegions = (
    Object.entries(regionCounts) as [BodyRegion, number][]
  )
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Worked {dateLabel ?? "today"}
        </p>
        <p className="text-[10px] text-[var(--muted)]">Redder = more sets</p>
      </div>

      <div className="flex items-center justify-center gap-8 sm:gap-12">
        <div className="flex flex-col items-center gap-2">
          <svg
            viewBox="0 0 120 280"
            className="w-28 h-auto body-heat-svg"
            aria-label="Front body heatmap"
          >
            <ellipse cx="60" cy="22" rx="16" ry="18" fill="rgba(80,80,88,0.35)" />
            <rect x="52" y="38" width="16" height="12" rx="3" fill="rgba(80,80,88,0.35)" />
            <Region fill={c.shoulders}>
              <ellipse cx="32" cy="58" rx="14" ry="12" />
              <ellipse cx="88" cy="58" rx="14" ry="12" />
            </Region>
            <Region fill={c.chest}>
              <path d="M38 52 Q60 48 82 52 L80 88 Q60 96 40 88 Z" />
            </Region>
            <Region fill={c.arms}>
              <rect x="14" y="66" width="14" height="58" rx="7" />
              <rect x="92" y="66" width="14" height="58" rx="7" />
            </Region>
            <Region fill={c.core}>
              <path d="M42 90 Q60 94 78 90 L76 130 Q60 138 44 130 Z" />
            </Region>
            <Region fill={c.legs}>
              <rect x="40" y="132" width="16" height="72" rx="8" />
              <rect x="64" y="132" width="16" height="72" rx="8" />
              <rect x="42" y="206" width="13" height="52" rx="6" />
              <rect x="65" y="206" width="13" height="52" rx="6" />
            </Region>
          </svg>
          <span className="text-[10px] text-[var(--muted)]">Front</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <svg
            viewBox="0 0 120 280"
            className="w-28 h-auto body-heat-svg"
            aria-label="Back body heatmap"
          >
            <ellipse cx="60" cy="22" rx="16" ry="18" fill="rgba(80,80,88,0.35)" />
            <rect x="52" y="38" width="16" height="12" rx="3" fill="rgba(80,80,88,0.35)" />
            <Region fill={c.shoulders}>
              <ellipse cx="32" cy="58" rx="14" ry="12" />
              <ellipse cx="88" cy="58" rx="14" ry="12" />
            </Region>
            <Region fill={c.back}>
              <path d="M36 52 Q60 46 84 52 L82 100 Q60 110 38 100 Z" />
              <path d="M42 98 Q60 104 78 98 L76 128 Q60 134 44 128 Z" />
            </Region>
            <Region fill={c.arms}>
              <rect x="14" y="66" width="14" height="58" rx="7" />
              <rect x="92" y="66" width="14" height="58" rx="7" />
            </Region>
            <Region fill={c.glutes}>
              <ellipse cx="48" cy="142" rx="14" ry="16" />
              <ellipse cx="72" cy="142" rx="14" ry="16" />
            </Region>
            <Region fill={c.legs}>
              <rect x="40" y="156" width="16" height="50" rx="8" />
              <rect x="64" y="156" width="16" height="50" rx="8" />
              <rect x="42" y="208" width="13" height="50" rx="6" />
              <rect x="65" y="208" width="13" height="50" rx="6" />
            </Region>
          </svg>
          <span className="text-[10px] text-[var(--muted)]">Back</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center">
        {activeRegions.length === 0 ? (
          <span className="text-sm text-[var(--muted)]">
            No muscles logged for this day
          </span>
        ) : (
          activeRegions.map(([r, n]) => (
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
          ))
        )}
      </div>
    </div>
  );
}
