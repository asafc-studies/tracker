"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { WeightChart } from "@/components/charts/WeightChart";
import { NutritionChart } from "@/components/charts/NutritionChart";
import { EeeBurnChart } from "@/components/charts/EeeBurnChart";
import { apiFetch } from "@/lib/api-fetch";
import { exerciseDisplayName, formatSetWeight } from "@/lib/exercises";
import { invalidateAfterWeight } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";

type Tab = "weight" | "nutrition" | "burn";
type Range = "7d" | "30d" | "90d" | "all";

type SessionSet = {
  id: string;
  lift: string;
  setNumber: number;
  reps: number;
  weightKg: number;
};

type SessionRow = {
  id: string;
  date: string;
  durationMinutes?: number | null;
  caloriesBurned?: number | null;
  sets: SessionSet[];
};

type EeeDay = {
  date: string;
  caloriesBurned: number;
  durationMinutes: number;
  setCount: number;
};

type HistoryPayload = {
  rows?: Array<{ date: string; weightKg: number; note?: string | null }>;
  days?: Array<{ date: string; proteinG: number; calories: number }>;
  proteinTarget?: number | null;
  series?: EeeDay[];
  sessions?: SessionRow[];
};

export function HistoryPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("weight");
  const [range, setRange] = useState<Range>("30d");
  const [quickWeight, setQuickWeight] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const apiTab = tab === "burn" ? "lifts" : tab;
  const historyQuery = useQuery({
    queryKey: queryKeys.history(apiTab, range),
    queryFn: () =>
      apiFetch<HistoryPayload>(
        `/api/history?${new URLSearchParams({ tab: apiTab, range })}`,
      ),
  });

  const weightRows = historyQuery.data?.rows ?? [];
  const nutritionDays = historyQuery.data?.days ?? [];
  const proteinTarget = historyQuery.data?.proteinTarget ?? null;
  const eeeSeries = historyQuery.data?.series ?? [];
  const sessions = historyQuery.data?.sessions ?? [];
  const loading = historyQuery.isLoading;

  async function logWeight(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = Number(quickWeight);
    if (!weightKg) return;
    await apiFetch("/api/weight", {
      method: "POST",
      body: JSON.stringify({ weightKg }),
    });
    setQuickWeight("");
    setTab("weight");
    await invalidateAfterWeight(queryClient);
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`px-3 py-2 rounded-md text-sm border transition-colors min-h-[44px] ${
        tab === id
          ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] text-[var(--muted)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <AppShell title="History">
      <div className="flex flex-wrap gap-2 mb-4">
        {tabBtn("weight", "Weight")}
        {tabBtn("nutrition", "Nutrition")}
        {tabBtn("burn", "Burn (EEE)")}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {(["7d", "30d", "90d", "all"] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`px-2.5 py-1.5 rounded text-xs border min-h-[36px] ${
              range === r
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {tab === "weight" ? (
        <form
          onSubmit={(e) => void logWeight(e)}
          className="flex gap-2 mb-6 md:hidden max-w-sm"
        >
          <input
            type="number"
            step="0.1"
            placeholder="Today's weight (kg)"
            value={quickWeight}
            onChange={(e) => setQuickWeight(e.target.value)}
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm min-h-[44px]"
          />
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-2 text-sm font-medium min-h-[44px]"
          >
            Log
          </button>
        </form>
      ) : null}

      {tab === "burn" ? (
        <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
          Resistance training burn (MET 5.5). Insight only — not subtracted from
          your daily calorie target.
        </p>
      ) : null}

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 mb-6">
        {loading ? (
          <p className="text-sm text-[var(--muted)] py-10 text-center">
            Loading…
          </p>
        ) : tab === "weight" ? (
          <WeightChart data={weightRows} />
        ) : tab === "nutrition" ? (
          <NutritionChart
            data={nutritionDays}
            proteinTarget={proteinTarget}
          />
        ) : (
          <EeeBurnChart data={eeeSeries} />
        )}
      </div>

      {tab === "weight" ? (
        <ul className="space-y-2 text-sm">
          {[...weightRows].reverse().map((r) => (
            <li
              key={r.date}
              className="flex justify-between border-b border-[var(--border)] py-2"
            >
              <span className="text-[var(--muted)]">{r.date}</span>
              <span>{r.weightKg} kg</span>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === "nutrition" ? (
        <ul className="space-y-2 text-sm">
          {[...nutritionDays].reverse().map((d) => {
            const hit =
              proteinTarget != null && d.proteinG >= proteinTarget;
            return (
              <li
                key={d.date}
                className="flex justify-between border-b border-[var(--border)] py-2"
              >
                <span className="text-[var(--muted)]">{d.date}</span>
                <span>
                  {Math.round(d.proteinG)}g P · {Math.round(d.calories)} kcal
                  <span className="text-[var(--muted)] ml-2">
                    {proteinTarget != null
                      ? hit
                        ? "protein met"
                        : "under protein"
                      : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {tab === "burn" ? (
        <div className="space-y-4">
          <ul className="space-y-2 text-sm">
            {[...eeeSeries].reverse().map((s) => (
              <li
                key={s.date}
                className="flex justify-between border-b border-[var(--border)] py-2 gap-2"
              >
                <span className="text-[var(--muted)]">{s.date}</span>
                <span className="text-right">
                  {s.caloriesBurned > 0
                    ? `${Math.round(s.caloriesBurned)} kcal`
                    : "—"}
                  {s.durationMinutes > 0 ? (
                    <span className="text-[var(--muted)]">
                      {" "}
                      · {Math.round(s.durationMinutes)} min
                    </span>
                  ) : null}
                  <span className="text-[var(--muted)]">
                    {" "}
                    · {s.setCount} sets
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <h3 className="text-sm text-[var(--muted)] pt-2">Sessions</h3>
          <ul className="space-y-2">
            {sessions.map((session) => {
              const byLift = new Map<string, SessionSet[]>();
              for (const s of session.sets) {
                if (!byLift.has(s.lift)) byLift.set(s.lift, []);
                byLift.get(s.lift)!.push(s);
              }
              const open = expanded === session.id;
              return (
                <li
                  key={session.id}
                  className="border border-[var(--border)] rounded-lg bg-[var(--surface)] overflow-hidden"
                >
                  <button
                    type="button"
                    className="w-full flex justify-between items-center px-3 py-3 text-sm text-left min-h-[48px] gap-2"
                    onClick={() =>
                      setExpanded(open ? null : session.id)
                    }
                  >
                    <span className="font-medium">{session.date}</span>
                    <span className="text-[var(--muted)] text-xs text-right">
                      {session.caloriesBurned
                        ? `${Math.round(session.caloriesBurned)} kcal`
                        : "no duration"}
                      {" · "}
                      {session.sets.length} sets
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-[var(--border)] px-3 py-3 space-y-3">
                      <Link
                        href={`/exercises?date=${session.date}&panel=log`}
                        className="inline-block text-xs text-[var(--accent)] hover:underline min-h-[44px] leading-[44px]"
                      >
                        Open & edit on Exercises →
                      </Link>
                      {[...byLift.entries()].map(([liftId, sets]) => (
                        <div key={liftId}>
                          <p className="text-sm font-medium mb-1">
                            {exerciseDisplayName(liftId)}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {[...sets]
                              .sort((a, b) => a.setNumber - b.setNumber)
                              .map(
                                (s) =>
                                  `Set ${s.setNumber}: ${formatSetWeight(liftId, s.weightKg)} × ${s.reps}`,
                              )
                              .join(" · ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </AppShell>
  );
}
