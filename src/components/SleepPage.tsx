"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { AiCoachPanel } from "@/components/AiCoachPanel";
import { apiFetch } from "@/lib/api-fetch";
import { invalidateAfterSleep } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import {
  computeSleepStats,
  consistencyLabel,
  formatClockTime,
  formatSleepWindow,
  hoursFromUntil,
  qualityLabel,
  SLEEP_HOURS_MAX,
  SLEEP_HOURS_MIN,
  sleepBandLabel,
  sleepDeficitTip,
} from "@/lib/sleep";
import { todayISODate } from "@/lib/tdee";

type SleepRow = {
  id: string;
  date: string;
  fromTime?: string | null;
  untilTime?: string | null;
  hours: number;
  quality: number;
  note?: string | null;
};

type SleepPayload = {
  date: string;
  row: SleepRow | null;
};

type SleepListPayload = {
  range: string;
  rows: SleepRow[];
};

type ProfilePayload = {
  targets: {
    deficit: number;
    proteinMinG?: number;
  } | null;
};

type StatsRange = "7d" | "30d" | "90d" | "all";

const RANGE_LABELS: Record<StatsRange, string> = {
  "7d": "Week",
  "30d": "Month",
  "90d": "3 months",
  all: "All time",
};

function clampDate(d: string): string {
  const today = todayISODate();
  return d > today ? today : d;
}

const field =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] min-h-[44px]";

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)]/40 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        {label}
      </p>
      <p className="text-sm font-medium mt-1">{value}</p>
      {hint ? (
        <p className="text-[11px] text-[var(--muted)] mt-0.5 leading-snug">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SleepPage() {
  const queryClient = useQueryClient();
  const today = todayISODate();
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [quality, setQuality] = useState(3);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [statsRange, setStatsRange] = useState<StatsRange>("30d");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    date: string;
    from: string;
    until: string;
    quality: string;
    note: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const sleepQuery = useQuery({
    queryKey: queryKeys.sleep(date),
    queryFn: () =>
      apiFetch<SleepPayload>(
        `/api/sleep?date=${encodeURIComponent(date)}`,
      ),
  });

  const listQuery = useQuery({
    queryKey: queryKeys.sleepList(statsRange),
    queryFn: () =>
      apiFetch<SleepListPayload>(
        `/api/sleep?range=${encodeURIComponent(statsRange)}`,
      ),
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });

  const row = sleepQuery.data?.row ?? null;
  const targets = profileQuery.data?.targets ?? null;
  const entries = listQuery.data?.rows ?? [];
  const stats = useMemo(() => computeSleepStats(entries), [entries]);

  useEffect(() => {
    if (!row) {
      setFrom("");
      setUntil("");
      setQuality(3);
      setNote("");
      return;
    }
    setFrom(formatClockTime(row.fromTime) || "");
    setUntil(formatClockTime(row.untilTime) || "");
    setQuality(row.quality);
    setNote(row.note ?? "");
  }, [row]);

  const hoursNum = useMemo(
    () => hoursFromUntil(from, until),
    [from, until],
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !until) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/sleep", {
        method: "POST",
        body: JSON.stringify({
          date,
          from,
          until,
          quality,
          note: note.trim() || null,
        }),
      });
      await invalidateAfterSleep(queryClient);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(entry: SleepRow) {
    setEditingId(entry.id);
    setEditDraft({
      date: entry.date,
      from: formatClockTime(entry.fromTime) || "",
      until: formatClockTime(entry.untilTime) || "",
      quality: String(entry.quality),
      note: entry.note ?? "",
    });
  }

  async function saveEdit(id: string) {
    if (!editDraft?.from || !editDraft.until) return;
    const q = Number(editDraft.quality);
    if (!Number.isFinite(q) || q < 1 || q > 5) return;
    setSavingEdit(true);
    try {
      await apiFetch("/api/sleep", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          date: editDraft.date,
          from: editDraft.from,
          until: editDraft.until,
          quality: q,
          note: editDraft.note.trim() || null,
        }),
      });
      setEditingId(null);
      setEditDraft(null);
      await invalidateAfterSleep(queryClient);
    } finally {
      setSavingEdit(false);
    }
  }

  async function removeEntry(id: string) {
    setSavingEdit(true);
    try {
      await apiFetch(`/api/sleep?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (editingId === id) {
        setEditingId(null);
        setEditDraft(null);
      }
      await invalidateAfterSleep(queryClient);
    } finally {
      setSavingEdit(false);
    }
  }

  const bandTip =
    hoursNum != null && hoursNum > 0
      ? sleepBandLabel(hoursNum)
      : `Aim for ${SLEEP_HOURS_MIN}–${SLEEP_HOURS_MAX}h (adults).`;
  const crossTip =
    hoursNum != null && hoursNum > 0
      ? sleepDeficitTip({
          hours: hoursNum,
          quality,
          deficitKcal: targets?.deficit,
          proteinMinG: targets?.proteinMinG,
        })
      : null;

  const consistency = consistencyLabel(stats.hoursStdDev);

  return (
    <AppShell title="Sleep">
      <div className="space-y-8 max-w-lg">
        <section className="space-y-2">
          <p className="text-sm text-[var(--muted)]">
            Log when you went to bed and woke up. Date is the morning you woke
            (until). Overnight from→until is handled automatically. Adults
            generally do best in the {SLEEP_HOURS_MIN}–{SLEEP_HOURS_MAX}h band.
          </p>
        </section>

        <form
          onSubmit={(e) => void save(e)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3"
        >
          <label className="space-y-1 block">
            <span className="text-xs text-[var(--muted)]">Morning of (until)</span>
            <input
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(clampDate(e.target.value))}
              className={field}
            />
          </label>
          {date !== today ? (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="text-xs text-[var(--accent)] hover:underline min-h-[44px]"
            >
              Jump to today
            </button>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-xs text-[var(--muted)]">From</span>
              <input
                type="time"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={field}
                required
              />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-[var(--muted)]">Until</span>
              <input
                type="time"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className={field}
                required
              />
            </label>
          </div>
          {hoursNum != null ? (
            <p className="text-sm">
              {hoursNum}h slept
              {from && until ? (
                <span className="text-[var(--muted)]">
                  {" "}
                  ({from} → {until})
                </span>
              ) : null}
            </p>
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Enter from and until to see duration.
            </p>
          )}
          <fieldset className="space-y-2">
            <legend className="text-xs text-[var(--muted)]">
              Quality · {qualityLabel(quality)}
            </legend>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuality(q)}
                  className={`min-h-[44px] min-w-[44px] rounded-md border text-sm ${
                    quality === q
                      ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="space-y-1 block">
            <span className="text-xs text-[var(--muted)]">Note (optional)</span>
            <textarea
              className={`${field} min-h-[80px] resize-y`}
              placeholder="Late caffeine, stress, felt recovered…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <p className="text-xs text-[var(--muted)]">{bandTip}</p>
          {crossTip ? (
            <p className="text-xs text-[var(--warn)]">{crossTip}</p>
          ) : null}
          {error ? <p className="text-sm text-[var(--warn)]">{error}</p> : null}
          <button
            type="submit"
            disabled={saving || !from || !until || hoursNum == null}
            className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium min-h-[44px] w-full sm:w-auto disabled:opacity-50"
          >
            {saving ? "Saving…" : row ? "Update" : "Log sleep"}
          </button>
        </form>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm text-[var(--muted)]">Stats</h2>
            <div className="flex flex-wrap gap-1.5 ml-auto">
              {(Object.keys(RANGE_LABELS) as StatsRange[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setStatsRange(r)}
                  className={`px-2.5 py-1.5 rounded text-xs border min-h-[36px] ${
                    statsRange === r
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {listQuery.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : stats.nights === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No nights logged in this range yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <StatCell
                label="Nights"
                value={String(stats.nights)}
                hint={`${stats.shortNights} short · ${stats.longNights} long`}
              />
              <StatCell
                label="Avg duration"
                value={stats.avgHours != null ? `${stats.avgHours}h` : "—"}
                hint={
                  stats.inBandPct != null
                    ? `${stats.inBandPct}% in ${SLEEP_HOURS_MIN}–${SLEEP_HOURS_MAX}h`
                    : null
                }
              />
              <StatCell
                label="Avg quality"
                value={
                  stats.avgQuality != null
                    ? `${stats.avgQuality}/5`
                    : "—"
                }
              />
              <StatCell
                label="Consistency"
                value={
                  stats.hoursStdDev != null
                    ? `±${stats.hoursStdDev}h`
                    : "—"
                }
                hint={consistency}
              />
              <StatCell
                label="Avg bedtime"
                value={stats.avgBedtime ?? "—"}
                hint={
                  stats.avgWake ? `Avg wake ${stats.avgWake}` : null
                }
              />
              <StatCell
                label="In-band streak"
                value={
                  stats.goodStreak > 0
                    ? `${stats.goodStreak} night${stats.goodStreak === 1 ? "" : "s"}`
                    : "0"
                }
                hint="Consecutive nights in 7–9h (from latest)"
              />
              <StatCell
                label="Shortest / longest"
                value={
                  stats.shortest != null && stats.longest != null
                    ? `${stats.shortest}h / ${stats.longest}h`
                    : "—"
                }
              />
              <StatCell
                label="Weekday / weekend"
                value={
                  stats.weekdayAvgHours != null ||
                  stats.weekendAvgHours != null
                    ? `${stats.weekdayAvgHours ?? "—"}h / ${stats.weekendAvgHours ?? "—"}h`
                    : "—"
                }
                hint="Avg hours Mon–Fri vs Sat–Sun"
              />
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm text-[var(--muted)]">
            Entries · {RANGE_LABELS[statsRange]}
          </h2>
          {listQuery.isLoading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No entries yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg overflow-hidden">
              {entries.map((entry) => {
                const editing = editingId === entry.id;
                const draft = editing ? editDraft : null;
                return (
                  <li
                    key={entry.id}
                    className="px-3 py-3 bg-[var(--surface)] text-sm"
                  >
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
                                date: clampDate(e.target.value),
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
                              setEditDraft({
                                ...draft,
                                quality: e.target.value,
                              })
                            }
                          />
                          <input
                            className={field}
                            type="time"
                            value={draft.from}
                            onChange={(e) =>
                              setEditDraft({
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
                              setEditDraft({
                                ...draft,
                                until: e.target.value,
                              })
                            }
                          />
                        </div>
                        <textarea
                          className={`${field} min-h-[60px] resize-y`}
                          placeholder="Note"
                          value={draft.note}
                          onChange={(e) =>
                            setEditDraft({ ...draft, note: e.target.value })
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => void saveEdit(entry.id)}
                            className="text-xs text-[var(--accent)] font-medium min-h-[44px] px-2"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(null);
                              setEditDraft(null);
                            }}
                            className="text-xs text-[var(--muted)] min-h-[44px] px-2"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => void removeEntry(entry.id)}
                            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px] px-2 ml-auto"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {entry.date}
                            {entry.hours < SLEEP_HOURS_MIN ? (
                              <span className="text-[var(--warn)] font-normal text-xs">
                                {" "}
                                · short
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-[var(--muted)]">
                            {formatSleepWindow(
                              entry.fromTime,
                              entry.untilTime,
                              entry.hours,
                            )}{" "}
                            · {qualityLabel(entry.quality)}
                            {entry.note ? ` · ${entry.note}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="text-xs px-3 py-2 rounded-md border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px]"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={savingEdit}
                            onClick={() => void removeEntry(entry.id)}
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

        <AiCoachPanel
          scope="sleep"
          title="Sleep tips"
          buttonLabel="Get AI sleep tips"
          placeholder='Optional: e.g. "wake up at 5am for gym"'
        />
      </div>
    </AppShell>
  );
}
