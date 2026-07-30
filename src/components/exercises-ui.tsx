"use client";

import type { ReactNode } from "react";

export type ExercisePanel =
  | "overview"
  | "muscles"
  | "log"
  | "plan"
  | "tips"
  | "history";

export const EXERCISE_PANELS: Array<{
  id: ExercisePanel;
  label: string;
  short?: string;
}> = [
  { id: "overview", label: "Overview", short: "Day" },
  { id: "muscles", label: "Muscles" },
  { id: "log", label: "Log" },
  { id: "plan", label: "Plan" },
  { id: "tips", label: "Tips" },
  { id: "history", label: "History" },
];

export function ExercisePanelNav({
  active,
  onChange,
}: {
  active: ExercisePanel;
  onChange: (id: ExercisePanel) => void;
}) {
  return (
    <nav
      className="flex gap-0.5 overflow-x-auto overscroll-x-contain border-b border-[var(--border)] mb-6 no-scrollbar"
      aria-label="Exercise sections"
    >
      {EXERCISE_PANELS.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`shrink-0 px-3 sm:px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              isActive
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.short ?? tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function PanelCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden ${className}`}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
        <div className="min-w-0">
          <h3 className="text-sm font-medium tracking-tight">{title}</h3>
          {subtitle ? (
            <div className="mt-1 text-[var(--muted)]">{subtitle}</div>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children ? (
        <div className="px-4 py-4 border-t border-[var(--border)]/50">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function EditToggle({
  editing,
  onClick,
  label = "Edit",
}: {
  editing: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-colors min-h-[44px]"
    >
      {editing ? "Close" : label}
    </button>
  );
}

export function DisplayNumber({
  children,
  size = "md",
  className = "",
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeClass =
    size === "lg"
      ? "text-2xl sm:text-3xl"
      : size === "sm"
        ? "text-base"
        : "text-xl";
  return (
    <span
      className={`font-[family-name:var(--font-syne)] tabular-nums tracking-tight text-[var(--foreground)] ${sizeClass} ${className}`}
    >
      {children}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 min-w-[7rem]">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <DisplayNumber size="md" className="mt-1 block">
        {value}
      </DisplayNumber>
      {hint ? (
        <p className="text-[10px] text-[var(--muted)] mt-1 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

export function SetChip({
  weightKg,
  reps,
  bodyweight,
  cardio = false,
  distanceKm,
  timePending = false,
}: {
  weightKg: number;
  reps: number;
  bodyweight: boolean;
  cardio?: boolean;
  distanceKm?: number | null;
  /** Cardio logged before Stop — time not locked yet. */
  timePending?: boolean;
}) {
  if (cardio) {
    const dist =
      distanceKm != null && Number(distanceKm) > 0
        ? `${distanceKm} km`
        : null;
    if (timePending) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-2 py-1 text-sm">
          {dist ? (
            <DisplayNumber size="sm">{dist}</DisplayNumber>
          ) : (
            <span className="text-[var(--muted)] text-xs">cardio</span>
          )}
          <span className="text-[var(--muted)] text-xs">· time on stop</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-2 py-1 text-sm">
        <DisplayNumber size="sm">{reps}</DisplayNumber>
        <span className="text-[var(--muted)] text-xs">min</span>
        {dist ? (
          <>
            <span className="text-[var(--muted)] text-xs">·</span>
            <DisplayNumber size="sm">{dist}</DisplayNumber>
          </>
        ) : null}
      </span>
    );
  }
  const weightLabel = bodyweight
    ? weightKg > 0
      ? `+${weightKg}`
      : "BW"
    : String(weightKg);
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-md bg-[var(--surface-2)] px-2 py-1 text-sm"
    >
      <DisplayNumber size="sm">{weightLabel}</DisplayNumber>
      <span className="text-[var(--muted)] text-xs">×</span>
      <DisplayNumber size="sm">{reps}</DisplayNumber>
    </span>
  );
}

export function fieldClass() {
  return "w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";
}
