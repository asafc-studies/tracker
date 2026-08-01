/** Adult sleep band (AASM / Sleep Research Society). */
export const SLEEP_HOURS_MIN = 7;
export const SLEEP_HOURS_MAX = 9;

export const SLEEP_QUALITY_LABELS = [
  "",
  "Poor",
  "Fair",
  "Ok",
  "Good",
  "Great",
] as const;

export type SleepBand = "short" | "ok" | "long";

/** Parse "HH:MM" or "H:MM" → minutes from midnight, or null. */
export function parseClockTime(raw: unknown): number | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function formatClockTime(raw: string | null | undefined): string {
  if (!raw) return "";
  const mins = parseClockTime(raw);
  if (mins == null) return raw;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Hours between from→until. Overnight when until < from.
 * Same clock times are invalid (not a 24h sleep).
 */
export function hoursFromUntil(from: string, until: string): number | null {
  const a = parseClockTime(from);
  const b = parseClockTime(until);
  if (a == null || b == null) return null;
  if (a === b) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60;
  if (diff > 24 * 60) return null;
  return Math.round((diff / 60) * 10) / 10;
}

export function formatSleepWindow(
  fromTime: string | null | undefined,
  untilTime: string | null | undefined,
  hours: number,
): string {
  const from = formatClockTime(fromTime);
  const until = formatClockTime(untilTime);
  if (from && until) return `${from} → ${until} · ${hours}h`;
  return `${hours}h`;
}

export function sleepBandStatus(hours: number): SleepBand {
  if (hours < SLEEP_HOURS_MIN) return "short";
  if (hours > SLEEP_HOURS_MAX) return "long";
  return "ok";
}

export function sleepBandLabel(hours: number): string {
  const band = sleepBandStatus(hours);
  if (band === "short") return `Below ${SLEEP_HOURS_MIN}h — recovery risk`;
  if (band === "long") return `Above ${SLEEP_HOURS_MAX}h — fine if you feel rested`;
  return `In the ${SLEEP_HOURS_MIN}–${SLEEP_HOURS_MAX}h adult band`;
}

export function qualityLabel(quality: number): string {
  const q = Math.round(quality);
  if (q < 1 || q > 5) return "—";
  return SLEEP_QUALITY_LABELS[q] ?? "—";
}

/** Underslept for tip banners: short duration or poor quality. */
export function isUnderslept(hours: number, quality: number): boolean {
  return hours < SLEEP_HOURS_MIN || quality <= 2;
}

export function sleepDeficitTip(opts: {
  hours: number;
  quality: number;
  deficitKcal?: number | null;
  proteinMinG?: number | null;
}): string | null {
  if (!isUnderslept(opts.hours, opts.quality)) return null;
  const deficit = opts.deficitKcal ?? 0;
  const protein = opts.proteinMinG;
  if (deficit >= 400) {
    return protein
      ? `Short/poor sleep + a ${deficit} kcal deficit — don’t cut harder today; protect ~${protein}g protein (1.61 g/kg floor).`
      : `Short/poor sleep + a ${deficit} kcal deficit — don’t cut harder today; prioritize recovery.`;
  }
  return protein
    ? `Short or rough sleep — appetite often rises; stick near your ~${protein}g protein floor.`
    : "Short or rough sleep — appetite often rises; keep protein steady and ease training intensity.";
}

export function sleepTrainingTip(hours: number, quality: number): string | null {
  if (!isUnderslept(hours, quality)) return null;
  return "Last night was short or rough — favor technique work over PR attempts; sleep is when recovery hormones peak.";
}

export type SleepStatRow = {
  date: string;
  hours: number;
  quality: number;
  fromTime?: string | null;
  untilTime?: string | null;
};

export type SleepStats = {
  nights: number;
  avgHours: number | null;
  avgQuality: number | null;
  inBandPct: number | null;
  shortNights: number;
  longNights: number;
  /** Std dev of hours — lower = more consistent duration. */
  hoursStdDev: number | null;
  shortest: number | null;
  longest: number | null;
  avgBedtime: string | null;
  avgWake: string | null;
  /** Consecutive in-band nights ending at the most recent log. */
  goodStreak: number;
  weekdayAvgHours: number | null;
  weekendAvgHours: number | null;
};

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function mean(nums: number[]) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]) {
  if (nums.length < 2) return null;
  const m = mean(nums)!;
  const v = nums.reduce((a, n) => a + (n - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

/** Bedtime minutes with early-AM rolled into “next day” for averaging. */
function bedtimeMinutesForAvg(fromTime: string): number | null {
  const m = parseClockTime(fromTime);
  if (m == null) return null;
  return m < 12 * 60 ? m + 24 * 60 : m;
}

function minutesToClock(total: number): string {
  const norm = ((Math.round(total) % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(norm / 60);
  const min = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function isWeekendDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function computeSleepStats(rows: SleepStatRow[]): SleepStats {
  const empty: SleepStats = {
    nights: 0,
    avgHours: null,
    avgQuality: null,
    inBandPct: null,
    shortNights: 0,
    longNights: 0,
    hoursStdDev: null,
    shortest: null,
    longest: null,
    avgBedtime: null,
    avgWake: null,
    goodStreak: 0,
    weekdayAvgHours: null,
    weekendAvgHours: null,
  };
  if (rows.length === 0) return empty;

  const hours = rows.map((r) => r.hours);
  const qualities = rows.map((r) => r.quality);
  const inBand = rows.filter(
    (r) => r.hours >= SLEEP_HOURS_MIN && r.hours <= SLEEP_HOURS_MAX,
  ).length;
  const shortNights = rows.filter((r) => r.hours < SLEEP_HOURS_MIN).length;
  const longNights = rows.filter((r) => r.hours > SLEEP_HOURS_MAX).length;

  const bedMins = rows
    .map((r) => (r.fromTime ? bedtimeMinutesForAvg(r.fromTime) : null))
    .filter((m): m is number => m != null);
  const wakeMins = rows
    .map((r) => (r.untilTime ? parseClockTime(r.untilTime) : null))
    .filter((m): m is number => m != null);

  const weekday = rows.filter((r) => !isWeekendDate(r.date)).map((r) => r.hours);
  const weekend = rows.filter((r) => isWeekendDate(r.date)).map((r) => r.hours);

  // Streak: sort newest first, count consecutive in-band from start.
  const newestFirst = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  let goodStreak = 0;
  for (const r of newestFirst) {
    if (r.hours >= SLEEP_HOURS_MIN && r.hours <= SLEEP_HOURS_MAX) goodStreak += 1;
    else break;
  }

  const avgH = mean(hours);
  const avgQ = mean(qualities);
  const sd = stdDev(hours);

  return {
    nights: rows.length,
    avgHours: avgH != null ? round1(avgH) : null,
    avgQuality: avgQ != null ? round1(avgQ) : null,
    inBandPct: Math.round((inBand / rows.length) * 100),
    shortNights,
    longNights,
    hoursStdDev: sd != null ? round1(sd) : null,
    shortest: round1(Math.min(...hours)),
    longest: round1(Math.max(...hours)),
    avgBedtime: mean(bedMins) != null ? minutesToClock(mean(bedMins)!) : null,
    avgWake: mean(wakeMins) != null ? minutesToClock(mean(wakeMins)!) : null,
    goodStreak,
    weekdayAvgHours: mean(weekday) != null ? round1(mean(weekday)!) : null,
    weekendAvgHours: mean(weekend) != null ? round1(mean(weekend)!) : null,
  };
}

export function consistencyLabel(stdDev: number | null): string | null {
  if (stdDev == null) return null;
  if (stdDev < 0.5) return "Very steady duration";
  if (stdDev < 1) return "Fairly consistent";
  if (stdDev < 1.5) return "Some night-to-night swing";
  return "Highly variable duration";
}
