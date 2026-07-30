import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { aiChatJson, extractJsonObject } from "@/lib/ai-client";
import { EXERCISES, getExercise } from "@/lib/exercises";
import { getMacroWarnings, sumMacros } from "@/lib/macros";
import {
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
  resolveTargets,
  todayISODate,
  type ActivityLevel,
} from "@/lib/tdee";

export type CoachScope = "today" | "workout";

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
    .slice(0, 7)
    .map(([date, foods]) => {
      const totals = sumMacros(foods);
      const isCurrentDay = date === today;
      const partial = intakeLooksPartial(
        totals.calories,
        targets.calorieTarget,
        isCurrentDay,
      );
      const warnings =
        partial && isCurrentDay
          ? []
          : getMacroWarnings(totals, {
              calorieTarget: targets.calorieTarget,
              proteinG: targets.proteinG,
              carbsG: targets.carbsG,
              fatG: targets.fatG,
            }).map((w) => w.title);
      return {
        date,
        totals,
        dayNotFinished: isCurrentDay,
        intakePartial: partial,
        intakePercentOfTarget:
          targets.calorieTarget > 0
            ? Math.round((totals.calories / targets.calorieTarget) * 100)
            : 0,
        warnings,
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
    limit: 10,
  });

  const recentWorkouts = sessions.slice(0, 12).map((s) => ({
    date: s.date,
    name: s.name,
    durationMinutes: s.durationMinutes,
    distanceKm: s.distanceKm,
    caloriesBurned: s.caloriesBurned,
    exercises: (s.sets ?? []).slice(0, 16).map((set) => ({
      lift: set.lift,
      name: getExercise(set.lift)?.name ?? set.lift,
      type: getExercise(set.lift)?.type ?? null,
      reps: set.reps,
      weightKg: set.weightKg,
    })),
  }));

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
      intake: todayTotals,
      foodCount: todayFoods.length,
      sessions: recentWorkouts.filter((w) => w.date === today),
      nutritionNote: todayPartial
        ? "The calendar day has not finished. Logged calories are partial — do NOT treat low intake as a severe deficit, starvation, or failed adherence. Mention that more meals are likely still ahead."
        : "Most of today's intake appears logged.",
    },
    recentNutrition,
    recentWorkouts,
    recentWeights: weightLogs.map((w) => ({
      date: w.date,
      weightKg: w.weightKg,
    })),
  };
}

async function buildWorkoutContext(userId: string) {
  const base = await buildTodayContext(userId);
  const gymish = base.recentWorkouts.filter((w) =>
    (w.exercises ?? []).some((e) => e.type !== "cardio"),
  );
  const cardio = base.recentWorkouts.filter(
    (w) =>
      /\brun\b/i.test(String(w.name || "")) ||
      (w.distanceKm != null && Number(w.distanceKm) > 0) ||
      (w.exercises ?? []).some((e) => e.type === "cardio"),
  );

  const availableExercises = EXERCISES.filter(
    (e) => !["squat", "deadlift", "bench"].includes(e.id),
  ).map((e) => ({
    id: e.id,
    name: e.name,
    place: e.group,
    type: e.type,
    muscles: e.muscles.slice(0, 3),
  }));

  return {
    ...base,
    focus: {
      strengthSessions: gymish.slice(0, 8),
      cardioSessions: cardio.slice(0, 8),
      note: "Prefer naming specific catalog exercises to ADD or REPLACE. Cardio volume is secondary to lift/selection advice.",
    },
    availableExercises,
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
      : await buildTodayContext(userId);

  const system =
    scope === "workout"
      ? `You are a pragmatic strength & conditioning coach for body recomposition.
Use the user's goalTarget (if set), recent sessions, lifts, cardio, and availableExercises (catalog they can log in the app).
If nutrition context includes today with dayNotFinished or intakePartial, do not judge calorie deficits from partial daily intake.
CRITICAL for "improve": do NOT stop at vague praise ("good mix") or only "do more cardio". At least 2 improve bullets must name specific exercises from availableExercises to ADD to sessions or REPLACE a current lift (e.g. "Replace X with Y" or "Add Z for 3×8–12"). Include sets/reps when helpful. Cardio tips are optional extras, not the main improve content.
Keep doing may name lifts they should keep. Do not invent logged numbers — only suggest based on patterns.
${JSON_SHAPE}
keepDoing / improve / watchOut: 2-4 short actionable bullets each.`
      : `You are a pragmatic body-recomposition coach.
Blend nutrition adherence, workout consistency, weight trend, and the user's goalTarget (open text — e.g. lose fat, recomp, gain muscle).
EEE burn is insight-only and is NOT added to the calorie target.
When context.today.dayNotFinished is true or intakePartial is true, the day is still in progress: never call low logged calories a severe deficit, deficiency, or failed day. Compare to partial intake only and note more food is likely coming.
For recentNutrition rows with dayNotFinished or intakePartial, apply the same rule — do not infer full-day deficits from morning or partial logs.
Be specific and concise; no medical claims.
${JSON_SHAPE}
keepDoing / improve / watchOut: 2-4 short actionable bullets each.`;

  const user = JSON.stringify({
    scope,
    instruction:
      scope === "workout"
        ? "Review recent lifts vs goal. In improve, prescribe specific catalog exercises to add or swap in — not generic volume/cardio-only tips."
        : "Summarize today + recent trends; say what to keep doing and what to improve.",
    ...(userRequest
      ? {
          userPriorityRequest: userRequest,
          note: "userPriorityRequest overrides other emphasis.",
        }
      : {}),
    context,
  });

  const { content, model } = await aiChatJson({
    system,
    user,
    temperature: 0.5,
  });
  return parseAdvice(content, model);
}
