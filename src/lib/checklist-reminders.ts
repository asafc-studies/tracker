import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { freqAppliesToday, zonedParts } from "@/lib/remind-schedule";
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

/**
 * All unchecked reminders scheduled for "today" in a timezone (morning digest).
 * Ignores clock time — Hobby cron only runs once/day.
 */
export async function findTodayReminders(opts: {
  timeZone: string;
  userId?: string;
  mark?: boolean;
}): Promise<DueReminder[]> {
  const { timeZone, userId, mark = false } = opts;
  const { date, weekday } = zonedParts(timeZone);

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
      const freq = (item.remindFreq ?? "off") as RemindFreq;
      if (freq === "off" || !item.dueTime) continue;
      if (!freqAppliesToday(freq, weekday, item.remindWeekday)) continue;
      if (item.lastRemindedDate === date) continue;

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
          .set({ lastRemindedDate: date })
          .where(eq(schema.checklistItems.id, item.id));
      }
    }
  }

  due.sort((a, b) => a.dueTime.localeCompare(b.dueTime));
  return due;
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
