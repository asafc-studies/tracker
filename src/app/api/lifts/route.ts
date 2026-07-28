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
import { caloriesBurnedResistance, todayISODate } from "@/lib/tdee";

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
  const hasDuration =
    durationMinutes != null &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0;
  /** In progress only when started, not ended, and duration not yet locked. */
  const inProgress = startedAt != null && endedAt == null && !hasDuration;
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
    caloriesBurned:
      s.caloriesBurned == null ? null : Number(s.caloriesBurned),
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

  const totalEee = daySessions.reduce(
    (sum, s) => sum + (s.caloriesBurned ?? 0),
    0,
  );
  const totalDuration = daySessions.reduce(
    (sum, s) => sum + (s.durationMinutes ?? 0),
    0,
  );

  const sessions = daySessions.map((s) => serializeSession(s, bodyWeightKg));

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
    .map((s) => ({
      date: s.date,
      sessionId: s.id,
      name: s.name?.trim() || "Workout",
      durationMinutes: s.durationMinutes,
      caloriesBurned: s.caloriesBurned,
      startedAt: toMs(s.startedAt),
      endedAt: toMs(s.endedAt),
      inProgress:
        toMs(s.startedAt) != null &&
        toMs(s.endedAt) == null &&
        !(s.durationMinutes != null && Number(s.durationMinutes) > 0),
      groups: groupSetsByExercise(s.sets),
      stats: computeDayStats(s.sets, bodyWeightKg),
    }));

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
    regionSummary,
    regionCounts,
    stats,
    eee: {
      durationMinutes: totalDuration || null,
      caloriesBurned: totalEee || null,
      met: 5.5,
      note: "EEE is insight-only and is not subtracted from your calorie target.",
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
    const caloriesBurned = bodyWeightKg
      ? caloriesBurnedResistance(bodyWeightKg, elapsedMin)
      : null;

    const name = body.name
      ? String(body.name).trim() || session.name || "Workout"
      : session.name || "Workout";

    /** Raw SQL so endedAt always persists as integer ms. */
    await getClient().execute({
      sql: `UPDATE workout_sessions
            SET endedAt = ?, durationMinutes = ?, caloriesBurned = ?, name = ?
            WHERE id = ?`,
      args: [nowMs, elapsedMin, caloriesBurned, name, sessionId],
    });

    const updated = await db.query.workoutSessions.findFirst({
      where: eq(schema.workoutSessions.id, sessionId),
      with: { sets: true },
    });

    return jsonOk({
      ok: true,
      session: serializeSession(
        updated ?? {
          ...session,
          name,
          endedAt: new Date(nowMs),
          durationMinutes: elapsedMin,
          caloriesBurned,
        },
        bodyWeightKg,
      ),
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

  const toInsert = setsPayload
    ? setsPayload
    : Array.from({ length: setsCount }, () => ({ reps, weightKg }));

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
    if (body.durationMinutes !== undefined) {
      const durationMinutes = parseDuration(body.durationMinutes);
      if (Number.isNaN(durationMinutes)) {
        return jsonError("Invalid duration");
      }
      updates.durationMinutes = durationMinutes;
      updates.caloriesBurned =
        durationMinutes != null && bodyWeightKg
          ? caloriesBurnedResistance(bodyWeightKg, durationMinutes)
          : null;
      /** Manual duration edit stops a still-running session. */
      if (toMs(session.endedAt) == null) {
        updates.endedAt = new Date();
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("Nothing to update");
    }

    const [updated] = await db
      .update(schema.workoutSessions)
      .set(updates)
      .where(eq(schema.workoutSessions.id, sessionId))
      .returning();

    return jsonOk({
      session: serializeSession(
        { ...updated, sets: session.sets },
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
  if (body.weightKg != null) {
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

  return jsonOk({ ok: true, deleted: "set" });
}
