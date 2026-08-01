"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nutritionFieldClass } from "@/components/nutrition-ui";
import { apiFetch } from "@/lib/api-fetch";
import { caloriesFromMacros, formatMacroShort } from "@/lib/macros";
import {
  formatServingSize,
  type ServingUnit,
} from "@/lib/serving-format";
import { invalidateAfterMacros } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";

type Ingredient = { name: string; amount: string };
type Step = { text: string };

type RecipeView = {
  id?: string;
  name: string;
  servings: number;
  servingAmount: number;
  servingUnit: ServingUnit;
  mealSlot?: string | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
  ingredients: Ingredient[];
  steps: Step[];
};

type IdeaResponse = {
  idea: {
    kind: "tip" | "recipe";
    text: string;
    recipe: {
      name: string;
      servings: number;
      servingAmount: number;
      servingUnit: ServingUnit;
      mealSlot: string;
      perServing: {
        proteinG: number;
        carbsG: number;
        fatG: number;
        calories: number;
      };
      ingredients: Ingredient[];
      steps: Step[];
    } | null;
    remaining: {
      proteinG: number;
      carbsG: number;
      fatG: number;
      calories: number;
    } | null;
  };
};

type RecipesPayload = { recipes: RecipeView[] };

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function Checklist({
  items,
  checked,
  onToggle,
  label,
}: {
  items: string[];
  checked: Set<number>;
  onToggle: (i: number) => void;
  label: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => {
          const on = checked.has(i);
          return (
            <li key={`${label}-${i}`}>
              <label className="flex gap-3 items-start cursor-pointer min-h-[44px] py-1">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(i)}
                  className="mt-1.5 size-4 accent-[var(--accent)] shrink-0"
                />
                <span
                  className={`text-sm leading-relaxed ${
                    on
                      ? "line-through text-[var(--muted)]"
                      : "text-[var(--foreground)]"
                  }`}
                >
                  {item}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RecipeCard({
  recipe,
  date,
  onSaved,
  onDeleted,
  showSave,
}: {
  recipe: RecipeView;
  date: string;
  onSaved?: () => void;
  onDeleted?: () => void;
  showSave?: boolean;
}) {
  const queryClient = useQueryClient();
  const field = nutritionFieldClass();
  const [ingChecked, setIngChecked] = useState<Set<number>>(new Set());
  const [stepChecked, setStepChecked] = useState<Set<number>>(new Set());
  const [quantity, setQuantity] = useState("1");
  const [logging, setLogging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");

  const sizeLabel = formatServingSize(
    recipe.servingAmount,
    recipe.servingUnit,
  );

  useEffect(() => {
    setIngChecked(new Set());
    setStepChecked(new Set());
    setQuantity("1");
    setHint("");
    setError("");
  }, [
    recipe.id,
    recipe.name,
    recipe.servingAmount,
    recipe.servingUnit,
    recipe.ingredients.length,
    recipe.steps.length,
  ]);

  const qtyNum = Number(quantity);
  const qtyOk = Number.isFinite(qtyNum) && qtyNum > 0;
  const scaled = qtyOk
    ? {
        proteinG: round1(recipe.proteinG * qtyNum),
        carbsG: round1(recipe.carbsG * qtyNum),
        fatG: round1(recipe.fatG * qtyNum),
        calories: Math.round(
          (recipe.calories ||
            caloriesFromMacros(
              recipe.proteinG,
              recipe.carbsG,
              recipe.fatG,
            )) * qtyNum,
        ),
      }
    : null;

  function toggle(set: Set<number>, i: number) {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  }

  async function logServing() {
    if (!scaled || !qtyOk) return;
    setLogging(true);
    setError("");
    try {
      await apiFetch("/api/macros", {
        method: "POST",
        body: JSON.stringify({
          date,
          name: recipe.name.trim(),
          proteinG: scaled.proteinG,
          carbsG: scaled.carbsG,
          fatG: scaled.fatG,
          calories: scaled.calories,
          quantity: qtyNum,
          servingLabel: sizeLabel,
          servingGrams:
            recipe.servingUnit === "g" ? recipe.servingAmount : null,
        }),
      });
      await invalidateAfterMacros(queryClient, date);
      setHint(
        qtyNum === 1
          ? `Logged 1 × ${sizeLabel}`
          : `Logged ${qtyNum} × ${sizeLabel}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log");
    } finally {
      setLogging(false);
    }
  }

  async function saveRecipe() {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/nutrition/recipes", {
        method: "POST",
        body: JSON.stringify({
          name: recipe.name,
          servings: recipe.servings,
          servingAmount: recipe.servingAmount,
          servingUnit: recipe.servingUnit,
          mealSlot: recipe.mealSlot ?? "snack",
          proteinG: recipe.proteinG,
          carbsG: recipe.carbsG,
          fatG: recipe.fatG,
          calories: recipe.calories,
          ingredients: recipe.ingredients,
          steps: recipe.steps,
        }),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
      setHint("Saved");
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteRecipe() {
    if (!recipe.id) return;
    setError("");
    try {
      await apiFetch(`/api/nutrition/recipes?id=${recipe.id}`, {
        method: "DELETE",
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  const hasRecipeBody =
    recipe.ingredients.length > 0 || recipe.steps.length > 0;

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-5">
      <header className="space-y-1">
        <h3 className="font-medium text-lg leading-snug">{recipe.name}</h3>
        <p className="text-xs text-[var(--muted)]">
          Serving {sizeLabel}
          {recipe.mealSlot ? ` · ${recipe.mealSlot}` : ""}
          {hasRecipeBody && recipe.servings > 1
            ? ` · makes ${recipe.servings}`
            : ""}
        </p>
      </header>

      <Checklist
        label="Ingredients"
        items={recipe.ingredients.map((i) =>
          i.amount ? `${i.amount} ${i.name}` : i.name,
        )}
        checked={ingChecked}
        onToggle={(i) => setIngChecked((s) => toggle(s, i))}
      />

      <Checklist
        label="Method"
        items={recipe.steps.map((s, i) => `${i + 1}. ${s.text}`)}
        checked={stepChecked}
        onToggle={(i) => setStepChecked((s) => toggle(s, i))}
      />

      <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 space-y-3">
        <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
          Log
        </p>
        <p className="text-xs text-[var(--muted)]">
          Per serving ({sizeLabel}): {formatMacroShort(recipe)}
        </p>
        <label className="space-y-1 block">
          <span className="text-xs text-[var(--muted)]">
            Servings eaten (of {sizeLabel})
          </span>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            className={`${field} max-w-[8rem]`}
            value={quantity}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const next = e.target.value.replace(",", ".");
              if (next === "" || /^\d*\.?\d*$/.test(next)) setQuantity(next);
            }}
          />
        </label>
        {scaled ? (
          <p className="text-sm font-medium">{formatMacroShort(scaled)}</p>
        ) : (
          <p className="text-sm text-[var(--warn)]">Enter a valid quantity</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={logging || !scaled}
            onClick={() => void logServing()}
            className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
          >
            {logging ? "Logging…" : "Log"}
          </button>
          {showSave ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveRecipe()}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm min-h-[44px] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          ) : null}
          {recipe.id ? (
            <button
              type="button"
              onClick={() => void deleteRecipe()}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted)] min-h-[44px]"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
      {hint ? <p className="text-sm text-[var(--accent)]">{hint}</p> : null}
    </article>
  );
}

function ManualMealForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient();
  const field = nutritionFieldClass();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [servingAmount, setServingAmount] = useState("100");
  const [servingUnit, setServingUnit] = useState<ServingUnit>("g");
  const [proteinG, setProteinG] = useState("");
  const [carbsG, setCarbsG] = useState("");
  const [fatG, setFatG] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const amount = Number(servingAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Serving size must be a positive number");
      return;
    }
    const p = Number(proteinG) || 0;
    const c = Number(carbsG) || 0;
    const f = Number(fatG) || 0;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/nutrition/recipes", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          servings: 1,
          servingAmount: amount,
          servingUnit,
          proteinG: p,
          carbsG: c,
          fatG: f,
          calories: caloriesFromMacros(p, c, f),
          ingredients: [],
          steps: [],
        }),
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.recipes });
      setName("");
      setServingAmount("100");
      setServingUnit("g");
      setProteinG("");
      setCarbsG("");
      setFatG("");
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-[var(--accent)] hover:underline min-h-[44px]"
      >
        + Add meal manually
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void save(e)}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
    >
      <p className="text-sm font-medium">New meal</p>
      <label className="space-y-1 block">
        <span className="text-xs text-[var(--muted)]">Name</span>
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Overnight oats"
          required
        />
      </label>
      <div className="flex flex-wrap gap-2 items-end">
        <label className="space-y-1 block">
          <span className="text-xs text-[var(--muted)]">Serving size</span>
          <input
            className={`${field} w-28`}
            type="text"
            inputMode="decimal"
            value={servingAmount}
            onChange={(e) => {
              const next = e.target.value.replace(",", ".");
              if (next === "" || /^\d*\.?\d*$/.test(next)) {
                setServingAmount(next);
              }
            }}
          />
        </label>
        <div className="flex gap-1 pb-0.5">
          {(["g", "ml"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setServingUnit(u)}
              className={`rounded-md px-3 py-2 text-sm min-h-[44px] border ${
                servingUnit === u
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Macros below are for one serving (
        {formatServingSize(Number(servingAmount) || 0, servingUnit)})
      </p>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1 block">
          <span className="text-xs text-[var(--muted)]">P</span>
          <input
            className={field}
            type="number"
            step="0.1"
            value={proteinG}
            onChange={(e) => setProteinG(e.target.value)}
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs text-[var(--muted)]">C</span>
          <input
            className={field}
            type="number"
            step="0.1"
            value={carbsG}
            onChange={(e) => setCarbsG(e.target.value)}
          />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs text-[var(--muted)]">F</span>
          <input
            className={field}
            type="number"
            step="0.1"
            value={fatG}
            onChange={(e) => setFatG(e.target.value)}
          />
        </label>
      </div>
      {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save meal"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-[var(--border)] px-4 py-2 text-sm min-h-[44px]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NutritionIdeasAi({ date }: { date: string }) {
  const field = nutritionFieldClass();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tip, setTip] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<IdeaResponse["idea"]["remaining"]>(
    null,
  );
  const [draftRecipe, setDraftRecipe] = useState<RecipeView | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const recipesQuery = useQuery({
    queryKey: queryKeys.recipes,
    queryFn: () => apiFetch<RecipesPayload>("/api/nutrition/recipes"),
  });
  const saved = recipesQuery.data?.recipes ?? [];

  async function ask() {
    const text = prompt.trim();
    if (text.length < 2) return;
    setLoading(true);
    setError("");
    setTip(null);
    setDraftRecipe(null);
    try {
      const data = await apiFetch<IdeaResponse>("/api/nutrition/ideas", {
        method: "POST",
        body: JSON.stringify({ prompt: text, date }),
      });
      setRemaining(data.idea.remaining);
      setTip(data.idea.text);
      if (data.idea.recipe) {
        const r = data.idea.recipe;
        setDraftRecipe({
          name: r.name,
          servings: r.servings,
          servingAmount: r.servingAmount,
          servingUnit: r.servingUnit === "ml" ? "ml" : "g",
          mealSlot: r.mealSlot,
          proteinG: r.perServing.proteinG,
          carbsG: r.perServing.carbsG,
          fatG: r.perServing.fatG,
          calories: r.perServing.calories,
          ingredients: r.ingredients,
          steps: r.steps,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Idea failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm text-[var(--muted)]">AI meal ideas</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Uses this day&apos;s logged macros and targets. Ask for a tip or a
            full recipe.
          </p>
        </div>
        <textarea
          className={`${field} min-h-[96px] resize-y`}
          placeholder="e.g. high-protein dinner under 500 kcal, something with chicken, quick lunch I can cook…"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!loading) void ask();
            }
          }}
        />
        <button
          type="button"
          disabled={loading || prompt.trim().length < 2}
          onClick={() => void ask()}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Get idea"}
        </button>
        {remaining ? (
          <p className="text-xs text-[var(--muted)]">
            Remaining: {Math.round(remaining.calories)} kcal ·{" "}
            {round1(remaining.proteinG)}p / {round1(remaining.carbsG)}c /{" "}
            {round1(remaining.fatG)}f
          </p>
        ) : null}
        {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
      </section>

      {tip && !draftRecipe ? (
        <div className="rounded-lg border border-[var(--accent)] bg-[var(--surface)] p-4">
          <p className="text-sm leading-relaxed">{tip}</p>
        </div>
      ) : null}

      {draftRecipe ? (
        <div className="space-y-3">
          {tip ? (
            <p className="text-sm leading-relaxed text-[var(--muted)]">{tip}</p>
          ) : null}
          <RecipeCard
            recipe={draftRecipe}
            date={date}
            showSave
            onSaved={() => {
              setDraftRecipe(null);
              setTip(null);
              setPrompt("");
            }}
          />
        </div>
      ) : null}

      <section className="space-y-3 border-t border-[var(--border)] pt-6">
        <h2 className="text-sm text-[var(--muted)]">Saved meals</h2>
        <ManualMealForm onCreated={() => setOpenId(null)} />

        {saved.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Save an AI recipe or add a meal manually.
          </p>
        ) : (
          <ul className="space-y-3">
            {saved.map((r) => {
              const open = openId === r.id;
              const isRecipe =
                (r.ingredients?.length ?? 0) > 0 || (r.steps?.length ?? 0) > 0;
              const size = formatServingSize(
                r.servingAmount,
                r.servingUnit === "ml" ? "ml" : "g",
              );
              return (
                <li key={r.id} className="space-y-2">
                  {open ? (
                    <>
                      <RecipeCard
                        recipe={{
                          ...r,
                          servingUnit: r.servingUnit === "ml" ? "ml" : "g",
                        }}
                        date={date}
                        onDeleted={() => setOpenId(null)}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenId(null)}
                        className="text-xs text-[var(--muted)] hover:underline min-h-[44px] px-1"
                      >
                        Collapse
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenId(r.id ?? null)}
                      className="w-full text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] transition-colors min-h-[44px]"
                    >
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        {formatMacroShort(r)} · {size}
                        {isRecipe ? " · recipe" : ""}
                      </p>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {recipesQuery.isError ? (
          <p className="text-sm text-[var(--warn)]">Could not load saved meals</p>
        ) : null}
      </section>
    </div>
  );
}
