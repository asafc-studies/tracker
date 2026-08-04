"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fieldClass } from "@/components/exercises-ui";
import { apiFetch } from "@/lib/api-fetch";
import type { CoachSessionItem, CoachSessionPlan } from "@/lib/ai-coach";
import { invalidateAfterLifts } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";

type TipRange = "7d" | "14d" | "all";

type WorkoutTip = {
  id: string;
  date: string;
  prompt: string;
  label: string;
  summary: string;
  keepDoing: string[];
  improve: string[];
  watchOut: string[];
  session: CoachSessionPlan | null;
  model: string;
};

type TipsPayload = { range: string; tips: WorkoutTip[] };

type PlanItem = {
  id: string;
  checked: boolean;
};

type PlansPayload = {
  plans: Array<{ items: PlanItem[] }>;
  activeSessionId: string | null;
};

const RANGE_LABELS: Record<TipRange, string> = {
  "7d": "1 week",
  "14d": "2 weeks",
  all: "All",
};

function formatLine(item: CoachSessionItem) {
  if (item.cardio) return item.name;
  if (item.bodyweight && item.weightKg <= 0) {
    return `${item.name} ${item.setsCount}×${item.reps} BW`;
  }
  if (item.bodyweight) {
    return `${item.name} ${item.setsCount}×${item.reps} BW+${item.weightKg}`;
  }
  return `${item.name} ${item.setsCount}×${item.reps}@${item.weightKg}`;
}

function BulletBlock({
  label,
  items,
}: {
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item}
            className="text-sm text-[var(--muted)] leading-relaxed pl-3 border-l-2 border-[var(--border)]"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanBlock({ plan }: { plan: CoachSessionPlan }) {
  const queryClient = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");

  const plansQuery = useQuery({
    queryKey: queryKeys.workoutPlans,
    queryFn: () => apiFetch<PlansPayload>("/api/workout-plans"),
  });

  const canCheck = Boolean(plansQuery.data?.activeSessionId);
  const hasCheckable = plan.items.some((i) => i.planItemId);
  const checkedIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of plansQuery.data?.plans ?? []) {
      for (const item of p.items) {
        if (item.checked) set.add(item.id);
      }
    }
    return set;
  }, [plansQuery.data]);

  async function toggle(itemId: string) {
    if (!canCheck) {
      setHint("Start a workout in Log first, then check exercises here.");
      return;
    }
    setBusyId(itemId);
    setHint("");
    try {
      await apiFetch("/api/workout-plans", {
        method: "POST",
        body: JSON.stringify({ action: "check", itemId }),
      });
      await invalidateAfterLifts(queryClient);
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Could not check");
    } finally {
      setBusyId(null);
    }
  }

  async function addToPlans() {
    setSaving(true);
    setHint("");
    try {
      const index = (plansQuery.data?.plans.length ?? 0) + 1;
      const name = `Plan ${index}`;
      const created = await apiFetch<{ plan: { id: string } }>(
        "/api/workout-plans",
        {
          method: "POST",
          body: JSON.stringify({ action: "create_plan", name }),
        },
      );
      for (const item of plan.items) {
        await apiFetch("/api/workout-plans", {
          method: "POST",
          body: JSON.stringify({
            action: "add_item",
            planId: created.plan.id,
            lift: item.lift,
            setsCount: item.setsCount,
            reps: item.reps,
            weightKg: item.weightKg,
          }),
        });
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workoutPlans,
      });
      setHint(`Saved as ${name} — rename it under Plan.`);
    } catch (err) {
      setHint(err instanceof Error ? err.message : "Could not save plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
            Plan
          </p>
          <p className="font-medium mt-1">{plan.title}</p>
          {plan.reason ? (
            <p className="text-xs text-[var(--muted)] mt-1">{plan.reason}</p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={saving || plan.items.length === 0}
          onClick={() => void addToPlans()}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-2 text-xs font-medium min-h-[44px] disabled:opacity-50 hover:border-[var(--accent)]"
        >
          {saving ? "Saving…" : "Add to plans"}
        </button>
      </div>
      {hasCheckable ? (
        <p className="text-xs text-[var(--muted)]">
          {canCheck
            ? "Check off to log sets into your running workout."
            : "Start a workout in Log to enable checkboxes."}
        </p>
      ) : null}
      <ul className="space-y-1.5">
        {plan.items.map((item, idx) => {
          const checkId = item.planItemId;
          const on = checkId ? checkedIds.has(checkId) : false;
          const busy = checkId != null && busyId === checkId;
          if (checkId) {
            return (
              <li key={checkId}>
                <label
                  className={`flex gap-3 items-start min-h-[44px] py-1 ${
                    canCheck ? "cursor-pointer" : "cursor-default opacity-80"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!canCheck || busy}
                    onChange={() => void toggle(checkId)}
                    className="mt-1.5 size-4 accent-[var(--accent)] shrink-0"
                  />
                  <span
                    className={`text-sm leading-relaxed ${
                      on
                        ? "line-through text-[var(--muted)]"
                        : "text-[var(--foreground)]"
                    }`}
                  >
                    {formatLine(item)}
                  </span>
                </label>
              </li>
            );
          }
          return (
            <li
              key={`${item.lift}-${idx}`}
              className="text-sm leading-relaxed pl-3 border-l-2 border-[var(--border)] min-h-[44px] flex items-center"
            >
              {formatLine(item)}
            </li>
          );
        })}
      </ul>
      {hint ? (
        <p
          className={`text-sm ${
            hint.startsWith("Saved")
              ? "text-[var(--accent)]"
              : "text-[var(--warn)]"
          }`}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function TipCard({
  tip,
  onCollapse,
  onDeleted,
}: {
  tip: WorkoutTip;
  onCollapse?: () => void;
  onDeleted?: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setDeleting(true);
    setError("");
    try {
      await apiFetch(`/api/workout-tips?id=${tip.id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["workout-tips"] });
      onDeleted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-4">
      <header className="space-y-1">
        {onCollapse ? (
          <button
            type="button"
            onClick={onCollapse}
            className="w-full text-left space-y-1 -m-1 p-1 rounded-md hover:bg-[var(--background)] transition-colors"
          >
            <h3 className="font-medium text-base leading-snug">{tip.label}</h3>
            <p className="text-xs text-[var(--muted)]">{tip.date}</p>
          </button>
        ) : (
          <>
            <h3 className="font-medium text-base leading-snug">{tip.label}</h3>
            <p className="text-xs text-[var(--muted)]">{tip.date}</p>
          </>
        )}
      </header>

      <p className="text-sm leading-relaxed">{tip.summary}</p>

      {tip.session ? <PlanBlock plan={tip.session} /> : null}

      <BulletBlock label="Keep doing" items={tip.keepDoing} />
      <BulletBlock label="Improve" items={tip.improve} />
      <BulletBlock label="Watch out" items={tip.watchOut} />

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={deleting}
          onClick={() => void remove()}
          className="rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] min-h-[44px] disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        {tip.model ? (
          <p className="text-[10px] text-[var(--muted)]">{tip.model}</p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
    </article>
  );
}

export function WorkoutTipsPanel({ date }: { date: string }) {
  const queryClient = useQueryClient();
  const field = fieldClass();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState<TipRange>("7d");
  const [openId, setOpenId] = useState<string | null>(null);

  const tipsQuery = useQuery({
    queryKey: queryKeys.workoutTips(range),
    queryFn: () =>
      apiFetch<TipsPayload>(
        `/api/workout-tips?range=${encodeURIComponent(range)}`,
      ),
  });
  const tips = tipsQuery.data?.tips ?? [];

  async function ask() {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ tip: WorkoutTip }>("/api/workout-tips", {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt.trim() || undefined,
          date,
        }),
      });
      setPrompt("");
      setOpenId(data.tip.id);
      await queryClient.invalidateQueries({ queryKey: ["workout-tips"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tip failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm text-[var(--muted)]">AI workout tips</h2>
          <p className="text-sm text-[var(--muted)] mt-1">
            Ask a straight question for a straight answer. If your ask implies
            concrete plan changes, you may get a Plan you can save under Plan.
          </p>
        </div>
        <textarea
          className={`${field} min-h-[96px] resize-y`}
          placeholder='e.g. "what should I train today based on recent workouts and my plans?"'
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
          disabled={loading}
          onClick={() => void ask()}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto disabled:opacity-50"
        >
          {loading ? "Thinking…" : "Get tip"}
        </button>
        {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
      </section>

      <section className="space-y-3 border-t border-[var(--border)] pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm text-[var(--muted)]">Saved tips</h2>
          <div className="flex flex-wrap gap-2">
            {(["7d", "14d", "all"] as TipRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(r);
                  setOpenId(null);
                }}
                className={`px-2.5 py-1.5 rounded text-xs border min-h-[36px] ${
                  range === r
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {tipsQuery.isLoading ? (
          <p className="text-sm text-[var(--muted)]">Loading tips…</p>
        ) : tips.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Ask for a tip above — it will show up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {tips.map((tip) => {
              const open = openId === tip.id;
              return (
                <li key={tip.id} className="space-y-2">
                  {open ? (
                    <TipCard
                      tip={tip}
                      onCollapse={() => setOpenId(null)}
                      onDeleted={() => setOpenId(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setOpenId(tip.id)}
                      className="w-full text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 hover:border-[var(--accent)] transition-colors min-h-[44px]"
                    >
                      <p className="font-medium">{tip.label}</p>
                      <p className="text-xs text-[var(--muted)] mt-1">
                        {tip.date}
                        {tip.session
                          ? ` · plan · ${tip.session.items.length} lifts`
                          : tip.prompt
                            ? " · asked"
                            : " · general"}
                      </p>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {tipsQuery.isError ? (
          <p className="text-sm text-[var(--warn)]">Could not load tips</p>
        ) : null}
      </section>
    </div>
  );
}
