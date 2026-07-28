import type { MacroTotals } from "@/lib/macros";
import { DEFAULT_DEFICIT_KCAL } from "@/lib/tdee";

/** Classic estimate: ~7700 kcal ≈ 1 kg body fat. */
export const KCAL_PER_KG_FAT = 7700;

export type CoachTargets = {
  calorieTarget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  tdee: number;
  deficit: number;
  bodyFatPercent?: number;
  weightKg?: number | null;
};

export type CoachBlock = {
  title: string;
  body: string;
};

export type BodyFatTimeline = {
  actualDeficitKcal: number;
  plannedDeficitKcal: number;
  kgFatPerWeek: number;
  /** Rough days until ~0.5 percentage points of BF could move (measurable). */
  daysToHalfPoint: number | null;
  /** Suggested recheck window in weeks. */
  recheckWeeks: number | null;
  summary: string;
};

export type NutritionCoachResult = {
  status: "incomplete" | "on_track" | "needs_work" | "surplus";
  headline: string;
  why: CoachBlock[];
  improvements: CoachBlock[];
  closing: string;
  timeline: BodyFatTimeline;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function buildTimeline(
  intakeKcal: number,
  targets: CoachTargets,
): BodyFatTimeline {
  const plannedDeficitKcal = targets.deficit || DEFAULT_DEFICIT_KCAL;
  const actualDeficitKcal = Math.round(targets.tdee - intakeKcal);
  const kgFatPerWeek = (actualDeficitKcal * 7) / KCAL_PER_KG_FAT;

  const weightKg = targets.weightKg ?? null;
  const bf = targets.bodyFatPercent;

  let daysToHalfPoint: number | null = null;
  let recheckWeeks: number | null = null;
  let summary: string;

  if (actualDeficitKcal <= 50) {
    summary =
      actualDeficitKcal < -100
        ? "At this surplus, fat loss will stall or reverse. Expect little useful change on the scale or calipers until calories settle near your recomp target."
        : "You're roughly at maintenance today. Body-fat % won't move much until you sustain a modest deficit over several weeks.";
  } else if (weightKg && bf != null && bf > 0) {
    // 0.5 percentage points of body weight as fat ≈ measurable change
    const kgForHalfPoint = weightKg * 0.005;
    const days = Math.ceil((kgForHalfPoint * KCAL_PER_KG_FAT) / actualDeficitKcal);
    daysToHalfPoint = Math.min(120, Math.max(7, days));
    recheckWeeks = Math.min(12, Math.max(2, Math.ceil(daysToHalfPoint / 7)));
    const weekly = round1(Math.abs(kgFatPerWeek));
    summary =
      kgFatPerWeek > 0
        ? `At today's pace (~${Math.round(actualDeficitKcal)} kcal/day under TDEE), that's about ${weekly} kg fat/week. A ~0.5% body-fat shift may show in roughly ${daysToHalfPoint} days — recheck in about ${recheckWeeks} weeks, not daily.`
        : `You're above maintenance; fat is more likely to hold or climb than drop.`;
  } else {
    const weekly = round1(Math.abs(kgFatPerWeek));
    recheckWeeks = actualDeficitKcal > 200 ? 3 : 4;
    summary =
      kgFatPerWeek > 0
        ? `Rough pace: ~${weekly} kg fat/week from a ${Math.round(actualDeficitKcal)} kcal daily deficit. Recheck body fat in ~${recheckWeeks} weeks.`
        : "Log weight and body fat in Profile so we can time a recheck window.";
  }

  return {
    actualDeficitKcal,
    plannedDeficitKcal,
    kgFatPerWeek: round1(kgFatPerWeek),
    daysToHalfPoint,
    recheckWeeks,
    summary,
  };
}

/**
 * Deterministic recomposition coaching from logged intake vs targets.
 * Softens critique when the day looks incomplete (<55% of calorie target logged).
 */
export function buildNutritionCoach(
  intake: MacroTotals,
  targets: CoachTargets,
): NutritionCoachResult {
  const timeline = buildTimeline(intake.calories, targets);
  const planned = targets.deficit || DEFAULT_DEFICIT_KCAL;
  const actualDeficit = timeline.actualDeficitKcal;
  const incomplete = intake.calories < targets.calorieTarget * 0.55;

  const why: CoachBlock[] = [];
  const improvements: CoachBlock[] = [];

  const proteinGap = Math.round(targets.proteinG - intake.proteinG);
  const fatOver = Math.round(intake.fatG - targets.fatG);
  const carbGap = Math.round(targets.carbsG - intake.carbsG);
  const calorieGap = Math.round(targets.calorieTarget - intake.calories);

  // --- Calorie / deficit ---
  if (incomplete) {
    why.push({
      title: "Day still filling in",
      body: `You've logged ${Math.round(intake.calories)} of ~${targets.calorieTarget} kcal so far. The notes below are based on what's entered — finish logging before treating this as the full day.`,
    });
  } else if (actualDeficit > planned + 150 || actualDeficit >= 600) {
    why.push({
      title: "The deficit is too deep",
      body: `By eating ${Math.round(intake.calories)} calories against a TDEE of ${targets.tdee}, your actual deficit for the day was ${actualDeficit} calories, not the planned ${planned}. You'll lose fat, but large deficits raise the risk of breaking down muscle — which works against lifting for recomposition.`,
    });
    if (calorieGap > 50) {
      improvements.push({
        title: "Add mostly protein and carbs",
        body: `You have roughly ${calorieGap} calories left to close toward your ${targets.calorieTarget} kcal target. Fill that gap with lean protein and carbs (seafood, whey + fruit, rice/pasta sides) rather than more cooking fats.`,
      });
    }
  } else if (actualDeficit < planned - 150 && intake.calories > targets.calorieTarget + 100) {
    why.push({
      title: "Calories ran high for recomp",
      body: `Logged ${Math.round(intake.calories)} kcal vs a ${targets.calorieTarget} target (TDEE ${targets.tdee}). Today's effective deficit was only ${actualDeficit} kcal against a planned ${planned}. Fat loss slows when the gap stays this small.`,
    });
    improvements.push({
      title: "Trim dense extras",
      body: `Aim closer to ${targets.calorieTarget} kcal tomorrow. Small cuts in oils, sauces, and snacks usually reclaim that budget without dropping protein.`,
    });
  } else if (!incomplete) {
    why.push({
      title: "Calories are in a solid recomp range",
      body: `Logged ${Math.round(intake.calories)} kcal vs ${targets.calorieTarget} target. Effective deficit ~${actualDeficit} kcal (planned ${planned}) — a sustainable pace for losing fat while lifting.`,
    });
  }

  // --- Protein ---
  if (proteinGap >= 20) {
    why.push({
      title: "Protein is short for a deficit",
      body: `${Math.round(intake.proteinG)}g is fine for maintenance days, but in a calorie deficit muscle protein breakdown rises. Getting closer to ${targets.proteinG}g protects the muscle you're training for.`,
    });
    improvements.push({
      title: "Close the protein gap",
      body:
        proteinGap <= 40
          ? `About ${proteinGap}g protein left — a scoop of whey, Greek yogurt, or a lean meat/fish portion usually covers it.`
          : `You're ~${proteinGap}g under protein. Prioritize a lean protein serving at your next meal before adding more carbs or fats.`,
    });
  } else if (proteinGap > 5 && !incomplete) {
    why.push({
      title: "Protein is nearly there",
      body: `${Math.round(intake.proteinG)}g / ${targets.proteinG}g — close enough for most days; another small serving would nail the target.`,
    });
  }

  // --- Fat vs carbs ---
  if (fatOver >= 12 && carbGap >= 25) {
    why.push({
      title: "Fats are crowding out carbs",
      body: `Fat landed ~${Math.round(intake.fatG)}g (${fatOver}g over the ~${targets.fatG}g target). Because fat is ~9 kcal/g, that quickly uses the calorie budget and left carbs ~${carbGap}g short of ~${targets.carbsG}g. Carbs fuel heavy compounds; low glycogen can make sessions feel flat.`,
    });
    improvements.push({
      title: "Dial back cooking fats",
      body: `Ease up slightly on oils, butter, and heavy sauces when cooking. Trimming about a tablespoon of oil (~14g fat / ~120 kcal) often brings fat back near ${targets.fatG}g and frees room for rice, pasta, fruit, or potatoes.`,
    });
  } else if (fatOver >= 15) {
    why.push({
      title: "Fat ran high",
      body: `${Math.round(intake.fatG)}g fat vs ~${targets.fatG}g target. That density eats calorie room that could go to protein or carbs for training.`,
    });
  } else if (carbGap >= 40 && !incomplete) {
    why.push({
      title: "Carbs are low for lifting",
      body: `${Math.round(intake.carbsG)}g carbs vs ~${targets.carbsG}g. If you trained (or will), an extra carb side helps performance without wrecking the deficit if calories still fit.`,
    });
  }

  // --- Improvements fallback ---
  if (improvements.length === 0 && !incomplete) {
    if (Math.abs(calorieGap) <= 100 && proteinGap <= 15) {
      improvements.push({
        title: "Keep the rhythm",
        body: `Stay near ${targets.calorieTarget} kcal with protein around ${targets.proteinG}g. Consistency beats perfect daily hits.`,
      });
    } else if (calorieGap > 100) {
      improvements.push({
        title: "Finish toward target",
        body: `Roughly ${calorieGap} kcal left in the budget — prefer protein + carbs so training and muscle retention stay supported.`,
      });
    }
  }

  let status: NutritionCoachResult["status"] = "on_track";
  if (incomplete) status = "incomplete";
  else if (intake.calories > targets.calorieTarget + 200 && actualDeficit < planned - 100)
    status = "surplus";
  else if (
    actualDeficit > planned + 150 ||
    proteinGap >= 20 ||
    (fatOver >= 12 && carbGap >= 25)
  )
    status = "needs_work";

  const headline =
    status === "incomplete"
      ? "Partial day — early read on your recomp targets"
      : status === "on_track"
        ? "Solid day for body recomposition"
        : status === "surplus"
          ? "Not optimized yet for your recomp goal"
          : "Not fully optimized for building/maintaining muscle while losing fat";

  const closing =
    status === "incomplete"
      ? "Don't stress mid-day numbers. Log the rest of your meals, keep protein high, and re-check this panel tonight."
      : `Don't stress hitting every gram perfectly. If most days land near ${targets.calorieTarget} kcal with protein close to ${targets.proteinG}g, recomposition can still happen.`;

  return {
    status,
    headline,
    why,
    improvements,
    closing,
    timeline,
  };
}
