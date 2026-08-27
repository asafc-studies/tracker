"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { ChecklistListView } from "@/lib/checklists";
import { queryKeys } from "@/lib/query-keys";
import {
  bucketTodayReminders,
  type TodayReminderRow,
} from "@/lib/remind-schedule";
import { todayISODate } from "@/lib/tdee";

type ListsPayload = { lists: ChecklistListView[]; date: string };

function ReminderRow({
  row,
  tone,
  busy,
  onCheck,
}: {
  row: TodayReminderRow;
  tone: "missed" | "soon" | "done";
  busy: boolean;
  onCheck?: () => void;
}) {
  const toneClass =
    tone === "missed"
      ? "text-[var(--warn)]"
      : tone === "soon"
        ? "text-[var(--accent)]"
        : "text-[var(--muted)]";

  return (
    <li className="flex items-center gap-3 py-2.5 border-b border-[var(--border)]/60 last:border-0">
      {onCheck ? (
        <button
          type="button"
          disabled={busy}
          onClick={onCheck}
          aria-label={`Check off ${row.title}`}
          className="shrink-0 h-5 w-5 rounded-full border border-[var(--border)] hover:border-[var(--accent)] disabled:opacity-40"
        />
      ) : (
        <span
          className="shrink-0 h-5 w-5 rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] flex items-center justify-center text-[10px] text-[var(--accent)]"
          aria-hidden
        >
          ✓
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm truncate ${
            tone === "done" ? "line-through text-[var(--muted)]" : ""
          }`}
        >
          {row.title}
        </p>
        <p className="text-[11px] text-[var(--muted)] truncate">
          {row.listName}
        </p>
      </div>
      <time className={`shrink-0 text-xs tabular-nums font-medium ${toneClass}`}>
        {row.dueTime}
      </time>
    </li>
  );
}

export function TodayRemindersPanel() {
  const queryClient = useQueryClient();
  const today = todayISODate();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const listsQuery = useQuery({
    queryKey: queryKeys.checklists(today),
    queryFn: () =>
      apiFetch<ListsPayload>(
        `/api/checklists?date=${encodeURIComponent(today)}&tz=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}`,
      ),
    refetchInterval: 60_000,
  });

  const { overdue, upcoming, done } = useMemo(() => {
    void tick;
    return bucketTodayReminders(listsQuery.data?.lists ?? []);
  }, [listsQuery.data, tick]);

  const total = overdue.length + upcoming.length + done.length;
  if (!listsQuery.data && listsQuery.isLoading) return null;
  if (total === 0) return null;

  async function checkOff(itemId: string) {
    setBusyId(itemId);
    try {
      await apiFetch("/api/checklists", {
        method: "POST",
        body: JSON.stringify({
          action: "set_checked",
          itemId,
          date: today,
          checked: true,
          checkedAt: new Date().toISOString(),
        }),
      });
      await queryClient.invalidateQueries({ queryKey: ["checklists"] });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Today’s reminders
          </p>
          <p className="text-[11px] text-[var(--muted)] mt-0.5">
            {overdue.length > 0
              ? `${overdue.length} missed`
              : upcoming.length > 0
                ? `${upcoming.length} coming up`
                : "All clear"}
            {done.length > 0 ? ` · ${done.length} done` : ""}
          </p>
        </div>
        <Link
          href="/lists"
          className="text-sm text-[var(--accent)] hover:underline min-h-[44px] inline-flex items-center"
        >
          Lists
        </Link>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/80 px-3 overflow-hidden">
        {overdue.length > 0 ? (
          <div className="pt-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--warn)] px-1 mb-0.5">
              Missed
            </p>
            <ul>
              {overdue.map((row) => (
                <ReminderRow
                  key={row.itemId}
                  row={row}
                  tone="missed"
                  busy={busyId === row.itemId}
                  onCheck={() => void checkOff(row.itemId)}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {upcoming.length > 0 ? (
          <div className={overdue.length > 0 ? "pt-1" : "pt-2"}>
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] px-1 mb-0.5">
              Up next
            </p>
            <ul>
              {upcoming.map((row) => (
                <ReminderRow
                  key={row.itemId}
                  row={row}
                  tone="soon"
                  busy={busyId === row.itemId}
                  onCheck={() => void checkOff(row.itemId)}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {done.length > 0 && overdue.length === 0 && upcoming.length === 0 ? (
          <div className="pt-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)] px-1 mb-0.5">
              Done today
            </p>
            <ul>
              {done.slice(0, 4).map((row) => (
                <ReminderRow
                  key={row.itemId}
                  row={row}
                  tone="done"
                  busy={false}
                />
              ))}
            </ul>
          </div>
        ) : null}

        {overdue.length === 0 &&
        upcoming.length === 0 &&
        done.length > 0 ? null : done.length > 0 &&
          (overdue.length > 0 || upcoming.length > 0) ? (
          <p className="text-[11px] text-[var(--muted)] px-1 py-2">
            {done.length} already checked
          </p>
        ) : null}
      </div>
    </section>
  );
}
