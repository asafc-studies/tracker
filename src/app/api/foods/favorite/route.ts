import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { toggleFoodFavorite } from "@/lib/food-search";

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const body = await req.json();
  const pinned = Boolean(body.pinned);
  const savedFoodId = body.savedFoodId ? String(body.savedFoodId) : null;
  const foodLogId = body.foodLogId ? String(body.foodLogId) : null;

  if (!savedFoodId && !foodLogId) {
    return jsonError("savedFoodId or foodLogId required");
  }

  const result = await toggleFoodFavorite(authz.userId, {
    pinned,
    savedFoodId,
    foodLogId,
  });

  if (!result.ok) {
    if (result.reason === "full") {
      return jsonOk({ ok: false, reason: "full" as const });
    }
    return jsonError("Not found", 404);
  }

  return jsonOk({
    ok: true as const,
    favorited: result.favorited,
    savedFoodId: result.savedFoodId,
  });
}
