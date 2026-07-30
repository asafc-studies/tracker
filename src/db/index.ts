import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import { ensureMigrated } from "./migrate";

type Db = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __recompClient?: Client;
  __recompDb?: Db;
  __recompMigrated?: Promise<void>;
};

export function resolveDbUrl() {
  const custom = process.env.DATABASE_URL?.trim();
  if (custom) return custom;
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const filePath = path.join(dataDir, "recomp.db");
  return `file:${filePath.replace(/\\/g, "/")}`;
}

export function isRemoteDb(url = resolveDbUrl()) {
  return (
    url.startsWith("libsql://") ||
    url.startsWith("https://") ||
    url.startsWith("wss://")
  );
}

export function getClient() {
  if (!globalForDb.__recompClient) {
    const url = resolveDbUrl();
    const authToken = process.env.DATABASE_AUTH_TOKEN?.trim();
    globalForDb.__recompClient = createClient({
      url,
      ...(authToken ? { authToken } : {}),
    });
  }
  return globalForDb.__recompClient;
}

export function getDbSync() {
  const client = getClient();
  // Rebind schema on each access so HMR/new tables show up on db.query.*
  // (a cached drizzle instance keeps the schema from first boot).
  if (
    !globalForDb.__recompDb ||
    !("standingMenuItems" in (globalForDb.__recompDb.query ?? {})) ||
    !("workoutPlans" in (globalForDb.__recompDb.query ?? {}))
  ) {
    globalForDb.__recompDb = drizzle(client, { schema });
  }
  return globalForDb.__recompDb;
}

export async function getDb() {
  const client = getClient();
  if (!globalForDb.__recompMigrated) {
    globalForDb.__recompMigrated = (async () => {
      if (!isRemoteDb()) {
        try {
          await client.execute("PRAGMA journal_mode = WAL;");
        } catch {
          // Local-only; ignore if unsupported.
        }
      }
      await ensureMigrated(client);
    })();
  }
  await globalForDb.__recompMigrated;
  return getDbSync();
}

export { schema };
