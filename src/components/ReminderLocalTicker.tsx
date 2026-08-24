"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import {
  freqAppliesToday,
  zonedParts,
} from "@/lib/remind-schedule";
import type { ChecklistListView } from "@/lib/checklists";
import { queryKeys } from "@/lib/query-keys";
import type { RemindFreq } from "@/lib/security";
import { todayISODate } from "@/lib/tdee";
import { readUserStorageItem, writeUserStorageItem } from "@/lib/user-storage";

type ListsPayload = { lists: ChecklistListView[]; date: string };
type ProfilePayload = { userId?: string };

const DEDUPE_BASE = "checklist-local-remind";

/** In-app Notification fallback while the tab/PWA is open. */
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
    const lists = listsQuery.data?.lists;
    if (!lists) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { date, hhmm, weekday } = zonedParts(tz);
    const [nowH, nowM] = hhmm.split(":").map(Number);
    const nowMins = nowH * 60 + nowM;

    for (const list of lists) {
      for (const item of list.items) {
        const freq = (item.remindFreq ?? "off") as RemindFreq;
        if (freq === "off" || !item.dueTime || item.checked) continue;
        if (!freqAppliesToday(freq, weekday, item.remindWeekday)) continue;
        const [h, m] = item.dueTime.split(":").map(Number);
        const dueMins = h * 60 + m;
        const delta = nowMins - dueMins;
        if (delta < 0 || delta > 2) continue;

        const key = `${item.id}:${date}`;
        if (fired.current.has(key)) continue;
        const stored = readUserStorageItem(DEDUPE_BASE, userId);
        if (stored?.includes(key)) {
          fired.current.add(key);
          continue;
        }

        fired.current.add(key);
        writeUserStorageItem(
          DEDUPE_BASE,
          userId,
          `${stored ? `${stored},` : ""}${key}`.slice(-2000),
        );
        try {
          new Notification("Recomp Tracker", {
            body: `${list.name}: ${item.title}`,
            tag: `local-${item.id}`,
            icon: "/icons/icon-192.png",
          });
        } catch {
          /* ignore */
        }
      }
    }
  }, [listsQuery.data, userId]);

  return null;
}
