import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import {
  formatClockTime,
  hoursFromUntil,
  parseClockTime,
} from "@/lib/sleep";
import { todayISODate } from "@/lib/tdee";

function rangeStart(range: string): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function parseQuality(raw: unknown) {
  const quality = Number(raw);
  if (!Number.isFinite(quality) || quality < 1 || quality > 5) return null;
  return Math.round(quality);
}

function resolveTimes(body: {
  from?: unknown;
  until?: unknown;
  fromTime?: unknown;
  untilTime?: unknown;
  hours?: unknown;
}) {
  const fromRaw = body.from ?? body.fromTime;
  const untilRaw = body.until ?? body.untilTime;
  const hasFrom = fromRaw != null && String(fromRaw).trim() !== "";
  const hasUntil = untilRaw != null && String(untilRaw).trim() !== "";

  if (hasFrom || hasUntil) {
    if (!hasFrom || !hasUntil) {
      return { error: "Both from and until times are required" as const };
    }
    if (parseClockTime(fromRaw) == null) {
      return { error: "Invalid from time (use HH:MM)" as const };
    }
    if (parseClockTime(untilRaw) == null) {
      return { error: "Invalid until time (use HH:MM)" as const };
    }
    const fromTime = formatClockTime(String(fromRaw));
    const untilTime = formatClockTime(String(untilRaw));
    const hours = hoursFromUntil(fromTime, untilTime);
    if (hours == null || hours <= 0 || hours > 24) {
      return { error: "Could not compute sleep duration from those times" as const };
    }
    return { fromTime, untilTime, hours };
  }

  // Legacy: hours-only (e.g. old history edits) — keep times null.
  const hours = Number(body.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
    return { error: "Provide from and until times (HH:MM)" as const };
  }
  return {
    fromTime: null as string | null,
    untilTime: null as string | null,
    hours: Math.round(hours * 10) / 10,
  };
}

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const range = searchParams.get("range");

  const db = await getDb();

  if (date) {
    const row = await db.query.sleepLogs.findFirst({
      where: and(
        eq(schema.sleepLogs.userId, authz.userId),
        eq(schema.sleepLogs.date, date),
      ),
    });
    return jsonOk({ date, row: row ?? null });
  }

  const start = range ? rangeStart(range) : rangeStart("30d");
  const rows = await db.query.sleepLogs.findMany({
    where: start
      ? and(
          eq(schema.sleepLogs.userId, authz.userId),
          gte(schema.sleepLogs.date, start),
        )
      : eq(schema.sleepLogs.userId, authz.userId),
    orderBy: [desc(schema.sleepLogs.date)],
  });

  return jsonOk({ range: range || "30d", rows });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const date = String(body.date || todayISODate());
  const quality = parseQuality(body.quality ?? 3);
  const note = body.note != null ? String(body.note).trim() || null : null;
  const resolved = resolveTimes(body);

  if (date > todayISODate()) {
    return jsonError("Cannot log sleep for a future date");
  }
  if ("error" in resolved) return jsonError(String(resolved.error));
  if (quality == null) return jsonError("Quality must be 1–5");

  const { fromTime, untilTime, hours } = resolved;
  const db = await getDb();
  const existing = await db.query.sleepLogs.findFirst({
    where: and(
      eq(schema.sleepLogs.userId, authz.userId),
      eq(schema.sleepLogs.date, date),
    ),
  });

  if (existing) {
    const [row] = await db
      .update(schema.sleepLogs)
      .set({ fromTime, untilTime, hours, quality, note })
      .where(eq(schema.sleepLogs.id, existing.id))
      .returning();
    return jsonOk({ row });
  }

  const [row] = await db
    .insert(schema.sleepLogs)
    .values({
      userId: authz.userId,
      date,
      fromTime,
      untilTime,
      hours,
      quality,
      note,
    })
    .returning();

  return jsonOk({ row }, { status: 201 });
}

export async function PATCH(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return jsonError("id required");

  const db = await getDb();
  const row = await db.query.sleepLogs.findFirst({
    where: eq(schema.sleepLogs.id, id),
  });
  if (!row || row.userId !== authz.userId) {
    return jsonError("Not found", 404);
  }

  const patch: {
    fromTime?: string | null;
    untilTime?: string | null;
    hours?: number;
    quality?: number;
    note?: string | null;
    date?: string;
  } = {};

  const nextFrom = body.from ?? body.fromTime;
  const nextUntil = body.until ?? body.untilTime;
  if (nextFrom != null || nextUntil != null || body.hours != null) {
    const from = nextFrom ?? row.fromTime;
    const until = nextUntil ?? row.untilTime;
    if (from && until) {
      const window = resolveTimes({ from, until });
      if ("error" in window) return jsonError(String(window.error));
      patch.fromTime = window.fromTime;
      patch.untilTime = window.untilTime;
      patch.hours = window.hours;
    } else if (body.hours != null) {
      const fallback = resolveTimes({ hours: body.hours });
      if ("error" in fallback) return jsonError(String(fallback.error));
      patch.hours = fallback.hours;
    } else {
      return jsonError("Both from and until times are required");
    }
  }

  if (body.quality != null) {
    const quality = parseQuality(body.quality);
    if (quality == null) return jsonError("Quality must be 1–5");
    patch.quality = quality;
  }
  if (body.note !== undefined) {
    patch.note = body.note ? String(body.note).trim() || null : null;
  }
  if (body.date != null) {
    const date = String(body.date);
    if (date > todayISODate()) {
      return jsonError("Cannot log sleep for a future date");
    }
    if (date !== row.date) {
      const clash = await db.query.sleepLogs.findFirst({
        where: and(
          eq(schema.sleepLogs.userId, authz.userId),
          eq(schema.sleepLogs.date, date),
        ),
      });
      if (clash && clash.id !== id) {
        return jsonError("An entry already exists for that date");
      }
    }
    patch.date = date;
  }

  if (Object.keys(patch).length === 0) {
    return jsonError("Nothing to update");
  }

  const [updated] = await db
    .update(schema.sleepLogs)
    .set(patch)
    .where(eq(schema.sleepLogs.id, id))
    .returning();

  return jsonOk({ row: updated });
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("id required");

  const db = await getDb();
  const row = await db.query.sleepLogs.findFirst({
    where: eq(schema.sleepLogs.id, id),
  });
  if (!row || row.userId !== authz.userId) {
    return jsonError("Not found", 404);
  }

  await db.delete(schema.sleepLogs).where(eq(schema.sleepLogs.id, id));
  return jsonOk({ ok: true });
}
