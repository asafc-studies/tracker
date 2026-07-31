import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiChatJson, extractJsonObject } from "@/lib/ai-client";
import { getMacroWarnings, sumMacros } from "@/lib/macros";
import {
  getStandingMenu,
  type StandingMenuItemInput,
} from "@/lib/standing-menu";
import {
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
  resolveTargets,
  todayISODate,
  type ActivityLevel,
} from "@/lib/tdee";

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

export type ImprovedMenuResult = {
  items: StandingMenuItemInput[];
  rationale: string;
  model: string;
};

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function parseAiItems(raw: unknown): StandingMenuItemInput[] {
  if (!Array.isArray(raw)) return [];
  const items: StandingMenuItemInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name || "").trim();
    if (!name) continue;
    const proteinG = Number(r.proteinG ?? 0);
    const carbsG = Number(r.carbsG ?? 0);
    const fatG = Number(r.fatG ?? 0);
    let calories = Number(r.calories ?? 0);
    if (!calories) calories = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
    const slot = String(r.mealSlot || "snack").toLowerCase();
    items.push({
      name,
      brand: r.brand ? String(r.brand) : null,
      quantity: Number(r.quantity ?? 1) || 1,
      proteinG: Number.isFinite(proteinG) ? proteinG : 0,
      carbsG: Number.isFinite(carbsG) ? carbsG : 0,
      fatG: Number.isFinite(fatG) ? fatG : 0,
      calories: Number.isFinite(calories) ? calories : 0,
      mealSlot: MEAL_SLOTS.has(slot) ? slot : "snack",
      sortOrder: items.length,
    });
  }
  return items;
}

export async function buildMenuImproveContext(userId: string) {
  const db = await getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  const targets =
    profile?.weightKg && profile.bodyFatPercent != null
      ? resolveTargets({
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          age: profile.age,
          sex: (profile.sex as "male" | "female" | null) ?? null,
          bodyFatPercent: profile.bodyFatPercent,
          activityLevel: (profile.activityLevel ??
            "moderate") as ActivityLevel,
          deficitKcal: profile.deficitKcal ?? DEFAULT_DEFICIT_KCAL,
          proteinPerKg: profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
          calorieTargetOverride: profile.calorieTargetOverride ?? null,
          proteinTargetOverride: profile.proteinTargetOverride ?? null,
        })
      : null;

  if (!targets) {
    throw new Error("Complete profile targets before improving the menu.");
  }

  const since = daysAgoISO(7);
  const logs = await db.query.foodLogs.findMany({
    where: and(
      eq(schema.foodLogs.userId, userId),
      gte(schema.foodLogs.date, since),
    ),
    orderBy: [desc(schema.foodLogs.date)],
  });

  const byDate = new Map<string, typeof logs>();
  for (const log of logs) {
    const list = byDate.get(log.date) ?? [];
    list.push(log);
    byDate.set(log.date, list);
  }

  const recentDays = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 5)
    .map(([date, foods]) => {
      const totals = sumMacros(foods);
      const warnings = getMacroWarnings(totals, {
        calorieTarget: targets.calorieTarget,
        proteinG: targets.proteinG,
        proteinMinG: targets.proteinMinG,
        proteinGoodG: targets.proteinGoodG,
        proteinMaxG: targets.proteinMaxG,
        carbsG: targets.carbsG,
        fatG: targets.fatG,
      });
      return {
        date,
        totals,
        warnings: warnings.map((w) => w.title),
        foods: foods.slice(0, 12).map((f) => ({
          name: f.name,
          proteinG: f.proteinG,
          carbsG: f.carbsG,
          fatG: f.fatG,
          calories: f.calories,
        })),
      };
    });

  const today = todayISODate();
  const todayLogs = byDate.get(today) ?? [];
  const todayTotals = sumMacros(todayLogs);
  const todayWarnings = getMacroWarnings(todayTotals, {
    calorieTarget: targets.calorieTarget,
    proteinG: targets.proteinG,
    proteinMinG: targets.proteinMinG,
    proteinGoodG: targets.proteinGoodG,
    proteinMaxG: targets.proteinMaxG,
    carbsG: targets.carbsG,
    fatG: targets.fatG,
  });

  let standing = await getStandingMenu(userId);
  if (standing.length === 0) {
    const daily = await db.query.dailyMenuItems.findMany({
      where: and(
        eq(schema.dailyMenuItems.userId, userId),
        eq(schema.dailyMenuItems.date, today),
      ),
    });
    standing = daily.map((item) => ({
      id: item.id,
      userId: item.userId,
      name: item.name,
      brand: item.brand,
      savedFoodId: item.savedFoodId,
      quantity: item.quantity,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      calories: item.calories,
      mealSlot: item.mealSlot,
      sortOrder: item.sortOrder,
      updatedAt: item.createdAt,
    }));
  }

  return {
    targets: {
      calorieTarget: targets.calorieTarget,
      proteinG: targets.proteinG,
      proteinMinG: targets.proteinMinG,
      proteinGoodG: targets.proteinGoodG,
      proteinMaxG: targets.proteinMaxG,
      proteinRangeNote:
        "Hit proteinMinG (≈1.61 g/kg) first; proteinGoodG–proteinMaxG is the strong zone. proteinG is the planning midpoint (~1.85 g/kg), not a hard ceiling.",
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      tdee: targets.tdee,
      deficit: targets.deficit,
    },
    goalTarget: profile?.goalTarget?.trim() || null,
    todayWarnings: todayWarnings.map((w) => ({
      title: w.title,
      detail: w.detail,
    })),
    currentPlan: standing.map((item) => ({
      name: item.name,
      brand: item.brand,
      quantity: item.quantity,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      calories: item.calories,
      mealSlot: item.mealSlot,
    })),
    recentDays,
  };
}

export async function improveMenuWithAI(
  userId: string,
  userRequest?: string,
): Promise<ImprovedMenuResult> {
  const context = await buildMenuImproveContext(userId);

  const planTotals = sumMacros(
    context.currentPlan.map((item) => ({
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      calories: item.calories,
    })),
  );

  const gaps = {
    proteinG: Math.round(
      (context.targets.proteinMinG ?? context.targets.proteinG) -
        planTotals.proteinG,
    ),
    carbsG: Math.round(context.targets.carbsG - planTotals.carbsG),
    fatG: Math.round(context.targets.fatG - planTotals.fatG),
    calories: Math.round(context.targets.calorieTarget - planTotals.calories),
  };

  const system = `You are a body-recomposition meal planner.
Primary goal: land macros in the user's TARGET bands.
Secondary goal: keep the menu recognizable — same meal pattern and mostly familiar foods.
If goalTarget is set (e.g. lose fat / recomp / gain), bias food choices toward that without missing macros.

PROTEIN: evidence range ≈1.61–2.2 g/kg. Clear proteinMinG first; aiming near proteinGoodG–proteinMaxG is fine. Do not treat proteinMaxG as mandatory.

PRIORITY ORDER (strict):
1) Protein at or above proteinMinG (highest priority); prefer near proteinG (~1.85 g/kg plan)
2) Calories within ±80 kcal of target
3) Fat within ±5g of target (do not overshoot fat)
4) Carbs fill remaining calories (within ±20g when possible)

RULES:
- Start from currentStandingPlan. Keep meal slots (breakfast/lunch/dinner/snack) when possible.
- Prefer portion changes and lean swaps over inventing a totally new diet.
- If fat is high: reduce oils/sauces/fatty cuts; replace with leaner protein + carbs.
- If protein is low: add/increase whey, chicken, turkey, fish, low-fat dairy, egg whites.
- If carbs are low and fat is fine: add rice, pasta, potato, fruit, oats — not more fat.
- Do NOT make tiny cosmetic edits. If gaps are large, change portions enough to close them.
- Keep 4–10 items. Use realistic macro numbers that sum near the targets.
- Rationale must mention the old vs new totals and the key swaps.

Return ONLY valid JSON (no markdown):
{"rationale":"2-4 sentences","items":[{"name":"string","mealSlot":"breakfast|lunch|dinner|snack","quantity":1,"proteinG":0,"carbsG":0,"fatG":0,"calories":0}],"projectedTotals":{"proteinG":0,"carbsG":0,"fatG":0,"calories":0}}`;

  const user = JSON.stringify({
    instruction:
      "Rewrite the standing daily menu so projectedTotals land on targets. Close the gaps below. Keep foods familiar.",
    ...(userRequest
      ? { userPriorityRequest: userRequest, note: "The userPriorityRequest is the MOST IMPORTANT instruction — follow it above all other rules." }
      : {}),
    goalTarget: context.goalTarget,
    mustHitTargets: context.targets,
    currentPlanTotals: planTotals,
    gapsToClose: gaps,
    meaningOfGaps:
      "Positive gap = need more of that macro. Negative gap = need less.",
    recentProblems: context.todayWarnings,
    currentStandingPlan: context.currentPlan,
    recentLoggedDays: context.recentDays,
    acceptance:
      "Reject tiny edits. Protein and calories must clearly move toward targets.",
  });

  const { content, model } = await aiChatJson({ system, user });

  let parsed: { rationale?: string; items?: unknown };
  try {
    parsed = JSON.parse(extractJsonObject(content)) as {
      rationale?: string;
      items?: unknown;
    };
  } catch {
    throw new Error("Could not parse AI menu JSON");
  }

  const items = parseAiItems(parsed.items);
  if (items.length === 0) {
    throw new Error("AI returned no menu items");
  }

  return {
    items,
    rationale: String(
      parsed.rationale || "Improved menu for your recomp targets.",
    ),
    model,
  };
}

/** @deprecated Use improveMenuWithAI */
export async function improveMenuWithOpenAI(userId: string) {
  return improveMenuWithAI(userId);
}
