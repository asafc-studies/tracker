import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { caloriesFromMacros } from "@/lib/macros";
import { parseRecipeJsonLists } from "@/lib/nutrition-ideas";
import {
  formatServingSize,
  type ServingUnit,
} from "@/lib/serving-format";

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

function mapRecipe(row: typeof schema.recipes.$inferSelect) {
  const { ingredients, steps } = parseRecipeJsonLists(row);
  const servingUnit: ServingUnit = row.servingUnit === "ml" ? "ml" : "g";
  const servingAmount =
    row.servingAmount && row.servingAmount > 0 ? row.servingAmount : 100;
  return {
    id: row.id,
    name: row.name,
    servings: row.servings,
    servingAmount,
    servingUnit,
    servingLabel: formatServingSize(servingAmount, servingUnit),
    mealSlot: row.mealSlot,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    fiberG: row.fiberG ?? 0,
    calories: row.calories,
    ingredients,
    steps,
    createdAt: row.createdAt,
  };
}

export async function GET() {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const db = await getDb();
  const rows = await db.query.recipes.findMany({
    where: eq(schema.recipes.userId, authz.userId),
    orderBy: [desc(schema.recipes.createdAt)],
  });

  return jsonOk({ recipes: rows.map(mapRecipe) });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || "").trim();
  if (!name) return jsonError("Recipe name required");

  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients : [];
  const steps = Array.isArray(body?.steps) ? body.steps : [];

  const proteinG = Number(body?.proteinG ?? 0);
  const carbsG = Number(body?.carbsG ?? 0);
  const fatG = Number(body?.fatG ?? 0);
  const fiberG = Number(body?.fiberG ?? 0);
  let calories = Number(body?.calories ?? 0);
  if (!calories) calories = caloriesFromMacros(proteinG, carbsG, fatG);

  const slot = String(body?.mealSlot || "snack").toLowerCase();
  const mealSlot = MEAL_SLOTS.has(slot) ? slot : "snack";
  const servingUnit: ServingUnit =
    String(body?.servingUnit || "g").toLowerCase() === "ml" ? "ml" : "g";
  let servingAmount = Number(body?.servingAmount ?? 100);
  if (!Number.isFinite(servingAmount) || servingAmount <= 0) {
    servingAmount = servingUnit === "ml" ? 250 : 100;
  }

  const db = await getDb();
  const [row] = await db
    .insert(schema.recipes)
    .values({
      userId: authz.userId,
      name,
      servings: Math.max(1, Number(body?.servings ?? 1) || 1),
      servingAmount,
      servingUnit,
      mealSlot: mealSlot as "breakfast" | "lunch" | "dinner" | "snack",
      proteinG,
      carbsG,
      fatG,
      fiberG,
      calories,
      ingredientsJson: JSON.stringify(
        ingredients
          .map((i: { name?: string; amount?: string }) => ({
            name: String(i?.name || "").trim(),
            amount: String(i?.amount || "").trim() || "to taste",
          }))
          .filter((i: { name: string }) => i.name),
      ),
      stepsJson: JSON.stringify(
        steps
          .map((s: { text?: string } | string) =>
            typeof s === "string"
              ? { text: s.trim() }
              : { text: String(s?.text || "").trim() },
          )
          .filter((s: { text: string }) => s.text),
      ),
    })
    .returning();

  return jsonOk({ recipe: mapRecipe(row) }, { status: 201 });
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("Recipe id required");

  const db = await getDb();
  await db
    .delete(schema.recipes)
    .where(
      and(
        eq(schema.recipes.id, id),
        eq(schema.recipes.userId, authz.userId),
      ),
    );

  return jsonOk({ ok: true });
}
