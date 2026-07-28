import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { sumMacros } from "@/lib/macros";
import { improveMenuWithAI } from "@/lib/openai-menu";
import { getMenuForDate, replaceStandingMenu } from "@/lib/standing-menu";
import { todayISODate } from "@/lib/tdee";

/**
 * POST /api/menu/improve
 * Revises the persistent daily menu via GitHub Models / Gemini / OpenAI.
 */
export async function POST() {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const improved = await improveMenuWithAI(authz.userId);
    await replaceStandingMenu(authz.userId, improved.items);
    const today = todayISODate();
    const items = await getMenuForDate(authz.userId, today);

    return jsonOk({
      applyDate: today,
      rationale: improved.rationale,
      model: improved.model,
      items,
      totals: sumMacros(items),
      persistent: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Improve failed";
    console.error("[menu/improve]", message);
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
