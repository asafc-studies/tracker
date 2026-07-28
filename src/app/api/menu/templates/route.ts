import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jsonError, jsonOk, requireUser } from "@/lib/api";

export async function GET() {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const db = await getDb();
  const templates = await db.query.menuTemplates.findMany({
    where: eq(schema.menuTemplates.userId, authz.userId),
    orderBy: [desc(schema.menuTemplates.createdAt)],
    with: {
      items: {
        orderBy: [asc(schema.menuTemplateItems.sortOrder)],
      },
    },
  });

  return jsonOk({ templates });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return jsonError("Template name required");

  const db = await getDb();
  const [template] = await db
    .insert(schema.menuTemplates)
    .values({
      userId: authz.userId,
      name,
      notes: body.notes ? String(body.notes) : null,
    })
    .returning();

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length) {
    await db.insert(schema.menuTemplateItems).values(
      items.map(
        (
          item: {
            name: string;
            brand?: string;
            savedFoodId?: string;
            quantity?: number;
            proteinG?: number;
            carbsG?: number;
            fatG?: number;
            calories?: number;
            mealSlot?: string;
          },
          i: number,
        ) => ({
          templateId: template.id,
          name: String(item.name),
          brand: item.brand ?? null,
          savedFoodId: item.savedFoodId ?? null,
          quantity: Number(item.quantity ?? 1),
          proteinG: Number(item.proteinG ?? 0),
          carbsG: Number(item.carbsG ?? 0),
          fatG: Number(item.fatG ?? 0),
          calories: Number(item.calories ?? 0),
          mealSlot: item.mealSlot ?? "snack",
          sortOrder: i,
        }),
      ),
    );
  }

  const full = await db.query.menuTemplates.findFirst({
    where: eq(schema.menuTemplates.id, template.id),
    with: { items: { orderBy: [asc(schema.menuTemplateItems.sortOrder)] } },
  });

  return jsonOk({ template: full }, { status: 201 });
}

export async function PUT(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const id = String(body.id || "");
  if (!id) return jsonError("Template id required");

  const db = await getDb();
  const existing = await db.query.menuTemplates.findFirst({
    where: and(
      eq(schema.menuTemplates.id, id),
      eq(schema.menuTemplates.userId, authz.userId),
    ),
  });
  if (!existing) return jsonError("Template not found", 404);

  await db
    .update(schema.menuTemplates)
    .set({
      name: body.name ? String(body.name) : existing.name,
      notes: body.notes !== undefined ? body.notes : existing.notes,
    })
    .where(eq(schema.menuTemplates.id, id));

  if (Array.isArray(body.items)) {
    await db
      .delete(schema.menuTemplateItems)
      .where(eq(schema.menuTemplateItems.templateId, id));
    if (body.items.length) {
      await db.insert(schema.menuTemplateItems).values(
        body.items.map(
          (
            item: {
              name: string;
              brand?: string;
              savedFoodId?: string;
              quantity?: number;
              proteinG?: number;
              carbsG?: number;
              fatG?: number;
              calories?: number;
              mealSlot?: string;
            },
            i: number,
          ) => ({
            templateId: id,
            name: String(item.name),
            brand: item.brand ?? null,
            savedFoodId: item.savedFoodId ?? null,
            quantity: Number(item.quantity ?? 1),
            proteinG: Number(item.proteinG ?? 0),
            carbsG: Number(item.carbsG ?? 0),
            fatG: Number(item.fatG ?? 0),
            calories: Number(item.calories ?? 0),
            mealSlot: item.mealSlot ?? "snack",
            sortOrder: i,
          }),
        ),
      );
    }
  }

  const full = await db.query.menuTemplates.findFirst({
    where: eq(schema.menuTemplates.id, id),
    with: { items: { orderBy: [asc(schema.menuTemplateItems.sortOrder)] } },
  });

  return jsonOk({ template: full });
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("Template id required");

  const db = await getDb();
  await db
    .delete(schema.menuTemplates)
    .where(
      and(
        eq(schema.menuTemplates.id, id),
        eq(schema.menuTemplates.userId, authz.userId),
      ),
    );

  return jsonOk({ ok: true });
}
