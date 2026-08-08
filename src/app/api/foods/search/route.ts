import { jsonOk, requireUser } from "@/lib/api";
import {
  getLast2DaysFoods,
  getLastLoggedFoods,
  getPinnedFoods,
  searchFoods,
} from "@/lib/food-search";

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const recent = searchParams.get("recent");

  if (recent === "1") {
    const [last2Days, lastLogged, favorites] = await Promise.all([
      getLast2DaysFoods(authz.userId),
      getLastLoggedFoods(authz.userId),
      getPinnedFoods(authz.userId),
    ]);
    return jsonOk({ last2Days, lastLogged, favorites });
  }

  const results = await searchFoods(authz.userId, q);
  return jsonOk({ results });
}
