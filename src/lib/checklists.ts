import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import {
  itemActiveOnDate,
  skipRemindOnCreateDay,
  zonedParts,
} from "@/lib/remind-schedule";
import {
  clampString,
  isISODate,
  MAX_ITEM_TITLE_LEN,
  MAX_LIST_NAME_LEN,
  parseOptionalHHMM,
  parseRemindFreq,
  parseRemindWeekday,
  type RemindFreq,
} from "@/lib/security";
import { todayISODate } from "@/lib/tdee";

export type ChecklistItemView = {
  id: string;
  title: string;
  dueTime: string | null;
  remindFreq: RemindFreq;
  remindWeekday: number | null;
  sortOrder: number;
  checked: boolean;
  checkedAt: string | null;
  checkId: string | null;
  /** ISO timestamp — used to scope items to calendar days. */
  createdAt: string | null;
};

export type ChecklistListView = {
  id: string;
  name: string;
  sortOrder: number;
  items: ChecklistItemView[];
};

export type ChecklistHistoryEntry = {
  checkId: string;
  itemId: string;
  title: string;
  listId: string;
  listName: string;
  dueTime: string | null;
  checkedAt: string;
};

function toIso(ms: Date | number | null | undefined): string | null {
  if (ms == null) return null;
  const d = ms instanceof Date ? ms : new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Legacy HH:MM → Date using the *process* timezone.
 * Prefer absolute ISO from the client — server TZ is often UTC (Vercel).
 */
export function checkedAtForDate(
  date: string,
  timeHHMM?: string | null,
): Date {
  const now = new Date();
  const [y, m, d] = date.split("-").map(Number);
  if (timeHHMM) {
    const parsed = parseOptionalHHMM(timeHHMM);
    if (parsed) {
      const [h, min] = parsed.split(":").map(Number);
      return new Date(y, m - 1, d, h, min, 0, 0);
    }
  }
  if (date === todayISODate()) return now;
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), 0, 0);
}

async function assertListOwned(userId: string, listId: string) {
  const db = await getDb();
  const list = await db.query.checklistLists.findFirst({
    where: and(
      eq(schema.checklistLists.id, listId),
      eq(schema.checklistLists.userId, userId),
    ),
  });
  return list ?? null;
}

async function assertItemOwned(userId: string, itemId: string) {
  const db = await getDb();
  const item = await db.query.checklistItems.findFirst({
    where: eq(schema.checklistItems.id, itemId),
    with: { list: true },
  });
  if (!item || item.list.userId !== userId) return null;
  return item;
}

export async function getChecklistsForDate(
  userId: string,
  date: string,
  timeZone = "UTC",
) {
  if (!isISODate(date)) throw new Error("Invalid date");
  const db = await getDb();

  const lists = await db.query.checklistLists.findMany({
    where: eq(schema.checklistLists.userId, userId),
    orderBy: [asc(schema.checklistLists.sortOrder), asc(schema.checklistLists.createdAt)],
    with: {
      items: {
        orderBy: [
          asc(schema.checklistItems.sortOrder),
          asc(schema.checklistItems.createdAt),
        ],
      },
    },
  });

  const activeItems = lists.flatMap((l) =>
    l.items.filter((i) => itemActiveOnDate(i.createdAt, date, timeZone)),
  );
  const itemIds = activeItems.map((i) => i.id);
  const checks =
    itemIds.length > 0
      ? await db.query.checklistChecks.findMany({
          where: and(
            eq(schema.checklistChecks.userId, userId),
            eq(schema.checklistChecks.date, date),
            inArray(schema.checklistChecks.itemId, itemIds),
          ),
        })
      : [];
  const checkByItem = new Map(checks.map((c) => [c.itemId, c]));

  const result: ChecklistListView[] = lists.map((list) => ({
    id: list.id,
    name: list.name,
    sortOrder: list.sortOrder,
    items: list.items
      .filter((item) => itemActiveOnDate(item.createdAt, date, timeZone))
      .map((item) => {
        const check = checkByItem.get(item.id);
        return {
          id: item.id,
          title: item.title,
          dueTime: item.dueTime,
          remindFreq: parseRemindFreq(item.remindFreq),
          remindWeekday: item.remindWeekday ?? null,
          sortOrder: item.sortOrder,
          checked: Boolean(check),
          checkedAt: toIso(check?.checkedAt),
          checkId: check?.id ?? null,
          createdAt: toIso(item.createdAt),
        };
      }),
  }));

  return { date, lists: result };
}

export async function getChecklistHistory(userId: string, date: string) {
  if (!isISODate(date)) throw new Error("Invalid date");
  const db = await getDb();

  const checks = await db.query.checklistChecks.findMany({
    where: and(
      eq(schema.checklistChecks.userId, userId),
      eq(schema.checklistChecks.date, date),
    ),
    orderBy: [asc(schema.checklistChecks.checkedAt)],
    with: {
      item: {
        with: { list: true },
      },
    },
  });

  const entries: ChecklistHistoryEntry[] = checks
    .filter((c) => c.item?.list?.userId === userId)
    .map((c) => ({
      checkId: c.id,
      itemId: c.itemId,
      title: c.item.title,
      listId: c.item.listId,
      listName: c.item.list.name,
      dueTime: c.item.dueTime,
      checkedAt: toIso(c.checkedAt)!,
    }));

  return { date, entries };
}

export async function createList(userId: string, nameRaw: string) {
  const name = clampString(nameRaw.trim(), MAX_LIST_NAME_LEN);
  if (!name) throw new Error("Name is required");

  const db = await getDb();
  const existing = await db.query.checklistLists.findMany({
    where: eq(schema.checklistLists.userId, userId),
    columns: { sortOrder: true },
    orderBy: [desc(schema.checklistLists.sortOrder)],
    limit: 1,
  });
  const sortOrder = (existing[0]?.sortOrder ?? -1) + 1;

  const [row] = await db
    .insert(schema.checklistLists)
    .values({ userId, name, sortOrder })
    .returning();
  return row;
}

export async function renameList(
  userId: string,
  listId: string,
  nameRaw: string,
) {
  const name = clampString(nameRaw.trim(), MAX_LIST_NAME_LEN);
  if (!name) throw new Error("Name is required");
  const list = await assertListOwned(userId, listId);
  if (!list) throw new Error("Not found");

  const db = await getDb();
  const [row] = await db
    .update(schema.checklistLists)
    .set({ name })
    .where(eq(schema.checklistLists.id, listId))
    .returning();
  return row;
}

export async function deleteList(userId: string, listId: string) {
  const list = await assertListOwned(userId, listId);
  if (!list) throw new Error("Not found");
  const db = await getDb();
  await db
    .delete(schema.checklistLists)
    .where(eq(schema.checklistLists.id, listId));
  return { ok: true };
}

export async function addItem(
  userId: string,
  listId: string,
  titleRaw: string,
  opts?: {
    dueTime?: unknown;
    remindFreq?: unknown;
    remindWeekday?: unknown;
    /** IANA tz — used to skip same-day remind when due already passed. */
    timeZone?: unknown;
  },
) {
  const list = await assertListOwned(userId, listId);
  if (!list) throw new Error("Not found");
  const title = clampString(titleRaw.trim(), MAX_ITEM_TITLE_LEN);
  if (!title) throw new Error("Title is required");
  const dueTime = parseOptionalHHMM(opts?.dueTime);
  const remindFreq = parseRemindFreq(opts?.remindFreq);
  const remindWeekday =
    remindFreq === "weekly" ? parseRemindWeekday(opts?.remindWeekday) : null;
  if (remindFreq !== "off" && !dueTime) {
    throw new Error("Reminder needs a time");
  }
  if (remindFreq === "weekly" && remindWeekday == null) {
    throw new Error("Pick a weekday for weekly reminders");
  }

  const db = await getDb();
  const last = await db.query.checklistItems.findMany({
    where: eq(schema.checklistItems.listId, listId),
    columns: { sortOrder: true },
    orderBy: [desc(schema.checklistItems.sortOrder)],
    limit: 1,
  });
  const sortOrder = (last[0]?.sortOrder ?? -1) + 1;

  const now = new Date();
  const tz =
    typeof opts?.timeZone === "string" && opts.timeZone.trim()
      ? opts.timeZone.trim()
      : "UTC";
  const { date: today } = zonedParts(tz, now);
  let lastRemindedDate: string | null = null;
  if (dueTime && skipRemindOnCreateDay(dueTime, now, tz)) {
    lastRemindedDate = `${today}@${dueTime}`;
  }

  const [row] = await db
    .insert(schema.checklistItems)
    .values({
      listId,
      title,
      dueTime,
      remindFreq,
      remindWeekday,
      sortOrder,
      lastRemindedDate,
      createdAt: now,
    })
    .returning();
  return row;
}

export async function updateItem(
  userId: string,
  itemId: string,
  patch: {
    title?: string;
    dueTime?: unknown;
    remindFreq?: unknown;
    remindWeekday?: unknown;
  },
) {
  const item = await assertItemOwned(userId, itemId);
  if (!item) throw new Error("Not found");

  const next: {
    title?: string;
    dueTime?: string | null;
    remindFreq?: RemindFreq;
    remindWeekday?: number | null;
  } = {};
  if (patch.title != null) {
    const title = clampString(String(patch.title).trim(), MAX_ITEM_TITLE_LEN);
    if (!title) throw new Error("Title is required");
    next.title = title;
  }
  if ("dueTime" in patch) {
    next.dueTime = parseOptionalHHMM(patch.dueTime);
  }
  if ("remindFreq" in patch) {
    next.remindFreq = parseRemindFreq(patch.remindFreq);
  }
  if ("remindWeekday" in patch || next.remindFreq === "weekly") {
    const freq = next.remindFreq ?? parseRemindFreq(item.remindFreq);
    next.remindWeekday =
      freq === "weekly"
        ? parseRemindWeekday(
            "remindWeekday" in patch ? patch.remindWeekday : item.remindWeekday,
          )
        : null;
  }

  const dueTime = "dueTime" in next ? next.dueTime : item.dueTime;
  const freq = next.remindFreq ?? parseRemindFreq(item.remindFreq);
  if (freq !== "off" && !dueTime) {
    throw new Error("Reminder needs a time");
  }
  if (freq === "weekly" && (next.remindWeekday ?? item.remindWeekday) == null) {
    throw new Error("Pick a weekday for weekly reminders");
  }

  if (Object.keys(next).length === 0) throw new Error("Nothing to update");

  const db = await getDb();
  const [row] = await db
    .update(schema.checklistItems)
    .set(next)
    .where(eq(schema.checklistItems.id, itemId))
    .returning();
  return row;
}

export async function deleteItem(userId: string, itemId: string) {
  const item = await assertItemOwned(userId, itemId);
  if (!item) throw new Error("Not found");
  const db = await getDb();
  await db
    .delete(schema.checklistItems)
    .where(eq(schema.checklistItems.id, itemId));
  return { ok: true };
}

export async function setItemChecked(
  userId: string,
  opts: {
    itemId: string;
    date: string;
    checked: boolean;
    /** HH:MM on that date, or full ISO timestamp. */
    checkedAt?: string | null;
  },
) {
  const { itemId, date, checked } = opts;
  if (!isISODate(date)) throw new Error("Invalid date");
  const item = await assertItemOwned(userId, itemId);
  if (!item) throw new Error("Not found");

  const db = await getDb();
  const existing = await db.query.checklistChecks.findFirst({
    where: and(
      eq(schema.checklistChecks.userId, userId),
      eq(schema.checklistChecks.date, date),
      eq(schema.checklistChecks.itemId, itemId),
    ),
  });

  if (!checked) {
    if (existing) {
      await db
        .delete(schema.checklistChecks)
        .where(eq(schema.checklistChecks.id, existing.id));
    }
    return { checked: false, checkId: null, checkedAt: null };
  }

  let at: Date;
  if (!opts.checkedAt) {
    // Absolute "now" — correct in any server TZ.
    at = new Date();
  } else if (opts.checkedAt.includes("T")) {
    at = new Date(opts.checkedAt);
    if (Number.isNaN(at.getTime())) throw new Error("Invalid checkedAt");
  } else {
    // Legacy HH:MM path (ambiguous on UTC servers) — clients should send ISO.
    at = checkedAtForDate(date, opts.checkedAt);
  }

  if (existing) {
    const [row] = await db
      .update(schema.checklistChecks)
      .set({ checkedAt: at })
      .where(eq(schema.checklistChecks.id, existing.id))
      .returning();
    return {
      checked: true,
      checkId: row.id,
      checkedAt: toIso(row.checkedAt),
    };
  }

  const [row] = await db
    .insert(schema.checklistChecks)
    .values({
      userId,
      date,
      itemId,
      checkedAt: at,
    })
    .returning();
  return {
    checked: true,
    checkId: row.id,
    checkedAt: toIso(row.checkedAt),
  };
}
