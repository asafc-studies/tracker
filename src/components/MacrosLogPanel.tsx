"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FoodSearch, type FoodSearchResult } from "@/components/FoodSearch";
import { nutritionFieldClass } from "@/components/nutrition-ui";
import { scaleFood } from "@/lib/food-reference";
import { progressRatio, remainingLabel } from "@/lib/macros";

type Food = {
  id: string;
  name: string;
  brand?: string | null;
  quantity?: number | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
};

type Props = {
  date: string;
};

export function MacrosLogPanel({ date }: Props) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [totals, setTotals] = useState({
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    calories: 0,
  });
  const [proteinTarget, setProteinTarget] = useState(0);
  const [calorieTarget, setCalorieTarget] = useState(0);
  const [hasTargets, setHasTargets] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [name, setName] = useState("");
  const [proteinG, setProteinG] = useState(0);
  const [carbsG, setCarbsG] = useState(0);
  const [fatG, setFatG] = useState(0);
  const [autoFillHint, setAutoFillHint] = useState("");
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [savingFoodId, setSavingFoodId] = useState<string | null>(null);

  const field = nutritionFieldClass();

  const reload = useCallback(async () => {
    const [m, p] = await Promise.all([
      fetch(`/api/macros?date=${encodeURIComponent(date)}`).then((r) =>
        r.json(),
      ),
      fetch("/api/profile").then((r) => r.json()),
    ]);
    setFoods(m.foods ?? []);
    setTotals(m.totals ?? { proteinG: 0, carbsG: 0, fatG: 0, calories: 0 });
    if (p.targets) {
      setProteinTarget(p.targets.proteinG);
      setCalorieTarget(p.targets.calorieTarget);
      setHasTargets(true);
    } else {
      setHasTargets(false);
    }
  }, [date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function addFood(payload: {
    name: string;
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories?: number;
    brand?: string | null;
    savedFoodId?: string | null;
    quantity?: number;
    cacheFood?: boolean;
    foodSource?: string;
    externalId?: string | null;
    barcode?: string | null;
    servingLabel?: string;
    servingGrams?: number | null;
    baseProteinG?: number;
    baseCarbsG?: number;
    baseFatG?: number;
    baseCalories?: number;
    foodId?: string;
  }) {
    await fetch("/api/macros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, date }),
    });
    await reload();
  }

  async function removeFood(id: string) {
    await fetch(`/api/macros?id=${id}`, { method: "DELETE" });
    if (editingFoodId === id) {
      setEditingFoodId(null);
      setEditQuantity("");
    }
    await reload();
  }

  function startEditFood(food: Food) {
    setEditingFoodId(food.id);
    setEditQuantity(String(food.quantity ?? 1));
  }

  async function saveFoodQuantity(id: string) {
    const quantity = Number(editQuantity);
    if (!quantity || quantity <= 0) return;
    setSavingFoodId(id);
    try {
      await fetch("/api/macros", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, quantity }),
      });
      setEditingFoodId(null);
      setEditQuantity("");
      await reload();
    } finally {
      setSavingFoodId(null);
    }
  }

  function handleSearchSelect(
    food: FoodSearchResult,
    quantity: number,
    mlAmount?: number,
  ) {
    const scaled = scaleFood(food, quantity, mlAmount);
    const displayName =
      quantity === 1 ? food.name : `${food.name} (${scaled.label})`;
    void addFood({
      name: displayName,
      brand: food.brand,
      proteinG: scaled.proteinG,
      carbsG: scaled.carbsG,
      fatG: scaled.fatG,
      calories: scaled.calories,
      quantity: mlAmount != null && food.servingUnit === "ml" ? quantity : quantity,
      savedFoodId: food.savedFoodId,
      cacheFood:
        food.source === "off" ||
        food.source === "reference" ||
        food.source === "fdc",
      foodSource: food.source,
      externalId: food.externalId,
      barcode: food.barcode,
      servingLabel: food.servingLabel,
      servingGrams: food.servingGrams,
      baseProteinG: food.proteinG,
      baseCarbsG: food.carbsG,
      baseFatG: food.fatG,
      baseCalories: food.calories,
      foodId: food.id,
    });
  }

  useEffect(() => {
    if (!showManual || name.trim().length < 2) {
      setAutoFillHint("");
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/foods/search?q=${encodeURIComponent(name.trim())}`)
        .then((r) => r.json())
        .then((d) => {
          const results: FoodSearchResult[] = d.results ?? [];
          const exact = results.find(
            (r) => r.name.toLowerCase() === name.trim().toLowerCase(),
          );
          const pick = exact ?? (results.length === 1 ? results[0] : null);
          if (pick) {
            setProteinG(pick.proteinG);
            setCarbsG(pick.carbsG);
            setFatG(pick.fatG);
            setAutoFillHint(`Auto-filled from ${pick.source}`);
          } else {
            setAutoFillHint("");
          }
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [name, showManual]);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        {hasTargets ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  Protein
                </p>
                <p className="text-2xl sm:text-3xl font-semibold">
                  {Math.round(totals.proteinG)}
                  <span className="text-base text-[var(--muted)] font-normal">
                    g
                  </span>
                </p>
                <p className="text-xs text-[var(--accent)]">
                  {remainingLabel(totals.proteinG, proteinTarget, "g")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  Calories
                </p>
                <p className="text-2xl sm:text-3xl font-semibold">
                  {Math.round(totals.calories)}
                </p>
                <p className="text-xs text-[var(--accent)]">
                  {remainingLabel(totals.calories, calorieTarget, " kcal")}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                  <span>Protein</span>
                  <span>
                    {Math.round(totals.proteinG)}/{proteinTarget}g
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-500"
                    style={{
                      width: `${progressRatio(totals.proteinG, proteinTarget) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                  <span>Calories</span>
                  <span>
                    {Math.round(totals.calories)}/{calorieTarget}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]/70 transition-all duration-500"
                    style={{
                      width: `${progressRatio(totals.calories, calorieTarget) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Set your daily targets in{" "}
            <Link
              href="/settings"
              className="text-[var(--accent)] hover:underline"
            >
              Settings
            </Link>{" "}
            to see how much is left today.
          </p>
        )}
        <p className="text-xs text-[var(--muted)]">
          Carbs {Math.round(totals.carbsG)}g · Fat {Math.round(totals.fatG)}g
        </p>
      </section>

      <section>
        <h2 className="text-sm text-[var(--muted)] mb-3">Add food</h2>
        {!showManual ? (
          <FoodSearch
            onSelect={handleSearchSelect}
            onManual={() => setShowManual(true)}
          />
        ) : (
          <form
            className="space-y-3 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              void addFood({ name, proteinG, carbsG, fatG, quantity: 1 }).then(
                () => {
                  setName("");
                  setProteinG(0);
                  setCarbsG(0);
                  setFatG(0);
                  setShowManual(false);
                  setAutoFillHint("");
                },
              );
            }}
          >
            <button
              type="button"
              onClick={() => setShowManual(false)}
              className="text-xs text-[var(--accent)] hover:underline min-h-[44px]"
            >
              ← Back to search
            </button>
            <input
              className={field}
              placeholder="Food name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            {autoFillHint ? (
              <p className="text-xs text-[var(--accent)]">{autoFillHint}</p>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <input
                className={field}
                type="number"
                step="0.1"
                placeholder="P"
                value={proteinG || ""}
                onChange={(e) => setProteinG(Number(e.target.value))}
              />
              <input
                className={field}
                type="number"
                step="0.1"
                placeholder="C"
                value={carbsG || ""}
                onChange={(e) => setCarbsG(Number(e.target.value))}
              />
              <input
                className={field}
                type="number"
                step="0.1"
                placeholder="F"
                value={fatG || ""}
                onChange={(e) => setFatG(Number(e.target.value))}
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto"
            >
              Add
            </button>
          </form>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm text-[var(--muted)]">Logged</h2>
        {foods.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No foods logged yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
            {foods.map((f) => {
              const editing = editingFoodId === f.id;
              const qty = f.quantity ?? 1;
              return (
                <li key={f.id} className="px-3 py-3 bg-[var(--surface)]">
                  {editing ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {Math.round(f.proteinG * 10) / 10}g P ·{" "}
                        {Math.round(f.calories)} kcal at current amount
                      </p>
                      <label className="space-y-1 block">
                        <span className="text-xs text-[var(--muted)]">
                          Amount (servings)
                        </span>
                        <input
                          className={field}
                          type="number"
                          step="0.25"
                          min={0.25}
                          inputMode="decimal"
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingFoodId === f.id}
                          onClick={() => void saveFoodQuantity(f.id)}
                          className="text-xs text-[var(--accent)] font-medium min-h-[44px] px-3"
                        >
                          {savingFoodId === f.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFoodId(null);
                            setEditQuantity("");
                          }}
                          className="text-xs text-[var(--muted)] min-h-[44px] px-3"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeFood(f.id)}
                          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px] px-3 ml-auto"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{f.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {f.brand ? `${f.brand} · ` : ""}
                          {qty !== 1 ? `×${qty} · ` : ""}
                          {Math.round(f.proteinG * 10) / 10}g P ·{" "}
                          {Math.round(f.calories)} kcal
                        </p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditFood(f)}
                          className="text-xs px-3 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px]"
                        >
                          Amount
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeFood(f.id)}
                          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px] px-3"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
