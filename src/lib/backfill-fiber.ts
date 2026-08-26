import { eq } from "drizzle-orm";
import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";
import { REFERENCE_FOODS } from "@/lib/food-reference";
import { fetchOffByBarcode } from "@/lib/open-food-facts";
import { fetchFdcById } from "@/lib/usda-fdc";

const FLAG_KEY = "fiber_backfill_v1";
const DELAY_MS = 120;

type Db = LibSQLDatabase<typeof schema>;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

async function flagDone(client: Client) {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )`,
  );
  await client.execute({
    sql: `INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)`,
    args: [FLAG_KEY, "1"],
  });
}

async function alreadyDone(client: Client): Promise<boolean> {
  try {
    await client.execute(
      `CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
    );
    const res = await client.execute({
      sql: `SELECT value FROM app_meta WHERE key = ?`,
      args: [FLAG_KEY],
    });
    return Boolean(res.rows[0]);
  } catch {
    return false;
  }
}

function refFiberByName(name: string): number | null {
  const key = name.trim().toLowerCase();
  const hit = REFERENCE_FOODS.find((f) => f.name.toLowerCase() === key);
  if (hit && hit.fiberG > 0) return hit.fiberG;
  // Partial match on English prefix before " / "
  const short = key.split(" / ")[0]?.trim();
  if (short) {
    const soft = REFERENCE_FOODS.find((f) =>
      f.name.toLowerCase().startsWith(short),
    );
    if (soft && soft.fiberG > 0) return soft.fiberG;
  }
  return null;
}

async function applyFiberToLinked(
  db: Db,
  savedId: string,
  fiberPerServing: number,
) {
  if (fiberPerServing <= 0) return;
  await db
    .update(schema.savedFoods)
    .set({ fiberG: fiberPerServing })
    .where(eq(schema.savedFoods.id, savedId));

  const logs = await db.query.foodLogs.findMany({
    where: eq(schema.foodLogs.savedFoodId, savedId),
  });
  for (const log of logs) {
    if ((log.fiberG ?? 0) > 0) continue;
    const qty = log.quantity && log.quantity > 0 ? log.quantity : 1;
    await db
      .update(schema.foodLogs)
      .set({ fiberG: round1(fiberPerServing * qty) })
      .where(eq(schema.foodLogs.id, log.id));
  }

  const standing = await db.query.standingMenuItems.findMany({
    where: eq(schema.standingMenuItems.savedFoodId, savedId),
  });
  for (const item of standing) {
    if ((item.fiberG ?? 0) > 0) continue;
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    await db
      .update(schema.standingMenuItems)
      .set({ fiberG: round1(fiberPerServing * qty) })
      .where(eq(schema.standingMenuItems.id, item.id));
  }

  const templates = await db.query.menuTemplateItems.findMany({
    where: eq(schema.menuTemplateItems.savedFoodId, savedId),
  });
  for (const item of templates) {
    if ((item.fiberG ?? 0) > 0) continue;
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    await db
      .update(schema.menuTemplateItems)
      .set({ fiberG: round1(fiberPerServing * qty) })
      .where(eq(schema.menuTemplateItems.id, item.id));
  }
}

/**
 * One-shot: fill fiberG on linked OFF/FDC/reference saved foods and cascade
 * to food_logs / menu rows. Idempotent (skips fiberG > 0). Flagged in app_meta.
 */
export async function backfillFiberOnce(client: Client, db: Db) {
  if (await alreadyDone(client)) return;

  try {
    const saved = await db.query.savedFoods.findMany();

    for (const row of saved) {
      if ((row.fiberG ?? 0) > 0) continue;

      // Built-in staples
      if (row.source === "reference") {
        const fi = refFiberByName(row.name);
        if (fi != null) await applyFiberToLinked(db, row.id, fi);
        continue;
      }

      // Open Food Facts
      const barcode = row.barcode || (row.source === "off" ? row.externalId : null);
      if (barcode) {
        try {
          const off = await fetchOffByBarcode(barcode);
          if (off && (off.fiberG ?? 0) > 0) {
            await applyFiberToLinked(db, row.id, off.fiberG);
          }
        } catch {
          // tolerate misses
        }
        await sleep(DELAY_MS);
        continue;
      }

      // USDA FDC (cached as custom with numeric externalId)
      if (
        row.externalId &&
        /^\d+$/.test(row.externalId) &&
        (row.source === "custom" || row.source === "history")
      ) {
        try {
          const fdc = await fetchFdcById(row.externalId);
          if (fdc && (fdc.fiberG ?? 0) > 0) {
            await applyFiberToLinked(db, row.id, fdc.fiberG);
          }
        } catch {
          // tolerate misses
        }
        await sleep(DELAY_MS);
      }
    }

    // Name-match reference fiber onto unlinked food_logs still at 0
    const zeroLogs = await db.query.foodLogs.findMany();
    for (const log of zeroLogs) {
      if ((log.fiberG ?? 0) > 0) continue;
      const fi = refFiberByName(log.name);
      if (fi == null) continue;
      const qty = log.quantity && log.quantity > 0 ? log.quantity : 1;
      await db
        .update(schema.foodLogs)
        .set({ fiberG: round1(fi * qty) })
        .where(eq(schema.foodLogs.id, log.id));
    }

    await flagDone(client);
  } catch (err) {
    console.error("[backfill-fiber]", err);
    // Leave flag unset so a later boot can retry.
  }
}
