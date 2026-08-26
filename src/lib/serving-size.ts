export type ServingUnit = "g" | "ml" | "serving";

export function parseVolumeMl(text?: string | null): number | null {
  if (!text) return null;
  const t = text.trim().toLowerCase().replace(",", ".");

  const mlMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:ml|m\s*l|millilitre?s?|מ"ל|מל)/i);
  if (mlMatch) return Math.round(Number(mlMatch[1]));

  const clMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:cl|centilitre?s?)/i);
  if (clMatch) return Math.round(Number(clMatch[1]) * 10);

  const lMatch = t.match(/(\d+(?:\.\d+)?)\s*(?:l|liter|litre|ליטר)(?![a-z])/i);
  if (lMatch) return Math.round(Number(lMatch[1]) * 1000);

  return null;
}

const BEVERAGE_CATEGORY_FRAGMENTS = [
  "beverage",
  "beverages",
  "drink",
  "drinks",
  "soft-drink",
  "sodas",
  "juice",
  "juices",
  "waters",
  "beer",
  "wine",
  "cola",
  "energy-drink",
  "iced-tea",
  "milk",
  "שתייה",
  "משקה",
  "מיץ",
];

const BEVERAGE_NAME_FRAGMENTS = [
  "juice",
  "cola",
  "soda",
  "beer",
  "wine",
  "water",
  "milk",
  "drink",
  "beverage",
  "lemonade",
  "sprite",
  "fanta",
  "מיץ",
  "משקה",
  "שתייה",
  "קולה",
  "בירה",
];

export function isLikelyBeverage(input: {
  name?: string;
  categoriesTags?: string[];
  categoriesText?: string;
  quantityText?: string;
}) {
  const volumeMl = parseVolumeMl(input.quantityText);
  if (volumeMl && volumeMl <= 2000) {
    const combined = `${input.name ?? ""} ${input.categoriesText ?? ""}`.toLowerCase();
    if (
      BEVERAGE_NAME_FRAGMENTS.some((k) => combined.includes(k)) ||
      (input.categoriesTags ?? []).some((tag) =>
        BEVERAGE_CATEGORY_FRAGMENTS.some((k) => tag.toLowerCase().includes(k)),
      )
    ) {
      return true;
    }
  }

  if ((input.categoriesTags ?? []).some((tag) => {
    const t = tag.toLowerCase();
    return BEVERAGE_CATEGORY_FRAGMENTS.some((k) => t.includes(k));
  })) {
    return true;
  }

  const name = input.name?.toLowerCase() ?? "";
  return BEVERAGE_NAME_FRAGMENTS.some((k) => name.includes(k));
}

export function formatMlLabel(ml: number, prefix = "") {
  const base = `${ml} ml`;
  return prefix ? `${prefix} (${base})` : base;
}

export function scaleMacros(
  proteinG: number,
  carbsG: number,
  fatG: number,
  calories: number,
  factor: number,
  fiberG = 0,
) {
  return {
    proteinG: Math.round(proteinG * factor * 10) / 10,
    carbsG: Math.round(carbsG * factor * 10) / 10,
    fatG: Math.round(fatG * factor * 10) / 10,
    fiberG: Math.round(fiberG * factor * 10) / 10,
    calories: Math.round(calories * factor),
  };
}
