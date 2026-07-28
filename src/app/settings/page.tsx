import { auth, signOut } from "@/auth";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsNutrition } from "@/components/SettingsNutrition";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <AppShell title="Settings">
      <div className="space-y-6 max-w-md">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Signed in as
          </p>
          <p className="mt-1 text-lg font-medium">
            {session.user.name || session.user.email}
          </p>
          <p className="text-sm text-[var(--muted)]">{session.user.email}</p>
        </div>

        <SettingsNutrition />

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-[var(--border)] px-4 py-2.5 text-sm hover:border-[var(--accent)] transition-colors"
          >
            Sign out
          </button>
        </form>

        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Install from your browser menu for a home-screen app. On Android Chrome,
          long-press the app icon for Log food / Log exercise / Log weight
          shortcuts. Logs sync across devices via your Google account (other
          devices refresh within about a minute).
        </p>
      </div>
    </AppShell>
  );
}
