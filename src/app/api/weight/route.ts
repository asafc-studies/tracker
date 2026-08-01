import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { getExercise } from "@/lib/exercises";
import { syncProfileWeightFromLogs } from "@/lib/weight-sync";
import {
  caloriesBurnedSession,
  looksLikeCardioSession,
  resolveTargets,
  todayISODate,
  type ActivityLevel,
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
} from "@/lib/tdee";

function rangeStart(range: string): string | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function sessionIsCardio(
  name: string | null | undefined,
  sets?: Array<{ lift: string }>,
) {
  if (looksLikeCardioSession(name)) return true;
  return (sets ?? []).some((s) => getExercise(s.lift)?.type === "cardio");
}

function resolveSessionBurn(
  bodyWeightKg: number | null,
  s: {
    name?: string | null;
    durationMinutes?: number | null;
    distanceKm?: number | null;
    caloriesBurned?: number | null;
    sets?: Array<{ lift: string }>;
  },
) {
  const stored =
    s.caloriesBurned == null ? null : Number(s.caloriesBurned);
  if (stored != null && Number.isFinite(stored) && stored > 0) return stored;
  const duration =
    s.durationMinutes != null && Number(s.durationMinutes) > 0
      ? Number(s.durationMinutes)
      : null;
  if (!bodyWeightKg || duration == null) return null;
  return caloriesBurnedSession(bodyWeightKg, duration, {
    distanceKm: s.distanceKm,
    sessionName: s.name,
    cardio: sessionIsCardio(s.name, s.sets),
  });
}

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") || "weight";
  const range = searchParams.get("range") || "30d";
  const lift = (searchParams.get("lift") || "squat").toLowerCase();
  const start = rangeStart(range);

  const db = await getDb();

  if (tab === "weight") {
    const rows = await db.query.weightLogs.findMany({
      where: start
        ? and(
            eq(schema.weightLogs.userId, authz.userId),
            gte(schema.weightLogs.date, start),
          )
        : eq(schema.weightLogs.userId, authz.userId),
      orderBy: [schema.weightLogs.date],
    });
    return jsonOk({ tab, range, rows });
  }

  if (tab === "nutrition") {
    const foods = await db.query.foodLogs.findMany({
      where: start
        ? and(
            eq(schema.foodLogs.userId, authz.userId),
            gte(schema.foodLogs.date, start),
          )
        : eq(schema.foodLogs.userId, authz.userId),
    });

    const byDate: Record<
      string,
      { date: string; proteinG: number; calories: number }
    > = {};
    for (const f of foods) {
      if (!byDate[f.date]) {
        byDate[f.date] = { date: f.date, proteinG: 0, calories: 0 };
      }
      byDate[f.date].proteinG += f.proteinG;
      byDate[f.date].calories += f.calories;
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(schema.profiles.userId, authz.userId),
    });

    let proteinTarget: number | null = null;
    let calorieTarget: number | null = null;
    if (profile?.weightKg && profile.bodyFatPercent != null) {
      const targets = resolveTargets({
        weightKg: profile.weightKg,
        heightCm: profile.heightCm,
        age: profile.age,
        sex: (profile.sex as "male" | "female" | null) ?? null,
        bodyFatPercent: profile.bodyFatPercent,
        activityLevel: (profile.activityLevel ?? "moderate") as ActivityLevel,
        deficitKcal: profile.deficitKcal ?? DEFAULT_DEFICIT_KCAL,
        proteinPerKg: profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
        calorieTargetOverride: profile.calorieTargetOverride ?? null,
        proteinTargetOverride: profile.proteinTargetOverride ?? null,
      });
      if (targets) {
        proteinTarget = targets.proteinMinG;
        calorieTarget = targets.calorieTarget;
      }
    }

    const days = Object.values(byDate).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    return jsonOk({
      tab,
      range,
      days,
      proteinTarget,
      calorieTarget,
    });
  }

  if (tab === "sleep") {
    const rows = await db.query.sleepLogs.findMany({
      where: start
        ? and(
            eq(schema.sleepLogs.userId, authz.userId),
            gte(schema.sleepLogs.date, start),
          )
        : eq(schema.sleepLogs.userId, authz.userId),
      orderBy: [schema.sleepLogs.date],
    });
    return jsonOk({ tab, range, rows });
  }

  // Workout EEE (exercise energy expenditure) — insight only
  const sessions = await db.query.workoutSessions.findMany({
    where: start
      ? and(
          eq(schema.workoutSessions.userId, authz.userId),
          gte(schema.workoutSessions.date, start),
        )
      : eq(schema.workoutSessions.userId, authz.userId),
    orderBy: [schema.workoutSessions.date],
    with: { sets: true },
  });

  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, authz.userId),
  });
  const weightLogs = await db.query.weightLogs.findMany({
    where: eq(schema.weightLogs.userId, authz.userId),
  });
  const weightByDate = new Map(weightLogs.map((w) => [w.date, w.weightKg]));

  const byDate: Record<
    string,
    {
      date: string;
      caloriesBurned: number;
      durationMinutes: number;
      setCount: number;
      sessionCount: number;
    }
  > = {};

  const sessionsWithBurn = [];
  for (const s of sessions) {
    const bodyWeightKg =
      weightByDate.get(s.date) ?? profile?.weightKg ?? null;
    const caloriesBurned = resolveSessionBurn(bodyWeightKg, s);
    /** Backfill wiped cache so future reads stay cheap. */
    if (
      caloriesBurned != null &&
      caloriesBurned > 0 &&
      (s.caloriesBurned == null || Number(s.caloriesBurned) <= 0) &&
      s.durationMinutes != null &&
      Number(s.durationMinutes) > 0
    ) {
      await db
        .update(schema.workoutSessions)
        .set({ caloriesBurned })
        .where(eq(schema.workoutSessions.id, s.id));
    }
    sessionsWithBurn.push({ ...s, caloriesBurned });

    if (!byDate[s.date]) {
      byDate[s.date] = {
        date: s.date,
        caloriesBurned: 0,
        durationMinutes: 0,
        setCount: 0,
        sessionCount: 0,
      };
    }
    byDate[s.date].sessionCount += 1;
    byDate[s.date].setCount += s.sets.length;
    if (s.durationMinutes && s.durationMinutes > 0) {
      byDate[s.date].durationMinutes += s.durationMinutes;
      byDate[s.date].caloriesBurned += caloriesBurned ?? 0;
    }
  }

  const series = Object.values(byDate)
    .filter((d) => d.caloriesBurned > 0 || d.setCount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const recent = [...sessionsWithBurn].reverse().slice(0, 20);

  return jsonOk({ tab: "eee", range, series, sessions: recent });
}

export async function POST(req: Request) {
  // Quick log today's weight from history
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const weightKg = Number(body.weightKg);
  const date = String(body.date || todayISODate());
  const note = body.note ? String(body.note) : undefined;

  if (date > todayISODate()) {
    return jsonError("Cannot log weight for a future date");
  }

  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return jsonError("Invalid weight");
  }

  const db = await getDb();
  const existing = await db.query.weightLogs.findFirst({
    where: and(
      eq(schema.weightLogs.userId, authz.userId),
      eq(schema.weightLogs.date, date),
    ),
  });

  if (existing) {
    await db
      .update(schema.weightLogs)
      .set({ weightKg, note })
      .where(eq(schema.weightLogs.id, existing.id));
  } else {
    await db.insert(schema.weightLogs).values({
      userId: authz.userId,
      date,
      weightKg,
      note,
    });
  }

  const profileWeightKg = await syncProfileWeightFromLogs(db, authz.userId);

  return jsonOk({ ok: true, profileWeightKg });
}

export async function PATCH(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return jsonError("id required");

  const weightKg = Number(body.weightKg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return jsonError("Invalid weight");
  }

  const date = body.date != null ? String(body.date) : undefined;
  if (date && date > todayISODate()) {
    return jsonError("Cannot log weight for a future date");
  }

  const db = await getDb();
  const row = await db.query.weightLogs.findFirst({
    where: eq(schema.weightLogs.id, id),
  });

  if (!row || row.userId !== authz.userId) {
    return jsonError("Not found", 404);
  }

  if (date && date !== row.date) {
    const clash = await db.query.weightLogs.findFirst({
      where: and(
        eq(schema.weightLogs.userId, authz.userId),
        eq(schema.weightLogs.date, date),
      ),
    });
    if (clash && clash.id !== id) {
      return jsonError("An entry already exists for that date");
    }
  }

  const [updated] = await db
    .update(schema.weightLogs)
    .set({
      weightKg,
      ...(date ? { date } : {}),
      ...(body.note !== undefined
        ? { note: body.note ? String(body.note) : null }
        : {}),
    })
    .where(eq(schema.weightLogs.id, id))
    .returning();

  const profileWeightKg = await syncProfileWeightFromLogs(db, authz.userId);

  return jsonOk({ row: updated, profileWeightKg });
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("id required");

  const db = await getDb();
  const row = await db.query.weightLogs.findFirst({
    where: eq(schema.weightLogs.id, id),
  });

  if (!row || row.userId !== authz.userId) {
    return jsonError("Not found", 404);
  }

  await db.delete(schema.weightLogs).where(eq(schema.weightLogs.id, id));

  const profileWeightKg = await syncProfileWeightFromLogs(db, authz.userId);

  return jsonOk({ ok: true, profileWeightKg });
}
