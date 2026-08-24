"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { AiCoachPanel } from "@/components/AiCoachPanel";
import { MacroWarningsBanner } from "@/components/MacroWarningsBanner";
import { NutritionCoach } from "@/components/NutritionCoach";
import { TodayRemindersPanel } from "@/components/TodayRemindersPanel";
import { apiFetch } from "@/lib/api-fetch";
import { writeMacrosLocal } from "@/lib/macros-local-cache";
import {
  getMacroWarnings,
  progressRatio,
  proteinBarFillClass,
  proteinBarSegments,
  proteinRemainingLabel,
  remainingLabel,
} from "@/lib/macros";
import { queryKeys } from "@/lib/query-keys";
import { formatSleepWindow, qualityLabel, sleepDeficitTip } from "@/lib/sleep";
import { todayISODate } from "@/lib/tdee";
import { useLiftsQuery } from "@/lib/use-lifts-query";

type ProfilePayload = {
  userId?: string;
  profile: {
    weightKg: number | null;
    bodyFatPercent?: number | null;
    goalTarget?: string | null;
  } | null;
  targets: {
    calorieTarget: number;
    proteinG: number;
    proteinMinG?: number;
    proteinGoodG?: number;
    proteinMaxG?: number;
    carbsG: number;
    fatG: number;
    tdee: number;
    deficit: number;
    bodyFatPercent?: number;
  } | null;
};

type MacrosPayload = {
  foods?: Array<{
    id: string;
    name: string;
    brand?: string | null;
    proteinG: number;
    carbsG: number;
    fatG: number;
    calories: number;
  }>;
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
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });

  const macrosQuery = useQuery({
    queryKey: queryKeys.macros(today),
    queryFn: async () => {
      const data = await apiFetch<MacrosPayload>(
        `/api/macros?date=${encodeURIComponent(today)}`,
      );
      const userId =
        profileQuery.data?.userId ??
        (
          queryClient.getQueryData(queryKeys.profile) as
            | ProfilePayload
            | undefined
        )?.userId;
      if (userId && data.foods) {
        writeMacrosLocal(userId, today, {
          foods: data.foods,
          totals: data.totals,
        });
      }
      return data;
    },
  });

  const liftsQuery = useLiftsQuery(today);

  const sleepQuery = useQuery({
    queryKey: queryKeys.sleep(today),
    queryFn: () =>
      apiFetch<{
        row: {
          hours: number;
          quality: number;
          fromTime?: string | null;
          untilTime?: string | null;
          note?: string | null;
        } | null;
      }>(`/api/sleep?date=${encodeURIComponent(today)}`),
  });

  const loading =
    profileQuery.isLoading ||
    macrosQuery.isLoading ||
    liftsQuery.isLoading ||
    sleepQuery.isLoading;
  const profile = profileQuery.data ?? null;
  const macros = macrosQuery.data ?? null;
  const lifts = (liftsQuery.data as LiftsPayload | undefined) ?? null;
  const sleep = sleepQuery.data?.row ?? null;

  const protein = macros?.totals.proteinG ?? 0;
  const calories = macros?.totals.calories ?? 0;
  const hasLogged = (macros?.totals.calories ?? 0) > 0;
  const eeeToday = lifts?.eee?.caloriesBurned ?? 0;
  const setsToday = lifts?.stats?.totalSets ?? 0;
  const goalTarget = profile?.profile?.goalTarget?.trim() || null;
  const targets = profile?.targets ?? null;
  const proteinMin = targets?.proteinMinG ?? targets?.proteinG ?? 0;
  const proteinGood = targets?.proteinGoodG ?? proteinMin;
  const proteinMax = targets?.proteinMaxG ?? targets?.proteinG ?? 0;
  const calorieTarget = targets?.calorieTarget ?? 0;
  const proteinSegments = proteinBarSegments(
    protein,
    proteinMin,
    proteinGood,
    proteinMax,
  );
  const calWarned = calorieTarget > 0 && calories - calorieTarget >= 120;
  const calRemaining = remainingLabel(calories, calorieTarget, " kcal");
  const sleepTip = sleep
    ? sleepDeficitTip({
        hours: sleep.hours,
        quality: sleep.quality,
        deficitKcal: profile?.targets?.deficit,
        proteinMinG: profile?.targets?.proteinMinG,
      })
    : null;

  return (
    <AppShell title="Today">
      {loading ? (
        <p className="text-[var(--muted)] text-sm">Loading…</p>
      ) : !profile?.targets ? (
        <div className="space-y-6">
          <TodayRemindersPanel />
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

          <TodayRemindersPanel />

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
                {proteinMin > 0 ? (
                  <p className="text-xs text-[var(--accent)] mt-0.5">
                    {proteinRemainingLabel(protein, proteinMin, proteinMax)}
                  </p>
                ) : null}
              </div>
              <Link
                href="/nutrition?panel=log"
                className="text-sm text-[var(--accent)] hover:underline"
              >
                Log food
              </Link>
            </div>
            {proteinMax > 0 ? (
              <div>
                <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                  <span>Protein · 1.61–2.2 g/kg</span>
                  <span>
                    {Math.round(protein)}g
                    {proteinMin > 0
                      ? ` · floor ${proteinMin} · max ${proteinMax}`
                      : ""}
                  </span>
                </div>
                <div className="relative h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  {proteinSegments.map((seg) => (
                    <div
                      key={seg.key}
                      className={`absolute top-0 bottom-0 transition-all duration-500 ${proteinBarFillClass(seg.key)}`}
                      style={{
                        left: `${seg.leftPct}%`,
                        width: `${seg.widthPct}%`,
                      }}
                    />
                  ))}
                  <span
                    className="absolute top-0 bottom-0 w-px bg-white/25"
                    style={{ left: `${(proteinMin / proteinMax) * 100}%` }}
                    title="1.61 g/kg floor"
                  />
                  <span
                    className="absolute top-0 bottom-0 w-px bg-white/40"
                    style={{ left: `${(proteinGood / proteinMax) * 100}%` }}
                    title="1.85 g/kg strong zone"
                  />
                </div>
              </div>
            ) : null}
            {calorieTarget > 0 ? (
              <div>
                <div className="flex justify-between text-xs text-[var(--muted)] mb-1">
                  <span>Calories</span>
                  <span className={calWarned ? "text-[var(--warn)]" : ""}>
                    {Math.round(calories)}/{calorieTarget}
                    {calRemaining ? ` · ${calRemaining}` : ""}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      calWarned
                        ? "bg-[var(--warn)]"
                        : "bg-[var(--accent)]/70"
                    }`}
                    style={{
                      width: `${Math.min(100, progressRatio(calories, calorieTarget) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid grid-cols-2 gap-4">
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
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                Last night
              </p>
              <p className="text-xl font-medium mt-1">
                {sleep ? (
                  <span className="text-base leading-snug">
                    {formatSleepWindow(
                      sleep.fromTime,
                      sleep.untilTime,
                      sleep.hours,
                    )}
                    <span className="text-sm text-[var(--muted)] font-normal">
                      {" "}
                      · {qualityLabel(sleep.quality)}
                    </span>
                  </span>
                ) : (
                  "—"
                )}
              </p>
              <Link
                href="/sleep"
                className="text-xs text-[var(--accent)] hover:underline"
              >
                {sleep ? "Update sleep" : "Log sleep"}
              </Link>
            </div>
          </section>

          {sleepTip ? (
            <p className="text-xs text-[var(--warn)] leading-relaxed -mt-4">
              {sleepTip}
            </p>
          ) : null}

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
                  proteinMinG: profile.targets.proteinMinG,
                  proteinGoodG: profile.targets.proteinGoodG,
                  proteinMaxG: profile.targets.proteinMaxG,
                  carbsG: profile.targets.carbsG,
                  fatG: profile.targets.fatG,
                })}
              />
              <NutritionCoach
                intake={macros.totals}
                targets={{
                  calorieTarget: profile.targets.calorieTarget,
                  proteinG: profile.targets.proteinG,
                  proteinMinG: profile.targets.proteinMinG,
                  proteinGoodG: profile.targets.proteinGoodG,
                  proteinMaxG: profile.targets.proteinMaxG,
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
