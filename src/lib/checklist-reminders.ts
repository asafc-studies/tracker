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
 * Find unchecked items due in the current minute window for a timezone.
 * Marks lastRemindedDate when `mark` is true (cron path).
 */
export async function findDueReminders(opts: {
  timeZone: string;
  userId?: string;
  mark?: boolean;
  windowMinutes?: number;
}): Promise<DueReminder[]> {
  const { timeZone, userId, mark = false, windowMinutes = 2 } = opts;
  const { date, hhmm, weekday } = zonedParts(timeZone);
  const [nowH, nowM] = hhmm.split(":").map(Number);
  const nowMins = nowH * 60 + nowM;

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

      const [h, m] = item.dueTime.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) continue;
      const dueMins = h * 60 + m;
      const delta = nowMins - dueMins;
      if (delta < 0 || delta > windowMinutes) continue;

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
