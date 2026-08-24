import type { RemindFreq } from "@/lib/security";

/** Parts of "now" in an IANA timezone. */
export function zonedParts(timeZone: string, at = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).map((p) => [p.type, p.value]),
  );
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const hhmm = `${parts.hour}:${parts.minute}`;
  const weekday = weekdayMap[parts.weekday ?? ""] ?? at.getDay();
  return { date, hhmm, weekday };
}

export function freqAppliesToday(
  freq: RemindFreq,
  weekday: number,
  remindWeekday: number | null,
): boolean {
  if (freq === "off") return false;
  if (freq === "daily") return true;
  if (freq === "weekdays") return weekday >= 1 && weekday <= 5;
  if (freq === "weekly") {
    return remindWeekday != null && remindWeekday === weekday;
  }
  return false;
}

export function hhmmToMinutes(hhmm: string): number | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export type TodayReminderRow = {
  itemId: string;
  title: string;
  listId: string;
  listName: string;
  dueTime: string;
  dueMins: number;
  checked: boolean;
  remindFreq: RemindFreq;
};

export type TodayReminderBuckets = {
  overdue: TodayReminderRow[];
  upcoming: TodayReminderRow[];
  done: TodayReminderRow[];
};

type ListLike = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    title: string;
    dueTime: string | null;
    remindFreq?: RemindFreq | string | null;
    remindWeekday?: number | null;
    checked: boolean;
  }>;
};

/** Split today's scheduled reminders into missed / upcoming / already checked. */
export function bucketTodayReminders(
  lists: ListLike[],
  timeZone = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "UTC",
  at = new Date(),
): TodayReminderBuckets {
  const { hhmm, weekday } = zonedParts(timeZone, at);
  const nowMins = hhmmToMinutes(hhmm) ?? 0;
  const overdue: TodayReminderRow[] = [];
  const upcoming: TodayReminderRow[] = [];
  const done: TodayReminderRow[] = [];

  for (const list of lists) {
    for (const item of list.items) {
      const freq = (item.remindFreq ?? "off") as RemindFreq;
      if (freq === "off" || !item.dueTime) continue;
      if (!freqAppliesToday(freq, weekday, item.remindWeekday ?? null)) continue;
      const dueMins = hhmmToMinutes(item.dueTime);
      if (dueMins == null) continue;
      const row: TodayReminderRow = {
        itemId: item.id,
        title: item.title,
        listId: list.id,
        listName: list.name,
        dueTime: item.dueTime,
        dueMins,
        checked: item.checked,
        remindFreq: freq,
      };
      if (item.checked) done.push(row);
      else if (dueMins <= nowMins) overdue.push(row);
      else upcoming.push(row);
    }
  }

  overdue.sort((a, b) => a.dueMins - b.dueMins);
  upcoming.sort((a, b) => a.dueMins - b.dueMins);
  done.sort((a, b) => a.dueMins - b.dueMins);
  return { overdue, upcoming, done };
}
