/** Local wall-clock helpers — avoid server-TZ Date(y,m,d,h,min) bugs. */

export function formatLocalHHMM(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Combine a calendar YYYY-MM-DD + local HH:MM into an absolute ISO instant.
 * Must run in the user's browser (or any runtime whose local TZ matches the user).
 */
export function localDateTimeToISO(date: string, hhmm: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, h || 0, min || 0, 0, 0).toISOString();
}

/** Display an ISO / Date as local HH:MM. */
export function isoToLocalHHMM(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return formatLocalHHMM(d);
}
