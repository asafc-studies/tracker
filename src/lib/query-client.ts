import { QueryClient } from "@tanstack/react-query";

/** Keep UI warm for up to a minute; pull fresh data on focus and every 60s. */
export const QUERY_STALE_MS = 60_000;
export const QUERY_REFETCH_MS = 60_000;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_MS,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: QUERY_REFETCH_MS,
        refetchIntervalInBackground: false,
        retry: 1,
      },
    },
  });
}
