import {
  MUSCLE_LABELS,
  getExercise,
  type BodyRegion,
  type MuscleGroup,
} from "@/lib/exercises";

export type HeatMode = "sets" | "tonnage";

export type SetLike = {
  lift: string;
  reps: number;
  weightKg: number;
};

export type SessionLike = {
  date: string;
  durationMinutes?: number | null;
  distanceKm?: number | null;
  sets: SetLike[];
};

export type MuscleHeatRow = {
  muscle: MuscleGroup;
  label: string;
  /** Raw day total (sets or kg tonnage). */
  value: number;
  /**
   * Comparison max for this muscle: best single-day total in recent history,
   * floored at SETS_FLOOR / TONNAGE_FLOOR so new muscles still have a bar.
   */
  baseline: number;
  /** 0–1 = value / max(baseline, value). */
  intensity: number;
};

/** Biomechanical / impact coefficients by exercise id. */
const LOAD_FACTOR: Record<string, number> = {
  // Pull / hang
  pull_up_bar: 0.95,
  chin_up: 0.95,
  outdoor_pull_up: 0.95,
  muscle_up: 0.9,
  assisted_pullup_machine: 0.7,
  hanging_leg_raise: 0.5,
  outdoor_hanging_knee_raise: 0.5,
  outdoor_toes_to_bar: 0.55,
  // Push
  push_up: 0.64,
  outdoor_push_up: 0.64,
  pike_push_up: 0.7,
  trx_push_up: 0.6,
  dip_parallel_bars: 0.85,
  outdoor_dip: 0.85,
  // Legs BW
  normal_squat: 0.85,
  burpee: 0.75,
  box_jump: 0.7,
  bear_crawl: 0.55,
  // Core
  plank: 0.35,
  outdoor_plank: 0.35,
  outdoor_side_plank: 0.35,
  ab_wheel: 0.5,
  outdoor_crunch: 0.45,
  outdoor_sit_up: 0.5,
  outdoor_leg_raise: 0.45,
  outdoor_russian_twist: 0.4,
  outdoor_bicycle_crunch: 0.45,
  outdoor_mountain_climber: 0.4,
  outdoor_v_up: 0.5,
  outdoor_jackknife_sit_up: 0.5,
  outdoor_dead_bug: 0.35,
  ab_crunch_machine: 0.4,
  roman_chair_side_bend: 0.4,
  // Cardio impact
  running: 1.2,
  sprint_intervals: 1.4,
  cycling: 0.22,
  hiking: 0.9,
  rucking: 1.0,
  jump_rope: 1.1,
  swimming: 0.7,
  stair_climb: 1.15,
};

const HOLD_IDS = new Set([
  "plank",
  "outdoor_plank",
  "outdoor_side_plank",
]);

/** Easy-pace baselines (min/km) for effort scaling. */
const CARDIO_REF_PACE: Record<string, number> = {
  running: 6.5,
  sprint_intervals: 5.0,
  cycling: 3.0,
  hiking: 12,
  rucking: 10,
  swimming: 20,
  stair_climb: 8,
  jump_rope: 0, // distance rarely logged
};

const SECONDARY = 0.5;
const SETS_FLOOR = 3;
const TONNAGE_FLOOR = 2500;
/** Sets-mode default when cardio has no useful duration. */
const CARDIO_DEFAULT_SETS = 4;

export function exerciseLoadFactor(exerciseId: string): number {
  const known = LOAD_FACTOR[exerciseId];
  if (known != null) return known;
  const ex = getExercise(exerciseId);
  if (!ex) return 0.7;
  if (ex.type === "cardio") return 1.0;
  if (ex.bodyRegions.includes("core") || ex.muscles.includes("abs")) return 0.45;
  if (ex.bodyweight) return 0.7;
  return 0;
}

function muscleShare(index: number): number {
  return index === 0 ? 1 : SECONDARY;
}

/** Effective external load for one non-cardio set (kg). */
export function setLoadKg(
  lift: string,
  reps: number,
  weightKg: number,
  bodyWeightKg: number | null | undefined,
): number {
  const ex = getExercise(lift);
  if (!ex || ex.type === "cardio") return 0;
  const r = Math.max(0, reps);
  const added = Math.max(0, weightKg);
  const bw = bodyWeightKg != null && bodyWeightKg > 0 ? bodyWeightKg : 0;
  const factor = exerciseLoadFactor(lift);

  if (HOLD_IDS.has(lift)) {
    // reps stored as seconds
    return r * (added + bw * factor) * 0.08;
  }

  if (ex.bodyweight) {
    return r * (added + bw * factor);
  }
  return r * added;
}

/**
 * Cardio stimulus from distance + pace (preferred) or duration fallback.
 * Units are comparable kg·reps-ish tonnage, not literal physics.
 */
export function cardioLoadKg(
  lift: string,
  session: Pick<SessionLike, "durationMinutes" | "distanceKm">,
  bodyWeightKg: number | null | undefined,
): number {
  const ex = getExercise(lift);
  if (!ex || ex.type !== "cardio") return 0;
  const bw = bodyWeightKg != null && bodyWeightKg > 0 ? bodyWeightKg : 75;
  const impact = exerciseLoadFactor(lift);
  const dist =
    session.distanceKm != null && Number(session.distanceKm) > 0
      ? Number(session.distanceKm)
      : null;
  const mins =
    session.durationMinutes != null && Number(session.durationMinutes) > 0
      ? Number(session.durationMinutes)
      : null;

  let effort = 1;
  if (dist != null && mins != null && dist > 0) {
    const pace = mins / dist;
    const ref = CARDIO_REF_PACE[lift] ?? 6.5;
    if (ref > 0) {
      effort = Math.min(1.8, Math.max(0.55, ref / pace));
    }
  }

  if (dist != null) {
    return dist * bw * impact * effort;
  }
  if (mins != null) {
    return mins * bw * impact * 0.06;
  }
  return bw * impact * 2;
}

/** Sets-mode cardio contribution (set-equivalents). */
export function cardioDefaultSets(
  session: Pick<SessionLike, "durationMinutes" | "distanceKm">,
): number {
  const mins =
    session.durationMinutes != null && Number(session.durationMinutes) > 0
      ? Number(session.durationMinutes)
      : null;
  if (mins != null) {
    return Math.max(3, Math.min(12, Math.round(mins / 10)));
  }
  const dist =
    session.distanceKm != null && Number(session.distanceKm) > 0
      ? Number(session.distanceKm)
      : null;
  if (dist != null) {
    return Math.max(3, Math.min(12, Math.round(dist)));
  }
  return CARDIO_DEFAULT_SETS;
}

function addMuscle(
  map: Map<MuscleGroup, number>,
  muscle: MuscleGroup,
  amount: number,
) {
  if (amount <= 0) return;
  map.set(muscle, (map.get(muscle) ?? 0) + amount);
}

/** Aggregate day loads for one calendar date's sessions. */
export function dayMuscleLoads(
  sessions: SessionLike[],
  bodyWeightKg: number | null | undefined,
  mode: HeatMode,
): Map<MuscleGroup, number> {
  const totals = new Map<MuscleGroup, number>();
  const cardioSeen = new Set<string>();

  for (const session of sessions) {
    for (const set of session.sets) {
      const ex = getExercise(set.lift);
      if (!ex) continue;

      if (ex.type === "cardio") {
        const key = `${session.date}:${set.lift}`;
        if (cardioSeen.has(key)) continue;
        cardioSeen.add(key);
        const amount =
          mode === "sets"
            ? cardioDefaultSets(session)
            : cardioLoadKg(set.lift, session, bodyWeightKg);
        ex.muscles.forEach((m, i) => {
          addMuscle(
            totals,
            m,
            mode === "sets" ? amount : amount * muscleShare(i),
          );
        });
        continue;
      }

      if (mode === "sets") {
        for (const m of ex.muscles) addMuscle(totals, m, 1);
        continue;
      }

      const load = setLoadKg(
        set.lift,
        set.reps,
        set.weightKg,
        bodyWeightKg,
      );
      ex.muscles.forEach((m, i) => {
        addMuscle(totals, m, load * muscleShare(i));
      });
    }
  }
  return totals;
}

function groupSessionsByDate(sessions: SessionLike[]): Map<string, SessionLike[]> {
  const byDate = new Map<string, SessionLike[]>();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  }
  return byDate;
}

function recentMaxByMuscle(
  sessions: SessionLike[],
  bodyWeightKg: number | null | undefined,
  mode: HeatMode,
): Map<MuscleGroup, number> {
  const maxes = new Map<MuscleGroup, number>();
  for (const daySessions of groupSessionsByDate(sessions).values()) {
    const day = dayMuscleLoads(daySessions, bodyWeightKg, mode);
    for (const [m, v] of day) {
      maxes.set(m, Math.max(maxes.get(m) ?? 0, v));
    }
  }
  return maxes;
}

function toRows(
  day: Map<MuscleGroup, number>,
  maxes: Map<MuscleGroup, number>,
  mode: HeatMode,
): MuscleHeatRow[] {
  const floor = mode === "sets" ? SETS_FLOOR : TONNAGE_FLOOR;
  return Array.from(day.entries())
    .filter(([, v]) => v > 0)
    .map(([muscle, value]) => {
      const baseline = Math.max(maxes.get(muscle) ?? 0, floor);
      const cap = Math.max(baseline, value);
      return {
        muscle,
        label: MUSCLE_LABELS[muscle],
        value: Math.round(value * 10) / 10,
        baseline: Math.round(baseline * 10) / 10,
        intensity: Math.min(1, value / cap),
      };
    })
    .sort((a, b) => b.value - a.value);
}

const REGION_MUSCLES: Partial<Record<BodyRegion, MuscleGroup[]>> = {
  chest: ["pectorals", "upper_chest"],
  back: ["lats", "mid_back", "lower_back", "traps"],
  shoulders: ["front_delts", "side_delts", "rear_delts"],
  arms: ["biceps", "triceps", "forearms"],
  legs: ["quads", "hamstrings", "calves", "hip_flexors"],
  glutes: ["glutes"],
  core: ["abs", "obliques"],
  cardio: ["cardiovascular"],
};

export function regionLoadsFromMuscles(
  muscleLoads: Map<MuscleGroup, number>,
): Partial<Record<BodyRegion, number>> {
  const out: Partial<Record<BodyRegion, number>> = {};
  for (const [region, muscles] of Object.entries(REGION_MUSCLES) as [
    BodyRegion,
    MuscleGroup[],
  ][]) {
    let n = 0;
    for (const m of muscles) n += muscleLoads.get(m) ?? 0;
    if (n > 0) out[region] = Math.round(n * 10) / 10;
  }
  return out;
}

export function buildMuscleHeat(
  daySessions: SessionLike[],
  historySessions: SessionLike[],
  bodyWeightKg: number | null | undefined,
): { sets: MuscleHeatRow[]; tonnage: MuscleHeatRow[] } {
  const hist = [...historySessions, ...daySessions];
  const daySets = dayMuscleLoads(daySessions, bodyWeightKg, "sets");
  const dayTon = dayMuscleLoads(daySessions, bodyWeightKg, "tonnage");
  const maxSets = recentMaxByMuscle(hist, bodyWeightKg, "sets");
  const maxTon = recentMaxByMuscle(hist, bodyWeightKg, "tonnage");
  return {
    sets: toRows(daySets, maxSets, "sets"),
    tonnage: toRows(dayTon, maxTon, "tonnage"),
  };
}
