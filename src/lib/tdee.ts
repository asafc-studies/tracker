export type Sex = "male" | "female";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

/** Standard Harris-Benedict-style activity multipliers (EEE is tracked separately). */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.725, // treated as Active; TDEE already covers baseline training
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: "Sedentary",
  light: "Light (1–3×/week)",
  moderate: "Moderate (3–5×/week)",
  active: "Active (6–7×/week)",
  very_active: "Active (6–7×/week)",
};

/** Primary options shown in the UI (4 standard multipliers). */
export const ACTIVITY_OPTIONS: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
];

export const DEFAULT_DEFICIT_KCAL = 400;
export const DEFAULT_PROTEIN_PER_KG = 2.2;
export const FAT_CALORIE_FRACTION = 0.25;

/** Lean body mass from total weight and body-fat %. */
export function leanBodyMassKg(weightKg: number, bodyFatPercent: number) {
  const bf = Math.min(60, Math.max(3, bodyFatPercent));
  return weightKg * (1 - bf / 100);
}

/**
 * Katch-McArdle BMR (kcal/day).
 * BMR = 370 + (21.6 × LeanBodyMassKg)
 */
export function bmrKatchMcArdle(leanMassKg: number) {
  return 370 + 21.6 * leanMassKg;
}

/** @deprecated Prefer bmrKatchMcArdle — kept for reference only. */
export function bmrMifflin({
  weightKg,
  heightCm,
  age,
  sex,
}: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function calcTdeeFromBmr(bmr: number, activityLevel: ActivityLevel) {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function clampDeficit(deficit: number) {
  // Garthe et al. 2011–aligned recomp deficit (~400 kcal); allow narrow band for overrides
  return Math.min(500, Math.max(300, Math.round(deficit)));
}

export function calcTargets(input: {
  weightKg: number;
  bodyFatPercent: number;
  activityLevel: ActivityLevel;
  deficitKcal?: number;
  proteinPerKg?: number;
}) {
  const lbm = leanBodyMassKg(input.weightKg, input.bodyFatPercent);
  const bmr = bmrKatchMcArdle(lbm);
  const tdee = calcTdeeFromBmr(bmr, input.activityLevel);
  const deficit = clampDeficit(input.deficitKcal ?? DEFAULT_DEFICIT_KCAL);
  const calorieTarget = Math.max(1200, tdee - deficit);

  const proteinPerKg = input.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG;
  const proteinG = Math.round(input.weightKg * proteinPerKg);
  const proteinKcal = proteinG * 4;

  const fatKcal = calorieTarget * FAT_CALORIE_FRACTION;
  const fatG = Math.round(fatKcal / 9);

  const carbKcal = Math.max(0, calorieTarget - proteinKcal - fatG * 9);
  const carbsG = Math.round(carbKcal / 4);

  return {
    leanBodyMassKg: Math.round(lbm * 10) / 10,
    bodyFatPercent: input.bodyFatPercent,
    bmr: Math.round(bmr),
    tdee,
    deficit,
    calorieTarget,
    proteinG,
    carbsG,
    fatG,
    proteinPerKg,
  };
}

export function todayISODate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export type ProfileForTargets = {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: "male" | "female" | null;
  bodyFatPercent: number | null;
  activityLevel: ActivityLevel | null;
  deficitKcal: number | null;
  proteinPerKg: number | null;
  calorieTargetOverride: number | null;
  proteinTargetOverride: number | null;
};

export function resolveTargets(profile: ProfileForTargets) {
  if (!profile.weightKg || profile.bodyFatPercent == null) {
    return null;
  }
  if (
    !Number.isFinite(profile.bodyFatPercent) ||
    profile.bodyFatPercent <= 0 ||
    profile.bodyFatPercent >= 70
  ) {
    return null;
  }

  const computed = calcTargets({
    weightKg: profile.weightKg,
    bodyFatPercent: profile.bodyFatPercent,
    activityLevel: (profile.activityLevel ?? "moderate") as ActivityLevel,
    deficitKcal: profile.deficitKcal ?? DEFAULT_DEFICIT_KCAL,
    proteinPerKg: profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
  });

  return {
    ...computed,
    calorieTarget: profile.calorieTargetOverride ?? computed.calorieTarget,
    proteinG: profile.proteinTargetOverride ?? computed.proteinG,
    computedCalorieTarget: computed.calorieTarget,
    computedProteinG: computed.proteinG,
    hasOverrides:
      profile.calorieTargetOverride != null ||
      profile.proteinTargetOverride != null,
  };
}

/**
 * Compendium of Physical Activities — resistance training (MET ≈ 5.5).
 * CaloriesBurned = 5.5 × 3.5 × (WeightKg / 200) × DurationMinutes
 * Insight only — do not subtract from daily calorie target (TDEE covers baseline).
 */
export const RESISTANCE_TRAINING_MET = 5.5;

export function caloriesBurnedResistance(
  weightKg: number,
  durationMinutes: number,
  met = RESISTANCE_TRAINING_MET,
) {
  if (
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return 0;
  }
  return Math.round(met * 3.5 * (weightKg / 200) * durationMinutes);
}
