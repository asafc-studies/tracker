import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { lookupBarcode } from "@/lib/food-search";

export async function GET(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code") ?? "";
  if (!code.trim()) return jsonError("Barcode code required");

  const result = await lookupBarcode(authz.userId, code);
  if (!result) return jsonError("Product not found", 404);

  return jsonOk({ food: result });
}
