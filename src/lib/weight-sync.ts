import { desc, eq } from "drizzle-orm";
import type { getDb } from "@/db";
import { schema } from "@/db";

type Db = Awaited<ReturnType<typeof getDb>>;

/** Set profile weight to the most recent weight log entry (by date). */
export async function syncProfileWeightFromLogs(db: Db, userId: string) {
  const latest = await db.query.weightLogs.findFirst({
    where: eq(schema.weightLogs.userId, userId),
    orderBy: [desc(schema.weightLogs.date)],
  });

  await db
    .update(schema.profiles)
    .set({
      weightKg: latest?.weightKg ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.profiles.userId, userId));

  return latest?.weightKg ?? null;
}
