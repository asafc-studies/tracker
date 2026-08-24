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
