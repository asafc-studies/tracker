import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

/** After a successful server write — refresh related caches immediately. */
export async function invalidateAfterMacros(
  queryClient: QueryClient,
  date: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["macros"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
    queryClient.invalidateQueries({ queryKey: ["history"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.menuDaily(date) }),
  ]);
}

export async function invalidateAfterLifts(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["lifts"] }),
    queryClient.invalidateQueries({ queryKey: ["history"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.workoutPlans }),
  ]);
}

export async function invalidateAfterWeight(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["history"] }),
    queryClient.invalidateQueries({ queryKey: ["lifts"] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
  ]);
}

export async function invalidateAfterMenu(
  queryClient: QueryClient,
  date?: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["menu"] }),
    date
      ? queryClient.invalidateQueries({ queryKey: queryKeys.macros(date) })
      : Promise.resolve(),
  ]);
}

export async function invalidateAfterProfile(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
    queryClient.invalidateQueries({ queryKey: ["macros"] }),
    queryClient.invalidateQueries({ queryKey: ["menu"] }),
    queryClient.invalidateQueries({ queryKey: ["history"] }),
  ]);
}
