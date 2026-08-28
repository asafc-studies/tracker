import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { describeFoodFromImage } from "@/lib/food-image";

/** POST /api/macros/describe-image — photo → food description (Mistral vision) */
export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const body = await req.json().catch(() => ({}));
    const imageBase64 =
      typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
    const mimeType =
      typeof body?.mimeType === "string" ? body.mimeType.trim() : "";
    const hint = typeof body?.hint === "string" ? body.hint.trim() : undefined;

    if (!imageBase64 || !mimeType) {
      return jsonError("imageBase64 and mimeType are required");
    }

    const result = await describeFoodFromImage(imageBase64, mimeType, hint);
    return jsonOk(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Describe failed";
    console.error("[macros/describe-image]", message);
    const status =
      message.includes("MISTRAL_API_KEY") ||
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
