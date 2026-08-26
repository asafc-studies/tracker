export type FoodSearchResult = {
  id: string;
  name: string;
  brand?: string | null;
  barcode?: string | null;
  source: "reference" | "off" | "custom" | "history" | "saved" | "fdc";
  externalId?: string | null;
  servingLabel: string;
  servingGrams?: number | null;
  /** For drinks: portion is in ml (full package when amount matches label). */
  servingUnit?: "g" | "ml" | "serving";
  servingAmount?: number | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  calories: number;
  savedFoodId?: string | null;
  /** Present on OFF hits when result came from global vs Israel-tagged catalog. */
  offScope?: "regional" | "global";
  /** Short label for UI, e.g. USDA · survey */
  dataSourceLabel?: string;
  /** When re-picking from history: how many servings were logged last time. */
  lastLoggedQuantity?: number | null;
};

export const REFERENCE_FOODS: FoodSearchResult[] = [
  {
    id: "ref-egg-small",
    name: "Egg (small) / ביצה קטנה",
    source: "reference",
    servingLabel: "1 egg (~50g)",
    servingGrams: 50,
    proteinG: 6,
    carbsG: 0.3,
    fatG: 4.5,
    fiberG: 0,
    calories: 63,
  },
  {
    id: "ref-egg-medium",
    name: "Egg (medium) / ביצה בינונית",
    source: "reference",
    servingLabel: "1 egg (~58g)",
    servingGrams: 58,
    proteinG: 7,
    carbsG: 0.4,
    fatG: 5.3,
    fiberG: 0,
    calories: 74,
  },
  {
    id: "ref-egg-large",
    name: "Egg (large) / ביצה גדולה",
    source: "reference",
    servingLabel: "1 egg (~65g)",
    servingGrams: 65,
    proteinG: 8,
    carbsG: 0.4,
    fatG: 6,
    fiberG: 0,
    calories: 84,
  },
  {
    id: "ref-eggs-2",
    name: "Eggs ×2 / שתי ביצים",
    source: "reference",
    servingLabel: "2 medium eggs",
    servingGrams: 116,
    proteinG: 14,
    carbsG: 0.8,
    fatG: 10.6,
    fiberG: 0,
    calories: 148,
  },
  {
    id: "ref-chicken-100",
    name: "Chicken breast / חזה עוף",
    source: "reference",
    servingLabel: "100g cooked",
    servingGrams: 100,
    proteinG: 31,
    carbsG: 0,
    fatG: 3.6,
    fiberG: 0,
    calories: 165,
  },
  {
    id: "ref-chicken-150",
    name: "Chicken breast 150g / חזה עוף 150 גרם",
    source: "reference",
    servingLabel: "150g cooked",
    servingGrams: 150,
    proteinG: 46,
    carbsG: 0,
    fatG: 5.4,
    fiberG: 0,
    calories: 248,
  },
  {
    id: "ref-rice-150",
    name: "White rice cooked / אורז מבושל",
    source: "reference",
    servingLabel: "150g cooked",
    servingGrams: 150,
    proteinG: 4,
    carbsG: 42,
    fatG: 0,
    fiberG: 0.6,
    calories: 185,
  },
  {
    id: "ref-greek-yogurt",
    name: "Greek yogurt 5% / יוגורט יווני 5%",
    source: "reference",
    servingLabel: "200g",
    servingGrams: 200,
    proteinG: 20,
    carbsG: 8,
    fatG: 10,
    fiberG: 0,
    calories: 210,
  },
  {
    id: "ref-cottage",
    name: "Cottage cheese 5% / גבינת קוטג' 5%",
    source: "reference",
    servingLabel: "250g",
    servingGrams: 250,
    proteinG: 28,
    carbsG: 10,
    fatG: 12.5,
    fiberG: 0,
    calories: 290,
  },
  {
    id: "ref-whey",
    name: "Whey protein scoop / סקופ חלבון",
    source: "reference",
    servingLabel: "1 scoop (~30g)",
    servingGrams: 30,
    proteinG: 24,
    carbsG: 3,
    fatG: 1,
    fiberG: 0,
    calories: 120,
  },
  {
    id: "ref-banana",
    name: "Banana / בננה",
    source: "reference",
    servingLabel: "1 medium",
    servingGrams: 118,
    proteinG: 1.3,
    carbsG: 27,
    fatG: 0.4,
    fiberG: 3.1,
    calories: 105,
  },
  {
    id: "ref-avocado",
    name: "Avocado / אבוקדו",
    source: "reference",
    servingLabel: "1/2 medium",
    servingGrams: 100,
    proteinG: 2,
    carbsG: 9,
    fatG: 15,
    fiberG: 6.7,
    calories: 160,
  },
  {
    id: "ref-hummus",
    name: "Hummus / חומוס",
    source: "reference",
    servingLabel: "100g",
    servingGrams: 100,
    proteinG: 8,
    carbsG: 14,
    fatG: 10,
    fiberG: 6,
    calories: 166,
  },
  {
    id: "ref-pita",
    name: "Pita bread / פita",
    source: "reference",
    servingLabel: "1 pita",
    servingGrams: 60,
    proteinG: 4,
    carbsG: 33,
    fatG: 1,
    fiberG: 1.3,
    calories: 165,
  },
  {
    id: "ref-salmon-100",
    name: "Salmon / סלמון",
    source: "reference",
    servingLabel: "100g",
    servingGrams: 100,
    proteinG: 22,
    carbsG: 0,
    fatG: 13,
    fiberG: 0,
    calories: 208,
  },
];

export function searchReferenceFoods(query: string, limit = 8): FoodSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return REFERENCE_FOODS.filter((f) => f.name.toLowerCase().includes(q)).slice(
    0,
    limit,
  );
}

export function scaleFood(
  food: Pick<
    FoodSearchResult,
    | "proteinG"
    | "carbsG"
    | "fatG"
    | "fiberG"
    | "calories"
    | "servingLabel"
    | "servingUnit"
    | "servingAmount"
  >,
  quantity: number,
  mlAmount?: number,
) {
  if (
    food.servingUnit === "ml" &&
    food.servingAmount &&
    food.servingAmount > 0 &&
    mlAmount != null &&
    mlAmount > 0
  ) {
    const factor = mlAmount / food.servingAmount;
    const scaled = {
      proteinG: Math.round(food.proteinG * factor * 10) / 10,
      carbsG: Math.round(food.carbsG * factor * 10) / 10,
      fatG: Math.round(food.fatG * factor * 10) / 10,
      fiberG: Math.round((food.fiberG || 0) * factor * 10) / 10,
      calories: Math.round(food.calories * factor),
      label: `${Math.round(mlAmount)} ml`,
    };
    return scaled;
  }

  const q = quantity > 0 ? quantity : 1;
  let label: string;
  if (food.servingUnit === "ml" && food.servingAmount) {
    const totalMl = Math.round(food.servingAmount * q);
    label = q === 1 ? `${food.servingAmount} ml` : `${totalMl} ml`;
  } else {
    label =
      q === 1 ? food.servingLabel : `${q} × ${food.servingLabel}`;
  }
  return {
    proteinG: Math.round(food.proteinG * q * 10) / 10,
    carbsG: Math.round(food.carbsG * q * 10) / 10,
    fatG: Math.round(food.fatG * q * 10) / 10,
    fiberG: Math.round((food.fiberG || 0) * q * 10) / 10,
    calories: Math.round(food.calories * q),
    label,
  };
}
