import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getExercise, type ExerciseGroup } from "@/lib/exercises";

export type PlanItemRow = {
  id: string;
  planId: string;
  lift: string;
  name: string;
  category: ExerciseGroup | null;
  equipment: string;
  bodyweight: boolean;
  cardio: boolean;
  setsCount: number;
  reps: number;
  weightKg: number;
  sortOrder: number;
  notes: string | null;
  checked: boolean;
};

export type PlanRow = {
  id: string;
  name: string;
  sortOrder: number;
  items: PlanItemRow[];
};

async function findInProgressSessionId(userId: string) {
  const db = await getDb();
  const recent = await db.query.workoutSessions.findMany({
    where: eq(schema.workoutSessions.userId, userId),
    orderBy: [asc(schema.workoutSessions.createdAt)],
    limit: 40,
  });
  for (let i = recent.length - 1; i >= 0; i--) {
    const s = recent[i];
    const started = s.startedAt != null;
    const ended = s.endedAt != null;
    const hasDuration =
      s.durationMinutes != null && Number(s.durationMinutes) > 0;
    if (started && !ended && !hasDuration) return s.id;
  }
  return null;
}

function serializeItem(
  item: typeof schema.workoutPlanItems.$inferSelect,
  checkedIds: Set<string>,
): PlanItemRow {
  const ex = getExercise(item.lift);
  return {
    id: item.id,
    planId: item.planId,
    lift: item.lift,
    name: ex?.name ?? item.lift.replace(/_/g, " "),
    category: (item.category as ExerciseGroup | null) ?? ex?.group ?? null,
    equipment: ex?.equipment ?? "",
    bodyweight: ex?.bodyweight ?? false,
    cardio: ex?.type === "cardio",
    setsCount: item.setsCount,
    reps: item.reps,
    weightKg: item.weightKg,
    sortOrder: item.sortOrder,
    notes: item.notes,
    checked: checkedIds.has(item.id),
  };
}

export async function listWorkoutPlans(userId: string): Promise<{
  plans: PlanRow[];
  activeSessionId: string | null;
}> {
  const db = await getDb();
  const activeSessionId = await findInProgressSessionId(userId);

  const plans = await db.query.workoutPlans.findMany({
    where: eq(schema.workoutPlans.userId, userId),
    orderBy: [asc(schema.workoutPlans.sortOrder), asc(schema.workoutPlans.createdAt)],
    with: {
      items: {
        orderBy: [asc(schema.workoutPlanItems.sortOrder)],
      },
    },
  });

  const checkedIds = new Set<string>();
  if (activeSessionId) {
    const checks = await db.query.workoutPlanChecks.findMany({
      where: and(
        eq(schema.workoutPlanChecks.userId, userId),
        eq(schema.workoutPlanChecks.sessionId, activeSessionId),
      ),
    });
    for (const c of checks) checkedIds.add(c.planItemId);
  }

  return {
    activeSessionId,
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      sortOrder: p.sortOrder,
      items: (p.items ?? []).map((item) => serializeItem(item, checkedIds)),
    })),
  };
}

export async function createWorkoutPlan(userId: string, name: string) {
  const db = await getDb();
  const existing = await db.query.workoutPlans.findMany({
    where: eq(schema.workoutPlans.userId, userId),
  });
  const [row] = await db
    .insert(schema.workoutPlans)
    .values({
      userId,
      name: name.trim() || `Plan ${existing.length + 1}`,
      sortOrder: existing.length,
    })
    .returning();
  return row;
}

export async function renameWorkoutPlan(
  userId: string,
  planId: string,
  name: string,
) {
  const db = await getDb();
  const plan = await db.query.workoutPlans.findFirst({
    where: eq(schema.workoutPlans.id, planId),
  });
  if (!plan || plan.userId !== userId) return null;
  const [row] = await db
    .update(schema.workoutPlans)
    .set({ name: name.trim() || plan.name })
    .where(eq(schema.workoutPlans.id, planId))
    .returning();
  return row;
}

export async function deleteWorkoutPlan(userId: string, planId: string) {
  const db = await getDb();
  const plan = await db.query.workoutPlans.findFirst({
    where: eq(schema.workoutPlans.id, planId),
  });
  if (!plan || plan.userId !== userId) return false;
  await db.delete(schema.workoutPlans).where(eq(schema.workoutPlans.id, planId));
  return true;
}

export async function addPlanItem(
  userId: string,
  planId: string,
  input: {
    lift: string;
    setsCount?: number;
    reps?: number;
    weightKg?: number;
  },
) {
  const db = await getDb();
  const plan = await db.query.workoutPlans.findFirst({
    where: eq(schema.workoutPlans.id, planId),
    with: { items: true },
  });
  if (!plan || plan.userId !== userId) return null;
  const ex = getExercise(input.lift);
  if (!ex) throw new Error("Unknown exercise");

  const setsCount = Math.max(1, Math.min(20, Number(input.setsCount) || 3));
  const reps = Math.max(1, Number(input.reps) || (ex.type === "cardio" ? 1 : 8));
  const weightKg = Math.max(
    0,
    Number(input.weightKg) || (ex.bodyweight || ex.type === "cardio" ? 0 : 20),
  );

  const [row] = await db
    .insert(schema.workoutPlanItems)
    .values({
      planId,
      lift: ex.id,
      category: ex.group,
      setsCount: ex.type === "cardio" ? 1 : setsCount,
      reps,
      weightKg: ex.type === "cardio" ? 0 : weightKg,
      sortOrder: plan.items?.length ?? 0,
    })
    .returning();
  return serializeItem(row, new Set());
}

export async function updatePlanItem(
  userId: string,
  itemId: string,
  patch: {
    setsCount?: number;
    reps?: number;
    weightKg?: number;
    notes?: string | null;
  },
) {
  const db = await getDb();
  const item = await db.query.workoutPlanItems.findFirst({
    where: eq(schema.workoutPlanItems.id, itemId),
    with: { plan: true },
  });
  if (!item || item.plan?.userId !== userId) return null;

  const updates: Partial<typeof schema.workoutPlanItems.$inferInsert> = {};
  if (patch.setsCount != null) {
    updates.setsCount = Math.max(1, Math.min(20, Number(patch.setsCount) || 1));
  }
  if (patch.reps != null) {
    updates.reps = Math.max(1, Number(patch.reps) || 1);
  }
  if (patch.weightKg != null) {
    updates.weightKg = Math.max(0, Number(patch.weightKg) || 0);
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes;
  }

  const [row] = await db
    .update(schema.workoutPlanItems)
    .set(updates)
    .where(eq(schema.workoutPlanItems.id, itemId))
    .returning();
  return row;
}

export async function removePlanItem(userId: string, itemId: string) {
  const db = await getDb();
  const item = await db.query.workoutPlanItems.findFirst({
    where: eq(schema.workoutPlanItems.id, itemId),
    with: { plan: true },
  });
  if (!item || item.plan?.userId !== userId) return false;
  await db
    .delete(schema.workoutPlanItems)
    .where(eq(schema.workoutPlanItems.id, itemId));
  return true;
}

export async function reorderPlanItems(
  userId: string,
  planId: string,
  orderedIds: string[],
) {
  const db = await getDb();
  const plan = await db.query.workoutPlans.findFirst({
    where: eq(schema.workoutPlans.id, planId),
    with: { items: true },
  });
  if (!plan || plan.userId !== userId) return false;
  const allowed = new Set((plan.items ?? []).map((i) => i.id));
  if (orderedIds.some((id) => !allowed.has(id))) return false;
  if (orderedIds.length !== allowed.size) return false;

  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(schema.workoutPlanItems)
      .set({ sortOrder: i })
      .where(eq(schema.workoutPlanItems.id, orderedIds[i]));
  }
  return true;
}

export async function clearPlanChecksForSession(sessionId: string) {
  const db = await getDb();
  await db
    .delete(schema.workoutPlanChecks)
    .where(eq(schema.workoutPlanChecks.sessionId, sessionId));
}

export async function togglePlanCheck(userId: string, itemId: string) {
  const db = await getDb();
  const item = await db.query.workoutPlanItems.findFirst({
    where: eq(schema.workoutPlanItems.id, itemId),
    with: { plan: true },
  });
  if (!item || item.plan?.userId !== userId) {
    throw new Error("Plan item not found");
  }

  const sessionId = await findInProgressSessionId(userId);
  if (!sessionId) {
    throw new Error("Start a workout first to check exercises off");
  }

  const existing = await db.query.workoutPlanChecks.findFirst({
    where: and(
      eq(schema.workoutPlanChecks.sessionId, sessionId),
      eq(schema.workoutPlanChecks.planItemId, itemId),
    ),
  });

  if (existing) {
    let setIds: string[] = [];
    try {
      setIds = JSON.parse(existing.setIds || "[]") as string[];
    } catch {
      setIds = [];
    }
    if (setIds.length > 0) {
      await db
        .delete(schema.liftSets)
        .where(inArray(schema.liftSets.id, setIds));
    }
    await db
      .delete(schema.workoutPlanChecks)
      .where(eq(schema.workoutPlanChecks.id, existing.id));
    return { checked: false, sessionId };
  }

  const ex = getExercise(item.lift);
  const cardio = ex?.type === "cardio";
  const existingSets = await db.query.liftSets.findMany({
    where: and(
      eq(schema.liftSets.sessionId, sessionId),
      eq(schema.liftSets.lift, item.lift),
    ),
  });
  let setNumber = existingSets.length;
  const count = cardio ? 1 : Math.max(1, item.setsCount);
  const insertedIds: string[] = [];

  for (let i = 0; i < count; i++) {
    setNumber += 1;
    const [row] = await db
      .insert(schema.liftSets)
      .values({
        sessionId,
        lift: item.lift,
        category: item.category ?? ex?.group ?? "gym",
        setNumber,
        reps: cardio ? 1 : Math.max(1, item.reps),
        weightKg: cardio ? 0 : Math.max(0, item.weightKg),
      })
      .returning();
    insertedIds.push(row.id);
  }

  await db.insert(schema.workoutPlanChecks).values({
    userId,
    sessionId,
    planItemId: itemId,
    setIds: JSON.stringify(insertedIds),
  });

  return { checked: true, sessionId, setIds: insertedIds };
}
