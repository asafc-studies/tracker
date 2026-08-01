import { and, asc, desc, eq } from "drizzle-orm";
import { getClient, getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import {
  EXERCISE_GROUPS,
  EXERCISES,
  computeDayStats,
  funnyVolumeLines,
  getExercise,
  groupSetsByExercise,
  summarizeMuscles,
  summarizeRegionCounts,
  summarizeRegions,
  type ExerciseGroup,
} from "@/lib/exercises";
import {
  buildMuscleHeat,
  regionLoadsFromMuscles,
  dayMuscleLoads,
} from "@/lib/muscle-tonnage";
import {
  caloriesBurnedSession,
  looksLikeCardioSession,
  todayISODate,
} from "@/lib/tdee";

function sessionIsCardio(
  name: string | null | undefined,
  sets?: Array<{ lift: string; category?: string | null }>,
) {
  if (looksLikeCardioSession(name)) return true;
  return (sets ?? []).some((s) => getExercise(s.lift)?.type === "cardio");
}

function eeeForSession(
  bodyWeightKg: number | null,
  durationMinutes: number | null | undefined,
  opts: {
    name?: string | null;
    distanceKm?: number | null;
    sets?: Array<{ lift: string; category?: string | null }>;
  },
) {
  if (
    !bodyWeightKg ||
    durationMinutes == null ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return null;
  }
  return caloriesBurnedSession(bodyWeightKg, durationMinutes, {
    distanceKm: opts.distanceKm,
    sessionName: opts.name,
    cardio: sessionIsCardio(opts.name, opts.sets),
  });
}

function parseDistance(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return NaN;
  if (n === 0) return null;
  return Math.round(n * 100) / 100;
}

/** Prefer explicit positive distance; never wipe an existing value with null. */
function resolveDistanceKm(
  bodyDistance: unknown,
  existing: number | null | undefined,
): number | null {
  if (bodyDistance !== undefined && bodyDistance !== null && bodyDistance !== "") {
    const parsed = parseDistance(bodyDistance);
    if (Number.isNaN(parsed as number)) return NaN;
    return parsed;
  }
  return existing != null && Number.isFinite(Number(existing))
    ? Number(existing)
    : null;
}

async function resolveBodyWeight(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  date: string,
) {
  const weightLog = await db.query.weightLogs.findFirst({
    where: and(
      eq(schema.weightLogs.userId, userId),
      eq(schema.weightLogs.date, date),
    ),
  });
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  return {
    bodyWeightKg: weightLog?.weightKg ?? profile?.weightKg ?? null,
    profileWeightKg: profile?.weightKg ?? null,
  };
}

function parseDuration(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return NaN;
  if (n === 0) return null;
  return n;
}

/** Normalize DB/driver timestamps to epoch ms. */
function toMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    /** Guard against accidental seconds-since-epoch values. */
    return value < 1e12 ? value * 1000 : value;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "string") {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && value.trim() !== "") {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  try {
    const t = new Date(value as Date).getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

function serializeSession(
  s: typeof schema.workoutSessions.$inferSelect & {
    sets?: Array<{
      id: string;
      lift: string;
      setNumber: number;
      reps: number;
      weightKg: number;
      category?: string | null;
    }>;
  },
  bodyWeightKg: number | null,
) {
  const startedAt =
    toMs(s.startedAt) ?? (toMs(s.endedAt) == null ? toMs(s.createdAt) : null);
  const endedAt = toMs(s.endedAt);
  const durationMinutes =
    s.durationMinutes == null || s.durationMinutes === undefined
      ? null
      : Number(s.durationMinutes);
  const distanceKm =
    s.distanceKm == null || s.distanceKm === undefined
      ? null
      : Number(s.distanceKm);
  const hasDuration =
    durationMinutes != null &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0;
  /** In progress only when started, not ended, and duration not yet locked. */
  const inProgress = startedAt != null && endedAt == null && !hasDuration;
  const storedBurn =
    s.caloriesBurned == null ? null : Number(s.caloriesBurned);
  /** Recompute when duration exists but cached burn was wiped (e.g. set delete). */
  const caloriesBurned =
    storedBurn != null && Number.isFinite(storedBurn) && storedBurn > 0
      ? storedBurn
      : eeeForSession(bodyWeightKg, durationMinutes, {
          name: s.name,
          distanceKm,
          sets: s.sets,
        });
  return {
    id: s.id,
    date: s.date,
    name: s.name?.trim() || "Workout",
    notes: s.notes,
    startedAt,
    endedAt,
    inProgress,
    durationMinutes: Number.isFinite(durationMinutes as number)
      ? durationMinutes
      : null,
    distanceKm:
      distanceKm != null && Number.isFinite(distanceKm) ? distanceKm : null,
    caloriesBurned,
    createdAt: toMs(s.createdAt),
    groups: groupSetsByExercise(s.sets ?? []),
    stats: computeDayStats(s.sets ?? [], bodyWeightKg),
  };
}

async function findInProgressSession(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
) {
  const recent = await db.query.workoutSessions.findMany({
    where: eq(schema.workoutSessions.userId, userId),
    orderBy: [desc(schema.workoutSessions.createdAt)],
    limit: 20,
    with: { sets: true },
  });
  return (
    recent.find((s) => {
      const started = toMs(s.startedAt);
      const ended = toMs(s.endedAt);
      /** Duration already locked ⇒ treat as finished even if endedAt was missed. */
      const hasDuration =
        s.durationMinutes != null && Number(s.durationMinutes) > 0;
      return started != null && ended == null && !hasDuration;
    }) ?? null
  );
}

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISODate();

  const db = await getDb();
  const daySessions = await db.query.workoutSessions.findMany({
    where: and(
      eq(schema.workoutSessions.userId, authz.userId),
      eq(schema.workoutSessions.date, date),
    ),
    orderBy: [asc(schema.workoutSessions.createdAt)],
    with: { sets: true },
  });

  const allSets = daySessions.flatMap((s) => s.sets);

  const recentSessions = await db.query.workoutSessions.findMany({
    where: eq(schema.workoutSessions.userId, authz.userId),
    orderBy: [
      desc(schema.workoutSessions.date),
      desc(schema.workoutSessions.createdAt),
    ],
    limit: 30,
    with: { sets: true },
  });

  const lastByLift: Record<
    string,
    { weightKg: number; reps: number; date: string }
  > = {};

  const lastSessionByLift: Record<
    string,
    {
      date: string;
      sets: Array<{
        setNumber: number;
        reps: number;
        weightKg: number;
      }>;
    }
  > = {};

  for (const s of recentSessions) {
    if (s.date === date) continue;
    const byLift = new Map<
      string,
      Array<{ setNumber: number; reps: number; weightKg: number }>
    >();
    for (const set of s.sets) {
      if (!byLift.has(set.lift)) byLift.set(set.lift, []);
      byLift.get(set.lift)!.push({
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
      });

      if (!lastByLift[set.lift]) {
        lastByLift[set.lift] = {
          weightKg: set.weightKg,
          reps: set.reps,
          date: s.date,
        };
      } else {
        const cur = lastByLift[set.lift];
        if (s.date === cur.date && set.weightKg > cur.weightKg) {
          lastByLift[set.lift] = {
            weightKg: set.weightKg,
            reps: set.reps,
            date: s.date,
          };
        }
      }
    }
    for (const [lift, liftSets] of byLift) {
      if (!lastSessionByLift[lift]) {
        lastSessionByLift[lift] = {
          date: s.date,
          sets: liftSets.sort((a, b) => a.setNumber - b.setNumber),
        };
      }
    }
  }

  const { bodyWeightKg, profileWeightKg } = await resolveBodyWeight(
    db,
    authz.userId,
    date,
  );

  const exerciseIds = allSets.map((s) => s.lift);
  const muscleSummary = summarizeMuscles(exerciseIds);
  const regionSummary = summarizeRegions(exerciseIds);
  const regionCounts = summarizeRegionCounts(exerciseIds);
  const stats = computeDayStats(allSets, bodyWeightKg);

  const sessionPayload = (s: (typeof daySessions)[number]) => ({
    date: s.date,
    durationMinutes: s.durationMinutes,
    distanceKm: s.distanceKm,
    sets: s.sets.map((set) => ({
      lift: set.lift,
      reps: set.reps,
      weightKg: set.weightKg,
    })),
  });
  const dayHeatSessions = daySessions.map(sessionPayload);
  const histHeatSessions = recentSessions.map(sessionPayload);
  const muscleHeat = buildMuscleHeat(
    dayHeatSessions,
    histHeatSessions,
    bodyWeightKg,
  );
  const regionHeat = {
    sets: regionLoadsFromMuscles(
      dayMuscleLoads(dayHeatSessions, bodyWeightKg, "sets"),
    ),
    tonnage: regionLoadsFromMuscles(
      dayMuscleLoads(dayHeatSessions, bodyWeightKg, "tonnage"),
    ),
  };

  const sessions = daySessions.map((s) => serializeSession(s, bodyWeightKg));
  const totalEee = sessions.reduce(
    (sum, s) => sum + (s.caloriesBurned ?? 0),
    0,
  );
  const totalDuration = sessions.reduce(
    (sum, s) => sum + (s.durationMinutes ?? 0),
    0,
  );

  const inProgressRaw = await findInProgressSession(db, authz.userId);
  const inProgressSession = inProgressRaw
    ? serializeSession(inProgressRaw, bodyWeightKg)
    : null;

  const recentGrouped = recentSessions
    .filter(
      (s) =>
        s.sets.length > 0 ||
        (s.durationMinutes ?? 0) > 0 ||
        s.endedAt != null ||
        s.startedAt != null,
    )
    .slice(0, 15)
    .map((s) => {
      const serialized = serializeSession(s, bodyWeightKg);
      return {
        date: serialized.date,
        sessionId: serialized.id,
        name: serialized.name,
        durationMinutes: serialized.durationMinutes,
        caloriesBurned: serialized.caloriesBurned,
        startedAt: serialized.startedAt,
        endedAt: serialized.endedAt,
        inProgress: serialized.inProgress,
        groups: serialized.groups,
        stats: serialized.stats,
      };
    });

  return jsonOk({
    date,
    catalog: {
      groups: EXERCISE_GROUPS,
      exercises: EXERCISES,
    },
    sessions,
    inProgressSession,
    /** @deprecated single-session shape — prefer `sessions` */
    session: sessions[0] ?? null,
    grouped: groupSetsByExercise(allSets),
    lastByLift,
    lastSessionByLift,
    muscleSummary,
    muscleHeat,
    regionSummary,
    regionCounts,
    regionHeat,
    stats,
    eee: {
      durationMinutes: totalDuration || null,
      caloriesBurned: totalEee || null,
      note: "EEE: gym MET 5.5; runs/cardio ~8+ (pace from distance+duration when set). Insight only — not subtracted from calorie target.",
    },
    funny: funnyVolumeLines(stats.volumeKg),
    recentGrouped,
    bodyWeightKg,
    profileWeightKg,
  });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const date = String(body.date || todayISODate());
  const db = await getDb();

  /** Stop must be handled before start/create — client only sends stopSession. */
  if (body.stopSession) {
    const sessionId = String(body.sessionId || "");
    if (!sessionId) return jsonError("sessionId required");

    const session = await db.query.workoutSessions.findFirst({
      where: eq(schema.workoutSessions.id, sessionId),
      with: { sets: true },
    });
    if (!session || session.userId !== authz.userId) {
      return jsonError("Not found", 404);
    }

    const nowMs = Date.now();
    const alreadyEnded = toMs(session.endedAt) != null;
    const existingDuration =
      session.durationMinutes != null && Number(session.durationMinutes) > 0
        ? Number(session.durationMinutes)
        : null;

    const startedMs =
      toMs(body.startedAt) ??
      toMs(session.startedAt) ??
      toMs(session.createdAt) ??
      nowMs;
    const clientDuration = parseDuration(body.durationMinutes);
    const elapsedMin =
      alreadyEnded && existingDuration != null
        ? existingDuration
        : clientDuration != null && !Number.isNaN(clientDuration)
          ? Math.max(1, Math.round(clientDuration))
          : Math.max(1, Math.round((nowMs - startedMs) / 60000));

    const { bodyWeightKg } = await resolveBodyWeight(
      db,
      authz.userId,
      session.date,
    );
    const name = body.name
      ? String(body.name).trim() || session.name || "Workout"
      : session.name || "Workout";
    const distanceKm = resolveDistanceKm(body.distanceKm, session.distanceKm);
    if (Number.isNaN(distanceKm as number)) {
      return jsonError("Invalid distance");
    }
    const caloriesBurned = eeeForSession(bodyWeightKg, elapsedMin, {
      name,
      distanceKm,
      sets: session.sets,
    });

    /** Raw SQL so endedAt always persists as integer ms. */
    await getClient().execute({
      sql: `UPDATE workout_sessions
            SET endedAt = ?, durationMinutes = ?, distanceKm = ?, caloriesBurned = ?, name = ?
            WHERE id = ?`,
      args: [
        nowMs,
        elapsedMin,
        distanceKm,
        caloriesBurned,
        name,
        sessionId,
      ],
    });

    await db
      .delete(schema.workoutPlanChecks)
      .where(eq(schema.workoutPlanChecks.sessionId, sessionId));

    const updated = await db.query.workoutSessions.findFirst({
      where: eq(schema.workoutSessions.id, sessionId),
      with: { sets: true },
    });

    const merged = {
      ...(updated ?? session),
      name,
      endedAt: new Date(nowMs),
      durationMinutes: elapsedMin,
      distanceKm,
      caloriesBurned,
      sets: updated?.sets ?? session.sets,
    };

    return jsonOk({
      ok: true,
      session: serializeSession(merged, bodyWeightKg),
    });
  }

  /** Start a timed session (Gym / Run / …). Only one in progress at a time. */
  if (body.startSession || body.createSession || body.ensureSession) {
    const existing = await findInProgressSession(db, authz.userId);
    if (existing && (body.startSession || body.createSession)) {
      return jsonError(
        `Finish “${existing.name?.trim() || "Workout"}” before starting another session`,
        409,
      );
    }

    const name = String(body.name || "Workout").trim() || "Workout";
    const nowMs = Date.now();
    const { bodyWeightKg } = await resolveBodyWeight(db, authz.userId, date);

    const [created] = await db
      .insert(schema.workoutSessions)
      .values({
        userId: authz.userId,
        date,
        name,
        notes: body.notes ? String(body.notes) : undefined,
        startedAt: new Date(nowMs),
        endedAt: null,
        durationMinutes: null,
        caloriesBurned: null,
      })
      .returning();

    return jsonOk(
      {
        session: serializeSession({ ...created, sets: [] }, bodyWeightKg),
      },
      { status: 201 },
    );
  }

  const lift = String(body.lift || body.exerciseId || "")
    .trim()
    .toLowerCase();
  const reps = Number(body.reps);
  const weightKg = Number(body.weightKg ?? 0);
  const setsCount = Math.min(20, Math.max(1, Number(body.setsCount ?? 1)));
  const category = body.category as ExerciseGroup | undefined;
  let sessionId = body.sessionId ? String(body.sessionId) : "";

  const setsPayload = Array.isArray(body.sets)
    ? (body.sets as Array<{ reps: number; weightKg: number }>)
    : null;

  if (!lift) return jsonError("Exercise is required");

  if (setsPayload) {
    for (const s of setsPayload) {
      if (!Number.isFinite(s.reps) || s.reps <= 0) {
        return jsonError("Invalid reps");
      }
      if (!Number.isFinite(s.weightKg) || s.weightKg < 0) {
        return jsonError("Invalid weight");
      }
    }
  } else {
    if (!Number.isFinite(reps) || reps <= 0) return jsonError("Invalid reps");
    if (!Number.isFinite(weightKg) || weightKg < 0) {
      return jsonError("Invalid weight");
    }
  }

  const exercise = getExercise(lift);
  const resolvedCategory = category ?? exercise?.group;
  const isCardio = exercise?.type === "cardio";

  let session = sessionId
    ? await db.query.workoutSessions.findFirst({
        where: eq(schema.workoutSessions.id, sessionId),
        with: { sets: true },
      })
    : null;

  if (session && session.userId !== authz.userId) {
    return jsonError("Not found", 404);
  }

  /** Prefer the in-progress session if client omitted sessionId. */
  if (!session) {
    const inProgress = await findInProgressSession(db, authz.userId);
    if (inProgress) {
      session = inProgress;
      sessionId = inProgress.id;
    }
  }

  if (!session) {
    return jsonError("Start a session first", 400);
  }

  const sameLift = session.sets.filter((s) => s.lift === lift);
  let setNumber = sameLift.length;
  const created: typeof schema.liftSets.$inferSelect[] = [];

  const toInsert = (setsPayload
    ? setsPayload
    : Array.from({ length: setsCount }, () => ({ reps, weightKg }))
  ).map((s) => ({
    reps: s.reps,
    weightKg: isCardio ? 0 : s.weightKg,
  }));

  for (const s of toInsert) {
    setNumber += 1;
    const [row] = await db
      .insert(schema.liftSets)
      .values({
        sessionId: session.id,
        lift,
        category: resolvedCategory ?? null,
        setNumber,
        reps: s.reps,
        weightKg: s.weightKg,
      })
      .returning();
    created.push(row);
  }

  return jsonOk({ sets: created, sessionId: session.id }, { status: 201 });
}

export async function PATCH(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const db = await getDb();

  if (body.sessionId || body.updateSession) {
    const sessionId = String(body.sessionId || "");
    if (!sessionId) return jsonError("sessionId required");

    const session = await db.query.workoutSessions.findFirst({
      where: eq(schema.workoutSessions.id, sessionId),
      with: { sets: true },
    });
    if (!session || session.userId !== authz.userId) {
      return jsonError("Not found", 404);
    }

    const { bodyWeightKg } = await resolveBodyWeight(
      db,
      authz.userId,
      session.date,
    );

    const updates: {
      name?: string | null;
      notes?: string | null;
      durationMinutes?: number | null;
      distanceKm?: number | null;
      caloriesBurned?: number | null;
      endedAt?: Date | null;
    } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      updates.name = name || "Workout";
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes ? String(body.notes) : null;
    }
    if (body.distanceKm !== undefined) {
      if (body.distanceKm === null || body.distanceKm === "") {
        updates.distanceKm = null;
      } else {
        const distanceKm = parseDistance(body.distanceKm);
        if (Number.isNaN(distanceKm)) {
          return jsonError("Invalid distance");
        }
        updates.distanceKm = distanceKm;
      }
    }
    if (body.durationMinutes !== undefined) {
      const durationMinutes = parseDuration(body.durationMinutes);
      if (Number.isNaN(durationMinutes)) {
        return jsonError("Invalid duration");
      }
      updates.durationMinutes = durationMinutes;
      /** Manual duration edit stops a still-running session. */
      if (toMs(session.endedAt) == null) {
        updates.endedAt = new Date();
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("Nothing to update");
    }

    const nextName =
      updates.name !== undefined ? updates.name : session.name;
    const nextDuration =
      updates.durationMinutes !== undefined
        ? updates.durationMinutes
        : session.durationMinutes;
    const nextDistance =
      updates.distanceKm !== undefined
        ? updates.distanceKm
        : session.distanceKm != null
          ? Number(session.distanceKm)
          : null;

    if (
      body.durationMinutes !== undefined ||
      body.distanceKm !== undefined ||
      body.name !== undefined
    ) {
      updates.caloriesBurned = eeeForSession(
        bodyWeightKg,
        nextDuration != null ? Number(nextDuration) : null,
        {
          name: nextName,
          distanceKm: nextDistance,
          sets: session.sets,
        },
      );
    }

    const [updated] = await db
      .update(schema.workoutSessions)
      .set(updates)
      .where(eq(schema.workoutSessions.id, sessionId))
      .returning();

    return jsonOk({
      session: serializeSession(
        { ...session, ...updated, sets: session.sets },
        bodyWeightKg,
      ),
    });
  }

  const id = String(body.id || "");
  if (!id) return jsonError("id required");

  const set = await db.query.liftSets.findFirst({
    where: eq(schema.liftSets.id, id),
    with: { session: true },
  });

  if (!set || set.session.userId !== authz.userId) {
    return jsonError("Not found", 404);
  }

  const updates: { reps?: number; weightKg?: number; setNumber?: number } = {};
  if (body.reps != null) {
    const reps = Number(body.reps);
    if (!Number.isFinite(reps) || reps <= 0) return jsonError("Invalid reps");
    updates.reps = reps;
  }
  if (getExercise(set.lift)?.type === "cardio") {
    updates.weightKg = 0;
  } else if (body.weightKg != null) {
    const weightKg = Number(body.weightKg);
    if (!Number.isFinite(weightKg) || weightKg < 0) {
      return jsonError("Invalid weight");
    }
    updates.weightKg = weightKg;
  }
  if (body.setNumber != null) {
    const setNumber = Number(body.setNumber);
    if (!Number.isFinite(setNumber) || setNumber < 1) {
      return jsonError("Invalid set number");
    }
    updates.setNumber = setNumber;
  }

  if (Object.keys(updates).length === 0) {
    return jsonError("Nothing to update");
  }

  const [updated] = await db
    .update(schema.liftSets)
    .set(updates)
    .where(eq(schema.liftSets.id, id))
    .returning();

  return jsonOk({ set: updated });
}

async function clearDistanceIfNoCardio(
  db: Awaited<ReturnType<typeof getDb>>,
  sessionId: string,
) {
  const session = await db.query.workoutSessions.findFirst({
    where: eq(schema.workoutSessions.id, sessionId),
    with: { sets: true },
  });
  if (!session) return;
  const sets = session.sets ?? [];
  const hasCardio = sets.some((s) => getExercise(s.lift)?.type === "cardio");
  if (hasCardio) return;

  const { bodyWeightKg } = await resolveBodyWeight(
    db,
    session.userId,
    session.date,
  );
  const durationMinutes =
    session.durationMinutes != null && Number(session.durationMinutes) > 0
      ? Number(session.durationMinutes)
      : null;
  /** Drop run distance only; keep EEE from remaining resistance work. */
  await db
    .update(schema.workoutSessions)
    .set({
      distanceKm: null,
      caloriesBurned: eeeForSession(bodyWeightKg, durationMinutes, {
        name: session.name,
        distanceKm: null,
        sets,
      }),
    })
    .where(eq(schema.workoutSessions.id, sessionId));
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const sessionId = searchParams.get("sessionId");
  const lift = searchParams.get("lift");

  const db = await getDb();

  if (sessionId && !id && !lift) {
    const session = await db.query.workoutSessions.findFirst({
      where: eq(schema.workoutSessions.id, sessionId),
    });
    if (!session || session.userId !== authz.userId) {
      return jsonError("Not found", 404);
    }
    await db
      .delete(schema.workoutSessions)
      .where(eq(schema.workoutSessions.id, sessionId));
    return jsonOk({ ok: true, deleted: "session" });
  }

  if (sessionId && lift) {
    const session = await db.query.workoutSessions.findFirst({
      where: eq(schema.workoutSessions.id, sessionId),
    });
    if (!session || session.userId !== authz.userId) {
      return jsonError("Not found", 404);
    }
    await db
      .delete(schema.liftSets)
      .where(
        and(
          eq(schema.liftSets.sessionId, sessionId),
          eq(schema.liftSets.lift, lift),
        ),
      );
    await clearDistanceIfNoCardio(db, sessionId);
    return jsonOk({ ok: true, deleted: "exercise" });
  }

  if (!id) return jsonError("id required");

  const set = await db.query.liftSets.findFirst({
    where: eq(schema.liftSets.id, id),
    with: { session: true },
  });

  if (!set || set.session.userId !== authz.userId) {
    return jsonError("Not found", 404);
  }

  await db.delete(schema.liftSets).where(eq(schema.liftSets.id, id));

  const remaining = await db.query.liftSets.findMany({
    where: and(
      eq(schema.liftSets.sessionId, set.sessionId),
      eq(schema.liftSets.lift, set.lift),
    ),
  });
  const ordered = remaining.sort((a, b) => a.setNumber - b.setNumber);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].setNumber !== i + 1) {
      await db
        .update(schema.liftSets)
        .set({ setNumber: i + 1 })
        .where(eq(schema.liftSets.id, ordered[i].id));
    }
  }

  await clearDistanceIfNoCardio(db, set.sessionId);

  return jsonOk({ ok: true, deleted: "set" });
}
