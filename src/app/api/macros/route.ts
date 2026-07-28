import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { cacheOffResult } from "@/lib/food-search";
import { caloriesFromMacros, scaleMacrosByQuantity, sumMacros } from "@/lib/macros";
import { todayISODate } from "@/lib/tdee";

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISODate();

  const db = await getDb();
  const foods = await db.query.foodLogs.findMany({
    where: and(
      eq(schema.foodLogs.userId, authz.userId),
      eq(schema.foodLogs.date, date),
    ),
    orderBy: [desc(schema.foodLogs.createdAt)],
  });

  return jsonOk({ date, foods, totals: sumMacros(foods) });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const name = String(body.name || "").trim();
  const proteinG = Number(body.proteinG ?? 0);
  const carbsG = Number(body.carbsG ?? 0);
  const fatG = Number(body.fatG ?? 0);
  let calories = Number(body.calories ?? 0);
  const date = String(body.date || todayISODate());
  const brand = body.brand ? String(body.brand) : null;
  const quantity = Number(body.quantity ?? 1);
  let savedFoodId = body.savedFoodId ? String(body.savedFoodId) : null;

  if (!name) return jsonError("Name is required");
  if (!Number.isFinite(proteinG) || !Number.isFinite(carbsG) || !Number.isFinite(fatG)) {
    return jsonError("Invalid macros");
  }
  if (!calories) calories = caloriesFromMacros(proteinG, carbsG, fatG);

  if (body.cacheFood && body.foodSource) {
    const cached = await cacheOffResult(authz.userId, {
      id: body.foodId ?? name,
      name,
      brand,
      barcode: body.barcode ?? null,
      source: body.foodSource,
      externalId: body.externalId ?? null,
      servingLabel: body.servingLabel ?? "1 serving",
      servingGrams: body.servingGrams ?? null,
      proteinG: Number(body.baseProteinG ?? proteinG / (quantity || 1)),
      carbsG: Number(body.baseCarbsG ?? carbsG / (quantity || 1)),
      fatG: Number(body.baseFatG ?? fatG / (quantity || 1)),
      calories: Number(body.baseCalories ?? calories / (quantity || 1)),
    });
    if (cached) savedFoodId = cached;
  }

  const db = await getDb();
  const [row] = await db
    .insert(schema.foodLogs)
    .values({
      userId: authz.userId,
      date,
      name,
      brand,
      savedFoodId,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      proteinG,
      carbsG,
      fatG,
      calories,
    })
    .returning();

  return jsonOk({ food: row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return jsonError("id required");

  const db = await getDb();
  const row = await db.query.foodLogs.findFirst({
    where: and(
      eq(schema.foodLogs.id, id),
      eq(schema.foodLogs.userId, authz.userId),
    ),
  });

  if (!row) return jsonError("Not found", 404);

  if (body.quantity == null) {
    return jsonError("quantity is required");
  }

  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return jsonError("Invalid quantity");
  }

  const scaled = scaleMacrosByQuantity(row, quantity);

  const [updated] = await db
    .update(schema.foodLogs)
    .set(scaled)
    .where(eq(schema.foodLogs.id, id))
    .returning();

  return jsonOk({ food: updated });
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("id required");

  const db = await getDb();
  await db
    .delete(schema.foodLogs)
    .where(
      and(eq(schema.foodLogs.id, id), eq(schema.foodLogs.userId, authz.userId)),
    );

  return jsonOk({ ok: true });
}
