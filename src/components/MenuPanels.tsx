"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FoodSearch, type FoodSearchResult } from "@/components/FoodSearch";
import { nutritionFieldClass } from "@/components/nutrition-ui";
import { apiFetch } from "@/lib/api-fetch";
import { scaleFood } from "@/lib/food-reference";
import { progressRatio, remainingLabel } from "@/lib/macros";
import { invalidateAfterMenu } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";

type MenuItem = {
  id: string;
  name: string;
  brand?: string | null;
  proteinG: number;
  carbsG: number;
  fatG: number;
  calories: number;
  mealSlot?: string | null;
  checked: boolean;
};

type Template = {
  id: string;
  name: string;
  notes?: string | null;
  items: Array<{
    id: string;
    name: string;
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories: number;
    mealSlot?: string | null;
  }>;
};

type DailyPayload = {
  items: MenuItem[];
  totals: { proteinG: number; calories: number };
  targets: { proteinG: number; calorieTarget: number } | null;
};

type TemplatesPayload = {
  templates: Template[];
};

export function MenuDailyPanel({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const [showAddFood, setShowAddFood] = useState(false);

  const field = nutritionFieldClass();

  const dailyQuery = useQuery({
    queryKey: queryKeys.menuDaily(date),
    queryFn: () =>
      apiFetch<DailyPayload>(
        `/api/menu/daily?date=${encodeURIComponent(date)}`,
      ),
  });

  const templatesQuery = useQuery({
    queryKey: queryKeys.menuTemplates,
    queryFn: () => apiFetch<TemplatesPayload>("/api/menu/templates"),
  });

  const items = dailyQuery.data?.items ?? [];
  const totals = dailyQuery.data?.totals ?? { proteinG: 0, calories: 0 };
  const targets = dailyQuery.data?.targets ?? null;
  const templates = templatesQuery.data?.templates ?? [];

  async function refreshAfterWrite() {
    await invalidateAfterMenu(queryClient, date);
  }

  async function checkItem(id: string) {
    await apiFetch("/api/menu/daily", {
      method: "POST",
      body: JSON.stringify({ action: "check", id }),
    });
    await refreshAfterWrite();
  }

  async function removeItem(id: string) {
    await apiFetch(`/api/menu/daily?id=${id}`, { method: "DELETE" });
    await refreshAfterWrite();
  }

  async function applyTemplate(templateId: string) {
    await apiFetch("/api/menu/daily", {
      method: "POST",
      body: JSON.stringify({ action: "apply_template", templateId, date }),
    });
    await refreshAfterWrite();
  }

  async function addFoodToMenu(
    food: FoodSearchResult,
    quantity: number,
    mlAmount?: number,
  ) {
    const scaled = scaleFood(food, quantity, mlAmount);
    await apiFetch("/api/menu/daily", {
      method: "POST",
      body: JSON.stringify({
        action: "add",
        date,
        name: quantity === 1 ? food.name : `${food.name} (${scaled.label})`,
        brand: food.brand,
        savedFoodId: food.savedFoodId,
        quantity,
        proteinG: scaled.proteinG,
        carbsG: scaled.carbsG,
        fatG: scaled.fatG,
        calories: scaled.calories,
        mealSlot: "snack",
        sortOrder: items.length,
      }),
    });
    setShowAddFood(false);
    await refreshAfterWrite();
  }

  return (
    <div className="space-y-6">
      {targets ? (
        <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
          <p className="text-xs text-[var(--muted)]">Planned vs target</p>
          <p className="text-sm">
            Protein: {Math.round(totals.proteinG)}g —{" "}
            {remainingLabel(totals.proteinG, targets.proteinG, "g")}
          </p>
          <p className="text-sm">
            Calories: {Math.round(totals.calories)} —{" "}
            {remainingLabel(totals.calories, targets.calorieTarget, " kcal")}
          </p>
          <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent)]"
              style={{
                width: `${progressRatio(totals.proteinG, targets.proteinG) * 100}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setShowAddFood((v) => !v)}
          className="rounded-md border border-[var(--border)] px-3 py-2.5 text-xs hover:border-[var(--accent)] min-h-[44px]"
        >
          {showAddFood ? "Cancel" : "Add food"}
        </button>
        {templates.length > 0 ? (
          <select
            className={`${field} text-xs max-w-full`}
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) void applyTemplate(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="">Apply template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {showAddFood ? (
        <FoodSearch onSelect={(f, q, ml) => void addFoodToMenu(f, q, ml)} />
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No items planned for this day.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-3 py-3 bg-[var(--surface)] min-h-[52px]"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => void checkItem(item.id)}
                className="shrink-0 w-5 h-5"
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium truncate ${item.checked ? "line-through text-[var(--muted)]" : ""}`}
                >
                  {item.name}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {item.mealSlot} · {item.proteinG}g P · {item.calories} kcal
                </p>
              </div>
              <button
                type="button"
                onClick={() => void removeItem(item.id)}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px] px-2 shrink-0"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MenuTemplatesPanel({
  date,
  onApplied,
}: {
  date: string;
  onApplied?: () => void;
}) {
  const queryClient = useQueryClient();
  const [newTemplateName, setNewTemplateName] = useState("");
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [draftItems, setDraftItems] = useState<Template["items"]>([]);

  const field = nutritionFieldClass();

  const templatesQuery = useQuery({
    queryKey: queryKeys.menuTemplates,
    queryFn: () => apiFetch<TemplatesPayload>("/api/menu/templates"),
  });
  const templates = templatesQuery.data?.templates ?? [];

  async function refreshTemplates() {
    await invalidateAfterMenu(queryClient, date);
  }

  async function applyTemplate(templateId: string) {
    await apiFetch("/api/menu/daily", {
      method: "POST",
      body: JSON.stringify({ action: "apply_template", templateId, date }),
    });
    await refreshTemplates();
    onApplied?.();
  }

  async function saveTemplateItems() {
    if (!editingTemplate) return;
    await apiFetch("/api/menu/templates", {
      method: "PUT",
      body: JSON.stringify({
        id: editingTemplate.id,
        items: draftItems.map((item) => ({
          name: item.name,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          calories: item.calories,
          mealSlot: item.mealSlot ?? "snack",
        })),
      }),
    });
    setEditingTemplate(null);
    setDraftItems([]);
    await refreshTemplates();
  }

  function addFoodToTemplate(
    food: FoodSearchResult,
    quantity: number,
    mlAmount?: number,
  ) {
    const scaled = scaleFood(food, quantity, mlAmount);
    setDraftItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: quantity === 1 ? food.name : `${food.name} (${scaled.label})`,
        proteinG: scaled.proteinG,
        carbsG: scaled.carbsG,
        fatG: scaled.fatG,
        calories: scaled.calories,
        mealSlot: "snack",
      },
    ]);
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTemplateName.trim()) return;
    await apiFetch("/api/menu/templates", {
      method: "POST",
      body: JSON.stringify({ name: newTemplateName.trim(), items: [] }),
    });
    setNewTemplateName("");
    await refreshTemplates();
  }

  async function deleteTemplate(id: string) {
    await apiFetch(`/api/menu/templates?id=${id}`, { method: "DELETE" });
    await refreshTemplates();
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => void createTemplate(e)}
        className="flex flex-col sm:flex-row gap-2"
      >
        <input
          className={`${field} flex-1`}
          placeholder="New meal idea name"
          value={newTemplateName}
          onChange={(e) => setNewTemplateName(e.target.value)}
        />
        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] shrink-0"
        >
          Create
        </button>
      </form>

      {editingTemplate ? (
        <div className="rounded-lg border border-[var(--accent)] p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium truncate">Edit: {editingTemplate.name}</p>
            <button
              type="button"
              onClick={() => {
                setEditingTemplate(null);
                setDraftItems([]);
              }}
              className="text-xs text-[var(--muted)] hover:underline min-h-[44px] px-2 shrink-0"
            >
              Cancel
            </button>
          </div>
          <FoodSearch onSelect={(f, q, ml) => addFoodToTemplate(f, q, ml)} />
          {draftItems.length > 0 ? (
            <ul className="space-y-1">
              {draftItems.map((item) => (
                <li
                  key={item.id}
                  className="text-xs text-[var(--muted)] flex justify-between gap-2"
                >
                  <span className="truncate">
                    {item.name} — {item.proteinG}g P · {item.calories} kcal
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftItems((prev) =>
                        prev.filter((i) => i.id !== item.id),
                      )
                    }
                    className="hover:text-[var(--foreground)] shrink-0 min-h-[44px] px-2"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            onClick={() => void saveTemplateItems()}
            className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px]"
          >
            Save template
          </button>
        </div>
      ) : null}

      {templates.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Create meal ideas to reuse on your daily menu.
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((t) => (
            <li
              key={t.id}
              className="rounded-lg border border-[var(--border)] p-4 bg-[var(--surface)]"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  {t.items.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {t.items.map((item) => (
                        <li key={item.id} className="text-xs text-[var(--muted)]">
                          {item.name} — {item.proteinG}g P · {item.calories}{" "}
                          kcal
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-[var(--muted)] mt-1">
                      No foods yet
                    </p>
                  )}
                </div>
                <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTemplate(t);
                      setDraftItems(t.items);
                    }}
                    className="text-xs text-[var(--accent)] hover:underline min-h-[44px] px-2"
                  >
                    Edit foods
                  </button>
                  <button
                    type="button"
                    onClick={() => void applyTemplate(t.id)}
                    className="text-xs text-[var(--accent)] hover:underline min-h-[44px] px-2"
                  >
                    Use on {date}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteTemplate(t.id)}
                    className="text-xs text-[var(--muted)] hover:underline min-h-[44px] px-2"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
