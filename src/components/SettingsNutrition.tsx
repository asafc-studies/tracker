"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { invalidateAfterProfile } from "@/lib/query-invalidate";
import { queryKeys } from "@/lib/query-keys";

type Targets = {
  calorieTarget: number;
  proteinG: number;
  computedCalorieTarget?: number;
  computedProteinG?: number;
  hasOverrides?: boolean;
};

type ProfilePayload = {
  profile?: {
    calorieTargetOverride?: number | null;
    proteinTargetOverride?: number | null;
  } | null;
  targets?: Targets | null;
};

export function SettingsNutrition() {
  const queryClient = useQueryClient();
  const [calorieTarget, setCalorieTarget] = useState<string>("");
  const [proteinTarget, setProteinTarget] = useState<string>("");
  const [useCalculator, setUseCalculator] = useState(true);
  const [computed, setComputed] = useState<Targets | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
  });

  useEffect(() => {
    const d = profileQuery.data;
    if (!d || hydrated) return;
    if (d.targets) {
      setComputed(d.targets);
      const hasOverrides =
        d.profile?.calorieTargetOverride != null ||
        d.profile?.proteinTargetOverride != null;
      setUseCalculator(!hasOverrides);
      if (hasOverrides) {
        setCalorieTarget(String(d.targets.calorieTarget));
        setProteinTarget(String(d.targets.proteinG));
      }
    }
    setHydrated(true);
  }, [profileQuery.data, hydrated]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const data = await apiFetch<ProfilePayload>("/api/profile", {
        method: "PUT",
        body: JSON.stringify({
          nutritionOnly: true,
          calorieTargetOverride: useCalculator
            ? null
            : Number(calorieTarget),
          proteinTargetOverride: useCalculator ? null : Number(proteinTarget),
          countryCode: "il",
        }),
      });
      setComputed(data.targets ?? null);
      setMessage("Nutrition targets saved.");
      await invalidateAfterProfile(queryClient);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <section className="space-y-4 pt-4 border-t border-[var(--border)]">
      <div>
        <h2 className="text-sm font-medium">Nutrition targets</h2>
        <p className="text-xs text-[var(--muted)] mt-1">
          Set once here — shown as &quot;remaining&quot; only when logging food.
          Region: Israel (Open Food Facts brands).
        </p>
      </div>

      {computed?.computedCalorieTarget != null ? (
        <p className="text-xs text-[var(--muted)]">
          Calculator suggests: {computed.computedProteinG}g protein ·{" "}
          {computed.computedCalorieTarget} kcal
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Complete your{" "}
          <Link href="/calculator" className="text-[var(--accent)] hover:underline">
            profile & calculator
          </Link>{" "}
          for suggested targets.
        </p>
      )}

      <form onSubmit={(e) => void save(e)} className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCalculator}
            onChange={(e) => setUseCalculator(e.target.checked)}
          />
          Use calculator targets
        </label>

        {!useCalculator ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)]">Protein (g)</label>
              <input
                className={field}
                type="number"
                value={proteinTarget}
                onChange={(e) => setProteinTarget(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)]">Calories</label>
              <input
                className={field}
                type="number"
                value={calorieTarget}
                onChange={(e) => setCalorieTarget(e.target.value)}
                required
              />
            </div>
          </div>
        ) : computed ? (
          <p className="text-sm">
            Active: {computed.proteinG}g protein · {computed.calorieTarget} kcal
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save targets"}
        </button>
        {message ? (
          <p className="text-xs text-[var(--muted)]">{message}</p>
        ) : null}
      </form>

      <Link
        href="/calculator"
        className="inline-block text-sm text-[var(--accent)] hover:underline"
      >
        Adjust body stats & TDEE →
      </Link>
    </section>
  );
}
