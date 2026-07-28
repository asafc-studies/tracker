import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { sumMacros } from "@/lib/macros";
import { resolveTargets, todayISODate, type ActivityLevel, DEFAULT_DEFICIT_KCAL, DEFAULT_PROTEIN_PER_KG } from "@/lib/tdee";

async function getTargets(userId: string) {
  const db = await getDb();
  const profile = await db.query.profiles.findFirst({
    where: eq(schema.profiles.userId, userId),
  });
  if (!profile?.weightKg || profile.bodyFatPercent == null) {
    return null;
  }
  return resolveTargets({
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
}

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") || todayISODate();

  const db = await getDb();
  const items = await db.query.dailyMenuItems.findMany({
    where: and(
      eq(schema.dailyMenuItems.userId, authz.userId),
      eq(schema.dailyMenuItems.date, date),
    ),
    orderBy: [asc(schema.dailyMenuItems.sortOrder)],
  });

  const totals = sumMacros(items);
  const targets = await getTargets(authz.userId);

  return jsonOk({ date, items, totals, targets });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const action = body.action as string;

  const db = await getDb();

  if (action === "add") {
    const date = String(body.date || todayISODate());
    const name = String(body.name || "").trim();
    if (!name) return jsonError("Name required");

    const [item] = await db
      .insert(schema.dailyMenuItems)
      .values({
        userId: authz.userId,
        date,
        name,
        brand: body.brand ?? null,
        savedFoodId: body.savedFoodId ?? null,
        quantity: Number(body.quantity ?? 1),
        proteinG: Number(body.proteinG ?? 0),
        carbsG: Number(body.carbsG ?? 0),
        fatG: Number(body.fatG ?? 0),
        calories: Number(body.calories ?? 0),
        mealSlot: body.mealSlot ?? "snack",
        sortOrder: Number(body.sortOrder ?? 0),
      })
      .returning();

    return jsonOk({ item }, { status: 201 });
  }

  if (action === "apply_template") {
    const date = String(body.date || todayISODate());
    const templateId = String(body.templateId || "");
    if (!templateId) return jsonError("Template id required");

    const template = await db.query.menuTemplates.findFirst({
      where: and(
        eq(schema.menuTemplates.id, templateId),
        eq(schema.menuTemplates.userId, authz.userId),
      ),
      with: { items: { orderBy: [asc(schema.menuTemplateItems.sortOrder)] } },
    });
    if (!template) return jsonError("Template not found", 404);

    const existing = await db.query.dailyMenuItems.findMany({
      where: and(
        eq(schema.dailyMenuItems.userId, authz.userId),
        eq(schema.dailyMenuItems.date, date),
      ),
    });
    const baseOrder = existing.length;

    if (template.items.length) {
      await db.insert(schema.dailyMenuItems).values(
        template.items.map((item, i) => ({
          userId: authz.userId,
          date,
          name: item.name,
          brand: item.brand,
          savedFoodId: item.savedFoodId,
          quantity: item.quantity,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          calories: item.calories,
          mealSlot: item.mealSlot,
          sortOrder: baseOrder + i,
        })),
      );
    }

    const items = await db.query.dailyMenuItems.findMany({
      where: and(
        eq(schema.dailyMenuItems.userId, authz.userId),
        eq(schema.dailyMenuItems.date, date),
      ),
      orderBy: [asc(schema.dailyMenuItems.sortOrder)],
    });

    return jsonOk({ items, totals: sumMacros(items) });
  }

  if (action === "check") {
    const id = String(body.id || "");
    if (!id) return jsonError("Item id required");

    const item = await db.query.dailyMenuItems.findFirst({
      where: and(
        eq(schema.dailyMenuItems.id, id),
        eq(schema.dailyMenuItems.userId, authz.userId),
      ),
    });
    if (!item) return jsonError("Item not found", 404);

    if (item.checked && item.foodLogId) {
      await db
        .update(schema.dailyMenuItems)
        .set({ checked: false, foodLogId: null })
        .where(eq(schema.dailyMenuItems.id, id));
      await db
        .delete(schema.foodLogs)
        .where(
          and(
            eq(schema.foodLogs.id, item.foodLogId),
            eq(schema.foodLogs.userId, authz.userId),
          ),
        );
      return jsonOk({ item: { ...item, checked: false, foodLogId: null } });
    }

    const [foodLog] = await db
      .insert(schema.foodLogs)
      .values({
        userId: authz.userId,
        date: item.date,
        name: item.name,
        brand: item.brand,
        savedFoodId: item.savedFoodId,
        quantity: item.quantity,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
        calories: item.calories,
      })
      .returning();

    await db
      .update(schema.dailyMenuItems)
      .set({ checked: true, foodLogId: foodLog.id })
      .where(eq(schema.dailyMenuItems.id, id));

    return jsonOk({ item: { ...item, checked: true, foodLogId: foodLog.id }, foodLog });
  }

  return jsonError("Unknown action");
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("Item id required");

  const db = await getDb();
  const item = await db.query.dailyMenuItems.findFirst({
    where: and(
      eq(schema.dailyMenuItems.id, id),
      eq(schema.dailyMenuItems.userId, authz.userId),
    ),
  });
  if (!item) return jsonError("Item not found", 404);

  if (item.foodLogId) {
    await db
      .delete(schema.foodLogs)
      .where(
        and(
          eq(schema.foodLogs.id, item.foodLogId),
          eq(schema.foodLogs.userId, authz.userId),
        ),
      );
  }

  await db
    .delete(schema.dailyMenuItems)
    .where(eq(schema.dailyMenuItems.id, id));

  return jsonOk({ ok: true });
}
