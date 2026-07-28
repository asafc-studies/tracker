"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EditToggle,
  PanelCard,
  SetChip,
  fieldClass,
} from "@/components/exercises-ui";
import {
  EXERCISE_GROUPS,
  type DayLiftStats,
  type ExerciseGroup,
  formatSetWeight,
  getExercisesByGroup,
  searchExercises,
} from "@/lib/exercises";

type SetRow = {
  id: string;
  lift: string;
  setNumber: number;
  reps: number;
  weightKg: number;
};

type Grouped = {
  lift: string;
  name: string;
  bodyweight: boolean;
  sets: SetRow[];
};

export type DaySession = {
  id: string;
  date: string;
  name: string;
  startedAt?: number | null;
  endedAt?: number | null;
  inProgress?: boolean;
  durationMinutes?: number | null;
  caloriesBurned?: number | null;
  groups: Grouped[];
  stats: DayLiftStats;
};

type DraftSet = { reps: number; weightKg: number };

type Props = {
  date: string;
  sessions: DaySession[];
  inProgressSession: DaySession | null;
  focusSessionId?: string | null;
  lastByLift: Record<string, { weightKg: number; reps: number; date: string }>;
  lastSessionByLift: Record<
    string,
    {
      date: string;
      sets: Array<{ setNumber: number; reps: number; weightKg: number }>;
    }
  >;
  onChanged: () => Promise<void>;
  onStopped?: (session: DaySession) => void;
  onClearFocus?: () => void;
};


const TIMER_STORAGE_KEY = "recomp.activeWorkoutTimer";

function coerceMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && value.trim() !== "") {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readStoredTimer(): { sessionId: string; startedAt: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string; startedAt?: number };
    if (!parsed.sessionId || !parsed.startedAt) return null;
    return { sessionId: parsed.sessionId, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

function writeStoredTimer(sessionId: string, startedAt: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    TIMER_STORAGE_KEY,
    JSON.stringify({ sessionId, startedAt }),
  );
}

function clearStoredTimer() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TIMER_STORAGE_KEY);
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDurationLabel(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(Number(minutes)) || Number(minutes) <= 0) {
    return "no duration";
  }
  const mins = Number(minutes);
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function WorkoutLogPanel({
  date,
  sessions,
  inProgressSession,
  focusSessionId = null,
  lastByLift,
  lastSessionByLift,
  onChanged,
  onStopped,
  onClearFocus,
}: Props) {
  const field = fieldClass();
  const running =
    inProgressSession ??
    sessions.find((s) => s.inProgress) ??
    null;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionDraft, setSessionDraft] = useState({
    name: "Workout",
    durationMinutes: "",
  });
  const [sessionMessage, setSessionMessage] = useState("");
  const [savingSession, setSavingSession] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const timerSessionIdRef = useRef<string | null>(null);

  const [group, setGroup] = useState<ExerciseGroup>("gym");
  const [search, setSearch] = useState("");
  const [exerciseId, setExerciseId] = useState("barbell_bench_press");
  const [reps, setReps] = useState(8);
  const [weightKg, setWeightKg] = useState(0);
  const [setsCount, setSetsCount] = useState(3);
  const [draftSets, setDraftSets] = useState<DraftSet[] | null>(null);
  const [editingLog, setEditingLog] = useState(false);
  const [editingLifts, setEditingLifts] = useState<Set<string>>(new Set());
  const [editDrafts, setEditDrafts] = useState<
    Record<string, { reps: string; weightKg: string }>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!running) {
      timerSessionIdRef.current = null;
      setTimerStartedAt(null);
      clearStoredTimer();
      return;
    }

    const serverStart = coerceMs(running.startedAt);
    const stored = readStoredTimer();
    let anchor =
      serverStart ??
      (stored?.sessionId === running.id ? stored.startedAt : null) ??
      null;

    if (timerSessionIdRef.current !== running.id) {
      timerSessionIdRef.current = running.id;
      if (anchor == null) anchor = Date.now();
      setTimerStartedAt(anchor);
      writeStoredTimer(running.id, anchor);
      return;
    }

    if (anchor != null) {
      setTimerStartedAt((prev) => prev ?? anchor);
      writeStoredTimer(running.id, anchor);
    }
  }, [running]);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running?.id]);

  useEffect(() => {
    if (running) {
      setSelectedId(running.id);
      return;
    }
    if (focusSessionId && sessions.some((s) => s.id === focusSessionId)) {
      setSelectedId(focusSessionId);
      return;
    }
    if (selectedId && !sessions.some((s) => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [sessions, running, selectedId, focusSessionId]);

  useEffect(() => {
    const drafts: Record<string, { reps: string; weightKg: string }> = {};
    for (const s of sessions) {
      for (const g of s.groups) {
        for (const set of g.sets) {
          drafts[set.id] = {
            reps: String(set.reps),
            weightKg: String(set.weightKg),
          };
        }
      }
    }
    if (running && running.date !== date) {
      for (const g of running.groups) {
        for (const set of g.sets) {
          drafts[set.id] = {
            reps: String(set.reps),
            weightKg: String(set.weightKg),
          };
        }
      }
    }
    setEditDrafts(drafts);
    setEditingLifts(new Set());
  }, [sessions, running, date]);

  const selectedSession = useMemo(() => {
    if (running && selectedId === running.id) return running;
    return sessions.find((s) => s.id === selectedId) ?? null;
  }, [sessions, selectedId, running]);

  const anchorMs = timerStartedAt ?? coerceMs(running?.startedAt) ?? null;
  const elapsedMs =
    running && anchorMs != null ? Math.max(0, now - anchorMs) : 0;

  const filteredExercises = useMemo(() => {
    if (search.trim()) return searchExercises(search, group);
    return getExercisesByGroup(group);
  }, [group, search]);

  const selectedExercise = useMemo(
    () =>
      filteredExercises.find((e) => e.id === exerciseId) ??
      getExercisesByGroup(group).find((e) => e.id === exerciseId),
    [exerciseId, group, filteredExercises],
  );

  useEffect(() => {
    const list = getExercisesByGroup(group);
    if (!list.some((e) => e.id === exerciseId)) {
      setExerciseId(list[0]?.id ?? "barbell_bench_press");
    }
    setSearch("");
  }, [group, exerciseId]);

  useEffect(() => {
    const last = lastByLift[exerciseId];
    const prior = lastSessionByLift[exerciseId];
    const ex = selectedExercise;
    if (prior?.sets.length) {
      setDraftSets(
        prior.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
      );
      setReps(prior.sets[0].reps);
      setWeightKg(prior.sets[0].weightKg);
      setSetsCount(prior.sets.length);
    } else if (last) {
      setDraftSets(null);
      setReps(last.reps);
      setWeightKg(last.weightKg);
      setSetsCount(3);
    } else if (ex?.bodyweight) {
      setDraftSets(null);
      setWeightKg(0);
      setReps(8);
      setSetsCount(3);
    } else {
      setDraftSets(null);
    }
  }, [exerciseId, lastByLift, lastSessionByLift, selectedExercise]);

  const isBodyweight = selectedExercise?.bodyweight ?? false;
  const previewSets: DraftSet[] = draftSets
    ? draftSets
    : Array.from({ length: setsCount }, () => ({ reps, weightKg }));

  const startSession = useCallback(
    async (name: string) => {
      setStarting(true);
      setSessionMessage("");
      const localStart = Date.now();
      try {
        const res = await fetch("/api/lifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            startSession: true,
            date,
            name,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSessionMessage(data.error || "Could not start session");
          return;
        }
        const sessionId = data.session?.id as string | undefined;
        const serverStart = coerceMs(data.session?.startedAt) ?? localStart;
        if (sessionId) {
          timerSessionIdRef.current = sessionId;
          setTimerStartedAt(serverStart);
          writeStoredTimer(sessionId, serverStart);
          setSelectedId(sessionId);
        }
        await onChanged();
      } finally {
        setStarting(false);
      }
    },
    [date, onChanged],
  );

  async function stopSession() {
    if (!running) return;
    setStopping(true);
    setSessionMessage("");
    const end = Date.now();
    const start = anchorMs ?? coerceMs(running.startedAt) ?? end;
    const durationMinutes = Math.max(1, Math.round((end - start) / 60000));
    const stoppedSnapshot: DaySession = {
      ...running,
      inProgress: false,
      endedAt: end,
      durationMinutes,
    };
    try {
      const res = await fetch("/api/lifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          stopSession: true,
          sessionId: running.id,
          startedAt: start,
          durationMinutes,
          name: running.name,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSessionMessage(data.error || "Could not stop session");
        return;
      }
      clearStoredTimer();
      setTimerStartedAt(null);
      timerSessionIdRef.current = null;
      const saved = data.session as DaySession | undefined;
      const mins = saved?.durationMinutes ?? durationMinutes;
      /** Clear running UI immediately — don't wait on reload. */
      onStopped?.(
        saved
          ? { ...saved, inProgress: false, durationMinutes: mins }
          : stoppedSnapshot,
      );
      setSelectedId(running.id);
      setSessionMessage(
        `Stopped · ${formatDurationLabel(mins)}. You can still add sets below.`,
      );
      await onChanged();
    } catch (err) {
      setSessionMessage(
        err instanceof Error ? err.message : "Could not stop session",
      );
    } finally {
      setStopping(false);
    }
  }

  function startEditSession(s: DaySession) {
    setEditingSessionId(s.id);
    const liveMins =
      s.inProgress && anchorMs != null
        ? Math.max(1, Math.round((Date.now() - anchorMs) / 60000))
        : null;
    setSessionDraft({
      name: s.name || "Workout",
      durationMinutes:
        s.durationMinutes != null && Number(s.durationMinutes) > 0
          ? String(s.durationMinutes)
          : liveMins != null
            ? String(liveMins)
            : "",
    });
    setSessionMessage("");
  }

  async function saveSession(sessionId: string) {
    setSavingSession(true);
    setSessionMessage("");
    const raw = sessionDraft.durationMinutes.trim();
    const durationMinutes = raw === "" ? null : Number(raw);
    if (raw !== "" && (!Number.isFinite(durationMinutes) || durationMinutes! < 0)) {
      setSessionMessage("Enter a valid duration in minutes");
      setSavingSession(false);
      return;
    }
    try {
      const res = await fetch("/api/lifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          sessionId,
          updateSession: true,
          name: sessionDraft.name.trim() || "Workout",
          durationMinutes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSessionMessage(data.error || "Save failed");
        return;
      }
      if (running?.id === sessionId) {
        clearStoredTimer();
        setTimerStartedAt(null);
        timerSessionIdRef.current = null;
      }
      setEditingSessionId(null);
      const saved = data.session?.durationMinutes;
      setSessionMessage(
        saved != null && Number(saved) > 0
          ? `Saved · ${formatDurationLabel(saved)}`
          : "Session updated",
      );
      await onChanged();
    } finally {
      setSavingSession(false);
    }
  }

  async function deleteSession(sessionId: string) {
    const ok = window.confirm(
      "Delete this session and all its exercises/sets?",
    );
    if (!ok) return;
    await fetch(`/api/lifts?sessionId=${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      cache: "no-store",
    });
    if (selectedId === sessionId) setSelectedId(null);
    if (running?.id === sessionId) {
      clearStoredTimer();
      setTimerStartedAt(null);
      timerSessionIdRef.current = null;
    }
    setEditingSessionId(null);
    await onChanged();
  }

  async function logSets() {
    const target = running ?? selectedSession;
    if (!exerciseId || !target) {
      setSessionMessage(
        running ? "Start a session first" : "Open a finished session to edit",
      );
      return;
    }
    const payload =
      draftSets && draftSets.length > 0
        ? {
            sessionId: target.id,
            lift: exerciseId,
            category: group,
            date: target.date,
            sets: draftSets,
          }
        : {
            sessionId: target.id,
            lift: exerciseId,
            category: group,
            date: target.date,
            reps,
            weightKg,
            setsCount,
          };
    const res = await fetch("/api/lifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json();
      setSessionMessage(data.error || "Could not log sets");
      return;
    }
    setEditingLog(false);
    setSelectedId(target.id);
    const count =
      draftSets && draftSets.length > 0 ? draftSets.length : setsCount;
    setSessionMessage(
      `Added ${count} set${count === 1 ? "" : "s"} to “${target.name}”`,
    );
    await onChanged();
  }

  async function saveSet(id: string) {
    const d = editDrafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      await fetch("/api/lifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          reps: Number(d.reps),
          weightKg: Number(d.weightKg),
        }),
      });
      await onChanged();
    } finally {
      setSavingId(null);
    }
  }

  async function removeSet(id: string) {
    await fetch(`/api/lifts?id=${id}`, { method: "DELETE" });
    await onChanged();
  }

  async function removeExercise(sessionId: string, lift: string) {
    const ok = window.confirm("Remove this exercise and all its sets?");
    if (!ok) return;
    await fetch(
      `/api/lifts?sessionId=${encodeURIComponent(sessionId)}&lift=${encodeURIComponent(lift)}`,
      { method: "DELETE" },
    );
    await onChanged();
  }

  async function addSetToExercise(
    sessionId: string,
    lift: string,
    bodyweight: boolean,
    existing?: Grouped,
    sessionDate?: string,
  ) {
    const last = existing?.sets[existing.sets.length - 1];
    await fetch("/api/lifts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        lift,
        date: sessionDate ?? date,
        reps: last?.reps ?? 8,
        weightKg: last?.weightKg ?? (bodyweight ? 0 : 20),
        setsCount: 1,
      }),
    });
    setEditingLifts((prev) => new Set(prev).add(`${sessionId}:${lift}`));
    await onChanged();
  }

  const last = lastByLift[exerciseId];
  const lastSession = lastSessionByLift[exerciseId];
  const canStart = !running && !starting;
  const completedSessions = sessions.filter((s) => !s.inProgress);
  const showRunningElsewhere =
    running != null && running.date !== date;

  function openFinishedSession(s: DaySession) {
    setSelectedId(s.id);
    setEditingSessionId(null);
    setSessionMessage("");
  }

  function renderExerciseList(s: DaySession) {
    if (s.groups.length === 0) {
      return (
        <p className="text-sm text-[var(--muted)]">
          No exercises yet — add sets below.
        </p>
      );
    }
    return s.groups.map((g) => {
      const key = `${s.id}:${g.lift}`;
      const editing = editingLifts.has(key);
      return (
        <div
          key={g.lift}
          className="rounded-lg border border-[var(--border)] overflow-hidden"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 bg-[var(--surface-2)]/50">
            <div className="min-w-0">
              <p className="text-sm font-medium">{g.name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {g.sets.map((set) => (
                  <SetChip
                    key={set.id}
                    weightKg={set.weightKg}
                    reps={set.reps}
                    bodyweight={g.bodyweight}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  void addSetToExercise(
                    s.id,
                    g.lift,
                    g.bodyweight,
                    g,
                    s.date,
                  )
                }
                className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] min-h-[44px]"
              >
                + Set
              </button>
              <EditToggle
                editing={editing}
                onClick={() =>
                  setEditingLifts((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              />
              <button
                type="button"
                onClick={() => void removeExercise(s.id, g.lift)}
                className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] min-h-[44px]"
              >
                Remove
              </button>
            </div>
          </div>
          {editing ? (
            <ul className="divide-y divide-[var(--border)] px-3 py-2 space-y-0">
              {g.sets.map((set) => {
                const d = editDrafts[set.id] ?? {
                  reps: String(set.reps),
                  weightKg: String(set.weightKg),
                };
                const dirty =
                  Number(d.reps) !== set.reps ||
                  Number(d.weightKg) !== set.weightKg;
                return (
                  <li
                    key={set.id}
                    className="py-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                  >
                    <span className="text-xs text-[var(--muted)] w-14">
                      Set {set.setNumber}
                    </span>
                    <label className="space-y-1 block flex-1">
                      <span className="text-[10px] text-[var(--muted)]">
                        {g.bodyweight ? "Added kg" : "kg"}
                      </span>
                      <input
                        className={field}
                        type="number"
                        step="0.5"
                        min={0}
                        value={d.weightKg}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [set.id]: {
                              ...d,
                              weightKg: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1 block flex-1">
                      <span className="text-[10px] text-[var(--muted)]">
                        Reps
                      </span>
                      <input
                        className={field}
                        type="number"
                        min={1}
                        value={d.reps}
                        onChange={(e) =>
                          setEditDrafts((prev) => ({
                            ...prev,
                            [set.id]: {
                              ...d,
                              reps: e.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <div className="flex gap-2">
                      {dirty ? (
                        <button
                          type="button"
                          disabled={savingId === set.id}
                          onClick={() => void saveSet(set.id)}
                          className="text-xs text-[var(--accent)] font-medium min-h-[44px] px-3"
                        >
                          {savingId === set.id ? "…" : "Save"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void removeSet(set.id)}
                        className="text-xs border border-[var(--border)] rounded-md px-3 min-h-[44px] text-[var(--muted)]"
                      >
                        Remove set
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      );
    });
  }

  function renderSessionEditForm(s: DaySession) {
    return (
      <div className="space-y-3">
        <label className="space-y-1 block">
          <span className="text-xs text-[var(--muted)]">Session name</span>
          <input
            className={field}
            value={sessionDraft.name}
            onChange={(e) =>
              setSessionDraft((d) => ({
                ...d,
                name: e.target.value,
              }))
            }
            placeholder="Gym / Run / Home"
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
            placeholder="e.g. 60"
            value={sessionDraft.durationMinutes}
            onChange={(e) =>
              setSessionDraft((d) => ({
                ...d,
                durationMinutes: e.target.value,
              }))
            }
          />
        </label>
        <p className="text-xs text-[var(--muted)]">
          Duration estimates EEE (MET 5.5). Insight only — not subtracted from
          calorie target.
        </p>
        <button
          type="button"
          disabled={savingSession}
          onClick={() => void saveSession(s.id)}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] disabled:opacity-50"
        >
          {savingSession ? "Saving…" : "Save details"}
        </button>
      </div>
    );
  }

  function renderAddExerciseSection(target: DaySession) {
    return (
      <div className="space-y-4 border-t border-[var(--border)] pt-4">
        <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
          Add exercise to “{target.name}”
        </p>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(EXERCISE_GROUPS) as ExerciseGroup[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors min-h-[36px] ${
                group === g
                  ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] text-[var(--muted)]"
              }`}
            >
              {EXERCISE_GROUPS[g].label}
            </button>
          ))}
        </div>

        <input
          className={field}
          placeholder="Search exercise or equipment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto rounded-lg border border-[var(--border)] p-2 bg-[var(--surface)]">
          {filteredExercises.map((ex) => (
            <button
              key={ex.id}
              type="button"
              onClick={() => setExerciseId(ex.id)}
              className={`text-left rounded-md px-3 py-2 text-sm transition-colors min-h-[44px] ${
                exerciseId === ex.id
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "hover:bg-[var(--surface-2)]"
              }`}
            >
              <span className="font-medium block truncate">{ex.name}</span>
              <span className="text-xs text-[var(--muted)] truncate block">
                {ex.equipment}
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-[var(--border)] overflow-hidden">
          <div className="flex items-start justify-between gap-3 px-3 py-2.5 bg-[var(--surface-2)]/50">
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-medium">
                {selectedExercise?.name ?? "Exercise"}
              </p>
              {selectedExercise ? (
                <p className="text-xs text-[var(--muted)]">
                  {selectedExercise.equipment} · {selectedExercise.type}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-1.5">
                {previewSets.map((s, i) => (
                  <SetChip
                    key={i}
                    weightKg={s.weightKg}
                    reps={s.reps}
                    bodyweight={isBodyweight}
                  />
                ))}
              </div>
              {lastSession ? (
                <p className="text-xs text-[var(--muted)]">
                  From last time ({lastSession.date})
                </p>
              ) : last ? (
                <p className="text-xs text-[var(--muted)]">
                  Last: {formatSetWeight(exerciseId, last.weightKg)} × {last.reps}
                </p>
              ) : null}
            </div>
            <EditToggle
              editing={editingLog}
              onClick={() => setEditingLog((v) => !v)}
              label="Adjust"
            />
          </div>
          <div className="px-3 py-3">
            {editingLog ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void logSets();
                }}
                className="space-y-4"
              >
                {draftSets ? (
                  <div className="space-y-3">
                    {draftSets.map((s, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[auto_1fr_1fr] gap-2 items-center"
                      >
                        <span className="text-xs text-[var(--muted)] w-8">
                          {i + 1}
                        </span>
                        <input
                          className={field}
                          type="number"
                          step="0.5"
                          min={0}
                          value={s.weightKg}
                          onChange={(e) => {
                            const next = [...draftSets];
                            next[i] = {
                              ...next[i],
                              weightKg: Number(e.target.value),
                            };
                            setDraftSets(next);
                          }}
                        />
                        <input
                          className={field}
                          type="number"
                          min={1}
                          value={s.reps}
                          onChange={(e) => {
                            const next = [...draftSets];
                            next[i] = {
                              ...next[i],
                              reps: Number(e.target.value),
                            };
                            setDraftSets(next);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    <label className="space-y-1 block">
                      <span className="text-xs text-[var(--muted)]">
                        {isBodyweight ? "Added kg" : "kg"}
                      </span>
                      <input
                        className={field}
                        type="number"
                        step="0.5"
                        min={0}
                        value={weightKg}
                        onChange={(e) => setWeightKg(Number(e.target.value))}
                        required
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-xs text-[var(--muted)]">Reps</span>
                      <input
                        className={field}
                        type="number"
                        min={1}
                        value={reps}
                        onChange={(e) => setReps(Number(e.target.value))}
                        required
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-xs text-[var(--muted)]">Sets</span>
                      <input
                        className={field}
                        type="number"
                        min={1}
                        max={20}
                        value={setsCount}
                        onChange={(e) => setSetsCount(Number(e.target.value))}
                        required
                      />
                    </label>
                  </div>
                )}
                <button
                  type="submit"
                  className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto"
                >
                  Add to “{target.name}”
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => void logSets()}
                className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto"
              >
                Add{" "}
                {draftSets
                  ? `${draftSets.length} set${draftSets.length > 1 ? "s" : ""}`
                  : `${setsCount} set${setsCount > 1 ? "s" : ""}`}{" "}
                to “{target.name}”
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!running ? (
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              Start a session
            </p>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              Start → timer runs → Stop. Only one session at a time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canStart}
              onClick={() => void startSession("Gym")}
              className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] disabled:opacity-50"
            >
              {starting ? "Starting…" : "Start Gym"}
            </button>
            <button
              type="button"
              disabled={!canStart}
              onClick={() => void startSession("Run")}
              className="rounded-md border border-[var(--border)] px-4 py-2.5 text-sm min-h-[44px] disabled:opacity-50"
            >
              Start Run
            </button>
            <button
              type="button"
              disabled={!canStart}
              onClick={() => void startSession("Workout")}
              className="rounded-md border border-[var(--border)] px-4 py-2.5 text-sm min-h-[44px] disabled:opacity-50"
            >
              Start other
            </button>
          </div>
        </div>
      ) : (
        <PanelCard
          title={running.name}
          className="ring-1 ring-[var(--accent)]/50"
          subtitle={
            <p className="text-xs">
              In progress
              {showRunningElsewhere ? ` · started ${running.date}` : ""}
              {" · "}
              {running.groups.length} exercises · {running.stats.totalSets} sets
            </p>
          }
          action={
            <div className="flex flex-wrap gap-1.5 justify-end">
              <EditToggle
                editing={editingSessionId === running.id}
                onClick={() =>
                  editingSessionId === running.id
                    ? setEditingSessionId(null)
                    : startEditSession(running)
                }
              />
              <button
                type="button"
                disabled={stopping}
                onClick={() => void stopSession()}
                className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] disabled:opacity-50"
              >
                {stopping ? "Stopping…" : "Stop"}
              </button>
            </div>
          }
        >
          {editingSessionId === running.id ? (
            renderSessionEditForm(running)
          ) : (
            <div className="flex flex-col items-center gap-2 py-2">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                Elapsed
              </p>
              <span className="font-[family-name:var(--font-syne)] tabular-nums tracking-tight text-4xl sm:text-5xl text-[var(--foreground)]">
                {formatElapsed(elapsedMs)}
              </span>
              <p className="text-xs text-[var(--muted)]">
                Stop to lock ~{Math.max(1, Math.round(elapsedMs / 60000))} min
                and free the next session.
              </p>
            </div>
          )}
          <div className="space-y-4 mt-4 border-t border-[var(--border)] pt-4">
            {renderExerciseList(running)}
          </div>
          {renderAddExerciseSection(running)}
        </PanelCard>
      )}

      {sessionMessage ? (
        <p className="text-sm text-[var(--accent)]">{sessionMessage}</p>
      ) : null}

      {(showRunningElsewhere || completedSessions.length > 0) && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            {showRunningElsewhere
              ? `Other sessions · ${date}`
              : `Finished today`}
          </p>
          {completedSessions.length === 0 && !showRunningElsewhere ? null : (
            <div className="space-y-3">
              {completedSessions.map((s) => {
                const isSelected = selectedId === s.id && !running;
                const isEditingDetails = editingSessionId === s.id;
                return (
                  <PanelCard
                    key={s.id}
                    title={s.name}
                    className={
                      isSelected ? "ring-1 ring-[var(--accent)]/40" : undefined
                    }
                    subtitle={
                      <div className="space-y-1">
                        <p className="text-xs">
                          {s.groups.length} exercises · {s.stats.totalSets} sets
                          {" · "}
                          {formatDurationLabel(s.durationMinutes)}
                          {s.caloriesBurned
                            ? ` · ${Math.round(s.caloriesBurned)} kcal EEE`
                            : ""}
                        </p>
                        {!isSelected && s.groups.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {s.groups.map((g) => (
                              <span
                                key={g.lift}
                                className="text-[10px] text-[var(--muted)] border border-[var(--border)] rounded px-1.5 py-0.5"
                              >
                                {g.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    }
                    action={
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {!running ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedId(null);
                                onClearFocus?.();
                              } else {
                                openFinishedSession(s);
                              }
                            }}
                            className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] text-[var(--accent)] min-h-[44px]"
                          >
                            {isSelected ? "Done" : "Edit"}
                          </button>
                        ) : null}
                        {isSelected ? (
                          <EditToggle
                            editing={isEditingDetails}
                            onClick={() =>
                              isEditingDetails
                                ? setEditingSessionId(null)
                                : startEditSession(s)
                            }
                            label="Details"
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void deleteSession(s.id)}
                          className="text-xs px-2.5 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] min-h-[44px]"
                        >
                          Remove
                        </button>
                      </div>
                    }
                  >
                    {isSelected && !running ? (
                      <div className="space-y-4">
                        {isEditingDetails ? renderSessionEditForm(s) : null}
                        <div className="space-y-3">
                          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                            Exercises & sets
                          </p>
                          {renderExerciseList(s)}
                        </div>
                        {renderAddExerciseSection(s)}
                      </div>
                    ) : null}
                  </PanelCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!running && sessions.length === 0 ? (
        <p className="text-sm text-[var(--muted)] text-center py-6 rounded-xl border border-dashed border-[var(--border)]">
          No sessions for this day yet.
        </p>
      ) : null}
    </div>
  );
}
