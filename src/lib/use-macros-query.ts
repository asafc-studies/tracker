"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api-fetch";
import {
  macrosCacheDateWindow,
  readMacrosLocal,
  writeMacrosLocal,
  type MacrosLocalPayload,
} from "@/lib/macros-local-cache";
import { QUERY_STALE_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

type ProfileWithUser = { userId?: string };

/**
 * Day macros with localStorage hydrate (last 14 days) + background refetch.
 * Edits still go through the API; cache updates after each successful fetch.
 */
export function useMacrosQuery(date: string) {
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => apiFetch<ProfileWithUser>("/api/profile"),
  });
  const userId = profileQuery.data?.userId;

  const macrosQuery = useQuery({
    queryKey: queryKeys.macros(date),
    queryFn: async () => {
      const data = await apiFetch<MacrosLocalPayload>(
        `/api/macros?date=${encodeURIComponent(date)}`,
      );
      const uid =
        userId ??
        (
          queryClient.getQueryData(queryKeys.profile) as
            | ProfileWithUser
            | undefined
        )?.userId;
      writeMacrosLocal(uid, date, data);
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
      return readMacrosLocal(uid, date) ?? undefined;
    },
  });

  // Fill gaps in the 2-week local window (skip days already cached).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const dates = macrosCacheDateWindow();

    (async () => {
      for (const d of dates) {
        if (cancelled) return;
        const cached = readMacrosLocal(userId, d);
        if (cached) {
          if (!queryClient.getQueryData(queryKeys.macros(d))) {
            queryClient.setQueryData(queryKeys.macros(d), cached);
          }
          continue;
        }
        try {
          await queryClient.prefetchQuery({
            queryKey: queryKeys.macros(d),
            staleTime: QUERY_STALE_MS,
            queryFn: async () => {
              const data = await apiFetch<MacrosLocalPayload>(
                `/api/macros?date=${encodeURIComponent(d)}`,
              );
              writeMacrosLocal(userId, d, data);
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

  return macrosQuery;
}
