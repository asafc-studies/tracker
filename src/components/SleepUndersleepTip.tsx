"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-fetch";
import { queryKeys } from "@/lib/query-keys";
import {
  sleepDeficitTip,
  sleepTrainingTip,
} from "@/lib/sleep";
import { todayISODate } from "@/lib/tdee";

type SleepPayload = {
  row: { hours: number; quality: number } | null;
};

type ProfilePayload = {
  targets: { deficit: number; proteinMinG?: number } | null;
};

type Props = {
  kind: "deficit" | "training";
  className?: string;
};

/** One-liner when last night was short/poor — used on Nutrition / Exercises. */
export function SleepUndersleepTip({ kind, className }: Props) {
  const today = todayISODate();
  const sleepQuery = useQuery({
    queryKey: queryKeys.sleep(today),
    queryFn: () =>
      apiFetch<SleepPayload>(
        `/api/sleep?date=${encodeURIComponent(today)}`,
      ),
  });
  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfilePayload>("/api/profile"),
    enabled: kind === "deficit",
  });

  const row = sleepQuery.data?.row;
  if (!row) return null;

  const tip =
    kind === "training"
      ? sleepTrainingTip(row.hours, row.quality)
      : sleepDeficitTip({
          hours: row.hours,
          quality: row.quality,
          deficitKcal: profileQuery.data?.targets?.deficit,
          proteinMinG: profileQuery.data?.targets?.proteinMinG,
        });

  if (!tip) return null;

  return (
    <p className={className ?? "text-xs text-[var(--muted)] leading-relaxed"}>
      {tip}{" "}
      <Link href="/sleep" className="text-[var(--accent)] hover:underline">
        Sleep
      </Link>
    </p>
  );
}
