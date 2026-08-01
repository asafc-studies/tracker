import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import {
  ACTIVITY_OPTIONS,
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
  clampDeficit,
  resolveTargets,
  type ActivityLevel,
  type Sex,
} from "@/lib/tdee";

function profileTargets(profile: {
  weightKg: number | null;
  heightCm: number | null;
  age: number | null;
  sex: string | null;
  bodyFatPercent: number | null;
  activityLevel: string | null;
  deficitKcal: number | null;
  proteinPerKg: number | null;
  calorieTargetOverride: number | null;
  proteinTargetOverride: number | null;
}) {
  return resolveTargets({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    sex: (profile.sex as Sex | null) ?? null,
    bodyFatPercent: profile.bodyFatPercent,
    activityLevel: (profile.activityLevel ?? "moderate") as ActivityLevel,
    deficitKcal: profile.deficitKcal ?? DEFAULT_DEFICIT_KCAL,
    proteinPerKg: profile.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
    calorieTargetOverride: profile.calorieTargetOverride ?? null,
    proteinTargetOverride: profile.proteinTargetOverride ?? null,
  });
}

export async function GET() {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const db = await getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, authz.userId),
  });

  if (!profile || !profile.weightKg || profile.bodyFatPercent == null) {
    return jsonOk({
      userId: authz.userId,
      profile: profile ?? null,
      targets: null,
      needsBodyFat: !profile?.bodyFatPercent,
    });
  }

  return jsonOk({
    userId: authz.userId,
    profile,
    targets: profileTargets(profile),
    needsBodyFat: false,
  });
}

export async function PUT(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const db = await getDb();
  const existing = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, authz.userId),
  });

  const isNutritionOnly =
    body.nutritionOnly === true ||
    (body.weightKg == null && existing != null);

  if (isNutritionOnly && existing) {
    const calorieTargetOverride =
      body.calorieTargetOverride === null ||
      body.calorieTargetOverride === ""
        ? null
        : Number(body.calorieTargetOverride);
    const proteinTargetOverride =
      body.proteinTargetOverride === null ||
      body.proteinTargetOverride === ""
        ? null
        : Number(body.proteinTargetOverride);

    if (
      calorieTargetOverride != null &&
      !Number.isFinite(calorieTargetOverride)
    ) {
      return jsonError("Invalid calorie target");
    }
    if (
      proteinTargetOverride != null &&
      !Number.isFinite(proteinTargetOverride)
    ) {
      return jsonError("Invalid protein target");
    }

    const values = {
      calorieTargetOverride,
      proteinTargetOverride,
      countryCode: body.countryCode ?? existing.countryCode ?? "il",
      ...(body.goalTarget !== undefined
        ? {
            goalTarget:
              body.goalTarget === null || body.goalTarget === ""
                ? null
                : String(body.goalTarget).trim().slice(0, 500),
          }
        : {}),
      updatedAt: new Date(),
    };

    await db
      .update(schema.profiles)
      .set(values)
      .where(eq(schema.profiles.userId, authz.userId));

    const profile = { ...existing, ...values };
    return jsonOk({
      profile,
      targets: profileTargets(profile),
    });
  }

  const weightKg = Number(body.weightKg);
  const heightCm = Number(body.heightCm);
  const age = Number(body.age);
  const sex = body.sex as Sex;
  const bodyFatPercent = Number(body.bodyFatPercent);
  let activityLevel = (body.activityLevel ?? "moderate") as ActivityLevel;
  if (!ACTIVITY_OPTIONS.includes(activityLevel) && activityLevel !== "very_active") {
    activityLevel = "moderate";
  }
  const deficitKcal = clampDeficit(
    Number(body.deficitKcal ?? DEFAULT_DEFICIT_KCAL),
  );
  const proteinPerKg = Number(
    body.proteinPerKg ?? DEFAULT_PROTEIN_PER_KG,
  );

  if (
    !Number.isFinite(weightKg) ||
    !Number.isFinite(heightCm) ||
    !Number.isFinite(age) ||
    (sex !== "male" && sex !== "female")
  ) {
    return jsonError("Invalid profile fields");
  }
  if (
    !Number.isFinite(bodyFatPercent) ||
    bodyFatPercent < 3 ||
    bodyFatPercent > 60
  ) {
    return jsonError("Body fat % is required (3–60)");
  }

  const values = {
    userId: authz.userId,
    weightKg,
    heightCm,
    age,
    sex,
    bodyFatPercent,
    activityLevel,
    deficitKcal,
    proteinPerKg,
    countryCode: body.countryCode ?? existing?.countryCode ?? "il",
    calorieTargetOverride: existing?.calorieTargetOverride ?? null,
    proteinTargetOverride: existing?.proteinTargetOverride ?? null,
    goalTarget:
      body.goalTarget !== undefined
        ? body.goalTarget === null || body.goalTarget === ""
          ? null
          : String(body.goalTarget).trim().slice(0, 500)
        : (existing?.goalTarget ?? null),
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.profiles)
      .set(values)
      .where(eq(schema.profiles.userId, authz.userId));
  } else {
    await db.insert(schema.profiles).values(values);
  }

  const { todayISODate } = await import("@/lib/tdee");
  const weightChanged =
    !existing || existing.weightKg == null || existing.weightKg !== weightKg;
  if (weightChanged) {
    const date = todayISODate();
    const todayLog = await db.query.weightLogs.findFirst({
      where: and(
        eq(schema.weightLogs.userId, authz.userId),
        eq(schema.weightLogs.date, date),
      ),
    });
    if (todayLog) {
      await db
        .update(schema.weightLogs)
        .set({ weightKg })
        .where(eq(schema.weightLogs.id, todayLog.id));
    } else {
      await db.insert(schema.weightLogs).values({
        userId: authz.userId,
        date,
        weightKg,
      });
    }
  }

  return jsonOk({
    profile: values,
    targets: profileTargets(values),
  });
}
