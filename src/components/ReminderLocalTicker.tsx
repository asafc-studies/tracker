"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import type { ChecklistListView } from "@/lib/checklists";
import { formatLocalHHMM } from "@/lib/local-time";
import { queryKeys } from "@/lib/query-keys";
import {
  freqAppliesToday,
  hhmmToMinutes,
  type TodayReminderRow,
} from "@/lib/remind-schedule";
import type { RemindFreq } from "@/lib/security";
import { todayISODate } from "@/lib/tdee";
import { readUserStorageItem, writeUserStorageItem } from "@/lib/user-storage";

export const REMINDERS_READY_EVENT = "recomp-reminders-ready";

type ListsPayload = { lists: ChecklistListView[]; date: string };
type ProfilePayload = { userId?: string };

const DEDUPE_BASE = "checklist-local-remind-v2";

function markFired(userId: string | undefined, keys: string[]) {
  if (keys.length === 0) return;
  const stored =
    readUserStorageItem(DEDUPE_BASE, userId) ??
    (typeof window !== "undefined"
      ? window.localStorage.getItem(DEDUPE_BASE)
      : null) ??
    "";
  const set = new Set(stored.split(",").filter(Boolean));
  for (const k of keys) set.add(k);
  const joined = [...set].join(",").slice(-2000);
  if (userId) writeUserStorageItem(DEDUPE_BASE, userId, joined);
  else if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(DEDUPE_BASE, joined);
    } catch {
      /* ignore */
    }
  }
}

function alreadyFired(
  userId: string | undefined,
  key: string,
  mem: Set<string>,
) {
  if (mem.has(key)) return true;
  const stored =
    readUserStorageItem(DEDUPE_BASE, userId) ??
    (typeof window !== "undefined"
      ? window.localStorage.getItem(DEDUPE_BASE)
      : null) ??
    "";
  if (stored.split(",").includes(key)) {
    mem.add(key);
    return true;
  }
  return false;
}

/** Best-effort OS toast — on Android prefer the service worker. */
async function showOsNotification(title: string, body: string, tag: string) {
  if (typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  const opts: NotificationOptions = {
    body,
    tag,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  };
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, opts);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(title, opts);
    window.setTimeout(() => n.close(), 25_000);
    return true;
  } catch {
    return false;
  }
}

/** Due items for *right now* using the browser's local clock (not Intl/server TZ). */
function localOverdue(lists: ChecklistListView[]): {
  date: string;
  overdue: TodayReminderRow[];
} {
  const now = new Date();
  const date = todayISODate(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const weekday = now.getDay();
  const overdue: TodayReminderRow[] = [];

  for (const list of lists) {
    for (const item of list.items) {
      if (!item.dueTime || item.checked) continue;
      const raw = (item.remindFreq ?? "off") as RemindFreq;
      const freq: RemindFreq = raw === "off" ? "daily" : raw;
      if (!freqAppliesToday(freq, weekday, item.remindWeekday ?? null)) continue;
      const dueMins = hhmmToMinutes(item.dueTime);
      if (dueMins == null || dueMins > nowMins) continue;
      overdue.push({
        itemId: item.id,
        title: item.title,
        listId: list.id,
        listName: list.name,
        dueTime: item.dueTime,
        dueMins,
        checked: false,
        remindFreq: freq,
      });
    }
  }
  overdue.sort((a, b) => a.dueMins - b.dueMins);
  return { date, overdue };
}

type AlertState = { title: string; body: string };

/**
 * Local reminders while the app is open.
 * Always shows an in-app banner; OS notification is best-effort only.
 */
export function ReminderLocalTicker() {
  const queryClient = useQueryClient();
  const fired = useRef(new Set<string>());
  const listsRef = useRef<ChecklistListView[] | undefined>(undefined);
  const userIdRef = useRef<string | undefined>(undefined);
  const [alert, setAlert] = useState<AlertState | null>(null);

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });
  const userId = profileQuery.data?.userId;
  const today = todayISODate();

  const listsQuery = useQuery({
    queryKey: queryKeys.checklists(today),
    queryFn: () =>
      apiFetch<ListsPayload>(
        `/api/checklists?date=${encodeURIComponent(today)}`,
      ),
    refetchInterval: 10_000,
  });

  listsRef.current = listsQuery.data?.lists;
  userIdRef.current = userId;

  useEffect(() => {
    if (typeof window === "undefined") return;

    async function tick() {
      const lists = listsRef.current;
      if (!lists?.length) return;

      const uid = userIdRef.current;
      const { date, overdue } = localOverdue(lists);

      const pending = overdue.filter((row) => {
        const key = `${row.itemId}:${date}:${row.dueTime}`;
        return !alreadyFired(uid, key, fired.current);
      });
      if (pending.length === 0) return;

      const title =
        pending.length === 1
          ? "Checklist reminder"
          : `${pending.length} reminders waiting`;
      const body =
        pending.length === 1
          ? `${pending[0].dueTime} · ${pending[0].listName}: ${pending[0].title}`
          : pending
              .slice(0, 3)
              .map((r) => `${r.dueTime} ${r.title}`)
              .join(" · ");

      // In-app is the reliable signal (OS toasts often hide while focused).
      setAlert({ title, body });

      const tag =
        pending.length === 1
          ? `local-${pending[0].itemId}`
          : `local-retro-${date}`;
      void showOsNotification(title, body, tag);

      const keys = pending.map((r) => `${r.itemId}:${date}:${r.dueTime}`);
      for (const k of keys) fired.current.add(k);
      markFired(uid, keys);
    }

    void tick();
    const id = window.setInterval(() => void tick(), 5_000);

    function onReady() {
      void queryClient.invalidateQueries({ queryKey: ["checklists"] });
      window.setTimeout(() => void tick(), 300);
    }
    function onVis() {
      if (document.visibilityState === "visible") void tick();
    }

    window.addEventListener(REMINDERS_READY_EVENT, onReady);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.clearInterval(id);
      window.removeEventListener(REMINDERS_READY_EVENT, onReady);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [queryClient]);

  if (!alert) return null;

  return (
    <div
      role="alert"
      className="fixed z-[60] left-3 right-3 md:left-auto md:right-6 md:w-[22rem] bottom-20 md:bottom-6 rounded-lg border border-[var(--accent)] bg-[var(--surface)] shadow-lg px-4 py-3"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--foreground)]">
            {alert.title}
          </p>
          <p className="text-xs text-[var(--muted)] mt-0.5 break-words">
            {alert.body}
          </p>
          <p className="text-[10px] text-[var(--muted)] mt-1.5">
            {formatLocalHHMM()} local
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAlert(null)}
          className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[44px] px-2"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
