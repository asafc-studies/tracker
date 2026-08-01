import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiChatJson, extractJsonObject } from "@/lib/ai-client";
import { EXERCISES, getExercise } from "@/lib/exercises";
import { sumMacros } from "@/lib/macros";
import {
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
  resolveTargets,
  todayISODate,
  type ActivityLevel,
} from "@/lib/tdee";
import { listWorkoutPlans } from "@/lib/workout-plans";

export type CoachScope = "today" | "workout" | "sleep";

export type CoachAdvice = {
  summary: string;
  keepDoing: string[];
  improve: string[];
  watchOut: string[];
  model: string;
};

function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function localDayContext() {
  const now = new Date();
  return {
    localTime: now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    localHour: now.getHours(),
  };
}

function intakeLooksPartial(
  calories: number,
  calorieTarget: number,
  isCurrentDay: boolean,
) {
  if (!isCurrentDay) {
    return calories < calorieTarget * 0.55;
  }
  /** Current day: always treat as in progress until most of target is logged. */
  return calories < calorieTarget * 0.85;
}

function asStringList(raw: unknown, max = 5): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Collapse many sets into "Name 3×8@60" lines. */
function compactLifts(
  sets: Array<{ lift: string; reps: number; weightKg: number }>,
  max = 8,
): string[] {
  const order: string[] = [];
  const map = new Map<
    string,
    { name: string; type: string | null; sets: number; reps: number; kg: number }
  >();
  for (const set of sets) {
    const ex = getExercise(set.lift);
    if (!map.has(set.lift)) {
      order.push(set.lift);
      map.set(set.lift, {
        name: ex?.name ?? set.lift.replace(/_/g, " "),
        type: ex?.type ?? null,
        sets: 0,
        reps: set.reps,
        kg: set.weightKg,
      });
    }
    const row = map.get(set.lift)!;
    row.sets += 1;
    row.reps = set.reps;
    row.kg = set.weightKg;
  }
  return order.slice(0, max).map((id) => {
    const r = map.get(id)!;
    if (r.type === "cardio") return r.name;
    if (r.kg > 0) return `${r.name} ${r.sets}×${r.reps}@${r.kg}`;
    return `${r.name} ${r.sets}×${r.reps}`;
  });
}

function formatPlanItem(item: {
  name: string;
  setsCount: number;
  reps: number;
  weightKg: number;
  cardio: boolean;
  bodyweight: boolean;
}): string {
  if (item.cardio) return item.name;
  if (item.bodyweight && item.weightKg <= 0) {
    return `${item.name} ${item.setsCount}×${item.reps} BW`;
  }
  if (item.bodyweight) {
    return `${item.name} ${item.setsCount}×${item.reps} BW+${item.weightKg}`;
  }
  return `${item.name} ${item.setsCount}×${item.reps}@${item.weightKg}`;
}

/** Small catalog hints for gaps — never send the full exercise list. */
function catalogHintsForPlans(
  planLiftIds: string[],
  max = 18,
): string[] {
  const used = new Set(planLiftIds);
  const covered = new Set<string>();
  for (const id of planLiftIds) {
    const ex = getExercise(id);
    ex?.muscles.forEach((m) => covered.add(m));
  }

  const priorityMuscles = [
    "rear_delts",
    "abs",
    "obliques",
    "hamstrings",
    "glutes",
    "lats",
    "upper_chest",
    "side_delts",
    "calves",
    "triceps",
    "biceps",
  ];

  const hints: string[] = [];
  for (const muscle of priorityMuscles) {
    if (hints.length >= max) break;
    if (covered.has(muscle)) continue;
    const candidates = EXERCISES.filter(
      (e) =>
        !used.has(e.id) &&
        !["squat", "deadlift", "bench"].includes(e.id) &&
        e.muscles.includes(muscle as never) &&
        e.type !== "cardio",
    ).slice(0, 2);
    for (const e of candidates) {
      if (hints.length >= max) break;
      hints.push(`${e.name} (${e.group}, ${muscle})`);
      used.add(e.id);
    }
  }

  if (hints.length < 8) {
    for (const e of EXERCISES) {
      if (hints.length >= max) break;
      if (used.has(e.id) || ["squat", "deadlift", "bench"].includes(e.id)) {
        continue;
      }
      if (e.type === "cardio") continue;
      hints.push(`${e.name} (${e.group})`);
      used.add(e.id);
    }
  }
  return hints;
}

async function loadProfileContext(userId: string) {
  const db = await getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  const targets =
    profile?.weightKg && profile.bodyFatPercent != null
      ? resolveTargets({
          weightKg: profile.weightKg,
          heightCm: profile.heightCm,
          age: profile.age,
          sex: (profile.sex as "male" | "female" | null) ?? null,
          bodyFatPercent: profile.bodyFatPercent,
          activityLevel: (profile.activityLevel ??
            "moderate") as ActivityLevel,
          deficitKcal: profile.deficitKcal ?? DEFAULT_DEFICIT_KCAL,
          proteinPerKg: profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
          calorieTargetOverride: profile.calorieTargetOverride ?? null,
          proteinTargetOverride: profile.proteinTargetOverride ?? null,
        })
      : null;

  return {
    db,
    profile,
    targets,
    goalTarget: profile?.goalTarget?.trim() || null,
  };
}

async function buildTodayContext(userId: string) {
  const { db, profile, targets, goalTarget } = await loadProfileContext(userId);
  if (!targets) {
    throw new Error("Complete profile targets before requesting coaching.");
  }

  const today = todayISODate();
  const since = daysAgoISO(14);
  const { localTime, localHour } = localDayContext();

  const foodLogs = await db.query.foodLogs.findMany({
    where: and(
      eq(schema.foodLogs.userId, userId),
      gte(schema.foodLogs.date, since),
    ),
    orderBy: [desc(schema.foodLogs.date)],
  });

  const byDate = new Map<string, typeof foodLogs>();
  for (const log of foodLogs) {
    const list = byDate.get(log.date) ?? [];
    list.push(log);
    byDate.set(log.date, list);
  }

  const recentNutrition = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, 5)
    .map(([date, foods]) => {
      const totals = sumMacros(foods);
      const isCurrentDay = date === today;
      const partial = intakeLooksPartial(
        totals.calories,
        targets.calorieTarget,
        isCurrentDay,
      );
      return {
        date,
        kcal: Math.round(totals.calories),
        proteinG: Math.round(totals.proteinG),
        carbsG: Math.round(totals.carbsG),
        fatG: Math.round(totals.fatG),
        dayNotFinished: isCurrentDay,
        intakePartial: partial,
        pctTarget:
          targets.calorieTarget > 0
            ? Math.round((totals.calories / targets.calorieTarget) * 100)
            : 0,
      };
    });

  const todayFoods = byDate.get(today) ?? [];
  const todayTotals = sumMacros(todayFoods);
  const todayPartial = intakeLooksPartial(
    todayTotals.calories,
    targets.calorieTarget,
    true,
  );

  const sessions = await db.query.workoutSessions.findMany({
    where: and(
      eq(schema.workoutSessions.userId, userId),
      gte(schema.workoutSessions.date, since),
    ),
    with: { sets: true },
    orderBy: [desc(schema.workoutSessions.date)],
  });

  const weightLogs = await db.query.weightLogs.findMany({
    where: and(
      eq(schema.weightLogs.userId, userId),
      gte(schema.weightLogs.date, since),
    ),
    orderBy: [desc(schema.weightLogs.date)],
    limit: 6,
  });

  const sleepLogs = await db.query.sleepLogs.findMany({
    where: and(
      eq(schema.sleepLogs.userId, userId),
      gte(schema.sleepLogs.date, since),
    ),
    orderBy: [desc(schema.sleepLogs.date)],
    limit: 14,
  });

  const recentWorkouts = sessions.slice(0, 8).map((s) => ({
    date: s.date,
    name: s.name || "Workout",
    min: s.durationMinutes ?? null,
    km: s.distanceKm ?? null,
    lifts: compactLifts(s.sets ?? [], 8),
  }));

  const lastSleep = sleepLogs[0] ?? null;
  const sleep7 = sleepLogs.filter((s) => s.date >= daysAgoISO(7));
  const avgHours7 =
    sleep7.length > 0
      ? Math.round(
          (sleep7.reduce((a, s) => a + s.hours, 0) / sleep7.length) * 10,
        ) / 10
      : null;

  return {
    goalTarget,
    body: {
      weightKg: profile?.weightKg ?? null,
      bodyFatPercent: profile?.bodyFatPercent ?? null,
      activityLevel: profile?.activityLevel ?? null,
    },
    macroTargets: {
      calorieTarget: targets.calorieTarget,
      proteinG: targets.proteinG,
      proteinRange: {
        minG: targets.proteinMinG,
        goodG: targets.proteinGoodG,
        maxG: targets.proteinMaxG,
        perKg: { min: 1.61, good: 1.85, max: 2.2 },
        note: "Evidence band for recomp protein. Adherence floor is minG (1.61 g/kg). Soft zone min→good; strong zone good→max. Planning macros use ~1.85 g/kg — do not treat maxG as a hard daily requirement.",
      },
      carbsG: targets.carbsG,
      fatG: targets.fatG,
      tdee: targets.tdee,
      deficit: targets.deficit,
    },
    today: {
      date: today,
      localTime,
      localHour,
      dayNotFinished: true,
      intakePartial: todayPartial,
      intakePercentOfTarget:
        targets.calorieTarget > 0
          ? Math.round((todayTotals.calories / targets.calorieTarget) * 100)
          : 0,
      intake: {
        calories: Math.round(todayTotals.calories),
        proteinG: Math.round(todayTotals.proteinG),
        carbsG: Math.round(todayTotals.carbsG),
        fatG: Math.round(todayTotals.fatG),
      },
      foodCount: todayFoods.length,
      sessions: recentWorkouts.filter((w) => w.date === today),
      nutritionNote: todayPartial
        ? "Day not finished — partial intake only; do not call this a severe deficit."
        : "Most of today's intake appears logged.",
      lastNightSleep: lastSleep
        ? {
            date: lastSleep.date,
            from: lastSleep.fromTime,
            until: lastSleep.untilTime,
            hours: lastSleep.hours,
            quality: lastSleep.quality,
            note: lastSleep.note,
            belowSeven: lastSleep.hours < 7,
          }
        : null,
    },
    recentNutrition,
    recentWorkouts,
    recentWeights: weightLogs.map((w) => ({
      date: w.date,
      weightKg: w.weightKg,
    })),
    recentSleep: sleepLogs.slice(0, 10).map((s) => ({
      date: s.date,
      from: s.fromTime,
      until: s.untilTime,
      hours: s.hours,
      quality: s.quality,
      note: s.note,
    })),
    sleepSummary: {
      avgHoursLast7: avgHours7,
      nightsBelow7Last7: sleep7.filter((s) => s.hours < 7).length,
      adultBand: "7–9 hours",
    },
  };
}

async function buildSleepContext(userId: string) {
  const base = await buildTodayContext(userId);
  return {
    goalTarget: base.goalTarget,
    body: base.body,
    macroTargets: {
      calorieTarget: base.macroTargets.calorieTarget,
      proteinMinG: base.macroTargets.proteinRange.minG,
      deficit: base.macroTargets.deficit,
      note: "High deficit + short sleep raises hunger and recovery risk — protect protein floor, don't cut harder.",
    },
    sleepSummary: base.sleepSummary,
    recentSleep: base.recentSleep,
    lastNight: base.today.lastNightSleep,
    recentWorkoutDays: [
      ...new Set(base.recentWorkouts.map((w) => w.date)),
    ].slice(0, 7),
    guidance:
      "Adults: 7–9h. Consistency beats weekend catch-up. Deep sleep supports recovery hormones after lifting.",
  };
}

async function buildWorkoutContext(userId: string) {
  const base = await buildTodayContext(userId);
  const { plans } = await listWorkoutPlans(userId);

  const planLiftIds = plans.flatMap((p) => p.items.map((i) => i.lift));
  const workoutPlans = plans.slice(0, 8).map((p) => ({
    name: p.name,
    pool: p.items.slice(0, 16).map(formatPlanItem),
  }));

  return {
    goalTarget: base.goalTarget,
    body: base.body,
    macroTargets: {
      calorieTarget: base.macroTargets.calorieTarget,
      proteinG: base.macroTargets.proteinG,
      deficit: base.macroTargets.deficit,
    },
    todayNutrition: {
      dayNotFinished: base.today.dayNotFinished,
      intakePartial: base.today.intakePartial,
      note: base.today.nutritionNote,
      kcal: base.today.intake.calories,
      proteinG: base.today.intake.proteinG,
    },
    recentWorkouts: base.recentWorkouts.slice(0, 6),
    recentWeights: base.recentWeights.slice(0, 4),
    workoutPlans,
    workoutPlansNote:
      "Each plan is a candidate pool — usually only a subset is used per session. Never treat a plan as one mandatory full workout.",
    catalogHints: catalogHintsForPlans(planLiftIds, 16),
  };
}

function parseAdvice(content: string, model: string): CoachAdvice {
  let parsed: {
    summary?: string;
    keepDoing?: unknown;
    improve?: unknown;
    watchOut?: unknown;
  };
  try {
    parsed = JSON.parse(extractJsonObject(content)) as typeof parsed;
  } catch {
    throw new Error("Could not parse AI coaching JSON");
  }

  const summary = String(parsed.summary || "").trim();
  if (!summary) throw new Error("AI returned empty coaching summary");

  return {
    summary,
    keepDoing: asStringList(parsed.keepDoing),
    improve: asStringList(parsed.improve),
    watchOut: asStringList(parsed.watchOut),
    model,
  };
}

const JSON_SHAPE = `Return ONLY valid JSON (no markdown):
{"summary":"3-5 sentences on trends vs the user's goal","keepDoing":["..."],"improve":["..."],"watchOut":["..."]}`;

export async function coachWithAI(
  userId: string,
  scope: CoachScope,
  userRequest?: string,
): Promise<CoachAdvice> {
  const context =
    scope === "workout"
      ? await buildWorkoutContext(userId)
      : scope === "sleep"
        ? await buildSleepContext(userId)
        : await buildTodayContext(userId);

  const system =
    scope === "workout"
      ? `You are a pragmatic strength & conditioning coach for body recomposition.
Use goalTarget, body, recentWorkouts, workoutPlans, and catalogHints.
workoutPlans are candidate pools — usually only a subset is done per session; never treat a full plan as one mandatory workout.
If todayNutrition.intakePartial, do not judge calorie deficits from partial intake.
improve: at least 2 bullets with concrete plan adds/swaps or set/rep/weight tweaks (name the plan + exercise). Prefer catalogHints or lifts already in plans/history. Avoid vague "good mix" / cardio-only tips.
${JSON_SHAPE}
2-4 short bullets each in keepDoing / improve / watchOut.`
      : scope === "sleep"
        ? `You are a pragmatic recovery coach for body recomposition.
Adults generally need 7–9 hours. Short sleep raises hunger and impairs recovery — with a calorie deficit, protect the protein floor (~1.61 g/kg) and avoid pushing harder cuts.
Consistency beats weekend catch-up. Tie advice to recentSleep, sleepSummary, deficit, and recentWorkoutDays.
Be specific and concise; no medical claims or diagnoses.
${JSON_SHAPE}
2-4 short bullets each in keepDoing / improve / watchOut.`
      : `You are a pragmatic body-recomposition coach.
Blend nutrition adherence, workout consistency, weight trend, sleep (if present), and goalTarget.
EEE is insight-only, not added to the calorie target.
Protein uses an evidence range (macroTargets.proteinRange): floor ≈1.61 g/kg, strong zone ≈1.85–2.2 g/kg. Judge under-eating vs the floor, not the ceiling; food logs may look "low" vs maxG while still being in range.
If today.dayNotFinished or intakePartial (or recentNutrition.intakePartial), do not call low calories a severe deficit — the day may be unfinished.
If lastNightSleep.belowSeven or quality is low, mention recovery/appetite briefly.
Be specific and concise; no medical claims.
${JSON_SHAPE}
2-4 short bullets each in keepDoing / improve / watchOut.`;

  const userPayload = {
    scope,
    instruction:
      scope === "workout"
        ? "Advise on named plans (pools) and recent lifts vs goal. Suggest specific adds/swaps and load tweaks."
        : scope === "sleep"
          ? "Summarize sleep trends vs recomp recovery; give concrete keep doing / improve / watch outs."
          : "Summarize today + recent trends; keep doing / improve.",
    ...(userRequest
      ? {
          userPriorityRequest: userRequest.slice(0, 400),
          note: "userPriorityRequest overrides other emphasis.",
        }
      : {}),
    context,
  };

  const { content, model } = await aiChatJson({
    system,
    user: JSON.stringify(userPayload),
    temperature: 0.5,
  });
  return parseAdvice(content, model);
}
