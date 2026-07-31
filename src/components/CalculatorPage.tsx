"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/shell/AppShell";
import { apiFetch } from "@/lib/api-fetch";
import { invalidateAfterProfile } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";
import {
  ACTIVITY_LABELS,
  ACTIVITY_OPTIONS,
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
  type ActivityLevel,
  type Sex,
} from "@/lib/tdee";

type Targets = {
  bmr: number;
  tdee: number;
  deficit: number;
  calorieTarget: number;
  proteinG: number;
  proteinMinG?: number;
  proteinGoodG?: number;
  proteinMaxG?: number;
  carbsG: number;
  fatG: number;
  leanBodyMassKg?: number;
  bodyFatPercent?: number;
};

type ProfilePayload = {
  profile?: {
    weightKg?: number | null;
    heightCm?: number | null;
    age?: number | null;
    sex?: Sex | null;
    bodyFatPercent?: number | null;
    activityLevel?: string | null;
    goalTarget?: string | null;
  } | null;
  targets?: Targets | null;
};

export function CalculatorPage() {
  const queryClient = useQueryClient();
  const [weightKg, setWeightKg] = useState("80");
  const [heightCm, setHeightCm] = useState("178");
  const [age, setAge] = useState("30");
  const [sex, setSex] = useState<Sex>("male");
  const [bodyFatPercent, setBodyFatPercent] = useState("15");
  const [activityLevel, setActivityLevel] =
    useState<ActivityLevel>("moderate");
  const [goalTarget, setGoalTarget] = useState("");
  const [targets, setTargets] = useState<Targets | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });

  useEffect(() => {
    const data = profileQuery.data;
    if (!data || hydrated) return;
    if (data.profile) {
      if (data.profile.weightKg) setWeightKg(String(data.profile.weightKg));
      if (data.profile.heightCm) setHeightCm(String(data.profile.heightCm));
      if (data.profile.age) setAge(String(data.profile.age));
      if (data.profile.sex) setSex(data.profile.sex);
      if (data.profile.bodyFatPercent != null) {
        setBodyFatPercent(String(data.profile.bodyFatPercent));
      }
      if (data.profile.activityLevel) {
        const a = data.profile.activityLevel as ActivityLevel;
        setActivityLevel(a === "very_active" ? "active" : a);
      }
      if (data.profile.goalTarget) setGoalTarget(data.profile.goalTarget);
    }
    if (data.targets) setTargets(data.targets);
    setHydrated(true);
  }, [profileQuery.data, hydrated]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    const weight = Number(weightKg);
    const height = Number(heightCm);
    const ageN = Number(age);
    const bf = Number(bodyFatPercent);
    if (!Number.isFinite(weight) || weight <= 0) {
      setMessage("Enter a valid weight");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(height) || height <= 0) {
      setMessage("Enter a valid height");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(ageN) || ageN <= 0) {
      setMessage("Enter a valid age");
      setSaving(false);
      return;
    }
    if (!Number.isFinite(bf) || bf < 3 || bf > 60) {
      setMessage("Body fat % must be between 3 and 60");
      setSaving(false);
      return;
    }
    try {
      const data = await apiFetch<ProfilePayload>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          weightKg: weight,
          heightCm: height,
          age: ageN,
          sex,
          bodyFatPercent: bf,
          activityLevel,
          deficitKcal: DEFAULT_DEFICIT_KCAL,
          proteinPerKg: DEFAULT_PROTEIN_PER_KG,
          goalTarget: goalTarget.trim() || null,
        }),
      });
      setTargets(data.targets ?? null);
      setMessage(
        data.targets
          ? "Saved. Targets use Katch-McArdle BMR × activity (EEE is tracked separately)."
          : "Saved profile — add body fat % for calorie targets.",
      );
      await invalidateAfterProfile(queryClient);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] min-h-[44px]";

  return (
    <AppShell title="Profile / Calculator">
      <form onSubmit={(e) => void save(e)} className="space-y-6 max-w-xl">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--muted)]">Weight (kg)</span>
            <input
              className={field}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--muted)]">
              Body fat % <span className="text-[var(--accent)]">*</span>
            </span>
            <input
              className={field}
              type="number"
              inputMode="decimal"
              step="0.1"
              min={3}
              max={60}
              value={bodyFatPercent}
              onChange={(e) => setBodyFatPercent(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--muted)]">Height (cm)</span>
            <input
              className={field}
              type="number"
              inputMode="decimal"
              step="0.1"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-[var(--muted)]">Age</span>
            <input
              className={field}
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5 col-span-2 sm:col-span-1">
            <span className="text-xs text-[var(--muted)]">Sex</span>
            <select
              className={field}
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </label>
          <label className="block space-y-1.5 col-span-2 sm:col-span-1">
            <span className="text-xs text-[var(--muted)]">Activity</span>
            <select
              className={field}
              value={activityLevel}
              onChange={(e) =>
                setActivityLevel(e.target.value as ActivityLevel)
              }
            >
              {ACTIVITY_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {ACTIVITY_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs text-[var(--muted)]">Target</span>
          <textarea
            className={`${field} min-h-[72px] resize-y`}
            value={goalTarget}
            onChange={(e) => setGoalTarget(e.target.value)}
            placeholder='e.g. "Lose fat while keeping strength" or "Recomp — slow cut"'
            maxLength={500}
            rows={3}
          />
          <span className="text-[11px] text-[var(--muted)] leading-relaxed block">
            Open text used by Today tips, workout tips, and future plans.
          </span>
        </label>

        <p className="text-xs text-[var(--muted)] leading-relaxed">
          BMR uses Katch-McArdle from lean mass. Target = TDEE − {DEFAULT_DEFICIT_KCAL}{" "}
          kcal. Protein aims ~{DEFAULT_PROTEIN_PER_KG} g/kg inside a 1.61–2.2 g/kg
          range (floor 1.61; strong zone from 1.85). Fat 25% of target · carbs fill
          the rest. Workout EEE is not subtracted from this target.
        </p>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2.5 text-sm font-medium disabled:opacity-60 min-h-[44px] w-full sm:w-auto"
        >
          {saving ? "Saving…" : "Save targets"}
        </button>
        {message ? (
          <p className="text-sm text-[var(--muted)]">{message}</p>
        ) : null}
      </form>

      {targets ? (
        <section className="mt-10 grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {[
            ["LBM", `${targets.leanBodyMassKg ?? "—"} kg`],
            ["BMR", `${targets.bmr} kcal`],
            ["TDEE", `${targets.tdee} kcal`],
            ["Target", `${targets.calorieTarget} kcal`],
            ["Protein", `${targets.proteinG} g`],
            ...(targets.proteinMinG != null
              ? [
                  [
                    "P range",
                    `${targets.proteinMinG}–${targets.proteinMaxG ?? "—"} g`,
                  ] as [string, string],
                ]
              : []),
            ["Carbs / Fat", `${targets.carbsG}g / ${targets.fatG}g`],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
            >
              <p className="text-xs text-[var(--muted)] uppercase tracking-wider">
                {label}
              </p>
              <p className="text-lg font-medium mt-1">{value}</p>
            </div>
          ))}
        </section>
      ) : null}
    </AppShell>
  );
}
