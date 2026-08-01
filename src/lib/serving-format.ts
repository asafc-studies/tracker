export type ServingUnit = "g" | "ml";

export function formatServingSize(amount: number, unit: ServingUnit) {
  const n = Number.isFinite(amount) && amount > 0 ? amount : 100;
  return unit === "ml" ? `${n} ml` : `${n}g`;
}
