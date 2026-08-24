"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import {
  bucketTodayReminders,
  zonedParts,
} from "@/lib/remind-schedule";
import type { ChecklistListView } from "@/lib/checklists";
import { queryKeys } from "@/lib/query-keys";
import { todayISODate } from "@/lib/tdee";
import { readUserStorageItem, writeUserStorageItem } from "@/lib/user-storage";

type ListsPayload = { lists: ChecklistListView[]; date: string };
type ProfilePayload = { userId?: string };

const DEDUPE_BASE = "checklist-local-remind";

function markFired(userId: string | undefined, keys: string[]) {
  if (keys.length === 0) return;
  const stored = readUserStorageItem(DEDUPE_BASE, userId) ?? "";
  const set = new Set(stored.split(",").filter(Boolean));
  for (const k of keys) set.add(k);
  writeUserStorageItem(DEDUPE_BASE, userId, [...set].join(",").slice(-2000));
}

function alreadyFired(userId: string | undefined, key: string, mem: Set<string>) {
  if (mem.has(key)) return true;
  const stored = readUserStorageItem(DEDUPE_BASE, userId) ?? "";
  if (stored.split(",").includes(key)) {
    mem.add(key);
    return true;
  }
  return false;
}

/**
 * Local notifications while the app is open:
 * - Retro: anything due earlier today that wasn’t pinged yet
 * - Live: items as their due time arrives
 */
export function ReminderLocalTicker() {
  const fired = useRef(new Set<string>());

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
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    function tick() {
      const lists = listsQuery.data?.lists;
      if (!lists) return;

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { date } = zonedParts(tz);
      const { overdue } = bucketTodayReminders(lists, tz);

      const pending = overdue.filter((row) => {
        const key = `${row.itemId}:${date}`;
        return !alreadyFired(userId, key, fired.current);
      });
      if (pending.length === 0) return;

      const keys = pending.map((r) => `${r.itemId}:${date}`);
      for (const k of keys) fired.current.add(k);
      markFired(userId, keys);

      try {
        if (pending.length === 1) {
          const r = pending[0];
          new Notification("Missed reminder", {
            body: `${r.dueTime} · ${r.listName}: ${r.title}`,
            tag: `local-${r.itemId}`,
            icon: "/icons/icon-192.png",
          });
        } else {
          const preview = pending
            .slice(0, 3)
            .map((r) => `${r.dueTime} ${r.title}`)
            .join(" · ");
          new Notification(`${pending.length} reminders waiting`, {
            body: preview,
            tag: `local-retro-${date}`,
            icon: "/icons/icon-192.png",
          });
        }
      } catch {
        /* ignore */
      }
    }

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [listsQuery.data, userId]);

  return null;
}
