/** localStorage key scoped to the signed-in user. */
export function userStorageKey(
  base: string,
  userId: string | null | undefined,
) {
  if (!userId) return null;
  return `${base}:${userId}`;
}

/**
 * Read a user-scoped value. One-shot migrates legacy unscoped `base` → `base:userId`.
 */
export function readUserStorageItem(
  base: string,
  userId: string | null | undefined,
): string | null {
  const key = userStorageKey(base, userId);
  if (!key || typeof window === "undefined") return null;
  try {
    const scoped = window.localStorage.getItem(key);
    if (scoped != null) return scoped;
    const legacy = window.localStorage.getItem(base);
    if (legacy == null) return null;
    window.localStorage.setItem(key, legacy);
    window.localStorage.removeItem(base);
    return legacy;
  } catch {
    return null;
  }
}

export function writeUserStorageItem(
  base: string,
  userId: string | null | undefined,
  value: string,
) {
  const key = userStorageKey(base, userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function removeUserStorageItem(
  base: string,
  userId: string | null | undefined,
) {
  const key = userStorageKey(base, userId);
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
