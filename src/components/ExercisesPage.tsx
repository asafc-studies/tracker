"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { AiCoachPanel } from "@/components/AiCoachPanel";
import { BodyHeatmap } from "@/components/BodyHeatmap";
import { MuscleMap } from "@/components/MuscleMap";
import { SleepUndersleepTip } from "@/components/SleepUndersleepTip";
import {
  DisplayNumber,
  ExercisePanelNav,
  MetricTile,
  PanelCard,
  fieldClass,
  type ExercisePanel,
} from "@/components/exercises-ui";
import {
  WorkoutLogPanel,
  type DaySession,
} from "@/components/WorkoutLogPanel";
import { WorkoutPlannerPanel } from "@/components/WorkoutPlannerPanel";
import { apiFetch } from "@/lib/api-fetch";
import {
  type BodyRegion,
  type MuscleGroup,
  type DayLiftStats,
} from "@/lib/exercises";
import type { HeatMode, MuscleHeatRow } from "@/lib/muscle-tonnage";
import { invalidateAfterLifts } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import { todayISODate } from "@/lib/tdee";
import { userStorageKey } from "@/lib/user-storage";

const HEAT_MODE_KEY = "recomp.muscleHeatMode";

type Grouped = {
  lift: string;
  name: string;
  bodyweight: boolean;
  cardio?: boolean;
  sets: Array<{
    id: string;
    lift: string;
    setNumber: number;
    reps: number;
    weightKg: number;
  }>;
};

type LastSession = {
  date: string;
  sets: Array<{ setNumber: number; reps: number; weightKg: number }>;
};

type RecentDay = {
  date: string;
  sessionId: string;
  name?: string;
  groups: Grouped[];
  stats: DayLiftStats;
  durationMinutes?: number | null;
  caloriesBurned?: number | null;
};

type LiftsPayload = {
  sessions?: DaySession[];
  inProgressSession?: DaySession | null;
  lastByLift?: Record<string, { weightKg: number; reps: number; date: string }>;
  lastSessionByLift?: Record<string, LastSession>;
  muscleSummary?: Array<{ muscle: MuscleGroup; sets: number; label: string }>;
  muscleHeat?: { sets: MuscleHeatRow[]; tonnage: MuscleHeatRow[] };
  regionCounts?: Partial<Record<BodyRegion, number>>;
  regionHeat?: {
    sets: Partial<Record<BodyRegion, number>>;
    tonnage: Partial<Record<BodyRegion, number>>;
  };
  stats?: DayLiftStats | null;
  funny?: string[];
  recentGrouped?: RecentDay[];
  eee?: { caloriesBurned?: number | null };
};

function clampDate(d: string): string {
  const today = todayISODate();
  return d > today ? today : d;
}

function normalizePanel(p: string | null): ExercisePanel {
  if (p === "heatmap") return "muscles";
  if (p === "session") return "log";
  if (p === "weight") return "overview";
  const valid: ExercisePanel[] = [
    "overview",
    "muscles",
    "log",
    "plan",
    "tips",
    "history",
  ];
  if (valid.includes(p as ExercisePanel)) return p as ExercisePanel;
  return "overview";
}

function todayFriendly(date: string): string {
  const today = todayISODate();
  if (date === today) return "today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date === todayISODate(yesterday)) return "yesterday";
  return date;
}

export function ExercisesPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = todayISODate();

  const [panel, setPanel] = useState<ExercisePanel>(() =>
    normalizePanel(searchParams.get("panel")),
  );
  const [date, setDate] = useState(() =>
    clampDate(searchParams.get("date") || today),
  );
  const [heatMode, setHeatMode] = useState<HeatMode>("tonnage");
  const [focusSessionId, setFocusSessionId] = useState<string | null>(null);
  const [editingSessionHistoryId, setEditingSessionHistoryId] = useState<
    string | null
  >(null);
  const [sessionHistoryDraft, setSessionHistoryDraft] = useState({
    name: "",
    durationMinutes: "",
  });
  const [savingSessionHistory, setSavingSessionHistory] = useState(false);

  const field = fieldClass();

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<{ userId?: string }>("/api/profile"),
  });
  const userId = profileQuery.data?.userId ?? null;

  useEffect(() => {
    setPanel(normalizePanel(searchParams.get("panel")));
    const nextDate = searchParams.get("date");
    if (nextDate) setDate(clampDate(nextDate));
    else setDate(todayISODate());
  }, [searchParams]);

  useEffect(() => {
    const key = userStorageKey(HEAT_MODE_KEY, userId);
    if (!key) return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === "sets" || raw === "tonnage") setHeatMode(raw);
    } catch {
      /* ignore */
    }
  }, [userId]);

  function syncUrl(nextPanel: ExercisePanel, nextDate: string) {
    const params = new URLSearchParams();
    params.set("panel", nextPanel);
    if (nextDate !== todayISODate()) params.set("date", nextDate);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function changePanel(next: ExercisePanel) {
    setPanel(next);
    syncUrl(next, date);
  }

  function changeHeatMode(mode: HeatMode) {
    setHeatMode(mode);
    const key = userStorageKey(HEAT_MODE_KEY, userId);
    if (!key) return;
    try {
      window.localStorage.setItem(key, mode);
    } catch {
      /* ignore */
    }
  }

  const liftsQuery = useQuery({
    queryKey: queryKeys.lifts(date),
    queryFn: () =>
      apiFetch<LiftsPayload>(
        `/api/lifts?date=${encodeURIComponent(date)}`,
      ),
  });

  const lifts = liftsQuery.data;
  const sessions = lifts?.sessions ?? [];
  const inProgressSession = lifts?.inProgressSession ?? null;
  const lastByLift = lifts?.lastByLift ?? {};
  const lastSessionByLift = lifts?.lastSessionByLift ?? {};
  const muscleSummary = lifts?.muscleSummary ?? [];
  const muscleHeat = lifts?.muscleHeat;
  const regionCounts = lifts?.regionCounts ?? {};
  const regionHeat = lifts?.regionHeat;
  const stats = lifts?.stats ?? null;
  const funny = lifts?.funny ?? [];
  const recentGrouped = lifts?.recentGrouped ?? [];
  const caloriesBurned = lifts?.eee?.caloriesBurned ?? null;
  const totalSets = stats?.totalSets ?? 0;

  async function refreshLifts() {
    await invalidateAfterLifts(queryClient);
  }

  function setDateSafe(next: string) {
    const clamped = clampDate(next);
    setDate(clamped);
    setFocusSessionId(null);
    syncUrl(panel, clamped);
  }

  function openDayForEdit(dayDate: string, sessionId?: string) {
    const clamped = clampDate(dayDate);
    setDate(clamped);
    setFocusSessionId(sessionId ?? null);
    setPanel("log");
    syncUrl("log", clamped);
  }

  async function saveSessionFromHistory(sessionId: string) {
    setSavingSessionHistory(true);
    try {
      await apiFetch("/api/lifts", {
        method: "PATCH",
        body: JSON.stringify({
          sessionId,
          updateSession: true,
          name: sessionHistoryDraft.name.trim() || "Workout",
          durationMinutes:
            sessionHistoryDraft.durationMinutes.trim() === ""
              ? null
              : Number(sessionHistoryDraft.durationMinutes),
        }),
      });
      setEditingSessionHistoryId(null);
      await refreshLifts();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSessionHistory(false);
    }
  }

  const dateBar = (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted)]">Date</span>
        <input
          className={field}
          type="date"
          max={today}
          value={date}
          onChange={(e) => setDateSafe(e.target.value)}
        />
      </label>
      <span className="text-sm text-[var(--muted)]">
        {todayFriendly(date)}
      </span>
      {date !== today ? (
        <button
          type="button"
          onClick={() => setDateSafe(today)}
          className="text-xs text-[var(--accent)] hover:underline"
        >
          Today
        </button>
      ) : null}
    </div>
  );

  const overviewPanel = (
    <div className="space-y-4">
      <SleepUndersleepTip kind="training" />
      {stats && stats.totalSets > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          <MetricTile label="Sets" value={String(stats.totalSets)} />
          <MetricTile label="Reps" value={String(stats.totalReps)} />
          <MetricTile
            label="Moved"
            value={`${Math.round(stats.volumeKg).toLocaleString()} kg`}
          />
          {caloriesBurned != null && caloriesBurned > 0 ? (
            <MetricTile
              label="EEE burn"
              value={`${Math.round(caloriesBurned)} kcal`}
            />
          ) : (
            <MetricTile
              label="Heaviest"
              value={`${Math.round(stats.heaviestKg)} kg`}
            />
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--muted)] py-6 text-center rounded-xl border border-dashed border-[var(--border)]">
          No sets logged for this day yet. Head to Log to add a workout.
        </p>
      )}
      {sessions.length > 0 ? (
        <ul className="space-y-1.5 text-sm px-1">
          {sessions.map((s) => (
            <li key={s.id} className="text-[var(--muted)]">
              <span className="text-[var(--foreground)]">{s.name}</span>
              {" · "}
              {s.groups.length} exercises
              {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
              {s.caloriesBurned
                ? ` · ${Math.round(s.caloriesBurned)} kcal EEE`
                : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {funny.length > 0 ? (
        <ul className="space-y-1.5 text-sm text-[var(--muted)] px-1">
          {funny.map((line) => (
            <li key={line} className="leading-relaxed">{line}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid sm:grid-cols-2 gap-3 pt-2">
        <button
          type="button"
          onClick={() => changePanel("muscles")}
          className="text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]/40 transition-colors"
        >
          <p className="text-xs text-[var(--muted)]">Heatmap</p>
          <p className="text-sm mt-0.5">See what you worked</p>
        </button>
        <button
          type="button"
          onClick={() => changePanel("log")}
          className="text-left rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 hover:border-[var(--accent)]/40 transition-colors"
        >
          <p className="text-xs text-[var(--muted)]">Today&apos;s sets</p>
          <DisplayNumber size="sm" className="mt-0.5">
            {totalSets}
          </DisplayNumber>
          <span className="text-sm text-[var(--muted)]"> sets logged</span>
        </button>
      </div>
    </div>
  );

  const historyPanel = (
    <div className="space-y-2">
      {recentGrouped.length === 0 ? (
        <p className="text-sm text-[var(--muted)] text-center py-10">
          No past sessions yet.
        </p>
      ) : (
        recentGrouped.map((day) => {
          const editing = editingSessionHistoryId === day.sessionId;
          return (
            <PanelCard
              key={day.sessionId}
              title={`${day.name || "Workout"} · ${todayFriendly(day.date)}`}
              subtitle={
                editing ? undefined : (
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-xs text-[var(--muted)]">
                      {day.groups.length} exercises · {day.stats.totalSets} sets
                      {day.durationMinutes != null && day.durationMinutes > 0
                        ? ` · ${Math.round(day.durationMinutes)} min`
                        : ""}
                    </span>
                    <DisplayNumber size="sm">
                      {Math.round(day.stats.volumeKg).toLocaleString()}
                    </DisplayNumber>
                    <span className="text-xs text-[var(--muted)]">kg moved</span>
                    {day.caloriesBurned != null && day.caloriesBurned > 0 ? (
                      <span className="text-xs text-[var(--accent)]">
                        · {Math.round(day.caloriesBurned)} kcal EEE
                      </span>
                    ) : null}
                  </div>
                )
              }
              action={
                <div className="flex flex-wrap gap-1.5 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (editing) {
                        setEditingSessionHistoryId(null);
                      } else {
                        setEditingSessionHistoryId(day.sessionId);
                        setSessionHistoryDraft({
                          name: day.name || "Workout",
                          durationMinutes:
                            day.durationMinutes != null
                              ? String(day.durationMinutes)
                              : "",
                        });
                      }
                    }}
                    className="text-xs px-2.5 py-1 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[36px]"
                  >
                    {editing ? "Cancel" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => openDayForEdit(day.date, day.sessionId)}
                    className="text-xs px-2.5 py-1 rounded-md border border-[var(--border)] text-[var(--accent)] min-h-[36px]"
                  >
                    Edit sets
                  </button>
                </div>
              }
            >
              {editing ? (
                <div className="space-y-3">
                  <label className="space-y-1 block">
                    <span className="text-xs text-[var(--muted)]">Name</span>
                    <input
                      className={field}
                      value={sessionHistoryDraft.name}
                      onChange={(e) =>
                        setSessionHistoryDraft((d) => ({
                          ...d,
                          name: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-xs text-[var(--muted)]">
                      Duration (minutes)
                    </span>
                    <input
                      className={field}
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={sessionHistoryDraft.durationMinutes}
                      onChange={(e) =>
                        setSessionHistoryDraft((d) => ({
                          ...d,
                          durationMinutes: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    disabled={savingSessionHistory}
                    onClick={() => void saveSessionFromHistory(day.sessionId)}
                    className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] disabled:opacity-50"
                  >
                    {savingSessionHistory ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : null}
            </PanelCard>
          );
        })
      )}
    </div>
  );

  return (
    <AppShell title="Exercises">
      {dateBar}
      <ExercisePanelNav active={panel} onChange={changePanel} />

      {panel === "overview" ? overviewPanel : null}
      {panel === "muscles" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["tonnage", "Tonnage"],
                ["sets", "Sets"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => changeHeatMode(id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors min-h-[36px] ${
                  heatMode === id
                    ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] text-[var(--muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(() => {
            const heatRows =
              heatMode === "tonnage"
                ? (muscleHeat?.tonnage ?? [])
                : (muscleHeat?.sets ??
                  muscleSummary.map((m) => ({
                    muscle: m.muscle,
                    label: m.label,
                    value: m.sets,
                    intensity: 0,
                  })));
            const maxLegacy = Math.max(
              1,
              ...heatRows.map((m) => m.value),
              0,
            );
            const rows =
              muscleHeat != null
                ? heatRows
                : heatRows.map((m) => ({
                    ...m,
                    intensity: m.value / maxLegacy,
                  }));
            const regions =
              (heatMode === "tonnage"
                ? regionHeat?.tonnage
                : regionHeat?.sets) ?? regionCounts;
            const activeRegions = (
              Object.entries(regions) as [BodyRegion, number][]
            )
              .filter(([, n]) => (n ?? 0) > 0)
              .map(([r]) => r);
            return (
              <>
                <MuscleMap
                  mode={heatMode}
                  title={`Muscles · ${todayFriendly(date)}`}
                  regions={activeRegions}
                  muscles={rows}
                />
                <BodyHeatmap
                  mode={heatMode}
                  muscles={rows}
                  regionCounts={regions}
                  dateLabel={todayFriendly(date)}
                />
              </>
            );
          })()}
        </div>
      ) : null}
      {panel === "log" ? (
        <WorkoutLogPanel
          date={date}
          sessions={sessions}
          inProgressSession={inProgressSession}
          focusSessionId={focusSessionId}
          lastByLift={lastByLift}
          lastSessionByLift={lastSessionByLift}
          onChanged={refreshLifts}
          onStopped={(stopped) => {
            setFocusSessionId(stopped.id);
            queryClient.setQueryData(
              queryKeys.lifts(date),
              (old: LiftsPayload | undefined) => {
                if (!old) return old;
                const others = (old.sessions ?? []).filter(
                  (s) => s.id !== stopped.id,
                );
                return {
                  ...old,
                  inProgressSession: null,
                  sessions: [...others, { ...stopped, inProgress: false }],
                };
              },
            );
          }}
          onClearFocus={() => setFocusSessionId(null)}
        />
      ) : null}
      {panel === "plan" ? <WorkoutPlannerPanel /> : null}
      {panel === "tips" ? (
        <div className="space-y-4">
          <SleepUndersleepTip kind="training" />
          <AiCoachPanel
            scope="workout"
            title="Workout tips"
            buttonLabel="Get workout tips"
            placeholder='Optional: e.g. "more pull volume" or "knee-friendly cardio"'
          />
        </div>
      ) : null}
      {panel === "history" ? historyPanel : null}
    </AppShell>
  );
}
