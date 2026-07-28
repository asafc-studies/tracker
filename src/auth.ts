import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getClient, getDbSync, isRemoteDb, schema } from "@/db";
import { ensureMigrated } from "@/db/migrate";
import { authConfig } from "@/auth.config";

const isBuild = process.env.NEXT_PHASE === "phase-production-build";

function buildAdapter() {
  const client = getClient();
  void (async () => {
    if (!isRemoteDb()) {
      try {
        await client.execute("PRAGMA journal_mode = WAL;");
      } catch {
        // ignore
      }
    }
    await ensureMigrated(client);
  })();
  return DrizzleAdapter(getDbSync(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  ...(isBuild ? {} : { adapter: buildAdapter() }),
});
