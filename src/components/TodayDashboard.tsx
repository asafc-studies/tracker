"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";

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

export function TodayDashboard() {
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [macros, setMacros] = useState<{
    totals: { proteinG: number; calories: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, m] = await Promise.all([
          fetch("/api/profile").then((r) => r.json()),
          fetch("/api/macros").then((r) => r.json()),
        ]);
        if (cancelled) return;
        setProfile(p);
        setMacros(m);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
