import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  freqAppliesToday,
  hhmmToMinutes,
  itemActiveOnDate,
  skipRemindOnCreateDay,
  zonedParts,
} from "@/lib/remind-schedule";
import type { RemindFreq } from "@/lib/security";
import { todayISODate } from "@/lib/tdee";

export type DueReminder = {
  itemId: string;
  title: string;
  listName: string;
  dueTime: string;
  remindFreq: RemindFreq;
  userId: string;
};

export { freqAppliesToday, zonedParts } from "@/lib/remind-schedule";

function remindStamp(date: string, dueTime: string) {
  return `${date}@${dueTime}`;
}

/**
 * Find unchecked reminders for a timezone.
 * - window: due in the last `windowMinutes` (for frequent external cron → Android push)
 * - digest: anything already due today (morning catch-up)
 */
export async function findDueReminders(opts: {
  timeZone: string;
  userId?: string;
  mode?: "window" | "digest";
  /** Only used for mode=window (default 15). */
  windowMinutes?: number;
  mark?: boolean;
}): Promise<DueReminder[]> {
  const {
    timeZone,
    userId,
    mode = "window",
    windowMinutes = 15,
    mark = false,
  } = opts;
  const { date, weekday, hhmm } = zonedParts(timeZone);
  const nowMins = hhmmToMinutes(hhmm) ?? 0;

  const db = await getDb();
  const lists = userId
    ? await db.query.checklistLists.findMany({
        where: eq(schema.checklistLists.userId, userId),
        with: { items: true },
      })
    : await db.query.checklistLists.findMany({
        with: { items: true },
      });

  const due: DueReminder[] = [];
  for (const list of lists) {
    for (const item of list.items) {
      const raw = (item.remindFreq ?? "off") as RemindFreq;
      if (!item.dueTime) continue;
      const freq: RemindFreq = raw === "off" ? "daily" : raw;
      if (!freqAppliesToday(freq, weekday, item.remindWeekday)) continue;

      const dueMins = hhmmToMinutes(item.dueTime);
      if (dueMins == null) continue;
      if (!itemActiveOnDate(item.createdAt, date, timeZone)) continue;
      if (skipRemindOnCreateDay(item.dueTime, item.createdAt, timeZone)) {
        continue;
      }
      if (dueMins > nowMins) continue; // not yet due

      if (mode === "window") {
        if (nowMins - dueMins > windowMinutes) continue;
      }

      const stamp = remindStamp(date, item.dueTime);
      // Accept legacy YYYY-MM-DD stamps as already-sent for that calendar day.
      if (
        item.lastRemindedDate === stamp ||
        item.lastRemindedDate === date
      ) {
        continue;
      }

      const check = await db.query.checklistChecks.findFirst({
        where: and(
          eq(schema.checklistChecks.userId, list.userId),
          eq(schema.checklistChecks.date, date),
          eq(schema.checklistChecks.itemId, item.id),
        ),
        columns: { id: true },
      });
      if (check) continue;

      due.push({
        itemId: item.id,
        title: item.title,
        listName: list.name,
        dueTime: item.dueTime,
        remindFreq: freq,
        userId: list.userId,
      });

      if (mark) {
        await db
          .update(schema.checklistItems)
          .set({ lastRemindedDate: stamp })
          .where(eq(schema.checklistItems.id, item.id));
      }
    }
  }

  due.sort((a, b) => a.dueTime.localeCompare(b.dueTime));
  return due;
}

/** @deprecated use findDueReminders({ mode: "digest" }) */
export async function findTodayReminders(opts: {
  timeZone: string;
  userId?: string;
  mark?: boolean;
}): Promise<DueReminder[]> {
  return findDueReminders({ ...opts, mode: "digest" });
}

export async function markRemindedToday(
  itemIds: string[],
  date = todayISODate(),
) {
  if (itemIds.length === 0) return;
  const db = await getDb();
  for (const id of itemIds) {
    await db
      .update(schema.checklistItems)
      .set({ lastRemindedDate: date })
      .where(
        and(
          eq(schema.checklistItems.id, id),
          ne(schema.checklistItems.lastRemindedDate, date),
        ),
      );
  }
}
