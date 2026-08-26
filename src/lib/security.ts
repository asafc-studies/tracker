/** Shared input guards (OWASP WSTG: input validation / injection). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

/** Strip LIKE wildcards so user input cannot broaden SQL patterns. */
export function sanitizeLikeQuery(query: string): string {
  return query.replace(/[%_]/g, "").trim();
}

export function clampString(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export const MAX_FOOD_NAME_LEN = 200;
export const MAX_BRAND_LEN = 120;
export const MAX_LIST_NAME_LEN = 80;
export const MAX_ITEM_TITLE_LEN = 200;

/** Optional HH:MM (24h). Accepts HH:MM:SS from some browsers’ time inputs. Empty/null → null. */
export function parseOptionalHHMM(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export type RemindFreq = "off" | "daily" | "weekdays" | "weekly";

export function parseRemindFreq(value: unknown): RemindFreq {
  const s = String(value ?? "off");
  if (s === "daily" || s === "weekdays" || s === "weekly" || s === "off") {
    return s;
  }
  return "off";
}

/** 0=Sun … 6=Sat; null if invalid / not needed. */
export function parseRemindWeekday(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  return n;
}
