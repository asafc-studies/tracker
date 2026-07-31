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

/** Protein adherence uses the floor (≈1.61 g/kg), not the range ceiling. */
export function proteinRemainingLabel(
  current: number,
  minG: number,
  maxG: number,
) {
  if (!minG || minG <= 0) return null;
  if (current < minG) {
    return `${Math.round(minG - current)}g to range`;
  }
  if (maxG > 0 && current > maxG) {
    return `${Math.round(current - maxG)}g over max`;
  }
  if (maxG > 0 && current >= maxG) {
    return "At range max";
  }
  return "In range";
}

export type ProteinBarZone = "low" | "soft" | "hard" | "max" | "over";

/** Soft 1.61→1.85, harder 1.85→max, darkest at max; over = past ceiling. */
export function proteinBarZone(
  current: number,
  minG: number,
  goodG: number,
  maxG: number,
): ProteinBarZone {
  if (current < minG) return "low";
  if (current < goodG) return "soft";
  if (maxG > 0 && current > maxG) return "over";
  if (maxG > 0 && current >= maxG) return "max";
  return "hard";
}

export function proteinBarFillClass(zone: ProteinBarZone | "low" | "soft" | "hard" | "max" | "over") {
  if (zone === "low") return "bg-[var(--protein-low)]";
  if (zone === "soft") return "bg-[var(--accent)]/45";
  if (zone === "hard") return "bg-[var(--accent)]/80";
  if (zone === "over") return "bg-[var(--warn)]";
  return "bg-[var(--accent)]"; // max — darkest green
}

/** Stacked fill: blue → soft → harder → darkest at ceiling. */
export function proteinBarSegments(
  current: number,
  minG: number,
  goodG: number,
  maxG: number,
): Array<{
  key: "low" | "soft" | "hard" | "max";
  leftPct: number;
  widthPct: number;
}> {
  if (maxG <= 0 || current <= 0) return [];
  const capped = Math.min(current, maxG);
  const out: Array<{
    key: "low" | "soft" | "hard" | "max";
    leftPct: number;
    widthPct: number;
  }> = [];

  const lowEnd = Math.min(capped, minG);
  if (lowEnd > 0) {
    out.push({
      key: "low",
      leftPct: 0,
      widthPct: (lowEnd / maxG) * 100,
    });
  }
  if (capped > minG) {
    const softEnd = Math.min(capped, goodG);
    out.push({
      key: "soft",
      leftPct: (minG / maxG) * 100,
      widthPct: ((softEnd - minG) / maxG) * 100,
    });
  }
  if (capped > goodG) {
    /** Harder green through the band; darkest when the ceiling is reached. */
    const atCeiling = current >= maxG;
    out.push({
      key: atCeiling ? "max" : "hard",
      leftPct: (goodG / maxG) * 100,
      widthPct: ((capped - goodG) / maxG) * 100,
    });
  }
  return out;
}

/** Compact macros line, e.g. "P 46 · C 0 · F 5 · K 231" */
export function formatMacroShort(macros: {
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
}) {
  const p = Math.round(macros.proteinG * 10) / 10;
  const c = Math.round(macros.carbsG * 10) / 10;
  const f = Math.round(macros.fatG * 10) / 10;
  const k = Math.round(macros.calories);
  return `P ${p} · C ${c} · F ${f} · K ${k}`;
}


export type MacroWarningMetric = "fat" | "calories" | "protein" | "carbs";

/** Visual tone — protein uses bar colors; fat/calories stay warn. */
export type MacroWarningTone = "warn" | "low" | "soft" | "hard";

export type MacroWarning = {
  metric: MacroWarningMetric;
  severity: "warn" | "high" | "info";
  title: string;
  detail: string;
  tone?: MacroWarningTone;
};

/** Flags problematic intake vs targets (overs on fat/calories, protein range nudges). */
export function getMacroWarnings(
  intake: MacroTotals,
  targets: {
    calorieTarget: number;
    proteinG: number;
    /** Floor ≈1.61 g/kg — preferred for protein warnings. */
    proteinMinG?: number;
    proteinGoodG?: number;
    proteinMaxG?: number;
    carbsG: number;
    fatG: number;
  },
): MacroWarning[] {
  const warnings: MacroWarning[] = [];
  if (!targets.calorieTarget) return warnings;

  const fatOver = Math.round(intake.fatG - targets.fatG);
  const calOver = Math.round(intake.calories - targets.calorieTarget);
  const proteinFloor = targets.proteinMinG ?? targets.proteinG;
  const proteinGood = targets.proteinGoodG ?? proteinFloor;
  const proteinMax = targets.proteinMaxG ?? targets.proteinG;
  const logged = Math.round(intake.proteinG);
  const toFloor = Math.round(proteinFloor - intake.proteinG);
  const toGood = Math.round(proteinGood - intake.proteinG);
  const toMax = Math.round(proteinMax - intake.proteinG);
  const carbShort = Math.round(targets.carbsG - intake.carbsG);
  const dayStarted = intake.calories >= targets.calorieTarget * 0.35;

  if (targets.fatG > 0 && fatOver >= 8) {
    warnings.push({
      metric: "fat",
      severity: fatOver >= 18 ? "high" : "warn",
      tone: "warn",
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
      tone: "warn",
      title: `Calories over target (+${calOver} kcal)`,
      detail: `Logged ${Math.round(intake.calories)} vs ${targets.calorieTarget} kcal. That shrinks your recomp deficit for the day.`,
    });
  }

  if (dayStarted && proteinFloor > 0) {
    if (toFloor > 0) {
      warnings.push({
        metric: "protein",
        severity: toFloor >= 40 ? "high" : "warn",
        tone: "warn",
        title: `Protein below floor (−${toFloor}g)`,
        detail: `${logged}g logged — ${toFloor}g to reach ${proteinFloor}g (1.61 g/kg). That’s the start of the good range.`,
      });
    } else if (toGood > 0) {
      warnings.push({
        metric: "protein",
        severity: "info",
        tone: "soft",
        title: `Good — soft green (could be better)`,
        detail: `${logged}g clears ${proteinFloor}g (1.61 g/kg). About ${toGood}g more reaches ${proteinGood}g (1.85 g/kg) — good enough.`,
      });
    } else if (toMax > 0) {
      warnings.push({
        metric: "protein",
        severity: "info",
        tone: "hard",
        title: `Good enough — hard green`,
        detail: `${logged}g hits ${proteinGood}g (1.85 g/kg). Optional: ${toMax}g more toward ${proteinMax}g (2.2 g/kg) for the top of the range.`,
      });
    } else if (logged > proteinMax) {
      const over = logged - proteinMax;
      warnings.push({
        metric: "protein",
        severity: "warn",
        tone: "warn",
        title: `Protein past the top of the range (+${over}g)`,
        detail: `${logged}g is above ${proteinMax}g (2.2 g/kg). You’re past the useful ceiling — ease off a bit if calories are tight.`,
      });
    }
  }

  if (dayStarted && fatOver >= 8 && carbShort >= 30) {
    warnings.push({
      metric: "carbs",
      severity: "warn",
      tone: "warn",
      title: `Carbs crowded out (−${carbShort}g)`,
      detail: `${Math.round(intake.carbsG)}g / ${targets.carbsG}g. High fat intake left less room for training fuel.`,
    });
  }

  return warnings;
}

