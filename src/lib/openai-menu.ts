import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
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
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      tdee: targets.tdee,
      deficit: targets.deficit,
    },
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

export async function improveMenuWithOpenAI(
  userId: string,
): Promise<ImprovedMenuResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local and your server env.",
    );
  }

  const context = await buildMenuImproveContext(userId);
  const model = process.env.OPENAI_MENU_MODEL?.trim() || "gpt-4o-mini";

  const system = `You are a body-recomposition nutrition assistant.
Goal: maintain/build muscle while losing fat with a modest calorie deficit.
Prefer keeping the user's familiar foods and meal structure; make small realistic swaps/portion tweaks.
Fix issues like excess fat, low protein, low carbs for lifting, or deep deficits.
Return ONLY valid JSON (no markdown) with shape:
{"rationale":"short paragraph","items":[{"name":"string","mealSlot":"breakfast|lunch|dinner|snack","quantity":1,"proteinG":0,"carbsG":0,"fatG":0,"calories":0}]}
Macros must be numbers. Aim totals near the calorie/protein/carb/fat targets.
Keep 4–10 items. Stay close to the current plan when possible.`;

  const user = JSON.stringify({
    instruction:
      "Improve this standing daily menu for tomorrow based on recent logging problems and targets.",
    targets: context.targets,
    todayProblems: context.todayWarnings,
    currentStandingPlan: context.currentPlan,
    recentLoggedDays: context.recentDays,
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const data = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    throw new Error(data.error?.message || `OpenAI error (${res.status})`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from OpenAI");

  let parsed: { rationale?: string; items?: unknown };
  try {
    parsed = JSON.parse(content) as { rationale?: string; items?: unknown };
  } catch {
    throw new Error("Could not parse AI menu JSON");
  }

  const items = parseAiItems(parsed.items);
  if (items.length === 0) {
    throw new Error("AI returned no menu items");
  }

  return {
    items,
    rationale: String(parsed.rationale || "Improved menu for your recomp targets."),
    model,
  };
}
