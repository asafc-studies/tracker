import { jsonOk, requireUser } from "@/lib/api";
import {
  getLast2DaysFoods,
  getLastLoggedFoods,
  getPinnedFoods,
  searchFoods,
} from "@/lib/food-search";
import { sanitizeLikeQuery } from "@/lib/security";

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const q = sanitizeLikeQuery(searchParams.get("q") ?? "");
  const recent = searchParams.get("recent");

  if (recent === "1") {
    const [last2Days, lastLogged, favorites] = await Promise.all([
      getLast2DaysFoods(authz.userId),
      getLastLoggedFoods(authz.userId),
      getPinnedFoods(authz.userId),
    ]);
    return jsonOk({ last2Days, lastLogged, favorites });
  }

  if (q.length < 2) return jsonOk({ results: [] });

  const results = await searchFoods(authz.userId, q);
  return jsonOk({ results });
}
