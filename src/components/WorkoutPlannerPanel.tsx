"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BodyHeatmap } from "@/components/BodyHeatmap";
import { fieldClass } from "@/components/exercises-ui";
import { apiFetch } from "@/lib/api-fetch";
import {
  EXERCISE_GROUPS,
  type ExerciseGroup,
  MUSCLE_LABELS,
  searchExercises,
  summarizeMuscles,
  summarizeRegionCounts,
  type BodyRegion,
  type MuscleGroup,
} from "@/lib/exercises";
import { invalidateAfterLifts } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import type { MuscleHeatRow } from "@/lib/muscle-tonnage";
import {
  readUserStorageItem,
  writeUserStorageItem,
} from "@/lib/user-storage";

type PlanItem = {
  id: string;
  planId: string;
  lift: string;
  name: string;
  category: ExerciseGroup | null;
  equipment: string;
  bodyweight: boolean;
  cardio: boolean;
  setsCount: number;
  reps: number;
  weightKg: number;
  sortOrder: number;
  notes: string | null;
  checked: boolean;
};

type Plan = {
  id: string;
  name: string;
  sortOrder: number;
  items: PlanItem[];
};

type PlansPayload = {
  plans: Plan[];
  activeSessionId: string | null;
};

const ALL_GROUPS = Object.keys(EXERCISE_GROUPS) as ExerciseGroup[];
const ACTIVE_PLAN_KEY = "recomp.activeWorkoutPlanId";

function DragHandle({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder"
      onPointerDown={onPointerDown}
      className="flex flex-col justify-center items-center gap-[3px] w-8 h-11 shrink-0 cursor-grab active:cursor-grabbing touch-none select-none rounded hover:bg-[var(--surface-2)]"
    >
      <span className="block h-[2px] w-4 rounded-full bg-[var(--muted)] pointer-events-none" />
      <span className="block h-[2px] w-4 rounded-full bg-[var(--muted)] pointer-events-none" />
      <span className="block h-[2px] w-4 rounded-full bg-[var(--muted)] pointer-events-none" />
    </button>
  );
}

function heatRowsFromPlan(items: PlanItem[]): {
  muscles: MuscleHeatRow[];
  regions: Partial<Record<BodyRegion, number>>;
} {
  const ids = items.map((i) => i.lift);
  const summary = summarizeMuscles(ids);
  const max = Math.max(1, ...summary.map((s) => s.sets), 0);
  return {
    muscles: summary.map((m) => ({
      muscle: m.muscle,
      label: m.label || MUSCLE_LABELS[m.muscle as MuscleGroup],
      value: m.sets,
      baseline: max,
      intensity: m.sets / max,
    })),
    regions: summarizeRegionCounts(ids),
  };
}

export function WorkoutPlannerPanel() {
  const queryClient = useQueryClient();
  const field = fieldClass();
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [enabledGroups, setEnabledGroups] = useState<Set<ExerciseGroup>>(
    () => new Set(ALL_GROUPS),
  );
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    setsCount: "3",
    reps: "8",
    weightKg: "0",
  });
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const itemsRef = useRef<PlanItem[]>([]);
  const reorderRef = useRef<(ordered: string[]) => void>(() => {});

  const plansQuery = useQuery({
    queryKey: queryKeys.workoutPlans,
    queryFn: () => apiFetch<PlansPayload>("/api/workout-plans"),
  });
  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<{ userId?: string }>("/api/profile"),
  });
  const userId = profileQuery.data?.userId ?? null;

  const plans = plansQuery.data?.plans ?? [];
  const activeSessionId = plansQuery.data?.activeSessionId ?? null;
  const canCheck = Boolean(activeSessionId);

  useEffect(() => {
    const stored = readUserStorageItem(ACTIVE_PLAN_KEY, userId);
    if (stored) setActivePlanId(stored);
  }, [userId]);

  useEffect(() => {
    if (plans.length === 0) {
      setActivePlanId(null);
      return;
    }
    if (!activePlanId || !plans.some((p) => p.id === activePlanId)) {
      setActivePlanId(plans[0].id);
    }
  }, [plans, activePlanId]);

  function selectPlan(id: string) {
    setActivePlanId(id);
    setShowAdd(false);
    setEditingId(null);
    writeUserStorageItem(ACTIVE_PLAN_KEY, userId, id);
  }

  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;
  const items = activePlan?.items ?? [];
  itemsRef.current = items;

  const heat = useMemo(() => heatRowsFromPlan(items), [items]);

  const activeGroups = ALL_GROUPS.filter((g) => enabledGroups.has(g));
  const filteredExercises = useMemo(
    () =>
      activeGroups.length === 0 ? [] : searchExercises(search, activeGroups),
    [activeGroups, search],
  );

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutPlans }),
      invalidateAfterLifts(queryClient),
    ]);
  }

  async function createPlan() {
    const index = plans.length + 1;
    const data = await apiFetch<{ plan: { id: string } }>("/api/workout-plans", {
      method: "POST",
      body: JSON.stringify({
        action: "create_plan",
        name: `Plan ${index}`,
      }),
    });
    selectPlan(data.plan.id);
    await refresh();
  }

  async function deletePlan() {
    if (!activePlan) return;
    const ok = window.confirm(`Delete plan “${activePlan.name}”?`);
    if (!ok) return;
    await apiFetch("/api/workout-plans", {
      method: "POST",
      body: JSON.stringify({ action: "delete_plan", planId: activePlan.id }),
    });
    await refresh();
  }

  async function saveRename() {
    if (!activePlan) return;
    await apiFetch("/api/workout-plans", {
      method: "POST",
      body: JSON.stringify({
        action: "rename_plan",
        planId: activePlan.id,
        name: renameValue,
      }),
    });
    setRenaming(false);
    await refresh();
  }

  async function addExercise(lift: string) {
    if (!activePlan) return;
    await apiFetch("/api/workout-plans", {
      method: "POST",
      body: JSON.stringify({
        action: "add_item",
        planId: activePlan.id,
        lift,
      }),
    });
    setShowAdd(false);
    setSearch("");
    await refresh();
  }

  async function removeItem(itemId: string) {
    await apiFetch("/api/workout-plans", {
      method: "POST",
      body: JSON.stringify({ action: "remove_item", itemId }),
    });
    await refresh();
  }

  async function saveEdit(itemId: string) {
    await apiFetch("/api/workout-plans", {
      method: "POST",
      body: JSON.stringify({
        action: "update_item",
        itemId,
        setsCount: Number(editDraft.setsCount),
        reps: Number(editDraft.reps),
        weightKg: Number(editDraft.weightKg),
      }),
    });
    setEditingId(null);
    await refresh();
  }

  async function toggleCheck(item: PlanItem) {
    if (!canCheck) {
      setMessage("Start a workout in Log first, then check exercises here.");
      return;
    }
    setMessage("");
    try {
      await apiFetch("/api/workout-plans", {
        method: "POST",
        body: JSON.stringify({ action: "check", itemId: item.id }),
      });
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not check");
    }
  }

  async function reorder(orderedIds: string[]) {
    if (!activePlan) return;
    const previous = queryClient.getQueryData<PlansPayload>(
      queryKeys.workoutPlans,
    );
    queryClient.setQueryData<PlansPayload>(queryKeys.workoutPlans, (old) => {
      if (!old) return old;
      return {
        ...old,
        plans: old.plans.map((p) => {
          if (p.id !== activePlan.id) return p;
          const map = new Map(p.items.map((i) => [i.id, i]));
          return {
            ...p,
            items: orderedIds
              .map((id, i) => {
                const item = map.get(id);
                return item ? { ...item, sortOrder: i } : null;
              })
              .filter(Boolean) as PlanItem[],
          };
        }),
      };
    });
    try {
      await apiFetch("/api/workout-plans", {
        method: "POST",
        body: JSON.stringify({
          action: "reorder",
          planId: activePlan.id,
          orderedIds,
        }),
      });
    } catch {
      if (previous) {
        queryClient.setQueryData(queryKeys.workoutPlans, previous);
      }
      setMessage("Could not reorder");
    }
  }

  reorderRef.current = (ordered) => {
    void reorder(ordered);
  };

  function startDrag(itemId: string, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragIdRef.current = itemId;
    setDragId(itemId);
    setDragOverId(null);
  }

  useEffect(() => {
    if (!dragId) return;
    const prevTouch = document.body.style.touchAction;
    document.body.style.touchAction = "none";

    function onMove(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest("[data-plan-item]") as HTMLElement | null;
      const id = row?.dataset.planItem ?? null;
      dragOverRef.current = id;
      setDragOverId(id);
    }

    function onUp() {
      const from = dragIdRef.current;
      const to = dragOverRef.current;
      dragIdRef.current = null;
      dragOverRef.current = null;
      setDragId(null);
      setDragOverId(null);
      if (!from || !to || from === to) return;
      const list = itemsRef.current.map((i) => i.id);
      const fromIdx = list.indexOf(from);
      const toIdx = list.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return;
      const next = [...list];
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      reorderRef.current(next);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      document.body.style.touchAction = prevTouch;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragId]);

  function toggleGroup(g: ExerciseGroup) {
    setEnabledGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Workout plans
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void createPlan()}
              className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] min-h-[44px]"
            >
              + Plan
            </button>
            {activePlan ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setRenameValue(activePlan.name);
                    setRenaming((v) => !v);
                  }}
                  className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] min-h-[44px]"
                >
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => void deletePlan()}
                  className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] min-h-[44px]"
                >
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>

        {plans.length === 0 ? (
          <p className="text-sm text-[var(--muted)] rounded-xl border border-dashed border-[var(--border)] p-4 text-center">
            No plans yet — create one, add exercises, then check them off during
            a live workout.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPlan(p.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors min-h-[36px] ${
                  activePlanId === p.id
                    ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {renaming && activePlan ? (
          <div className="flex gap-2">
            <input
              className={field}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Plan name"
            />
            <button
              type="button"
              onClick={() => void saveRename()}
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2 text-xs font-medium min-h-[44px]"
            >
              Save
            </button>
          </div>
        ) : null}
      </div>

      {activePlan ? (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--muted)]">
                {canCheck
                  ? "Check an exercise to log it into the active workout."
                  : "Start a workout in Log to enable checkboxes."}
              </p>
              <button
                type="button"
                onClick={() => setShowAdd((v) => !v)}
                className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] min-h-[44px]"
              >
                {showAdd ? "Close" : "+ Exercise"}
              </button>
            </div>

            {showAdd ? (
              <div className="space-y-3 rounded-lg border border-[var(--border)] p-3 bg-[var(--surface)]">
                <div className="flex flex-wrap gap-2">
                  {ALL_GROUPS.map((g) => {
                    const on = enabledGroups.has(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGroup(g)}
                        className={`px-3 py-1.5 rounded-full text-xs border min-h-[36px] ${
                          on
                            ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]"
                            : "border-[#2a2a2e] bg-[#141416] text-[#6a6a72]"
                        }`}
                      >
                        {EXERCISE_GROUPS[g].label}
                      </button>
                    );
                  })}
                </div>
                <input
                  className={field}
                  placeholder="Search exercises…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                  {filteredExercises.slice(0, 40).map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => void addExercise(ex.id)}
                      className="text-left rounded-md px-3 py-2 text-sm hover:bg-[var(--surface-2)] min-h-[44px]"
                    >
                      <span className="font-medium block truncate">
                        {ex.name}
                      </span>
                      <span className="text-xs text-[var(--muted)] truncate block">
                        {EXERCISE_GROUPS[ex.group].label} · {ex.equipment}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {message ? (
              <p className="text-sm text-[var(--accent)]">{message}</p>
            ) : null}

            {items.length === 0 ? (
              <p className="text-sm text-[var(--muted)] py-4 text-center">
                Add exercises to this plan.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    data-plan-item={item.id}
                    data-drag-over={dragOverId === item.id ? "1" : "0"}
                    className={`rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden ${
                      dragOverId === item.id && dragId !== item.id
                        ? "ring-1 ring-[var(--accent)]"
                        : ""
                    } ${dragId === item.id ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start gap-1 px-2 py-2">
                      <DragHandle onPointerDown={(e) => startDrag(item.id, e)} />
                      <label className="flex items-start gap-2 pt-2.5 shrink-0">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          disabled={!canCheck}
                          onChange={() => void toggleCheck(item)}
                          className="mt-0.5 size-4 accent-[var(--accent)] disabled:opacity-40"
                        />
                      </label>
                      <div className="min-w-0 flex-1 space-y-1 py-1">
                        <p
                          className={`text-sm font-medium ${
                            item.checked ? "line-through text-[var(--muted)]" : ""
                          }`}
                        >
                          {item.name}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {item.cardio
                            ? "Cardio · planned distance on Log"
                            : item.bodyweight
                              ? `${item.setsCount}×${item.reps} · ${
                                  item.weightKg > 0
                                    ? `BW + ${item.weightKg} kg`
                                    : "Bodyweight"
                                }`
                              : `${item.setsCount}×${item.reps} @ ${item.weightKg} kg`}
                        </p>
                        {editingId === item.id ? (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            {!item.cardio ? (
                              <>
                                <label className="space-y-0.5 block">
                                  <span className="text-[10px] text-[var(--muted)]">
                                    {item.bodyweight ? "Add kg" : "kg"}
                                  </span>
                                  <input
                                    className={field}
                                    type="number"
                                    min={0}
                                    step={0.5}
                                    value={editDraft.weightKg}
                                    onChange={(e) =>
                                      setEditDraft((d) => ({
                                        ...d,
                                        weightKg: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="space-y-0.5 block">
                                  <span className="text-[10px] text-[var(--muted)]">
                                    Reps
                                  </span>
                                  <input
                                    className={field}
                                    type="number"
                                    min={1}
                                    value={editDraft.reps}
                                    onChange={(e) =>
                                      setEditDraft((d) => ({
                                        ...d,
                                        reps: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                                <label className="space-y-0.5 block">
                                  <span className="text-[10px] text-[var(--muted)]">
                                    Sets
                                  </span>
                                  <input
                                    className={field}
                                    type="number"
                                    min={1}
                                    max={20}
                                    value={editDraft.setsCount}
                                    onChange={(e) =>
                                      setEditDraft((d) => ({
                                        ...d,
                                        setsCount: e.target.value,
                                      }))
                                    }
                                  />
                                </label>
                              </>
                            ) : (
                              <p className="col-span-3 text-xs text-[var(--muted)]">
                                Cardio details are set when logging the run.
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => void saveEdit(item.id)}
                              className="col-span-3 rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2 text-xs font-medium min-h-[40px]"
                            >
                              Save presets
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (editingId === item.id) {
                              setEditingId(null);
                              return;
                            }
                            setEditingId(item.id);
                            setEditDraft({
                              setsCount: String(item.setsCount),
                              reps: String(item.reps),
                              weightKg: String(item.weightKg),
                            });
                          }}
                          className="text-xs px-2 py-2 rounded-md border border-[var(--border)] min-h-[40px]"
                        >
                          {editingId === item.id ? "Cancel" : "Edit"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeItem(item.id)}
                          className="text-xs px-2 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] min-h-[40px]"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--border)]">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Planned muscles · {activePlan.name}
            </p>
            <BodyHeatmap
              mode="sets"
              muscles={heat.muscles}
              regionCounts={heat.regions}
              dateLabel="this plan"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
