import { jsonOk, requireUser } from "@/lib/api";
import { getRecentFoods, getPinnedFoods, searchFoods } from "@/lib/food-search";

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const recent = searchParams.get("recent");

  if (recent === "1") {
    const [recentFoods, pinned] = await Promise.all([
      getRecentFoods(authz.userId),
      getPinnedFoods(authz.userId),
    ]);
    return jsonOk({ results: [...pinned, ...recentFoods] });
  }

  const results = await searchFoods(authz.userId, q);
  return jsonOk({ results });
}
