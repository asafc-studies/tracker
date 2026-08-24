"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import {
  bucketTodayReminders,
  zonedParts,
} from "@/lib/remind-schedule";
import type { ChecklistListView } from "@/lib/checklists";
import { queryKeys } from "@/lib/query-keys";
import { todayISODate } from "@/lib/tdee";
import { readUserStorageItem, writeUserStorageItem } from "@/lib/user-storage";

export const REMINDERS_READY_EVENT = "recomp-reminders-ready";

type ListsPayload = { lists: ChecklistListView[]; date: string };
type ProfilePayload = { userId?: string };

const DEDUPE_BASE = "checklist-local-remind";

function markFired(userId: string | undefined, keys: string[]) {
  if (keys.length === 0) return;
  // Prefer scoped key; also write unscoped fallback when profile hasn’t loaded.
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

async function showLocalNotification(
  title: string,
  body: string,
  tag: string,
) {
  const opts: NotificationOptions = {
    body,
    tag,
    icon: "/icons/icon-192.png",
    requireInteraction: false,
  };
  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, opts);
        return true;
      }
    }
  } catch {
    /* fall through */
  }
  try {
    const n = new Notification(title, opts);
    // Some browsers drop the notification if the instance is GC’d immediately.
    window.setTimeout(() => n.close(), 20_000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Local notifications while the app is open:
 * - Retro: anything due earlier today that wasn’t pinged yet
 * - Live: items as their due time arrives
 */
export function ReminderLocalTicker() {
  const queryClient = useQueryClient();
  const fired = useRef(new Set<string>());
  const listsRef = useRef<ChecklistListView[] | undefined>(undefined);
  const userIdRef = useRef<string | undefined>(undefined);

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
    refetchInterval: 30_000,
  });

  listsRef.current = listsQuery.data?.lists;
  userIdRef.current = userId;

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    async function tick() {
      if (Notification.permission !== "granted") return;

      const lists = listsRef.current;
      if (!lists?.length) return;

      const uid = userIdRef.current;
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { date } = zonedParts(tz);
      const { overdue } = bucketTodayReminders(lists, tz);

      const pending = overdue.filter((row) => {
        const key = `${row.itemId}:${date}`;
        return !alreadyFired(uid, key, fired.current);
      });
      if (pending.length === 0) return;

      const keys = pending.map((r) => `${r.itemId}:${date}`);
      for (const k of keys) fired.current.add(k);
      markFired(uid, keys);

      if (pending.length === 1) {
        const r = pending[0];
        await showLocalNotification(
          "Checklist reminder",
          `${r.dueTime} · ${r.listName}: ${r.title}`,
          `local-${r.itemId}`,
        );
      } else {
        const preview = pending
          .slice(0, 3)
          .map((r) => `${r.dueTime} ${r.title}`)
          .join(" · ");
        await showLocalNotification(
          `${pending.length} reminders waiting`,
          preview,
          `local-retro-${date}`,
        );
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), 15_000);

    function onReady() {
      void queryClient.invalidateQueries({ queryKey: ["checklists"] });
      void tick();
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

  return null;
}
