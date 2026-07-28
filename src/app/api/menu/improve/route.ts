import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { sumMacros } from "@/lib/macros";
import { improveMenuWithOpenAI } from "@/lib/openai-menu";
import { getMenuForDate, replaceStandingMenu } from "@/lib/standing-menu";
import { todayISODate } from "@/lib/tdee";

/**
 * POST /api/menu/improve
 * Revises the persistent daily (standing) menu from recent intake problems.
 * Checkmarks for any day stay separate and start empty for new item ids.
 */
export async function POST() {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const improved = await improveMenuWithOpenAI(authz.userId);
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
    const status = message.includes("OPENAI_API_KEY") ? 503 : 400;
    return jsonError(message, status);
  }
}
