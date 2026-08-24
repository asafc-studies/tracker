import {
  readUserStorageItem,
  removeUserStorageItem,
  writeUserStorageItem,
} from "@/lib/user-storage";
import { todayISODate } from "@/lib/tdee";

/** Keep two weeks of exercise/lifts payloads warm for instant UI. */
export const LIFTS_CACHE_WINDOW_DAYS = 14;
const STORAGE_BASE = "lifts-local-v1";

/** Full `/api/lifts?date=` response — stored as-is for hydrate. */
export type LiftsLocalPayload = Record<string, unknown>;

type DayEntry = {
  updatedAt: number;
  data: LiftsLocalPayload;
};

type Store = {
  userId: string;
  days: Record<string, DayEntry>;
};

function shiftISODate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  return todayISODate(dt);
}

function cutoffDate(today = todayISODate()): string {
  return shiftISODate(today, -(LIFTS_CACHE_WINDOW_DAYS - 1));
}

function prune(store: Store, today = todayISODate()): Store {
  const min = cutoffDate(today);
  const days: Record<string, DayEntry> = {};
  for (const [date, entry] of Object.entries(store.days)) {
    if (date >= min && date <= today) days[date] = entry;
  }
  return { ...store, days };
}

function readStore(userId: string | null | undefined): Store | null {
  if (!userId) return null;
  const raw = readUserStorageItem(STORAGE_BASE, userId);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || parsed.userId !== userId || typeof parsed.days !== "object") {
      return null;
    }
    return prune(parsed);
  } catch {
    return null;
  }
}

function writeStore(store: Store) {
  writeUserStorageItem(
    STORAGE_BASE,
    store.userId,
    JSON.stringify(prune(store)),
  );
}

export function readLiftsLocal(
  userId: string | null | undefined,
  date: string,
): LiftsLocalPayload | null {
  const store = readStore(userId);
  if (!store) return null;
  const min = cutoffDate();
  if (date < min || date > todayISODate()) return null;
  return store.days[date]?.data ?? null;
}

export function writeLiftsLocal(
  userId: string | null | undefined,
  date: string,
  data: LiftsLocalPayload,
) {
  if (!userId) return;
  const min = cutoffDate();
  const today = todayISODate();
  if (date < min || date > today) return;
  const prev = readStore(userId) ?? { userId, days: {} };
  prev.days[date] = { updatedAt: Date.now(), data };
  writeStore({ ...prev, userId });
}

export function clearLiftsLocal(userId: string | null | undefined) {
  removeUserStorageItem(STORAGE_BASE, userId);
}

export function liftsCacheDateWindow(today = todayISODate()): string[] {
  const out: string[] = [];
  for (let i = 0; i < LIFTS_CACHE_WINDOW_DAYS; i++) {
    out.push(shiftISODate(today, -i));
  }
  return out;
}
