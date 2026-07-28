import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { sumMacros } from "@/lib/macros";
import {
  addStandingItem,
  getMenuForDate,
  removeStandingItem,
  toggleStandingCheck,
} from "@/lib/standing-menu";
import {
  resolveTargets,
  todayISODate,
  type ActivityLevel,
  DEFAULT_DEFICIT_KCAL,
  DEFAULT_PROTEIN_PER_KG,
} from "@/lib/tdee";

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

  const items = await getMenuForDate(authz.userId, date);
  const totals = sumMacros(items);
  const targets = await getTargets(authz.userId);

  return jsonOk({
    date,
    items,
    totals,
    targets,
    persistent: true,
  });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const body = await req.json();
    const action = body.action as string;
    const date = String(body.date || todayISODate());

    if (action === "add") {
      const name = String(body.name || "").trim();
      if (!name) return jsonError("Name required");

      const item = await addStandingItem(authz.userId, {
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
      });

      return jsonOk(
        { item: { ...item, checked: false, foodLogId: null } },
        { status: 201 },
      );
    }

    if (action === "apply_template") {
      const templateId = String(body.templateId || "");
      if (!templateId) return jsonError("Template id required");

      const db = await getDb();
      const template = await db.query.menuTemplates.findFirst({
        where: and(
          eq(schema.menuTemplates.id, templateId),
          eq(schema.menuTemplates.userId, authz.userId),
        ),
        with: { items: { orderBy: [asc(schema.menuTemplateItems.sortOrder)] } },
      });
      if (!template) return jsonError("Template not found", 404);

      const existing = await getMenuForDate(authz.userId, date);
      let order = existing.length;
      for (const item of template.items) {
        await addStandingItem(authz.userId, {
          name: item.name,
          brand: item.brand,
          savedFoodId: item.savedFoodId,
          quantity: item.quantity,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
          calories: item.calories,
          mealSlot: item.mealSlot,
          sortOrder: order++,
        });
      }

      const items = await getMenuForDate(authz.userId, date);
      return jsonOk({ items, totals: sumMacros(items) });
    }

    if (action === "check") {
      const id = String(body.id || "");
      if (!id) return jsonError("Item id required");

      const result = await toggleStandingCheck(authz.userId, id, date);
      if (!result) return jsonError("Item not found", 404);
      return jsonOk(result);
    }

    return jsonError("Unknown action");
  } catch (err) {
    console.error("[menu/daily POST]", err);
    return jsonError(
      err instanceof Error ? err.message : "Menu update failed",
      500,
    );
  }
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("Item id required");

  const removed = await removeStandingItem(authz.userId, id);
  if (!removed) return jsonError("Item not found", 404);

  return jsonOk({ ok: true });
}
