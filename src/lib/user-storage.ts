/** localStorage key scoped to the signed-in user. */
export function userStorageKey(
  base: string,
  userId: string | null | undefined,
) {
  if (!userId) return null;
  return `${base}:${userId}`;
}
