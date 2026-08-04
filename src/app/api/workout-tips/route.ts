import { and, desc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { coachWithAI } from "@/lib/ai-coach";
import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { todayISODate } from "@/lib/tdee";

export type WorkoutTipView = {
  id: string;
  date: string;
  prompt: string;
  label: string;
  summary: string;
  keepDoing: string[];
  improve: string[];
  watchOut: string[];
  model: string;
  createdAt: Date | number;
};

function parseList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function mapTip(row: typeof schema.workoutTips.$inferSelect): WorkoutTipView {
  return {
    id: row.id,
    date: row.date,
    prompt: row.prompt,
    label: row.label,
    summary: row.summary,
    keepDoing: parseList(row.keepDoingJson),
    improve: parseList(row.improveJson),
    watchOut: parseList(row.watchOutJson),
    model: row.model,
    createdAt: row.createdAt,
  };
}

function tipLabel(prompt: string, summary: string): string {
  const p = prompt.trim();
  if (p) return p.length > 80 ? `${p.slice(0, 77)}…` : p;
  const s = summary.trim().replace(/\s+/g, " ");
  if (!s) return "Workout tip";
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function rangeStart(range: string): string | null {
  if (range === "all") return null;
  const days = range === "14d" ? 14 : 7;
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  return todayISODate(d);
}

/**
 * GET /api/workout-tips?range=7d|14d|all
 */
export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "7d";
  const start = rangeStart(range);

  const db = await getDb();
  const rows = await db.query.workoutTips.findMany({
    where: start
      ? and(
          eq(schema.workoutTips.userId, authz.userId),
          gte(schema.workoutTips.date, start),
        )
      : eq(schema.workoutTips.userId, authz.userId),
    orderBy: [desc(schema.workoutTips.createdAt)],
  });

  return jsonOk({ range, tips: rows.map(mapTip) });
}

/**
 * POST /api/workout-tips
 * Body: { prompt?: string, date?: string }
 * Generates workout coach advice and persists it.
 */
export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const body = await req.json().catch(() => ({}));
    const prompt =
      typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const dateRaw = typeof body?.date === "string" ? body.date.trim() : "";
    const today = todayISODate();
    const date = dateRaw && dateRaw <= today ? dateRaw : today;

    const advice = await coachWithAI(
      authz.userId,
      "workout",
      prompt || undefined,
    );

    const db = await getDb();
    const [row] = await db
      .insert(schema.workoutTips)
      .values({
        userId: authz.userId,
        date,
        prompt,
        label: tipLabel(prompt, advice.summary),
        summary: advice.summary,
        keepDoingJson: JSON.stringify(advice.keepDoing),
        improveJson: JSON.stringify(advice.improve),
        watchOutJson: JSON.stringify(advice.watchOut),
        model: advice.model,
      })
      .returning();

    return jsonOk({ tip: mapTip(row) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Workout tip failed";
    console.error("[workout-tips]", message);
    const status =
      message.includes("No AI key") ||
      message.includes("auth failed") ||
      message.includes("401") ||
      message.includes("403")
        ? 503
        : message.includes("quota") || message.includes("429")
          ? 402
          : 400;
    return jsonError(message, status);
  }
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("Tip id required");

  const db = await getDb();
  await db
    .delete(schema.workoutTips)
    .where(
      and(
        eq(schema.workoutTips.id, id),
        eq(schema.workoutTips.userId, authz.userId),
      ),
    );

  return jsonOk({ ok: true });
}
