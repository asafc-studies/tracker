import { and, desc, eq, gte, inArray, like, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { parseVolumeMl } from "@/lib/serving-size";
import {
  searchReferenceFoods,
  type FoodSearchResult,
} from "@/lib/food-reference";
import { fetchOffByBarcode, searchOffProducts } from "@/lib/open-food-facts";
import { searchFdcProducts } from "@/lib/usda-fdc";

const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const RECENT_EVENT_LIMIT = 20;

/** Strip legacy "Name (portion)" suffixes from logged food names. */
export function stripPortionFromName(name: string) {
  return name.replace(/\s*\([^)]*\)\s*$/, "").trim() || name;
}

function savedToHistoryResult(
  log: typeof schema.foodLogs.$inferSelect,
  saved: typeof schema.savedFoods.$inferSelect,
  idPrefix = "hist",
): FoodSearchResult {
  const lastQty = log.quantity && log.quantity > 0 ? log.quantity : 1;
  const label = saved.servingLabel ?? "1 serving";
  const parsedMl = parseVolumeMl(label);
  return {
    id: `${idPrefix}-${log.id}`,
    name: saved.name,
    brand: saved.brand,
    barcode: saved.barcode,
    source: "history",
    externalId: saved.externalId,
    servingLabel: label,
    servingGrams: parsedMl ? null : saved.servingGrams,
    servingUnit: parsedMl ? "ml" : "g",
    servingAmount: parsedMl ?? saved.servingGrams ?? null,
    // Always the food's known per-serving macros — not last-log totals.
    proteinG: saved.proteinG,
    carbsG: saved.carbsG,
    fatG: saved.fatG,
    calories: saved.calories,
    savedFoodId: saved.id,
    lastLoggedQuantity: lastQty,
  };
}

function logToSearchResult(
  log: typeof schema.foodLogs.$inferSelect,
  saved?: typeof schema.savedFoods.$inferSelect,
  reference?: FoodSearchResult,
): FoodSearchResult {
  const lastQty = log.quantity && log.quantity > 0 ? log.quantity : 1;

  if (saved) return savedToHistoryResult(log, saved);

  // Prefer a catalog staple's known serving over deriving from the last log.
  if (reference) {
    return {
      ...reference,
      id: `hist-${log.id}`,
      source: "history",
      lastLoggedQuantity: lastQty,
    };
  }

  // Fallback: per quantity-unit from the log (manual foods with no catalog entry).
  return {
    id: `hist-${log.id}`,
    name: stripPortionFromName(log.name),
    brand: log.brand,
    source: "history",
    servingLabel: "1 serving",
    servingUnit: "serving",
    proteinG: log.proteinG / lastQty,
    carbsG: log.carbsG / lastQty,
    fatG: log.fatG / lastQty,
    calories: log.calories / lastQty,
    savedFoodId: log.savedFoodId,
    lastLoggedQuantity: lastQty,
  };
}

function findReferenceMatch(name: string): FoodSearchResult | undefined {
  const key = stripPortionFromName(name).toLowerCase();
  const hits = searchReferenceFoods(key.length >= 2 ? key : name, 8);
  return hits.find((r) => r.name.toLowerCase() === key);
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
    let linked = log.savedFoodId
      ? historySavedById.get(log.savedFoodId)
      : undefined;
    if (!linked) {
      linked = saved.find((row) => row.name.toLowerCase() === key);
    }
    historyMap.set(
      key,
      logToSearchResult(
        log,
        linked,
        linked ? undefined : findReferenceMatch(log.name),
      ),
    );
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

export async function getRecentFoods(userId: string, limit = RECENT_EVENT_LIMIT) {
  const db = await getDb();
  const cutoff = new Date(Date.now() - RECENT_WINDOW_MS);

  // Last 48h ∪ last 20 log events (Menu / Ideas / Guess / search all write food_logs).
  const [byTime, byCount] = await Promise.all([
    db.query.foodLogs.findMany({
      where: and(
        eq(schema.foodLogs.userId, userId),
        gte(schema.foodLogs.createdAt, cutoff),
      ),
      orderBy: [desc(schema.foodLogs.createdAt)],
      limit: 100,
    }),
    db.query.foodLogs.findMany({
      where: eq(schema.foodLogs.userId, userId),
      orderBy: [desc(schema.foodLogs.createdAt)],
      limit: RECENT_EVENT_LIMIT,
    }),
  ]);

  const byId = new Map<string, (typeof byCount)[number]>();
  for (const log of byTime) byId.set(log.id, log);
  for (const log of byCount) byId.set(log.id, log);
  const logs = [...byId.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  const savedIds = [
    ...new Set(
      logs.map((log) => log.savedFoodId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const [savedRows, customSaved] = await Promise.all([
    savedIds.length > 0
      ? db.query.savedFoods.findMany({
          where: and(
            eq(schema.savedFoods.userId, userId),
            inArray(schema.savedFoods.id, savedIds),
          ),
        })
      : Promise.resolve([]),
    db.query.savedFoods.findMany({
      where: eq(schema.savedFoods.userId, userId),
      orderBy: [desc(schema.savedFoods.createdAt)],
      limit: 80,
    }),
  ]);
  const savedById = new Map(savedRows.map((row) => [row.id, row]));
  const savedByName = new Map(
    customSaved.map((row) => [row.name.toLowerCase(), row]),
  );

  const seen = new Set<string>();
  const results: FoodSearchResult[] = [];
  for (const log of logs) {
    const key = stripPortionFromName(log.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let linked = log.savedFoodId ? savedById.get(log.savedFoodId) : undefined;
    if (!linked) linked = savedByName.get(key);
    results.push({
      ...logToSearchResult(
        log,
        linked,
        linked ? undefined : findReferenceMatch(log.name),
      ),
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
