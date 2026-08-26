import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiChatJson, extractJsonObject } from "@/lib/ai-client";
import { caloriesFromMacros, sumMacros } from "@/lib/macros";
import type { ServingUnit } from "@/lib/serving-format";
import {
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
  resolveTargets,
  todayISODate,
  type ActivityLevel,
} from "@/lib/tdee";

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

export type RecipeIngredient = { name: string; amount: string };
export type RecipeStep = { text: string };
export type { ServingUnit };

export type IdeaRecipe = {
  name: string;
  servings: number;
  servingAmount: number;
  servingUnit: ServingUnit;
  mealSlot: "breakfast" | "lunch" | "dinner" | "snack";
  perServing: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    calories: number;
  };
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
};

export type NutritionIdeaResult = {
  kind: "tip" | "recipe";
  text: string;
  recipe: IdeaRecipe | null;
  remaining: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    calories: number;
  } | null;
  model: string;
};

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : fallback;
}

function parseIngredients(raw: unknown): RecipeIngredient[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const name = String(r.name || "").trim();
      if (!name) return null;
      return {
        name,
        amount: String(r.amount || "").trim() || "to taste",
      };
    })
    .filter((x): x is RecipeIngredient => Boolean(x))
    .slice(0, 24);
}

function parseSteps(raw: unknown): RecipeStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (typeof row === "string") {
        const text = row.trim();
        return text ? { text } : null;
      }
      if (!row || typeof row !== "object") return null;
      const text = String((row as Record<string, unknown>).text || "").trim();
      return text ? { text } : null;
    })
    .filter((x): x is RecipeStep => Boolean(x))
    .slice(0, 20);
}

export async function buildNutritionIdeaContext(
  userId: string,
  date = todayISODate(),
) {
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
    throw new Error("Complete profile targets before asking for ideas.");
  }

  const foods = await db.query.foodLogs.findMany({
    where: and(
      eq(schema.foodLogs.userId, userId),
      eq(schema.foodLogs.date, date),
    ),
  });
  const intake = sumMacros(foods);
  const remaining = {
    proteinG: Math.round((targets.proteinG - intake.proteinG) * 10) / 10,
    carbsG: Math.round((targets.carbsG - intake.carbsG) * 10) / 10,
    fatG: Math.round((targets.fatG - intake.fatG) * 10) / 10,
    fiberG: Math.round((targets.fiberG - (intake.fiberG || 0)) * 10) / 10,
    calories: Math.round(targets.calorieTarget - intake.calories),
  };

  return {
    date,
    goalTarget: profile?.goalTarget?.trim() || null,
    targets: {
      calorieTarget: targets.calorieTarget,
      proteinG: targets.proteinG,
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      fiberG: targets.fiberG,
      fiberMinG: targets.fiberMinG,
      fiberMaxG: targets.fiberMaxG,
    },
    intake,
    remaining,
    loggedFoods: foods.slice(0, 20).map((f) => ({
      name: f.name,
      proteinG: f.proteinG,
      carbsG: f.carbsG,
      fatG: f.fatG,
      fiberG: f.fiberG ?? 0,
      calories: f.calories,
    })),
  };
}

export async function generateNutritionIdea(
  userId: string,
  prompt: string,
  date = todayISODate(),
): Promise<NutritionIdeaResult> {
  const text = prompt.trim();
  if (text.length < 2) throw new Error("Describe what you want an idea for");

  const context = await buildNutritionIdeaContext(userId, date);

  const system = `You help with body-recomposition meal ideas.
Given the user's same-day intake, remaining macros, targets, and a free-text request, return either:
- kind "tip": short practical advice / food swap / what to eat next (no full recipe)
- kind "recipe": a cookable meal with ingredients, steps, and per-serving macros that fit remaining macros when possible

Choose "recipe" when they ask to cook, build a meal, dinner/lunch ideas, or want something concrete to prepare.
Choose "tip" for quick advice, swaps, shopping hints, or when remaining macros are tiny.

Rules:
- Prefer Israeli / Mediterranean foods when ambiguous.
- Per-serving macros must be consistent (calories ≈ P×4 + C×4 + F×9, ±20 kcal OK).
- Include fiberG (dietary fiber grams) per serving; 0 when none.
- Prefer hitting remaining protein; do not wildly overshoot remaining calories.
- Ingredients need amounts (e.g. "150g", "1 tbsp").
- Steps should be clear cook stages (prep → cook → finish).
- text: 1–3 sentences summarizing the idea (required for both kinds).
- mealSlot: breakfast|lunch|dinner|snack.
- servingAmount + servingUnit: size of ONE serving in grams or ml (e.g. 350 + "g", or 300 + "ml").
- perServing macros are for that exact servingAmount.

Return ONLY valid JSON (no markdown):
{"kind":"tip"|"recipe","text":"string","recipe":null|{"name":"string","servings":1,"servingAmount":350,"servingUnit":"g","mealSlot":"lunch","perServing":{"proteinG":0,"carbsG":0,"fatG":0,"fiberG":0,"calories":0},"ingredients":[{"name":"string","amount":"string"}],"steps":[{"text":"string"}]}}`;

  const { content, model } = await aiChatJson({
    system,
    user: JSON.stringify({
      request: text,
      date: context.date,
      goalTarget: context.goalTarget,
      targets: context.targets,
      intakeSoFar: context.intake,
      remainingMacros: context.remaining,
      loggedToday: context.loggedFoods,
    }),
    temperature: 0.5,
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonObject(content)) as Record<string, unknown>;
  } catch {
    throw new Error("Could not parse AI nutrition idea");
  }

  const kind = parsed.kind === "recipe" ? "recipe" : "tip";
  const summary = String(parsed.text || "").trim();
  if (!summary) throw new Error("AI returned no idea text");

  let recipe: IdeaRecipe | null = null;
  if (kind === "recipe" && parsed.recipe && typeof parsed.recipe === "object") {
    const r = parsed.recipe as Record<string, unknown>;
    const name = String(r.name || "").trim();
    const ingredients = parseIngredients(r.ingredients);
    const steps = parseSteps(r.steps);
    if (!name || ingredients.length === 0 || steps.length === 0) {
      throw new Error("AI recipe missing name, ingredients, or steps");
    }
    const per =
      r.perServing && typeof r.perServing === "object"
        ? (r.perServing as Record<string, unknown>)
        : r;
    const proteinG = num(per.proteinG);
    const carbsG = num(per.carbsG);
    const fatG = num(per.fatG);
    const fiberG = num(per.fiberG);
    let calories = Math.round(num(per.calories, 0));
    if (!calories) calories = caloriesFromMacros(proteinG, carbsG, fatG);
    const slot = String(r.mealSlot || "snack").toLowerCase();
    const unitRaw = String(r.servingUnit || "g").toLowerCase();
    const servingUnit: ServingUnit = unitRaw === "ml" ? "ml" : "g";
    let servingAmount = num(r.servingAmount, 0);
    if (servingAmount <= 0) servingAmount = servingUnit === "ml" ? 250 : 100;
    recipe = {
      name,
      servings: Math.max(1, num(r.servings, 1)),
      servingAmount,
      servingUnit,
      mealSlot: MEAL_SLOTS.has(slot)
        ? (slot as IdeaRecipe["mealSlot"])
        : "snack",
      perServing: { proteinG, carbsG, fatG, fiberG, calories },
      ingredients,
      steps,
    };
  }

  return {
    kind: recipe ? "recipe" : "tip",
    text: summary,
    recipe,
    remaining: context.remaining,
    model,
  };
}

export function parseRecipeJsonLists(row: {
  ingredientsJson: string;
  stepsJson: string;
}): { ingredients: RecipeIngredient[]; steps: RecipeStep[] } {
  let ingredients: RecipeIngredient[] = [];
  let steps: RecipeStep[] = [];
  try {
    ingredients = parseIngredients(JSON.parse(row.ingredientsJson));
  } catch {
    /* ignore */
  }
  try {
    steps = parseSteps(JSON.parse(row.stepsJson));
  } catch {
    /* ignore */
  }
  return { ingredients, steps };
}
