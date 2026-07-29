import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parseVolumeMl } from "@/lib/serving-size";
import {
  searchReferenceFoods,
  type FoodSearchResult,
} from "@/lib/food-reference";
import { fetchOffByBarcode, searchOffProducts } from "@/lib/open-food-facts";
import { searchFdcProducts } from "@/lib/usda-fdc";

/** Strip legacy "Name (portion)" suffixes from logged food names. */
export function stripPortionFromName(name: string) {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

function logToSearchResult(
  log: typeof schema.foodLogs.$inferSelect,
  saved?: typeof schema.savedFoods.$inferSelect,
): FoodSearchResult {
  const lastQty = log.quantity && log.quantity > 0 ? log.quantity : 1;

  if (saved) {
    const label = saved.servingLabel ?? "1 serving";
    const parsedMl = parseVolumeMl(label);
    return {
      id: `hist-${log.id}`,
      name: saved.name,
      brand: saved.brand,
      barcode: saved.barcode,
      source: "history",
      externalId: saved.externalId,
      servingLabel: label,
      servingGrams: parsedMl ? null : saved.servingGrams,
      servingUnit: parsedMl ? "ml" : "g",
      servingAmount: parsedMl ?? saved.servingGrams ?? null,
      proteinG: saved.proteinG,
      carbsG: saved.carbsG,
      fatG: saved.fatG,
      calories: saved.calories,
      savedFoodId: saved.id,
      lastLoggedQuantity: lastQty,
    };
  }

  return {
    id: `hist-${log.id}`,
    name: stripPortionFromName(log.name),
    brand: log.brand,
    source: "history",
    servingLabel: "1 serving",
    proteinG: log.proteinG / lastQty,
    carbsG: log.carbsG / lastQty,
    fatG: log.fatG / lastQty,
    calories: log.calories / lastQty,
    savedFoodId: log.savedFoodId,
    lastLoggedQuantity: lastQty,
  };
}

function toSavedResult(row: typeof schema.savedFoods.$inferSelect): FoodSearchResult {
  const label = row.servingLabel ?? "1 serving";
  const parsedMl = parseVolumeMl(label);
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    barcode: row.barcode,
    source: row.source === "history" ? "history" : "saved",
    externalId: row.externalId,
    servingLabel: label,
    servingGrams: parsedMl ? null : row.servingGrams,
    servingUnit: parsedMl ? "ml" : "g",
    servingAmount: parsedMl ?? row.servingGrams ?? null,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    calories: row.calories,
    savedFoodId: row.id,
  };
}

function dedupeResults(results: FoodSearchResult[]): FoodSearchResult[] {
  const seen = new Set<string>();
  const out: FoodSearchResult[] = [];
  for (const r of results) {
    const key = `${r.name.toLowerCase()}|${r.brand?.toLowerCase() ?? ""}|${r.barcode ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export async function searchFoods(
  userId: string,
  query: string,
  countryCode = "il",
): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const db = await getDb();
  const pattern = `%${q}%`;

  const [saved, recentLogs, profile] = await Promise.all([
    db.query.savedFoods.findMany({
      where: and(
        eq(schema.savedFoods.userId, userId),
        or(
          like(schema.savedFoods.name, pattern),
          like(schema.savedFoods.brand, pattern),
        ),
      ),
      orderBy: [desc(schema.savedFoods.pinned), desc(schema.savedFoods.createdAt)],
      limit: 8,
    }),
    db.query.foodLogs.findMany({
      where: and(
        eq(schema.foodLogs.userId, userId),
        like(schema.foodLogs.name, pattern),
      ),
      orderBy: [desc(schema.foodLogs.createdAt)],
      limit: 20,
    }),
    db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, userId),
    }),
  ]);

  const cc = profile?.countryCode ?? countryCode;
  const reference = searchReferenceFoods(q, 8);
  const savedResults = saved.map(toSavedResult);

  const historyMap = new Map<string, FoodSearchResult>();
  const historySavedIds = [
    ...new Set(
      recentLogs.map((log) => log.savedFoodId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const historySavedRows =
    historySavedIds.length > 0
      ? await db.query.savedFoods.findMany({
          where: and(
            eq(schema.savedFoods.userId, userId),
            inArray(schema.savedFoods.id, historySavedIds),
          ),
        })
      : [];
  const historySavedById = new Map(historySavedRows.map((row) => [row.id, row]));

  for (const log of recentLogs) {
    const key = stripPortionFromName(log.name).toLowerCase();
    if (historyMap.has(key)) continue;
    const saved = log.savedFoodId
      ? historySavedById.get(log.savedFoodId)
      : undefined;
    historyMap.set(key, logToSearchResult(log, saved));
  }

  let offResults: FoodSearchResult[] = [];
  let fdcResults: FoodSearchResult[] = [];
  const localCount = savedResults.length + reference.length + historyMap.size;
  if (localCount < 12) {
    [offResults, fdcResults] = await Promise.all([
      searchOffProducts(q, cc, 8),
      searchFdcProducts(q, 8),
    ]);
  }

  return dedupeResults([
    ...savedResults,
    ...reference,
    ...Array.from(historyMap.values()),
    ...offResults,
    ...fdcResults,
  ]).slice(0, 15);
}

export async function lookupBarcode(
  userId: string,
  barcode: string,
): Promise<FoodSearchResult | null> {
  const code = barcode.replace(/\D/g, "");
  if (!code) return null;

  const db = await getDb();
  const cached = await db.query.savedFoods.findFirst({
    where: and(
      eq(schema.savedFoods.userId, userId),
      eq(schema.savedFoods.barcode, code),
    ),
  });
  if (cached) return toSavedResult(cached);

  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  const off = await fetchOffByBarcode(code, profile?.countryCode ?? "il");
  if (!off) return null;

  const [saved] = await db
    .insert(schema.savedFoods)
    .values({
      userId,
      name: off.name,
      brand: off.brand,
      barcode: code,
      source: "off",
      externalId: off.externalId,
      servingLabel: off.servingLabel,
      servingGrams: off.servingGrams,
      proteinG: off.proteinG,
      carbsG: off.carbsG,
      fatG: off.fatG,
      calories: off.calories,
    })
    .returning();

  return toSavedResult(saved);
}

export async function cacheOffResult(
  userId: string,
  food: FoodSearchResult,
): Promise<string | null> {
  if (food.savedFoodId) return food.savedFoodId;
  if (food.source !== "off" && food.source !== "reference" && food.source !== "fdc") {
    return null;
  }

  const db = await getDb();
  if (food.barcode) {
    const existing = await db.query.savedFoods.findFirst({
      where: and(
        eq(schema.savedFoods.userId, userId),
        eq(schema.savedFoods.barcode, food.barcode),
      ),
    });
    if (existing) return existing.id;
  }

  const [saved] = await db
    .insert(schema.savedFoods)
    .values({
      userId,
      name: food.name,
      brand: food.brand,
      barcode: food.barcode,
      source:
        food.source === "reference"
          ? "reference"
          : food.source === "fdc"
            ? "custom"
            : "off",
      externalId: food.externalId,
      servingLabel: food.servingLabel,
      servingGrams: food.servingGrams,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      calories: food.calories,
    })
    .returning();

  return saved.id;
}

export async function getRecentFoods(userId: string, limit = 10) {
  const db = await getDb();
  const logs = await db.query.foodLogs.findMany({
    where: eq(schema.foodLogs.userId, userId),
    orderBy: [desc(schema.foodLogs.createdAt)],
    limit: 30,
  });

  const savedIds = [
    ...new Set(
      logs.map((log) => log.savedFoodId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const savedRows =
    savedIds.length > 0
      ? await db.query.savedFoods.findMany({
          where: and(
            eq(schema.savedFoods.userId, userId),
            inArray(schema.savedFoods.id, savedIds),
          ),
        })
      : [];
  const savedById = new Map(savedRows.map((row) => [row.id, row]));

  const seen = new Set<string>();
  const results: FoodSearchResult[] = [];
  for (const log of logs) {
    const key = stripPortionFromName(log.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const saved = log.savedFoodId ? savedById.get(log.savedFoodId) : undefined;
    results.push({
      ...logToSearchResult(log, saved),
      id: `recent-${log.id}`,
    });
    if (results.length >= limit) break;
  }
  return results;
}

export async function getPinnedFoods(userId: string) {
  const db = await getDb();
  const rows = await db.query.savedFoods.findMany({
    where: and(
      eq(schema.savedFoods.userId, userId),
      eq(schema.savedFoods.pinned, true),
    ),
    orderBy: [desc(schema.savedFoods.createdAt)],
    limit: 10,
  });
  return rows.map(toSavedResult);
}
