"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch } from "@/lib/api-fetch";
import { queryKeys } from "@/lib/query-keys";
import { todayISODate } from "@/lib/tdee";

type ProfilePayload = {
  profile: {
    weightKg: number | null;
  } | null;
  targets: {
    calorieTarget: number;
    proteinG: number;
    tdee: number;
  } | null;
};

type MacrosPayload = {
  totals: { proteinG: number; calories: number };
};

export function TodayDashboard() {
  const today = todayISODate();

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });

  const macrosQuery = useQuery({
    queryKey: queryKeys.macros(today),
    queryFn: () =>
      apiFetch<MacrosPayload>(
        `/api/macros?date=${encodeURIComponent(today)}`,
      ),
  });

  const loading = profileQuery.isLoading || macrosQuery.isLoading;
  const profile = profileQuery.data ?? null;
  const macros = macrosQuery.data ?? null;

  const protein = macros?.totals.proteinG ?? 0;
  const calories = macros?.totals.calories ?? 0;

  return (
    <AppShell title="Today">
      {loading ? (
        <p className="text-[var(--muted)] text-sm">Loading…</p>
      ) : !profile?.targets ? (
        <div className="space-y-4">
          <p className="text-[var(--muted)]">
            Set weight, estimated body fat %, and activity to unlock Katch-McArdle
            targets.
          </p>
          <Link
            href="/calculator"
            className="inline-flex items-center px-4 py-2.5 rounded-md bg-[var(--accent)] text-[var(--background)] text-sm font-medium min-h-[44px]"
          >
            Open Profile / Calculator
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  Protein today
                </p>
                <p className="text-3xl font-semibold tracking-tight">
                  {Math.round(protein)}
                  <span className="text-base text-[var(--muted)] font-normal">
                    g
                  </span>
                </p>
              </div>
              <Link
                href="/nutrition?panel=log"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                Log food
              </Link>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Calories
              </p>
              <p className="text-xl font-medium mt-1">
                {Math.round(calories)}
                <span className="text-sm text-[var(--muted)] font-normal">
                  {" "}
                  kcal
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Weight
              </p>
              <p className="text-xl font-medium mt-1">
                {profile.profile?.weightKg
                  ? `${profile.profile.weightKg} kg`
                  : "—"}
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
              Exercises
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/exercises?panel=log"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-sm hover:border-[var(--accent)] transition-colors"
              >
                <span className="block font-medium">Update exercise</span>
                <span className="text-xs text-[var(--muted)] mt-0.5 block">
                  Log or edit sets
                </span>
              </Link>
              <Link
                href="/exercises?panel=weight"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-sm hover:border-[var(--accent)] transition-colors"
              >
                <span className="block font-medium">Update weight</span>
                <span className="text-xs text-[var(--muted)] mt-0.5 block">
                  Body weight & history
                </span>
              </Link>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <Link
              href="/nutrition?panel=menu"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm hover:border-[var(--accent)] transition-colors"
            >
              Daily menu →
            </Link>
            <Link
              href="/history"
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm hover:border-[var(--accent)] transition-colors"
            >
              History →
            </Link>
          </section>
        </div>
      )}
    </AppShell>
  );
}
