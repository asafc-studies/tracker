"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FoodSearch, type FoodSearchResult } from "@/components/FoodSearch";
import { MacroWarningsBanner } from "@/components/MacroWarningsBanner";
import { NutritionCoach } from "@/components/NutritionCoach";
import { nutritionFieldClass } from "@/components/nutrition-ui";
import { apiFetch } from "@/lib/api-fetch";
import { scaleFood } from "@/lib/food-reference";
import { formatMacroShort, getMacroWarnings, progressRatio, remainingLabel } from "@/lib/macros";
import { invalidateAfterMacros } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";

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

type MacrosPayload = {
  foods: Food[];
  totals: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories: number;
  };
};

type ProfilePayload = {
  profile?: {
    weightKg?: number | null;
    bodyFatPercent?: number | null;
  } | null;
  targets: {
    proteinG: number;
    calorieTarget: number;
    carbsG: number;
    fatG: number;
    tdee: number;
    deficit: number;
    bodyFatPercent?: number;
  } | null;
};

type Props = {
  date: string;
};

export function MacrosLogPanel({ date }: Props) {
  const queryClient = useQueryClient();
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

  const macrosQuery = useQuery({
    queryKey: queryKeys.macros(date),
    queryFn: () =>
      apiFetch<MacrosPayload>(
        `/api/macros?date=${encodeURIComponent(date)}`,
      ),
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });

  const foods = macrosQuery.data?.foods ?? [];
  const totals = macrosQuery.data?.totals ?? {
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    calories: 0,
  };
  const targets = profileQuery.data?.targets ?? null;
  const proteinTarget = targets?.proteinG ?? 0;
  const calorieTarget = targets?.calorieTarget ?? 0;
  const hasTargets = Boolean(targets);
  const warnings =
    targets != null
      ? getMacroWarnings(totals, {
          calorieTarget: targets.calorieTarget,
          proteinG: targets.proteinG,
          carbsG: targets.carbsG,
          fatG: targets.fatG,
        })
      : [];
  const fatWarned = warnings.some((w) => w.metric === "fat");
  const calWarned = warnings.some((w) => w.metric === "calories");
  const proteinWarned = warnings.some((w) => w.metric === "protein");
  const carbWarned = warnings.some((w) => w.metric === "carbs");

  async function refreshAfterWrite() {
    await invalidateAfterMacros(queryClient, date);
  }

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
    await apiFetch("/api/macros", {
      method: "POST",
      body: JSON.stringify({ ...payload, date }),
    });
    await refreshAfterWrite();
  }

  async function removeFood(id: string) {
    await apiFetch(`/api/macros?id=${id}`, { method: "DELETE" });
    if (editingFoodId === id) {
      setEditingFoodId(null);
      setEditQuantity("");
    }
    await refreshAfterWrite();
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
      await apiFetch("/api/macros", {
        method: "PATCH",
        body: JSON.stringify({ id, quantity }),
      });
      setEditingFoodId(null);
      setEditQuantity("");
      await refreshAfterWrite();
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
    void addFood({
      name: food.name,
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
                {proteinWarned ? (
                  <p className="text-xs text-[var(--warn)] mt-0.5">
                    Below recomp target
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  Calories
                </p>
                <p
                  className={`text-2xl sm:text-3xl font-semibold ${
                    calWarned ? "text-[var(--warn)]" : ""
                  }`}
                >
                  {Math.round(totals.calories)}
                </p>
                <p
                  className={`text-xs ${
                    calWarned ? "text-[var(--warn)]" : "text-[var(--accent)]"
                  }`}
                >
                  {remainingLabel(totals.calories, calorieTarget, " kcal")}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                  <span>Protein</span>
                  <span className={proteinWarned ? "text-[var(--warn)]" : ""}>
                    {Math.round(totals.proteinG)}/{proteinTarget}g
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      proteinWarned ? "bg-[var(--warn)]" : "bg-[var(--accent)]"
                    }`}
                    style={{
                      width: `${progressRatio(totals.proteinG, proteinTarget) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                  <span>Calories</span>
                  <span className={calWarned ? "text-[var(--warn)]" : ""}>
                    {Math.round(totals.calories)}/{calorieTarget}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      calWarned
                        ? "bg-[var(--warn)]"
                        : "bg-[var(--accent)]/70"
                    }`}
                    style={{
                      width: `${Math.min(100, progressRatio(totals.calories, calorieTarget) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              {targets ? (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span
                      className={
                        fatWarned ? "text-[var(--warn)]" : "text-[var(--muted)]"
                      }
                    >
                      Fat{fatWarned ? " — over" : ""}
                    </span>
                    <span
                      className={
                        fatWarned ? "text-[var(--warn)]" : "text-[var(--muted)]"
                      }
                    >
                      {Math.round(totals.fatG)}/{targets.fatG}g
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        fatWarned ? "bg-[var(--warn)]" : "bg-[var(--accent)]/50"
                      }`}
                      style={{
                        width: `${Math.min(100, progressRatio(totals.fatG, targets.fatG) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
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
          Carbs{" "}
          <span className={carbWarned ? "text-[var(--warn)]" : undefined}>
            {Math.round(totals.carbsG)}g
            {targets ? ` / ${targets.carbsG}g` : ""}
          </span>
          {" · "}
          Fat{" "}
          <span className={fatWarned ? "text-[var(--warn)] font-medium" : undefined}>
            {Math.round(totals.fatG)}g
            {targets ? ` / ${targets.fatG}g` : ""}
            {fatWarned ? " over" : ""}
          </span>
        </p>
      </section>

      <MacroWarningsBanner warnings={warnings} />

      {targets && totals.calories > 0 ? (
        <NutritionCoach
          compact
          intake={totals}
          targets={{
            calorieTarget: targets.calorieTarget,
            proteinG: targets.proteinG,
            carbsG: targets.carbsG,
            fatG: targets.fatG,
            tdee: targets.tdee,
            deficit: targets.deficit,
            bodyFatPercent:
              targets.bodyFatPercent ??
              profileQuery.data?.profile?.bodyFatPercent ??
              undefined,
            weightKg: profileQuery.data?.profile?.weightKg,
          }}
        />
      ) : null}

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
                        {formatMacroShort(f)} at current amount
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
                          {formatMacroShort(f)}
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
