import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { cacheOffResult, stripPortionFromName } from "@/lib/food-search";
import { caloriesFromMacros, scaleMacrosByQuantity, sumMacros } from "@/lib/macros";
import {
  clampString,
  isISODate,
  MAX_BRAND_LEN,
  MAX_FOOD_NAME_LEN,
} from "@/lib/security";
import { todayISODate } from "@/lib/tdee";

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISODate();
  if (!isISODate(date)) return jsonError("Invalid date");

  const db = await getDb();
  const foods = await db.query.foodLogs.findMany({
    where: and(
      eq(schema.foodLogs.userId, authz.userId),
      eq(schema.foodLogs.date, date),
    ),
    orderBy: [desc(schema.foodLogs.createdAt)],
  });

  const savedIds = [
    ...new Set(
      foods
        .map((f) => f.savedFoodId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [savedRows, pinnedRows] = await Promise.all([
    savedIds.length > 0
      ? db.query.savedFoods.findMany({
          where: and(
            eq(schema.savedFoods.userId, authz.userId),
            inArray(schema.savedFoods.id, savedIds),
          ),
        })
      : Promise.resolve([]),
    db.query.savedFoods.findMany({
      where: and(
        eq(schema.savedFoods.userId, authz.userId),
        eq(schema.savedFoods.pinned, true),
      ),
      columns: { id: true, name: true },
    }),
  ]);
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const pinnedIds = new Set(pinnedRows.map((row) => row.id));
  const pinnedNames = new Set(
    pinnedRows.map((row) => row.name.toLowerCase()),
  );

  const enriched = foods.map((f) => {
    const q = f.quantity && f.quantity > 0 ? f.quantity : 1;
    const saved = f.savedFoodId ? savedById.get(f.savedFoodId) : undefined;
    const nameKey = stripPortionFromName(f.name).toLowerCase();
    return {
      ...f,
      servingLabel: saved?.servingLabel ?? "1 serving",
      servingProteinG: saved?.proteinG ?? Math.round((f.proteinG / q) * 10) / 10,
      servingCarbsG: saved?.carbsG ?? Math.round((f.carbsG / q) * 10) / 10,
      servingFatG: saved?.fatG ?? Math.round((f.fatG / q) * 10) / 10,
      favorited:
        Boolean(saved?.pinned) ||
        (f.savedFoodId != null && pinnedIds.has(f.savedFoodId)) ||
        pinnedNames.has(nameKey),
    };
  });

  return jsonOk({ date, foods: enriched, totals: sumMacros(foods) });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const name = clampString(String(body.name || "").trim(), MAX_FOOD_NAME_LEN);
  const proteinG = Number(body.proteinG ?? 0);
  const carbsG = Number(body.carbsG ?? 0);
  const fatG = Number(body.fatG ?? 0);
  let calories = Number(body.calories ?? 0);
  const date = String(body.date || todayISODate());
  const brand = body.brand
    ? clampString(String(body.brand), MAX_BRAND_LEN)
    : null;
  const quantity = Number(body.quantity ?? 1);
  let savedFoodId = body.savedFoodId ? String(body.savedFoodId) : null;

  if (!name) return jsonError("Name is required");
  if (!isISODate(date)) return jsonError("Invalid date");
  if (!Number.isFinite(proteinG) || !Number.isFinite(carbsG) || !Number.isFinite(fatG)) {
    return jsonError("Invalid macros");
  }
  if (
    proteinG < 0 ||
    carbsG < 0 ||
    fatG < 0 ||
    proteinG > 10_000 ||
    carbsG > 10_000 ||
    fatG > 10_000
  ) {
    return jsonError("Invalid macros");
  }
  if (!calories) calories = caloriesFromMacros(proteinG, carbsG, fatG);

  const db = await getDb();

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

  // Manual / uncached entries: keep a per-serving definition for later reuse.
  if (!savedFoodId) {
    const qty = quantity > 0 ? quantity : 1;
    const existing = await db.query.savedFoods.findFirst({
      where: and(
        eq(schema.savedFoods.userId, authz.userId),
        eq(schema.savedFoods.name, name),
        eq(schema.savedFoods.source, "custom"),
      ),
    });
    if (existing) {
      savedFoodId = existing.id;
    } else {
      const [saved] = await db
        .insert(schema.savedFoods)
        .values({
          userId: authz.userId,
          name,
          brand,
          source: "custom",
          servingLabel: body.servingLabel ?? "1 serving",
          servingGrams: body.servingGrams ?? null,
          proteinG: Math.round((proteinG / qty) * 10) / 10,
          carbsG: Math.round((carbsG / qty) * 10) / 10,
          fatG: Math.round((fatG / qty) * 10) / 10,
          calories: Math.round(calories / qty),
        })
        .returning();
      savedFoodId = saved.id;
    }
  }

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

  const hasMacros =
    body.proteinG != null || body.carbsG != null || body.fatG != null;
  const hasQuantity = body.quantity != null;
  const hasName = body.name != null;

  if (!hasMacros && !hasQuantity && !hasName) {
    return jsonError("Nothing to update");
  }

  const patch: {
    name?: string;
    proteinG?: number;
    carbsG?: number;
    fatG?: number;
    calories?: number;
    quantity?: number;
  } = {};

  if (hasName) {
    const name = clampString(String(body.name || "").trim(), MAX_FOOD_NAME_LEN);
    if (!name) return jsonError("Name is required");
    patch.name = name;
  }

  if (hasMacros) {
    const proteinG = Number(body.proteinG ?? row.proteinG);
    const carbsG = Number(body.carbsG ?? row.carbsG);
    const fatG = Number(body.fatG ?? row.fatG);
    if (
      !Number.isFinite(proteinG) ||
      !Number.isFinite(carbsG) ||
      !Number.isFinite(fatG)
    ) {
      return jsonError("Invalid macros");
    }
    patch.proteinG = proteinG;
    patch.carbsG = carbsG;
    patch.fatG = fatG;
    patch.calories = caloriesFromMacros(proteinG, carbsG, fatG);
    if (hasQuantity) {
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return jsonError("Invalid quantity");
      }
      patch.quantity = quantity;
    }
  } else if (hasQuantity) {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return jsonError("Invalid quantity");
    }

    // Rescale from the food's known serving when linked; else from current log.
    if (row.savedFoodId) {
      const saved = await db.query.savedFoods.findFirst({
        where: and(
          eq(schema.savedFoods.id, row.savedFoodId),
          eq(schema.savedFoods.userId, authz.userId),
        ),
      });
      if (saved) {
        const proteinG = Math.round(saved.proteinG * quantity * 10) / 10;
        const carbsG = Math.round(saved.carbsG * quantity * 10) / 10;
        const fatG = Math.round(saved.fatG * quantity * 10) / 10;
        patch.proteinG = proteinG;
        patch.carbsG = carbsG;
        patch.fatG = fatG;
        patch.calories = caloriesFromMacros(proteinG, carbsG, fatG);
        patch.quantity = quantity;
      } else {
        Object.assign(patch, scaleMacrosByQuantity(row, quantity));
      }
    } else {
      Object.assign(patch, scaleMacrosByQuantity(row, quantity));
    }
  }

  // Keep custom saved serving in sync only when client says macros were edited.
  if (
    body.syncServing === true &&
    hasMacros &&
    row.savedFoodId &&
    (patch.proteinG != null || patch.carbsG != null || patch.fatG != null)
  ) {
    const saved = await db.query.savedFoods.findFirst({
      where: and(
        eq(schema.savedFoods.id, row.savedFoodId),
        eq(schema.savedFoods.userId, authz.userId),
      ),
    });
    if (saved?.source === "custom") {
      const qty =
        (patch.quantity ?? row.quantity) && (patch.quantity ?? row.quantity)! > 0
          ? (patch.quantity ?? row.quantity)!
          : 1;
      const p = patch.proteinG ?? row.proteinG;
      const c = patch.carbsG ?? row.carbsG;
      const f = patch.fatG ?? row.fatG;
      const cal = patch.calories ?? row.calories;
      await db
        .update(schema.savedFoods)
        .set({
          name: patch.name ?? row.name,
          proteinG: Math.round((p / qty) * 10) / 10,
          carbsG: Math.round((c / qty) * 10) / 10,
          fatG: Math.round((f / qty) * 10) / 10,
          calories: Math.round(cal / qty),
        })
        .where(eq(schema.savedFoods.id, saved.id));
    }
  }

  const [updated] = await db
    .update(schema.foodLogs)
    .set(patch)
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
  /** Unlink menu checks before food-log delete (FK would only null foodLogId). */
  await db
    .delete(schema.dailyMenuChecks)
    .where(
      and(
        eq(schema.dailyMenuChecks.foodLogId, id),
        eq(schema.dailyMenuChecks.userId, authz.userId),
      ),
    );
  await db
    .update(schema.dailyMenuItems)
    .set({ checked: false, foodLogId: null })
    .where(
      and(
        eq(schema.dailyMenuItems.foodLogId, id),
        eq(schema.dailyMenuItems.userId, authz.userId),
      ),
    );
  await db
    .delete(schema.foodLogs)
    .where(
      and(eq(schema.foodLogs.id, id), eq(schema.foodLogs.userId, authz.userId)),
    );

  return jsonOk({ ok: true });
}
