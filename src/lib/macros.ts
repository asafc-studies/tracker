export type MacroTotals = {
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
};

export const QUICK_ADDS: Array<{
  name: string;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
}> = [
  { name: "Chicken breast 150g", proteinG: 46, carbsG: 0, fatG: 5, calories: 231 },
  { name: "Greek yogurt 200g", proteinG: 20, carbsG: 8, fatG: 4, calories: 146 },
  { name: "Eggs ×2", proteinG: 12, carbsG: 1, fatG: 10, calories: 143 },
  { name: "Whey scoop", proteinG: 24, carbsG: 3, fatG: 1, calories: 120 },
  { name: "Rice 150g cooked", proteinG: 4, carbsG: 42, fatG: 0, calories: 185 },
  { name: "Banana", proteinG: 1, carbsG: 27, fatG: 0, calories: 105 },
];

export function sumMacros(
  rows: Array<{
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories: number;
  }>,
): MacroTotals {
  return rows.reduce(
    (acc, row) => ({
      proteinG: acc.proteinG + (row.proteinG || 0),
      carbsG: acc.carbsG + (row.carbsG || 0),
      fatG: acc.fatG + (row.fatG || 0),
      calories: acc.calories + (row.calories || 0),
    }),
    { proteinG: 0, carbsG: 0, fatG: 0, calories: 0 },
  );
}

export function caloriesFromMacros(p: number, c: number, f: number) {
  return Math.round(p * 4 + c * 4 + f * 9);
}

export function scaleMacrosByQuantity(
  row: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories: number;
    quantity?: number | null;
  },
  newQuantity: number,
) {
  const oldQty = row.quantity && row.quantity > 0 ? row.quantity : 1;
  const factor = newQuantity / oldQty;
  const proteinG = Math.round(row.proteinG * factor * 10) / 10;
  const carbsG = Math.round(row.carbsG * factor * 10) / 10;
  const fatG = Math.round(row.fatG * factor * 10) / 10;
  const calories = caloriesFromMacros(proteinG, carbsG, fatG);
  return { proteinG, carbsG, fatG, calories, quantity: newQuantity };
}

export function progressRatio(current: number, target: number) {
  if (!target || target <= 0) return 0;
  return Math.min(1, current / target);
}

export function remaining(current: number, target: number) {
  if (!target || target <= 0) return 0;
  return Math.round(target - current);
}

export function remainingLabel(current: number, target: number, unit: string) {
  if (!target || target <= 0) return null;
  const diff = remaining(current, target);
  if (diff > 0) return `${diff}${unit} left`;
  if (diff < 0) return `${Math.abs(diff)}${unit} over`;
  return `On target`;
}

export type MacroWarningMetric = "fat" | "calories" | "protein" | "carbs";

export type MacroWarning = {
  metric: MacroWarningMetric;
  severity: "warn" | "high";
  title: string;
  detail: string;
};

/** Flags problematic intake vs targets (overs on fat/calories, short protein). */
export function getMacroWarnings(
  intake: MacroTotals,
  targets: {
    calorieTarget: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  },
): MacroWarning[] {
  const warnings: MacroWarning[] = [];
  if (!targets.calorieTarget) return warnings;

  const fatOver = Math.round(intake.fatG - targets.fatG);
  const calOver = Math.round(intake.calories - targets.calorieTarget);
  const proteinShort = Math.round(targets.proteinG - intake.proteinG);
  const carbShort = Math.round(targets.carbsG - intake.carbsG);
  const dayStarted = intake.calories >= targets.calorieTarget * 0.35;

  if (targets.fatG > 0 && fatOver >= 8) {
    warnings.push({
      metric: "fat",
      severity: fatOver >= 18 ? "high" : "warn",
      title:
        fatOver >= 18
          ? `Fat is well over target (+${fatOver}g)`
          : `Fat is over target (+${fatOver}g)`,
      detail: `Logged ${Math.round(intake.fatG)}g vs ${targets.fatG}g. Extra fat burns through the calorie budget fast (9 kcal/g) and often crowds out carbs for lifting.`,
    });
  }

  if (calOver >= 120) {
    warnings.push({
      metric: "calories",
      severity: calOver >= 250 ? "high" : "warn",
      title: `Calories over target (+${calOver} kcal)`,
      detail: `Logged ${Math.round(intake.calories)} vs ${targets.calorieTarget} kcal. That shrinks your recomp deficit for the day.`,
    });
  }

  if (dayStarted && proteinShort >= 25) {
    warnings.push({
      metric: "protein",
      severity: proteinShort >= 45 ? "high" : "warn",
      title: `Protein short of target (−${proteinShort}g)`,
      detail: `${Math.round(intake.proteinG)}g / ${targets.proteinG}g. In a deficit, staying close to target helps protect muscle.`,
    });
  }

  if (dayStarted && fatOver >= 8 && carbShort >= 30) {
    warnings.push({
      metric: "carbs",
      severity: "warn",
      title: `Carbs crowded out (−${carbShort}g)`,
      detail: `${Math.round(intake.carbsG)}g / ${targets.carbsG}g. High fat intake left less room for training fuel.`,
    });
  }

  return warnings;
}

