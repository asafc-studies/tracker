import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { todayISODate } from "@/lib/tdee";

export type StandingMenuItemInput = {
  name: string;
  brand?: string | null;
  savedFoodId?: string | null;
  quantity?: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  calories: number;
  mealSlot?: string | null;
  sortOrder?: number;
};

export type MenuDayItem = {
  id: string;
  name: string;
  brand: string | null;
  savedFoodId: string | null;
  quantity: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  calories: number;
  mealSlot: "breakfast" | "lunch" | "dinner" | "snack" | null;
  sortOrder: number;
  checked: boolean;
  foodLogId: string | null;
  checkId: string | null;
};

const MEAL_SLOTS = new Set(["breakfast", "lunch", "dinner", "snack"]);

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Only keep savedFoodId if it exists for this user (avoids FK 500s). */
export async function resolveSavedFoodId(
  userId: string,
  savedFoodId: unknown,
): Promise<string | null> {
  if (savedFoodId == null || savedFoodId === "") return null;
  const id = String(savedFoodId);
  const db = await getDb();
  const rows = await db
    .select({ id: schema.savedFoods.id })
    .from(schema.savedFoods)
    .where(
      and(
        eq(schema.savedFoods.id, id),
        eq(schema.savedFoods.userId, userId),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

function normalizeMealSlot(
  slot: unknown,
): "breakfast" | "lunch" | "dinner" | "snack" {
  const s = String(slot || "snack").toLowerCase();
  return (MEAL_SLOTS.has(s) ? s : "snack") as
    | "breakfast"
    | "lunch"
    | "dinner"
    | "snack";
}

export async function getStandingMenu(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.standingMenuItems)
    .where(eq(schema.standingMenuItems.userId, userId))
    .orderBy(asc(schema.standingMenuItems.sortOrder));
}

/**
 * One-time: if standing plan is empty, seed it from the newest legacy
 * daily_menu_items day (checklist ignored).
 */
export async function ensureStandingFromLegacy(userId: string) {
  const existing = await getStandingMenu(userId);
  if (existing.length > 0) return existing;

  const db = await getDb();
  const latestRows = await db
    .select()
    .from(schema.dailyMenuItems)
    .where(eq(schema.dailyMenuItems.userId, userId))
    .orderBy(desc(schema.dailyMenuItems.date))
    .limit(1);
  const latest = latestRows[0];
  if (!latest) return [];

  const legacy = await db
    .select()
    .from(schema.dailyMenuItems)
    .where(
      and(
        eq(schema.dailyMenuItems.userId, userId),
        eq(schema.dailyMenuItems.date, latest.date),
      ),
    )
    .orderBy(asc(schema.dailyMenuItems.sortOrder));
  if (!legacy.length) return [];

  return replaceStandingMenu(
    userId,
    legacy.map((item, i) => ({
      name: item.name,
      brand: item.brand,
      savedFoodId: item.savedFoodId,
      quantity: item.quantity,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG ?? 0,
      calories: item.calories,
      mealSlot: item.mealSlot,
      sortOrder: i,
    })),
  );
}

export async function replaceStandingMenu(
  userId: string,
  items: StandingMenuItemInput[],
) {
  const db = await getDb();
  await db
    .delete(schema.standingMenuItems)
    .where(eq(schema.standingMenuItems.userId, userId));

  if (!items.length) return [];

  const now = new Date();
  const values = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    values.push({
      userId,
      name: item.name,
      brand: item.brand ?? null,
      savedFoodId: await resolveSavedFoodId(userId, item.savedFoodId),
      quantity: num(item.quantity, 1),
      proteinG: num(item.proteinG),
      carbsG: num(item.carbsG),
      fatG: num(item.fatG),
      fiberG: num(item.fiberG),
      calories: num(item.calories),
      mealSlot: normalizeMealSlot(item.mealSlot),
      sortOrder: item.sortOrder ?? i,
      updatedAt: now,
    });
  }

  return db.insert(schema.standingMenuItems).values(values).returning();
}

/** Standing plan + today's (or any date's) checkmarks. */
export async function getMenuForDate(
  userId: string,
  date: string,
): Promise<MenuDayItem[]> {
  await ensureStandingFromLegacy(userId);
  const db = await getDb();
  const standing = await getStandingMenu(userId);
  const checks = await db
    .select()
    .from(schema.dailyMenuChecks)
    .where(
      and(
        eq(schema.dailyMenuChecks.userId, userId),
        eq(schema.dailyMenuChecks.date, date),
      ),
    );
  const byStanding = new Map(checks.map((c) => [c.standingItemId, c]));

  return standing.map((item) => {
    const check = byStanding.get(item.id);
    return {
      id: item.id,
      name: item.name,
      brand: item.brand,
      savedFoodId: item.savedFoodId,
      quantity: item.quantity,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG ?? 0,
      calories: item.calories,
      mealSlot: item.mealSlot,
      sortOrder: item.sortOrder,
      checked: Boolean(check),
      foodLogId: check?.foodLogId ?? null,
      checkId: check?.id ?? null,
    };
  });
}

export async function addStandingItem(
  userId: string,
  item: StandingMenuItemInput,
) {
  const db = await getDb();
  const existing = await getStandingMenu(userId);
  const savedFoodId = await resolveSavedFoodId(userId, item.savedFoodId);
  const [row] = await db
    .insert(schema.standingMenuItems)
    .values({
      userId,
      name: item.name,
      brand: item.brand ?? null,
      savedFoodId,
      quantity: num(item.quantity, 1),
      proteinG: num(item.proteinG),
      carbsG: num(item.carbsG),
      fatG: num(item.fatG),
      fiberG: num(item.fiberG),
      calories: num(item.calories),
      mealSlot: normalizeMealSlot(item.mealSlot),
      sortOrder: num(item.sortOrder, existing.length),
      updatedAt: new Date(),
    })
    .returning();
  if (!row) {
    throw new Error("Failed to add menu item");
  }
  return row;
}

export async function updateStandingItemSlot(
  userId: string,
  id: string,
  mealSlot: string,
) {
  const db = await getDb();
  const slot = normalizeMealSlot(mealSlot);
  const rows = await db
    .update(schema.standingMenuItems)
    .set({ mealSlot: slot, updatedAt: new Date() })
    .where(
      and(
        eq(schema.standingMenuItems.id, id),
        eq(schema.standingMenuItems.userId, userId),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function removeStandingItem(userId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.standingMenuItems)
    .where(
      and(
        eq(schema.standingMenuItems.id, id),
        eq(schema.standingMenuItems.userId, userId),
      ),
    )
    .limit(1);
  const item = rows[0];
  if (!item) return null;

  // Checks cascade-delete; leave historical food logs intact.
  await db
    .delete(schema.standingMenuItems)
    .where(eq(schema.standingMenuItems.id, id));
  return item;
}

export async function toggleStandingCheck(
  userId: string,
  standingItemId: string,
  date: string,
) {
  const db = await getDb();
  const itemRows = await db
    .select()
    .from(schema.standingMenuItems)
    .where(
      and(
        eq(schema.standingMenuItems.id, standingItemId),
        eq(schema.standingMenuItems.userId, userId),
      ),
    )
    .limit(1);
  const item = itemRows[0];
  if (!item) return null;

  const existingRows = await db
    .select()
    .from(schema.dailyMenuChecks)
    .where(
      and(
        eq(schema.dailyMenuChecks.userId, userId),
        eq(schema.dailyMenuChecks.date, date),
        eq(schema.dailyMenuChecks.standingItemId, standingItemId),
      ),
    )
    .limit(1);
  const existing = existingRows[0];

  if (existing) {
    if (existing.foodLogId) {
      await db
        .delete(schema.foodLogs)
        .where(
          and(
            eq(schema.foodLogs.id, existing.foodLogId),
            eq(schema.foodLogs.userId, userId),
          ),
        );
    }
    await db
      .delete(schema.dailyMenuChecks)
      .where(eq(schema.dailyMenuChecks.id, existing.id));
    return {
      item: {
        ...item,
        checked: false,
        foodLogId: null,
      },
    };
  }

  const [foodLog] = await db
    .insert(schema.foodLogs)
    .values({
      userId,
      date,
      name: item.name,
      brand: item.brand,
      savedFoodId: await resolveSavedFoodId(userId, item.savedFoodId),
      quantity: item.quantity,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG ?? 0,
      calories: item.calories,
    })
    .returning();

  await db.insert(schema.dailyMenuChecks).values({
    userId,
    date,
    standingItemId,
    foodLogId: foodLog.id,
  });

  return {
    item: {
      ...item,
      checked: true,
      foodLogId: foodLog.id,
    },
    foodLog,
  };
}

export function nextISODate(from = todayISODate()) {
  const d = new Date(`${from}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return todayISODate(d);
}
