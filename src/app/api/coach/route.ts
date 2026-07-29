import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { coachWithAI, type CoachScope } from "@/lib/ai-coach";

/**
 * POST /api/coach
 * Shared AI coaching for today summary or workout tips.
 * Body: { scope: "today" | "workout", userRequest?: string }
 */
export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const body = await req.json().catch(() => ({}));
    const scope = String(body?.scope || "today") as CoachScope;
    if (scope !== "today" && scope !== "workout") {
      return jsonError('scope must be "today" or "workout"');
    }
    const userRequest =
      typeof body?.userRequest === "string"
        ? body.userRequest.trim()
        : undefined;

    const advice = await coachWithAI(
      authz.userId,
      scope,
      userRequest || undefined,
    );

    return jsonOk({ scope, ...advice });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Coach failed";
    console.error("[coach]", message);
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
