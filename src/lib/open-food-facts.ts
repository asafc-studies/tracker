import type { FoodSearchResult } from "@/lib/food-reference";
import {
  isLikelyBeverage,
  parseVolumeMl,
  scaleMacros,
} from "@/lib/serving-size";

const OFF_WORLD = "https://world.openfoodfacts.org";
const OFF_IL = "https://il.openfoodfacts.org";
const SAL_SEARCH = "https://search.openfoodfacts.org/search";
const USER_AGENT = "RecompTracker/1.0 (recomp-tracker@local)";

const MAX_OFF_SEARCH_PER_MINUTE = 10;
const offSearchTimestamps: number[] = [];
const MAX_OFF_PRODUCT_PER_MINUTE = 15;
const offProductTimestamps: number[] = [];

function canRequestOffSearch() {
  const now = Date.now();
  while (offSearchTimestamps.length && now - offSearchTimestamps[0] > 60_000) {
    offSearchTimestamps.shift();
  }
  return offSearchTimestamps.length < MAX_OFF_SEARCH_PER_MINUTE;
}

function trackOffSearch() {
  offSearchTimestamps.push(Date.now());
}

function canRequestOffProduct() {
  const now = Date.now();
  while (offProductTimestamps.length && now - offProductTimestamps[0] > 60_000) {
    offProductTimestamps.shift();
  }
  return offProductTimestamps.length < MAX_OFF_PRODUCT_PER_MINUTE;
}

function trackOffProduct() {
  offProductTimestamps.push(Date.now());
}

type OffNutriments = {
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  "energy-kcal_100g"?: number;
  proteins_serving?: number;
  carbohydrates_serving?: number;
  fat_serving?: number;
  "energy-kcal_serving"?: number;
};

type OffProduct = {
  code?: string;
  product_name?: string;
  product_name_he?: string;
  product_name_en?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number;
  quantity?: string;
  categories?: string;
  categories_tags?: string[];
  nutriments?: OffNutriments;
  countries_tags?: string[];
};

type SalHit = OffProduct & {
  code: string;
  _score?: number;
};

function pickProductName(
  product: OffProduct,
  preferLang: "he" | "any" = "any",
): string | null {
  const he = product.product_name_he?.trim();
  const en = product.product_name_en?.trim();
  const generic = product.product_name?.trim();

  if (preferLang === "he") {
    return he || generic || en || null;
  }
  return generic || en || he || null;
}

function pickBrand(brands?: string | string[] | null) {
  if (!brands) return null;
  if (Array.isArray(brands)) return brands[0]?.trim() || null;
  return brands.split(",")[0]?.trim() || null;
}

function isIsraelHit(hit: SalHit) {
  return (hit.countries_tags ?? []).some((t) =>
    t.includes("israel") || t === "en:il",
  );
}

function normalizeOffHit(
  hit: SalHit,
  preferLang: "he" | "any" = "any",
  offScope?: "regional" | "global",
): FoodSearchResult | null {
  const name = pickProductName(hit, preferLang);
  if (!name) return null;

  const n = hit.nutriments ?? {};
  const beverage = isLikelyBeverage({
    name,
    categoriesTags: hit.categories_tags,
    categoriesText: hit.categories,
    quantityText: hit.quantity ?? hit.serving_size,
  });

  const volumeMlFromText =
    parseVolumeMl(hit.quantity) ?? parseVolumeMl(hit.serving_size);
  const volumeMl =
    volumeMlFromText ??
    (beverage && hit.serving_quantity != null && hit.serving_quantity > 0
      ? hit.serving_quantity
      : null);

  const isBeverage = beverage;

  const hasServing =
    n.proteins_serving != null ||
    n.carbohydrates_serving != null ||
    n.fat_serving != null ||
    n["energy-kcal_serving"] != null;

  let proteinG: number;
  let carbsG: number;
  let fatG: number;
  let calories: number;
  let servingLabel: string;
  let servingGrams: number | null = null;
  let servingUnit: "g" | "ml" | "serving" = "g";
  let servingAmount: number | null = null;

  if (hasServing) {
    proteinG = n.proteins_serving ?? 0;
    carbsG = n.carbohydrates_serving ?? 0;
    fatG = n.fat_serving ?? 0;
    calories =
      n["energy-kcal_serving"] ??
      Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);

    if (isBeverage && volumeMl) {
      servingUnit = "ml";
      servingAmount = volumeMl;
      servingLabel = `${volumeMl} ml`;
      servingGrams = null;

      // Some products report per-100ml in serving fields while size is the full bottle.
      const servingSizeMl = parseVolumeMl(hit.serving_size);
      if (servingSizeMl && servingSizeMl > 100 && servingSizeMl !== volumeMl) {
        const per100 = scaleMacros(proteinG, carbsG, fatG, calories, 100 / servingSizeMl);
        const full = scaleMacros(
          per100.proteinG,
          per100.carbsG,
          per100.fatG,
          per100.calories,
          volumeMl / 100,
        );
        proteinG = full.proteinG;
        carbsG = full.carbsG;
        fatG = full.fatG;
        calories = full.calories;
      }
    } else {
      servingLabel =
        hit.serving_size?.trim() || hit.quantity?.trim() || "1 serving";
      servingGrams = hit.serving_quantity ?? null;
      if (parseVolumeMl(servingLabel)) {
        servingUnit = "ml";
        servingAmount = parseVolumeMl(servingLabel);
        servingGrams = null;
      }
    }
  } else if (isBeverage && volumeMl) {
    const per100 = {
      proteinG: n.proteins_100g ?? 0,
      carbsG: n.carbohydrates_100g ?? 0,
      fatG: n.fat_100g ?? 0,
      calories:
        n["energy-kcal_100g"] ??
        Math.round(
          (n.proteins_100g ?? 0) * 4 +
            (n.carbohydrates_100g ?? 0) * 4 +
            (n.fat_100g ?? 0) * 9,
        ),
    };
    const scaled = scaleMacros(
      per100.proteinG,
      per100.carbsG,
      per100.fatG,
      per100.calories,
      volumeMl / 100,
    );
    proteinG = scaled.proteinG;
    carbsG = scaled.carbsG;
    fatG = scaled.fatG;
    calories = scaled.calories;
    servingLabel = `${volumeMl} ml`;
    servingUnit = "ml";
    servingAmount = volumeMl;
    servingGrams = null;
  } else {
    proteinG = n.proteins_100g ?? 0;
    carbsG = n.carbohydrates_100g ?? 0;
    fatG = n.fat_100g ?? 0;
    calories =
      n["energy-kcal_100g"] ??
      Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
    servingLabel = hit.quantity?.trim() || "100g";
    servingGrams = 100;
  }

  if (calories <= 0 && proteinG + carbsG + fatG <= 0) return null;

  const scope =
    offScope ?? (isIsraelHit(hit) ? "regional" : "global");

  return {
    id: `off-${hit.code}`,
    name,
    brand: pickBrand(hit.brands),
    barcode: hit.code ?? null,
    source: "off",
    externalId: hit.code ?? null,
    servingLabel,
    servingGrams,
    servingUnit,
    servingAmount,
    proteinG: Math.round(proteinG * 10) / 10,
    carbsG: Math.round(carbsG * 10) / 10,
    fatG: Math.round(fatG * 10) / 10,
    calories: Math.round(calories),
    offScope: scope,
    dataSourceLabel: scope === "regional" ? "Open Food Facts · Israel" : "Open Food Facts",
  };
}

function dedupeOffResults(results: FoodSearchResult[]): FoodSearchResult[] {
  const seen = new Set<string>();
  const out: FoodSearchResult[] = [];
  for (const r of results) {
    const key = r.barcode || r.externalId || r.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Full-text search via Search-a-licious (OFF's recommended replacement for cgi/search.pl).
 * @see https://openfoodfacts.github.io/openfoodfacts-server/api/
 */
async function searchSalicious(
  query: string,
  limit: number,
  preferLang: "he" | "any",
): Promise<FoodSearchResult[]> {
  if (!canRequestOffSearch()) return [];

  trackOffSearch();
  const params = new URLSearchParams({
    q: query.trim(),
    page_size: String(limit),
  });

  try {
    const res = await fetch(`${SAL_SEARCH}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as { hits?: SalHit[] };
    const hits = (data.hits ?? [])
      .map((hit) => normalizeOffHit(hit, preferLang))
      .filter((h): h is FoodSearchResult => h != null);

    if (preferLang === "he") {
      hits.sort((a, b) => {
        const aScore = a.offScope === "regional" ? 1 : 0;
        const bScore = b.offScope === "regional" ? 1 : 0;
        return bScore - aScore;
      });
    }

    return hits.slice(0, limit);
  } catch {
    return [];
  }
}

export async function searchOffProducts(
  query: string,
  countryCode = "il",
  limit = 8,
): Promise<FoodSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const preferLang = countryCode === "il" ? "he" : "any";
  return searchSalicious(q, limit, preferLang);
}

async function fetchOffProductFromBase(
  baseUrl: string,
  code: string,
  preferLang: "he" | "any",
): Promise<FoodSearchResult | null> {
  if (!canRequestOffProduct()) return null;
  trackOffProduct();

  try {
    const res = await fetch(`${baseUrl}/api/v2/product/${code}.json`, {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      product?: OffProduct;
      status?: number;
    };
    if (data.status !== 1 || !data.product) return null;
    return normalizeOffHit(
      { ...data.product, code },
      preferLang,
      "global",
    );
  } catch {
    return null;
  }
}

export async function fetchOffByBarcode(
  barcode: string,
  countryCode = "il",
): Promise<FoodSearchResult | null> {
  const code = barcode.replace(/\D/g, "");
  if (!code) return null;

  const preferLang = countryCode === "il" ? "he" : "any";

  const world = await fetchOffProductFromBase(OFF_WORLD, code, preferLang);
  if (world) {
    return {
      ...world,
      offScope: world.offScope ?? "global",
      dataSourceLabel: "Open Food Facts",
    };
  }

  if (countryCode === "il") {
    const il = await fetchOffProductFromBase(OFF_IL, code, "he");
    if (il) {
      return {
        ...il,
        offScope: "regional",
        dataSourceLabel: "Open Food Facts · Israel",
      };
    }
  }

  return null;
}
