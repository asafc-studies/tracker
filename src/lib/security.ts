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
