"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  liftsCacheDateWindow,
  readLiftsLocal,
  writeLiftsLocal,
  type LiftsLocalPayload,
} from "@/lib/lifts-local-cache";
import { QUERY_STALE_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

type ProfileWithUser = { userId?: string };

/**
 * Day lifts with localStorage hydrate (last 14 days) + background refetch.
 * Edits still go through the API; cache updates after each successful fetch.
 */
export function useLiftsQuery<T extends LiftsLocalPayload = LiftsLocalPayload>(
  date: string,
) {
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfileWithUser>("/api/profile"),
  });
  const userId = profileQuery.data?.userId;

  const liftsQuery = useQuery({
    queryKey: queryKeys.lifts(date),
    queryFn: async () => {
      const data = await apiFetch<T>(
        `/api/lifts?date=${encodeURIComponent(date)}`,
      );
      const uid =
        userId ??
        (
          queryClient.getQueryData(queryKeys.profile) as
            | ProfileWithUser
            | undefined
        )?.userId;
      writeLiftsLocal(uid, date, data);
      return data;
    },
    placeholderData: () => {
      const uid =
        userId ??
        (
          queryClient.getQueryData(queryKeys.profile) as
            | ProfileWithUser
            | undefined
        )?.userId;
      return (readLiftsLocal(uid, date) as T | null) ?? undefined;
    },
  });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const dates = liftsCacheDateWindow();

    (async () => {
      for (const d of dates) {
        if (cancelled) return;
        const cached = readLiftsLocal(userId, d);
        if (cached) {
          if (!queryClient.getQueryData(queryKeys.lifts(d))) {
            queryClient.setQueryData(queryKeys.lifts(d), cached);
          }
          continue;
        }
        try {
          await queryClient.prefetchQuery({
            queryKey: queryKeys.lifts(d),
            staleTime: QUERY_STALE_MS,
            queryFn: async () => {
              const data = await apiFetch<LiftsLocalPayload>(
                `/api/lifts?date=${encodeURIComponent(d)}`,
              );
              writeLiftsLocal(userId, d, data);
              return data;
            },
          });
        } catch {
          /* ignore warm failures */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, queryClient]);

  return liftsQuery;
}
