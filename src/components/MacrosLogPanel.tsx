"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FoodSearch,
  FAVORITES_CHANGED,
  type FoodSearchResult,
} from "@/components/FoodSearch";
import { MacroWarningsBanner } from "@/components/MacroWarningsBanner";
import { SleepUndersleepTip } from "@/components/SleepUndersleepTip";
import { nutritionFieldClass } from "@/components/nutrition-ui";
import { apiFetch } from "@/lib/api-fetch";
import { scaleFood } from "@/lib/food-reference";
import { formatMacroShort, getMacroWarnings, progressRatio, proteinBarFillClass, proteinBarSegments, proteinRemainingLabel, remainingLabel } from "@/lib/macros";
import { invalidateAfterMacros } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { todayISODate } from "@/lib/tdee";
import { useMacrosQuery } from "@/lib/use-macros-query";

type Food = {
  id: string;
  name: string;
  brand?: string | null;
  savedFoodId?: string | null;
  quantity?: number | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  calories: number;
  servingLabel?: string;
  servingProteinG?: number;
  servingCarbsG?: number;
  servingFatG?: number;
  servingFiberG?: number;
  favorited?: boolean;
};

type ProfilePayload = {
  profile?: {
    weightKg?: number | null;
    bodyFatPercent?: number | null;
  } | null;
  targets: {
    proteinG: number;
    proteinMinG?: number;
    proteinGoodG?: number;
    proteinMaxG?: number;
    calorieTarget: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    fiberMinG?: number;
    fiberMaxG?: number;
    tdee: number;
    deficit: number;
    bodyFatPercent?: number;
  } | null;
};

type Props = {
  date: string;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export function MacrosLogPanel({ date }: Props) {
  const queryClient = useQueryClient();
  const today = todayISODate();
  const isPastDate = date < today;
  const [showManual, setShowManual] = useState(false);
  const [name, setName] = useState("");
  const [proteinG, setProteinG] = useState(0);
  const [carbsG, setCarbsG] = useState(0);
  const [fatG, setFatG] = useState(0);
  const [fiberG, setFiberG] = useState(0);
  const [autoFillHint, setAutoFillHint] = useState("");
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editServingLabel, setEditServingLabel] = useState("1 serving");
  /** Per original serving — stays fixed unless the user edits these fields. */
  const [editProtein, setEditProtein] = useState(0);
  const [editCarbs, setEditCarbs] = useState(0);
  const [editFat, setEditFat] = useState(0);
  const [editFiber, setEditFiber] = useState(0);
  const [macrosTouched, setMacrosTouched] = useState(false);
  const [savingFoodId, setSavingFoodId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copyingAll, setCopyingAll] = useState(false);
  const [copyHint, setCopyHint] = useState("");
  const [favHint, setFavHint] = useState("");
  const [togglingFavId, setTogglingFavId] = useState<string | null>(null);

  const field = nutritionFieldClass();

  const macrosQuery = useMacrosQuery(date);

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });

  const foods = macrosQuery.data?.foods ?? [];
  const totals = macrosQuery.data?.totals ?? {
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    calories: 0,
  };
  const targets = profileQuery.data?.targets ?? null;
  const proteinMin = targets?.proteinMinG ?? targets?.proteinG ?? 0;
  const proteinGood = targets?.proteinGoodG ?? proteinMin;
  const proteinMax = targets?.proteinMaxG ?? targets?.proteinG ?? 0;
  const calorieTarget = targets?.calorieTarget ?? 0;
  const hasTargets = Boolean(targets);
  const warnings =
    targets != null
      ? getMacroWarnings(totals, {
          calorieTarget: targets.calorieTarget,
          proteinG: targets.proteinG,
          proteinMinG: proteinMin,
          proteinGoodG: proteinGood,
          proteinMaxG: proteinMax,
          carbsG: targets.carbsG,
          fatG: targets.fatG,
          fiberG: targets.fiberG,
          fiberMinG: targets.fiberMinG,
          fiberMaxG: targets.fiberMaxG,
        })
      : [];
  const fatWarned = warnings.some((w) => w.metric === "fat");
  const calWarned = warnings.some((w) => w.metric === "calories");
  const proteinNote = warnings.find((w) => w.metric === "protein");
  const carbWarned = warnings.some((w) => w.metric === "carbs");
  const proteinSegments = proteinBarSegments(
    totals.proteinG,
    proteinMin,
    proteinGood,
    proteinMax,
  );
  const proteinToneClass =
    proteinNote?.tone === "hard"
      ? "text-[var(--protein-hard)]"
      : proteinNote?.tone === "soft"
        ? "text-[var(--protein-soft)]"
        : proteinNote?.tone === "warn"
          ? "text-[var(--warn)]"
          : "";

  async function refreshAfterWrite() {
    await invalidateAfterMacros(queryClient, date);
  }

  async function postFood(payload: {
    name: string;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG?: number;
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
    baseFiberG?: number;
    baseCalories?: number;
    foodId?: string;
    date?: string;
  }) {
    await apiFetch("/api/macros", {
      method: "POST",
      body: JSON.stringify({ ...payload, date: payload.date ?? date }),
    });
  }

  async function addFood(payload: Parameters<typeof postFood>[0]) {
    await postFood(payload);
    await refreshAfterWrite();
  }

  async function removeFood(id: string) {
    await apiFetch(`/api/macros?id=${id}`, { method: "DELETE" });
    if (editingFoodId === id) {
      setEditingFoodId(null);
      setMacrosTouched(false);
    }
    await refreshAfterWrite();
  }

  function startEditFood(food: Food) {
    const q = food.quantity && food.quantity > 0 ? food.quantity : 1;
    setEditingFoodId(food.id);
    setEditName(food.name);
    setEditQuantity(String(q));
    setEditServingLabel(food.servingLabel ?? "1 serving");
    // This log's per-portion macros (catalog serving, or last edit if changed).
    setEditProtein(round1(food.proteinG / q));
    setEditCarbs(round1(food.carbsG / q));
    setEditFat(round1(food.fatG / q));
    setEditFiber(round1((food.fiberG ?? 0) / q));
    setMacrosTouched(false);
  }

  function cancelEdit() {
    setEditingFoodId(null);
    setMacrosTouched(false);
  }

  async function saveFoodEdit(id: string) {
    const quantity = Number(editQuantity);
    if (!editName.trim()) return;
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setSavingFoodId(id);
    try {
      // Always apply form per-serving macros × portions so changing portions
      // never pulls a different base, and P/C/F stay fixed unless edited.
      await apiFetch("/api/macros", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          name: editName.trim(),
          quantity,
          proteinG: round1(editProtein * quantity),
          carbsG: round1(editCarbs * quantity),
          fatG: round1(editFat * quantity),
          fiberG: round1(editFiber * quantity),
          syncServing: macrosTouched,
        }),
      });
      cancelEdit();
      await refreshAfterWrite();
    } finally {
      setSavingFoodId(null);
    }
  }

  async function copyFoodToToday(food: Food) {
    setCopyingId(food.id);
    setCopyHint("");
    try {
      await postFood({
        name: food.name,
        brand: food.brand,
        proteinG: food.proteinG,
        carbsG: food.carbsG,
        fatG: food.fatG,
        fiberG: food.fiberG ?? 0,
        calories: food.calories,
        quantity: food.quantity ?? 1,
        savedFoodId: food.savedFoodId,
        date: today,
      });
      await refreshAfterWrite();
      setCopyHint(`Added “${food.name}” to today`);
    } finally {
      setCopyingId(null);
    }
  }

  async function copyAllToToday() {
    if (foods.length === 0) return;
    setCopyingAll(true);
    setCopyHint("");
    try {
      for (const food of foods) {
        await postFood({
          name: food.name,
          brand: food.brand,
          proteinG: food.proteinG,
          carbsG: food.carbsG,
          fatG: food.fatG,
          fiberG: food.fiberG ?? 0,
          calories: food.calories,
          quantity: food.quantity ?? 1,
          savedFoodId: food.savedFoodId,
          date: today,
        });
      }
      await refreshAfterWrite();
      setCopyHint(`Copied ${foods.length} food${foods.length === 1 ? "" : "s"} to today`);
    } finally {
      setCopyingAll(false);
    }
  }

  async function toggleFavorite(food: Food) {
    if (togglingFavId) return;
    setTogglingFavId(food.id);
    setFavHint("");
    try {
      const data = await apiFetch<{
        ok: boolean;
        reason?: string;
        favorited?: boolean;
        savedFoodId?: string;
      }>("/api/foods/favorite", {
        method: "POST",
        body: JSON.stringify({
          foodLogId: food.id,
          savedFoodId: food.savedFoodId,
          pinned: !food.favorited,
        }),
      });
      if (!data.ok && data.reason === "full") {
        setFavHint("Favorites is full");
        window.dispatchEvent(
          new CustomEvent(FAVORITES_CHANGED, { detail: { reason: "full" } }),
        );
        window.setTimeout(() => setFavHint(""), 2200);
        return;
      }
      await refreshAfterWrite();
      window.dispatchEvent(new Event(FAVORITES_CHANGED));
    } finally {
      setTogglingFavId(null);
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
      fiberG: scaled.fiberG ?? 0,
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
      baseFiberG: food.fiberG ?? 0,
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
            setFiberG(pick.fiberG ?? 0);
            setAutoFillHint(`Auto-filled from ${pick.source}`);
          } else {
            setAutoFillHint("");
          }
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [name, showManual]);

  useEffect(() => {
    if (!copyHint) return;
    const t = setTimeout(() => setCopyHint(""), 3000);
    return () => clearTimeout(t);
  }, [copyHint]);

  useEffect(() => {
    function onFavChange() {
      void refreshAfterWrite();
    }
    window.addEventListener(FAVORITES_CHANGED, onFavChange);
    return () => window.removeEventListener(FAVORITES_CHANGED, onFavChange);
  }, [queryClient, date]);

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
                  {proteinRemainingLabel(
                    totals.proteinG,
                    proteinMin,
                    proteinMax,
                  )}
                </p>
                {proteinNote ? (
                  <p className={`text-xs mt-0.5 ${proteinToneClass}`}>
                    {proteinNote.tone === "warn" &&
                    totals.proteinG > proteinMax
                      ? "Past range max"
                      : proteinNote.tone === "warn"
                        ? "Below 1.61 g/kg floor"
                        : proteinNote.tone === "soft"
                          ? "Good — could be better"
                          : "Good enough"}
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
                  <span>Protein · 1.61–2.2 g/kg</span>
                  <span className={proteinToneClass || undefined}>
                    {Math.round(totals.proteinG)}g
                    {proteinMin > 0
                      ? ` · floor ${proteinMin} · max ${proteinMax}`
                      : ""}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  {proteinSegments.map((seg) => (
                    <div
                      key={seg.key}
                      className={`absolute top-0 bottom-0 transition-all duration-500 ${proteinBarFillClass(seg.key)}`}
                      style={{
                        left: `${seg.leftPct}%`,
                        width: `${seg.widthPct}%`,
                      }}
                    />
                  ))}
                  {proteinMax > 0 ? (
                    <>
                      <span
                        className="absolute top-0 bottom-0 w-px bg-white/25"
                        style={{ left: `${(proteinMin / proteinMax) * 100}%` }}
                        title="1.61 g/kg floor"
                      />
                      <span
                        className="absolute top-0 bottom-0 w-px bg-white/40"
                        style={{ left: `${(proteinGood / proteinMax) * 100}%` }}
                        title="1.85 g/kg strong zone"
                      />
                    </>
                  ) : null}
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
              {targets?.fiberG ? (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[var(--muted)]">Fiber</span>
                    <span className="text-[var(--muted)]">
                      {Math.round(totals.fiberG ?? 0)}/{targets.fiberG}g
                      {(() => {
                        const rem = remainingLabel(
                          totals.fiberG ?? 0,
                          targets.fiberG,
                          "g",
                        );
                        return rem ? ` · ${rem}` : "";
                      })()}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                    <div
                      className="h-full transition-all duration-500 bg-[var(--accent)]/50"
                      style={{
                        width: `${Math.min(100, progressRatio(totals.fiberG ?? 0, targets.fiberG) * 100)}%`,
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
          {" · "}
          Fiber{" "}
          <span>
            {Math.round(totals.fiberG ?? 0)}g
            {targets?.fiberG ? ` / ${targets.fiberG}g` : ""}
          </span>
        </p>
      </section>

      <MacroWarningsBanner warnings={warnings} />

      <SleepUndersleepTip kind="deficit" className="text-xs text-[var(--muted)]" />

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
              void addFood({
                name,
                proteinG,
                carbsG,
                fatG,
                fiberG: fiberG || 0,
                quantity: 1,
              }).then(
                () => {
                  setName("");
                  setProteinG(0);
                  setCarbsG(0);
                  setFatG(0);
                  setFiberG(0);
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
              <input
                className={field}
                type="number"
                step="0.1"
                placeholder="Fi"
                value={fiberG || ""}
                onChange={(e) => setFiberG(Number(e.target.value))}
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
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm text-[var(--muted)]">Logged</h2>
          {isPastDate && foods.length > 0 ? (
            <button
              type="button"
              disabled={copyingAll}
              onClick={() => void copyAllToToday()}
              className="text-xs text-[var(--accent)] hover:underline min-h-[44px] px-1 ml-auto"
            >
              {copyingAll ? "Copying…" : "Copy all to today"}
            </button>
          ) : null}
        </div>
        {copyHint ? (
          <p className="text-xs text-[var(--accent)]">{copyHint}</p>
        ) : null}
        {favHint ? (
          <p className="text-xs text-[var(--accent)]">{favHint}</p>
        ) : null}
        {foods.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No foods logged yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
            {foods.map((f) => {
              const editing = editingFoodId === f.id;
              const qty = f.quantity ?? 1;
              return (
                <li key={f.id} className="relative px-3 py-3 pr-10 bg-[var(--surface)]">
                  <button
                    type="button"
                    disabled={togglingFavId === f.id}
                    aria-label={
                      f.favorited
                        ? `Remove ${f.name} from favorites`
                        : `Add ${f.name} to favorites`
                    }
                    onClick={() => void toggleFavorite(f)}
                    className="absolute top-2 right-2 p-1.5 text-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      aria-hidden
                      fill={f.favorited ? "#ef4444" : "none"}
                      stroke={f.favorited ? "#ef4444" : "currentColor"}
                      strokeWidth="1.75"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                      />
                    </svg>
                  </button>
                  {editing ? (
                    <div className="space-y-3">
                      <label className="space-y-1 block">
                        <span className="text-xs text-[var(--muted)]">Name</span>
                        <input
                          className={field}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </label>
                      <p className="text-xs text-[var(--muted)]">
                        Macros per {editServingLabel}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="space-y-1 block">
                          <span className="text-xs text-[var(--muted)]">P</span>
                          <input
                            className={field}
                            type="number"
                            step="0.1"
                            value={editProtein || ""}
                            onChange={(e) => {
                              setMacrosTouched(true);
                              setEditProtein(Number(e.target.value));
                            }}
                          />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-xs text-[var(--muted)]">C</span>
                          <input
                            className={field}
                            type="number"
                            step="0.1"
                            value={editCarbs || ""}
                            onChange={(e) => {
                              setMacrosTouched(true);
                              setEditCarbs(Number(e.target.value));
                            }}
                          />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-xs text-[var(--muted)]">F</span>
                          <input
                            className={field}
                            type="number"
                            step="0.1"
                            value={editFat || ""}
                            onChange={(e) => {
                              setMacrosTouched(true);
                              setEditFat(Number(e.target.value));
                            }}
                          />
                        </label>
                        <label className="space-y-1 block">
                          <span className="text-xs text-[var(--muted)]">Fi</span>
                          <input
                            className={field}
                            type="number"
                            step="0.1"
                            value={editFiber || ""}
                            onChange={(e) => {
                              setMacrosTouched(true);
                              setEditFiber(Number(e.target.value));
                            }}
                          />
                        </label>
                      </div>
                      <label className="space-y-1 block">
                        <span className="text-xs text-[var(--muted)]">
                          Portions of {editServingLabel}
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
                      {(() => {
                        const q = Number(editQuantity);
                        const qty = Number.isFinite(q) && q > 0 ? q : 1;
                        const p = round1(editProtein * qty);
                        const c = round1(editCarbs * qty);
                        const fat = round1(editFat * qty);
                        const fi = round1(editFiber * qty);
                        return (
                          <p className="text-xs text-[var(--muted)]">
                            This log:{" "}
                            {formatMacroShort({
                              proteinG: p,
                              carbsG: c,
                              fatG: fat,
                              fiberG: fi,
                              calories: Math.round(p * 4 + c * 4 + fat * 9),
                            })}
                          </p>
                        );
                      })()}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingFoodId === f.id}
                          onClick={() => void saveFoodEdit(f.id)}
                          className="text-xs text-[var(--accent)] font-medium min-h-[44px] px-3"
                        >
                          {savingFoodId === f.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
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
                          {f.servingLabel
                            ? `${qty === 1 ? "" : `${qty} × `}${f.servingLabel} · `
                            : qty !== 1
                              ? `×${qty} · `
                              : ""}
                          {formatMacroShort(f)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        {isPastDate ? (
                          <button
                            type="button"
                            disabled={copyingId === f.id || copyingAll}
                            onClick={() => void copyFoodToToday(f)}
                            className="text-xs px-3 py-2 rounded-md border border-[var(--border)] text-[var(--accent)] hover:border-[var(--accent)] min-h-[44px]"
                          >
                            {copyingId === f.id ? "Adding…" : "Use today"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => startEditFood(f)}
                          className="text-xs px-3 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px]"
                        >
                          Edit
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
