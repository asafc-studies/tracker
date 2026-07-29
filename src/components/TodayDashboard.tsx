"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { AiCoachPanel } from "@/components/AiCoachPanel";
import { MacroWarningsBanner } from "@/components/MacroWarningsBanner";
import { NutritionCoach } from "@/components/NutritionCoach";
import { apiFetch } from "@/lib/api-fetch";
import { getMacroWarnings } from "@/lib/macros";
import { queryKeys } from "@/lib/query-keys";
import { todayISODate } from "@/lib/tdee";

type ProfilePayload = {
  profile: {
    weightKg: number | null;
    bodyFatPercent?: number | null;
    goalTarget?: string | null;
  } | null;
  targets: {
    calorieTarget: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    tdee: number;
    deficit: number;
    bodyFatPercent?: number;
  } | null;
};

type MacrosPayload = {
  totals: {
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories: number;
  };
};

type LiftsPayload = {
  eee?: { caloriesBurned?: number | null };
  stats?: { totalSets?: number; volumeKg?: number } | null;
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

  const liftsQuery = useQuery({
    queryKey: queryKeys.lifts(today),
    queryFn: () =>
      apiFetch<LiftsPayload>(
        `/api/lifts?date=${encodeURIComponent(today)}`,
      ),
  });

  const loading =
    profileQuery.isLoading || macrosQuery.isLoading || liftsQuery.isLoading;
  const profile = profileQuery.data ?? null;
  const macros = macrosQuery.data ?? null;
  const lifts = liftsQuery.data ?? null;

  const protein = macros?.totals.proteinG ?? 0;
  const calories = macros?.totals.calories ?? 0;
  const hasLogged = (macros?.totals.calories ?? 0) > 0;
  const eeeToday = lifts?.eee?.caloriesBurned ?? 0;
  const setsToday = lifts?.stats?.totalSets ?? 0;
  const goalTarget = profile?.profile?.goalTarget?.trim() || null;

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
          {goalTarget ? (
            <section className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Your target
              </p>
              <p className="text-sm leading-relaxed">{goalTarget}</p>
            </section>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Add an open-text Target on{" "}
              <Link
                href="/calculator"
                className="text-[var(--accent)] hover:underline"
              >
                Profile
              </Link>{" "}
              so tips can tailor to fat loss, recomp, etc.
            </p>
          )}

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
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Workout EEE
              </p>
              <p className="text-xl font-medium mt-1">
                {eeeToday > 0 ? Math.round(eeeToday) : "—"}
                {eeeToday > 0 ? (
                  <span className="text-sm text-[var(--muted)] font-normal">
                    {" "}
                    kcal
                  </span>
                ) : null}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Sets today
              </p>
              <p className="text-xl font-medium mt-1">{setsToday || "—"}</p>
            </div>
          </section>

          <AiCoachPanel
            scope="today"
            title="Today summary"
            buttonLabel="Get AI summary"
            placeholder='Optional: e.g. "focus on fat loss this week"'
          />

          {hasLogged && macros ? (
            <>
              <MacroWarningsBanner
                warnings={getMacroWarnings(macros.totals, {
                  calorieTarget: profile.targets.calorieTarget,
                  proteinG: profile.targets.proteinG,
                  carbsG: profile.targets.carbsG,
                  fatG: profile.targets.fatG,
                })}
              />
              <NutritionCoach
                intake={macros.totals}
                targets={{
                  calorieTarget: profile.targets.calorieTarget,
                  proteinG: profile.targets.proteinG,
                  carbsG: profile.targets.carbsG,
                  fatG: profile.targets.fatG,
                  tdee: profile.targets.tdee,
                  deficit: profile.targets.deficit,
                  bodyFatPercent:
                    profile.targets.bodyFatPercent ??
                    profile.profile?.bodyFatPercent ??
                    undefined,
                  weightKg: profile.profile?.weightKg,
                }}
              />
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Log food to get a recomp check vs your targets and a body-fat
              recheck timeline.
            </p>
          )}

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
                href="/exercises?panel=tips"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 text-sm hover:border-[var(--accent)] transition-colors"
              >
                <span className="block font-medium">Workout tips</span>
                <span className="text-xs text-[var(--muted)] mt-0.5 block">
                  AI training advice
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
