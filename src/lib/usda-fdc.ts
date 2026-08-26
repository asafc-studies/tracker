import type { FoodSearchResult } from "@/lib/food-reference";
import { isLikelyBeverage } from "@/lib/serving-size";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

type FdcNutrient = {
  nutrientId?: number;
  nutrientName?: string;
  unitName?: string;
  value?: number;
};

type FdcSearchFood = {
  fdcId: number;
  description?: string;
  brandOwner?: string;
  brandName?: string;
  dataType?: string;
  foodCategory?: string;
  foodNutrients?: FdcNutrient[];
};

function fdcApiKey() {
  return process.env.FDC_API_KEY?.trim() || "DEMO_KEY";
}

function nutrientValue(nutrients: FdcNutrient[], nutrientId: number) {
  const row = nutrients.find((n) => n.nutrientId === nutrientId);
  return row?.value ?? 0;
}

export function normalizeFdcFood(food: FdcSearchFood): FoodSearchResult | null {
  const name = food.description?.trim();
  if (!name) return null;

  const nutrients = food.foodNutrients ?? [];
  const proteinG = nutrientValue(nutrients, 1003);
  const fatG = nutrientValue(nutrients, 1004);
  const carbsG = nutrientValue(nutrients, 1005);
  const fiberG = nutrientValue(nutrients, 1079);
  let calories = nutrientValue(nutrients, 1008);
  if (!calories) {
    calories = Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
  }

  if (calories <= 0 && proteinG + carbsG + fatG <= 0) return null;

  const brand = food.brandOwner || food.brandName || null;
  const dataLabel =
    food.dataType === "Branded" ? "branded" : food.dataType?.toLowerCase() ?? "fdc";

  const isBeverage = isLikelyBeverage({
    name,
    categoriesText: food.foodCategory,
  });

  return {
    id: `fdc-${food.fdcId}`,
    name,
    brand,
    source: "fdc",
    externalId: String(food.fdcId),
    servingLabel: isBeverage ? "100 ml" : "100g",
    servingGrams: isBeverage ? null : 100,
    servingUnit: isBeverage ? "ml" : "g",
    servingAmount: isBeverage ? 100 : 100,
    proteinG: Math.round(proteinG * 10) / 10,
    carbsG: Math.round(carbsG * 10) / 10,
    fatG: Math.round(fatG * 10) / 10,
    fiberG: Math.round(fiberG * 10) / 10,
    calories: Math.round(calories),
    offScope: undefined,
    dataSourceLabel: `USDA · ${dataLabel}`,
  };
}

export async function searchFdcProducts(
  query: string,
  limit = 8,
): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    api_key: fdcApiKey(),
    query: q,
    pageSize: String(limit),
    dataType: "Foundation,SR Legacy,Survey (FNDDS),Branded",
  });

  try {
    const res = await fetch(`${FDC_BASE}/foods/search?${params}`, {
      headers: { "User-Agent": "RecompTracker/1.0 (recomp-tracker@local)" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { foods?: FdcSearchFood[] };
    return (data.foods ?? [])
      .map(normalizeFdcFood)
      .filter((f): f is FoodSearchResult => f != null)
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Fetch a single FDC food by id (for backfill). */
export async function fetchFdcById(
  fdcId: string | number,
): Promise<FoodSearchResult | null> {
  const id = String(fdcId).trim();
  if (!/^\d+$/.test(id)) return null;
  try {
    const res = await fetch(
      `${FDC_BASE}/food/${id}?api_key=${encodeURIComponent(fdcApiKey())}`,
      {
        headers: { "User-Agent": "RecompTracker/1.0 (recomp-tracker@local)" },
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      description?: string;
      brandOwner?: string;
      brandName?: string;
      dataType?: string;
      foodCategory?: string;
      foodNutrients?: Array<{
        nutrientId?: number;
        nutrientName?: string;
        unitName?: string;
        value?: number;
        nutrient?: { id?: number };
      }>;
    };
    // Detail endpoint nests nutrient id under nutrient.id sometimes.
    const nutrients: FdcNutrient[] = (data.foodNutrients ?? []).map((n) => ({
      nutrientId: n.nutrientId ?? n.nutrient?.id,
      nutrientName: n.nutrientName,
      unitName: n.unitName,
      value: n.value,
    }));
    return normalizeFdcFood({
      fdcId: Number(id),
      description: data.description,
      brandOwner: data.brandOwner,
      brandName: data.brandName,
      dataType: data.dataType,
      foodCategory: data.foodCategory,
      foodNutrients: nutrients,
    });
  } catch {
    return null;
  }
}

export function isFdcConfigured() {
  return Boolean(process.env.FDC_API_KEY?.trim());
}
