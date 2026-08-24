import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { findTodayReminders } from "@/lib/checklist-reminders";

function vapidConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

export function getVapidPublicKey() {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

function ensureVapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:recomp-tracker@local";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function savePushSubscription(
  userId: string,
  sub: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  },
  timezone: string,
) {
  const db = await getDb();
  const existing = await db.query.pushSubscriptions.findFirst({
    where: eq(schema.pushSubscriptions.endpoint, sub.endpoint),
  });
  if (existing) {
    await db
      .update(schema.pushSubscriptions)
      .set({
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        timezone: timezone || existing.timezone,
      })
      .where(eq(schema.pushSubscriptions.id, existing.id));
    return existing.id;
  }
  const [row] = await db
    .insert(schema.pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      timezone: timezone || "UTC",
    })
    .returning();
  return row.id;
}

export async function removePushSubscription(
  userId: string,
  endpoint: string,
) {
  const db = await getDb();
  await db
    .delete(schema.pushSubscriptions)
    .where(
      and(
        eq(schema.pushSubscriptions.userId, userId),
        eq(schema.pushSubscriptions.endpoint, endpoint),
      ),
    );
}

/** Once-daily morning digest (Hobby cron limit). Exact times use in-app ticker. */
export async function sendChecklistPushReminders() {
  if (!vapidConfigured()) {
    return { sent: 0, skipped: "vapid_missing" as const };
  }
  ensureVapid();
  const db = await getDb();
  const subs = await db.query.pushSubscriptions.findMany();
  if (subs.length === 0) return { sent: 0, skipped: "no_subs" as const };

  const groups = new Map<string, typeof subs>();
  for (const s of subs) {
    const key = `${s.userId}|${s.timezone}`;
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  let sent = 0;
  for (const [key, group] of groups) {
    const [userId, timeZone] = key.split("|");
    const due = await findTodayReminders({
      timeZone,
      userId,
      mark: true,
    });
    if (due.length === 0) continue;

    const preview = due
      .slice(0, 3)
      .map((d) => `${d.dueTime} ${d.title}`)
      .join(" · ");
    const more = due.length > 3 ? ` (+${due.length - 3} more)` : "";
    const body =
      due.length === 1
        ? `${due[0].listName}: ${due[0].title} at ${due[0].dueTime}`
        : `Today: ${preview}${more}`;
    const payload = JSON.stringify({
      title: "Today’s checklist",
      body,
      url: "/lists",
      tag: `checklist-digest-${due[0]?.userId ?? "day"}`,
    });

    for (const sub of group) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
        sent += 1;
      } catch (err: unknown) {
        const status =
          err && typeof err === "object" && "statusCode" in err
            ? Number((err as { statusCode: number }).statusCode)
            : 0;
        if (status === 404 || status === 410) {
          await db
            .delete(schema.pushSubscriptions)
            .where(eq(schema.pushSubscriptions.id, sub.id));
        }
      }
    }
  }

  return { sent };
}
