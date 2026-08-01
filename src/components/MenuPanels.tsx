"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FoodSearch, type FoodSearchResult } from "@/components/FoodSearch";
import { nutritionFieldClass } from "@/components/nutrition-ui";
import { apiFetch } from "@/lib/api-fetch";
import { scaleFood } from "@/lib/food-reference";
import { progressRatio, remainingLabel, formatMacroShort } from "@/lib/macros";
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

type DailyPayload = {
  items: MenuItem[];
  totals: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories: number;
  };
  targets: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    calorieTarget: number;
  } | null;
};

const MEAL_SLOT_SECTIONS = [
  { slot: "breakfast", label: "Morning" },
  { slot: "lunch", label: "Afternoon" },
  { slot: "dinner", label: "Evening" },
  { slot: "snack", label: "Snacks" },
] as const;

function DragHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Drag to move"
      onPointerDown={onPointerDown}
      className="flex flex-col justify-center items-center gap-[3px] w-8 h-11 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none rounded hover:bg-[var(--surface-2)]"
    >
      <span className="block h-[2px] w-4 rounded-full bg-[var(--muted)] pointer-events-none" />
      <span className="block h-[2px] w-4 rounded-full bg-[var(--muted)] pointer-events-none" />
    </button>
  );
}

export function MenuDailyPanel({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const [showAddFood, setShowAddFood] = useState(false);
  const [improving, setImproving] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [userRequest, setUserRequest] = useState("");
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const dragItemRef = useRef<string | null>(null);
  const moveItemRef = useRef<(id: string, slot: string) => void>(() => {});

  const field = nutritionFieldClass();

  const dailyQuery = useQuery({
    queryKey: queryKeys.menuDaily(date),
    queryFn: () =>
      apiFetch<DailyPayload>(
        `/api/menu/daily?date=${encodeURIComponent(date)}`,
      ),
  });

  const items = dailyQuery.data?.items ?? [];
  const totals = dailyQuery.data?.totals ?? {
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    calories: 0,
  };
  const targets = dailyQuery.data?.targets ?? null;
  const fatOver =
    targets != null && totals.fatG > targets.fatG + 0.5;
  const calOver =
    targets != null && totals.calories > targets.calorieTarget + 0.5;

  async function refreshAfterWrite() {
    await invalidateAfterMenu(queryClient, date);
  }

  async function checkItem(id: string) {
    await apiFetch("/api/menu/daily", {
      method: "POST",
      body: JSON.stringify({ action: "check", id, date }),
    });
    await refreshAfterWrite();
  }

  async function removeItem(id: string) {
    await apiFetch(`/api/menu/daily?id=${id}`, { method: "DELETE" });
    await refreshAfterWrite();
  }

  async function moveItemToSlot(id: string, newSlot: string) {
    const current = items.find((item) => item.id === id);
    if (current?.mealSlot === newSlot) return;

    const previous = queryClient.getQueryData<DailyPayload>(
      queryKeys.menuDaily(date),
    );
    queryClient.setQueryData<DailyPayload>(
      queryKeys.menuDaily(date),
      (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((item) =>
            item.id === id ? { ...item, mealSlot: newSlot } : item,
          ),
        };
      },
    );
    try {
      await apiFetch("/api/menu/daily", {
        method: "POST",
        body: JSON.stringify({ action: "update_slot", id, mealSlot: newSlot }),
      });
      await refreshAfterWrite();
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(queryKeys.menuDaily(date), previous);
      }
      setActionError(
        err instanceof Error ? err.message : "Could not move item",
      );
    }
  }

  moveItemRef.current = (id, slot) => {
    void moveItemToSlot(id, slot);
  };

  function startItemDrag(
    itemId: string,
    e: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragItemRef.current = itemId;
    setDragItem(itemId);
    setDragOverSlot(null);
  }

  useEffect(() => {
    if (!dragItem) return;

    const previousTouchAction = document.body.style.touchAction;
    document.body.style.touchAction = "none";

    function findSlot(clientX: number, clientY: number) {
      const el = document.elementFromPoint(clientX, clientY);
      const zone = el?.closest("[data-drop-slot]") as HTMLElement | null;
      return zone?.dataset.dropSlot ?? null;
    }

    function onPointerMove(e: PointerEvent) {
      setDragOverSlot(findSlot(e.clientX, e.clientY));
    }

    function finishDrag(e: PointerEvent) {
      const id = dragItemRef.current;
      const slot = findSlot(e.clientX, e.clientY);
      if (id && slot) moveItemRef.current(id, slot);
      dragItemRef.current = null;
      setDragItem(null);
      setDragOverSlot(null);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      document.body.style.touchAction = previousTouchAction;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [dragItem]);

  async function addFoodToMenu(
    food: FoodSearchResult,
    quantity: number,
    mlAmount?: number,
  ) {
    const scaled = scaleFood(food, quantity, mlAmount);
    setActionError(null);
    try {
      await apiFetch("/api/menu/daily", {
        method: "POST",
        body: JSON.stringify({
          action: "add",
          date,
          name: food.name,
          brand: food.brand,
          savedFoodId: food.savedFoodId ?? null,
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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not add food");
    }
  }

  async function improveWithAi() {
    setImproving(true);
    setAiError(null);
    setAiNote(null);
    try {
      const data = await apiFetch<{
        applyDate: string;
        rationale: string;
        items: MenuItem[];
      }>("/api/menu/improve", {
        method: "POST",
        body: JSON.stringify({ userRequest: userRequest.trim() || undefined }),
      });
      setAiNote(`Updated your daily menu. ${data.rationale}`);
      setShowAiPrompt(false);
      setUserRequest("");
      await Promise.all([
        invalidateAfterMenu(queryClient, date),
        queryClient.invalidateQueries({ queryKey: ["menu"] }),
      ]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Improve failed");
    } finally {
      setImproving(false);
    }
  }

  function openAiPrompt() {
    setShowAiPrompt(true);
    setAiError(null);
    requestAnimationFrame(() => aiInputRef.current?.focus());
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--muted)] leading-relaxed">
        This is your persistent daily menu. Edits stay for every day; only the
        checklist resets overnight. Check an item to log it for the selected
        date.
      </p>

      {targets ? (
        <div className="rounded-lg border border-[var(--border)] p-4 space-y-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Planned vs target
          </p>
          {(
            [
              {
                key: "protein",
                label: "Protein",
                current: totals.proteinG,
                target: targets.proteinG,
                unit: "g",
                warn: false,
              },
              {
                key: "carbs",
                label: "Carbs",
                current: totals.carbsG,
                target: targets.carbsG,
                unit: "g",
                warn: false,
              },
              {
                key: "fat",
                label: "Fat",
                current: totals.fatG,
                target: targets.fatG,
                unit: "g",
                warn: fatOver,
              },
              {
                key: "calories",
                label: "Calories",
                current: totals.calories,
                target: targets.calorieTarget,
                unit: " kcal",
                warn: calOver,
              },
            ] as const
          ).map((row) => {
            const distance = remainingLabel(row.current, row.target, row.unit);
            const ratio = progressRatio(row.current, row.target);
            return (
              <div key={row.key} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className={row.warn ? "text-[var(--warn)]" : undefined}>
                    {row.label}
                  </span>
                  <span
                    className={`text-xs tabular-nums ${
                      row.warn ? "text-[var(--warn)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {Math.round(row.current)} / {row.target}
                    {row.unit} Â· {distance}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      row.warn ? "bg-[var(--warn)]" : "bg-[var(--accent)]"
                    }`}
                    style={{ width: `${Math.min(100, ratio * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAddFood((v) => !v)}
            className="rounded-md border border-[var(--border)] px-3 py-2.5 text-xs hover:border-[var(--accent)] min-h-[44px]"
          >
            {showAddFood ? "Cancel" : "Add food"}
          </button>
          <button
            type="button"
            disabled={improving}
            onClick={() => (showAiPrompt ? setShowAiPrompt(false) : openAiPrompt())}
            className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2.5 text-xs font-medium min-h-[44px] disabled:opacity-50"
          >
            {improving ? "Improvingâ€¦" : showAiPrompt ? "Cancel AI" : "AI improve menu"}
          </button>
        </div>

        {showAiPrompt ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 flex gap-2 items-end transition-opacity duration-200">
            <textarea
              ref={aiInputRef}
              value={userRequest}
              onChange={(e) => setUserRequest(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!improving) void improveWithAi();
                }
              }}
              placeholder='Optional: e.g. "main protein should be chicken, max protein"'
              className="flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs placeholder:text-[var(--muted)] resize-none min-h-[52px]"
              rows={2}
            />
            <button
              type="button"
              disabled={improving}
              onClick={() => void improveWithAi()}
              className="shrink-0 rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2.5 text-xs font-medium min-h-[44px] min-w-[44px] disabled:opacity-50"
              aria-label="Send AI improve request"
            >
              {improving ? "â€¦" : "Send"}
            </button>
          </div>
        ) : null}
      </div>

      {aiError ? (
        <p className="text-xs text-[var(--warn)] leading-relaxed">{aiError}</p>
      ) : null}
      {actionError ? (
        <p className="text-xs text-[var(--warn)] leading-relaxed">{actionError}</p>
      ) : null}
      {aiNote ? (
        <p className="text-xs text-[var(--accent)] leading-relaxed">{aiNote}</p>
      ) : null}

      {showAddFood ? (
        <FoodSearch
          confirmLabel="Add to menu"
          onSelect={(f, q, ml) => void addFoodToMenu(f, q, ml)}
        />
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No menu yet. Add foods here, or use AI improve after logging a few
          days.
        </p>
      ) : null}

      <div className="space-y-4">
        {MEAL_SLOT_SECTIONS.map(({ slot, label }) => {
          const slotItems = items.filter((i) => i.mealSlot === slot);
          const isDropTarget = dragOverSlot === slot;
          return (
            <div key={slot} className="space-y-1.5">
              <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] font-medium">
                {label}
              </p>
              {slotItems.length > 0 ? (
                <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
                  {slotItems.map((item) => {
                    const isDragging = dragItem === item.id;
                    return (
                      <li
                        key={item.id}
                        className={`flex items-center gap-2 px-2 py-3 bg-[var(--surface)] min-h-[52px] transition-all duration-300 ease-out ${
                          isDragging
                            ? "opacity-40 scale-[0.98]"
                            : "opacity-100 scale-100"
                        }`}
                      >
                        <DragHandle
                          onPointerDown={(e) => startItemDrag(item.id, e)}
                        />
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
                            {formatMacroShort(item)}
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
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)]">
                  No items yet
                </div>
              )}
              {dragItem ? (
                <div
                  data-drop-slot={slot}
                  className={`rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs transition-all duration-200 ${
                    isDropTarget
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] scale-[1.01]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  Drop here to move to {label.toLowerCase()}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
