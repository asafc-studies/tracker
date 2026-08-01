"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { WeightChart } from "@/components/charts/WeightChart";
import { NutritionChart } from "@/components/charts/NutritionChart";
import { EeeBurnChart } from "@/components/charts/EeeBurnChart";
import { SleepChart } from "@/components/charts/SleepChart";
import { apiFetch } from "@/lib/api-fetch";
import { exerciseDisplayName, formatSetWeight } from "@/lib/exercises";
import { invalidateAfterSleep, invalidateAfterWeight } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { formatSleepWindow, qualityLabel, SLEEP_HOURS_MIN } from "@/lib/sleep";
import { todayISODate } from "@/lib/tdee";

type Tab = "weight" | "nutrition" | "burn" | "sleep";
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

type WeightRow = {
  id: string;
  date: string;
  weightKg: number;
  note?: string | null;
};

type SleepRow = {
  id: string;
  date: string;
  fromTime?: string | null;
  untilTime?: string | null;
  hours: number;
  quality: number;
  note?: string | null;
};

type HistoryPayload = {
  rows?: WeightRow[] | SleepRow[];
  days?: Array<{ date: string; proteinG: number; calories: number }>;
  proteinTarget?: number | null;
  series?: EeeDay[];
  sessions?: SessionRow[];
};

export function HistoryPage() {
  const queryClient = useQueryClient();
  const today = todayISODate();
  const [tab, setTab] = useState<Tab>("weight");
  const [range, setRange] = useState<Range>("30d");
  const [quickWeight, setQuickWeight] = useState("");
  const [quickDate, setQuickDate] = useState(today);
  const [savingWeight, setSavingWeight] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    weightKg: string;
    date: string;
  } | null>(null);
  const [sleepEditDraft, setSleepEditDraft] = useState<{
    from: string;
    until: string;
    quality: string;
    date: string;
  } | null>(null);
  const [savingSleep, setSavingSleep] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const apiTab = tab === "burn" ? "lifts" : tab;
  const historyQuery = useQuery({
    queryKey: queryKeys.history(apiTab, range),
    queryFn: () =>
      apiFetch<HistoryPayload>(
        `/api/history?${new URLSearchParams({ tab: apiTab, range })}`,
      ),
  });

  const weightRows =
    tab === "weight" ? ((historyQuery.data?.rows as WeightRow[]) ?? []) : [];
  const sleepRows =
    tab === "sleep" ? ((historyQuery.data?.rows as SleepRow[]) ?? []) : [];
  const nutritionDays = historyQuery.data?.days ?? [];
  const proteinTarget = historyQuery.data?.proteinTarget ?? null;
  const eeeSeries = historyQuery.data?.series ?? [];
  const sessions = historyQuery.data?.sessions ?? [];
  const loading = historyQuery.isLoading;

  useEffect(() => {
    setQuickDate(today);
  }, [today]);

  useEffect(() => {
    setEditingId(null);
    setEditDraft(null);
    setSleepEditDraft(null);
  }, [tab]);

  async function logWeight(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = Number(quickWeight);
    if (!weightKg || weightKg <= 0) return;
    setSavingWeight(true);
    try {
      await apiFetch("/api/weight", {
        method: "POST",
        body: JSON.stringify({
          weightKg,
          date: quickDate || today,
        }),
      });
      setQuickWeight("");
      setTab("weight");
      await invalidateAfterWeight(queryClient);
    } finally {
      setSavingWeight(false);
    }
  }

  async function saveWeight(id: string) {
    if (!editDraft) return;
    const weightKg = Number(editDraft.weightKg);
    if (!weightKg || weightKg <= 0) return;
    setSavingWeight(true);
    try {
      await apiFetch("/api/weight", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          weightKg,
          date: editDraft.date,
        }),
      });
      setEditingId(null);
      setEditDraft(null);
      await invalidateAfterWeight(queryClient);
    } finally {
      setSavingWeight(false);
    }
  }

  async function deleteWeight(id: string) {
    const ok = window.confirm("Delete this weight entry?");
    if (!ok) return;
    setSavingWeight(true);
    try {
      await apiFetch(`/api/weight?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
      await invalidateAfterWeight(queryClient);
    } finally {
      setSavingWeight(false);
    }
  }

  async function saveSleepEdit(id: string) {
    if (!sleepEditDraft) return;
    const quality = Number(sleepEditDraft.quality);
    if (!sleepEditDraft.from || !sleepEditDraft.until) return;
    if (!Number.isFinite(quality) || quality < 1 || quality > 5) return;
    setSavingSleep(true);
    try {
      await apiFetch("/api/sleep", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          from: sleepEditDraft.from,
          until: sleepEditDraft.until,
          quality,
          date: sleepEditDraft.date,
        }),
      });
      setEditingId(null);
      setSleepEditDraft(null);
      await invalidateAfterSleep(queryClient);
    } finally {
      setSavingSleep(false);
    }
  }

  async function deleteSleep(id: string) {
    setSavingSleep(true);
    try {
      await apiFetch(`/api/sleep?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (editingId === id) {
        setEditingId(null);
        setSleepEditDraft(null);
      }
      await invalidateAfterSleep(queryClient);
    } finally {
      setSavingSleep(false);
    }
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

  const field =
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm min-h-[44px]";

  return (
    <AppShell title="History">
      <div className="flex flex-wrap gap-2 mb-4">
        {tabBtn("weight", "Weight")}
        {tabBtn("nutrition", "Nutrition")}
        {tabBtn("sleep", "Sleep")}
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
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 mb-6 space-y-3"
        >
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            Log or update weight
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 block flex-1 min-w-[8rem]">
              <span className="text-xs text-[var(--muted)]">Date</span>
              <input
                type="date"
                max={today}
                value={quickDate}
                onChange={(e) => setQuickDate(e.target.value)}
                className={field}
              />
            </label>
            <label className="space-y-1 block flex-1 min-w-[8rem]">
              <span className="text-xs text-[var(--muted)]">Weight (kg)</span>
              <input
                type="number"
                step="0.1"
                min={20}
                placeholder="e.g. 78.4"
                value={quickWeight}
                onChange={(e) => setQuickWeight(e.target.value)}
                className={field}
              />
            </label>
            <button
              type="submit"
              disabled={savingWeight || !quickWeight}
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium min-h-[44px] disabled:opacity-50"
            >
              {savingWeight ? "Saving…" : "Save"}
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            Saves that day&apos;s entry (creates or updates) and syncs profile
            weight to the most recent log.
          </p>
        </form>
      ) : null}

      {tab === "burn" ? (
        <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
          Resistance training burn (MET 5.5). Insight only — not subtracted from
          your daily calorie target.
        </p>
      ) : null}

      {tab === "sleep" ? (
        <p className="text-xs text-[var(--muted)] mb-3 leading-relaxed">
          Adult band {SLEEP_HOURS_MIN}–9h. Consistency matters more than one
          catch-up night. Log nights on the{" "}
          <Link href="/sleep" className="text-[var(--accent)] hover:underline">
            Sleep
          </Link>{" "}
          page.
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
        ) : tab === "sleep" ? (
          <SleepChart data={sleepRows} />
        ) : (
          <EeeBurnChart data={eeeSeries} />
        )}
      </div>

      {tab === "weight" ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
            Entries
          </p>
          {weightRows.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-6 text-center">
              No entries in this range.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {[...weightRows].reverse().map((row) => {
                const editing = editingId === row.id;
                const draft = editing
                  ? editDraft ?? {
                      weightKg: String(row.weightKg),
                      date: row.date,
                    }
                  : null;
                return (
                  <li key={row.id} className="px-4 py-2.5 text-sm">
                    {editing && draft ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            className={field}
                            type="date"
                            max={today}
                            value={draft.date}
                            onChange={(e) =>
                              setEditDraft({
                                ...draft,
                                date: e.target.value,
                              })
                            }
                          />
                          <input
                            className={field}
                            type="number"
                            step="0.1"
                            min={20}
                            value={draft.weightKg}
                            onChange={(e) =>
                              setEditDraft({
                                ...draft,
                                weightKg: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingWeight}
                            onClick={() => void saveWeight(row.id)}
                            className="text-xs text-[var(--accent)] font-medium min-h-[36px]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                            className="text-xs text-[var(--muted)] min-h-[36px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--muted)]">{row.date}</span>
                        <div className="flex items-center gap-2">
                          <span>{row.weightKg} kg</span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(row.id);
                              setEditDraft({
                                weightKg: String(row.weightKg),
                                date: row.date,
                              });
                            }}
                            className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[36px]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={savingWeight}
                            onClick={() => void deleteWeight(row.id)}
                            className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[36px]"
                          >
                            Del
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
      ) : null}

      {tab === "sleep" ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)]/60">
            Entries
          </p>
          {sleepRows.length === 0 ? (
            <p className="text-sm text-[var(--muted)] py-6 text-center">
              No sleep entries in this range.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {[...sleepRows].reverse().map((row) => {
                const editing = editingId === row.id;
                const draft = editing
                  ? sleepEditDraft ?? {
                      from: row.fromTime ?? "",
                      until: row.untilTime ?? "",
                      quality: String(row.quality),
                      date: row.date,
                    }
                  : null;
                return (
                  <li key={row.id} className="px-4 py-2.5 text-sm">
                    {editing && draft ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <input
                            className={field}
                            type="date"
                            max={today}
                            value={draft.date}
                            onChange={(e) =>
                              setSleepEditDraft({
                                ...draft,
                                date: e.target.value,
                              })
                            }
                          />
                          <input
                            className={field}
                            type="time"
                            value={draft.from}
                            onChange={(e) =>
                              setSleepEditDraft({
                                ...draft,
                                from: e.target.value,
                              })
                            }
                          />
                          <input
                            className={field}
                            type="time"
                            value={draft.until}
                            onChange={(e) =>
                              setSleepEditDraft({
                                ...draft,
                                until: e.target.value,
                              })
                            }
                          />
                          <input
                            className={field}
                            type="number"
                            min={1}
                            max={5}
                            value={draft.quality}
                            onChange={(e) =>
                              setSleepEditDraft({
                                ...draft,
                                quality: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingSleep}
                            onClick={() => void saveSleepEdit(row.id)}
                            className="text-xs text-[var(--accent)] font-medium min-h-[36px]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setSleepEditDraft(null);
                            }}
                            className="text-xs text-[var(--muted)] min-h-[36px]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--muted)]">{row.date}</span>
                        <div className="flex items-center gap-2">
                          <span>
                            {formatSleepWindow(
                              row.fromTime,
                              row.untilTime,
                              row.hours,
                            )}{" "}
                            · {qualityLabel(row.quality)}
                            {row.hours < SLEEP_HOURS_MIN ? (
                              <span className="text-[var(--warn)]"> · short</span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(row.id);
                              setSleepEditDraft({
                                from: row.fromTime ?? "",
                                until: row.untilTime ?? "",
                                quality: String(row.quality),
                                date: row.date,
                              });
                            }}
                            className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[36px]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={savingSleep}
                            onClick={() => void deleteSleep(row.id)}
                            className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[36px]"
                          >
                            Del
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
                        ? "in range"
                        : "under floor"
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
                        : session.durationMinutes
                          ? `${Math.round(session.durationMinutes)} min · no EEE`
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
