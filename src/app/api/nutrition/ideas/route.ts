import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { generateNutritionIdea } from "@/lib/nutrition-ideas";
import { todayISODate } from "@/lib/tdee";

/** POST /api/nutrition/ideas — prompt + same-day macros → tip or recipe */
export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const body = await req.json().catch(() => ({}));
    const prompt =
      typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (prompt.length < 2) {
      return jsonError("Describe what you want an idea for");
    }
    const date =
      typeof body?.date === "string" && body.date
        ? String(body.date)
        : todayISODate();

    const idea = await generateNutritionIdea(authz.userId, prompt, date);
    return jsonOk({ idea });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Idea failed";
    console.error("[nutrition/ideas]", message);
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
