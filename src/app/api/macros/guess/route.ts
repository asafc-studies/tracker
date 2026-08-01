import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { guessMacrosFromText } from "@/lib/macros-guesser";

/** POST /api/macros/guess — free-text → estimated food log macros */
export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  try {
    const body = await req.json().catch(() => ({}));
    const description =
      typeof body?.description === "string" ? body.description.trim() : "";
    if (description.length < 2) {
      return jsonError("Describe the food or recipe first");
    }

    const guess = await guessMacrosFromText(description);
    return jsonOk({ guess });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Guess failed";
    console.error("[macros/guess]", message);
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
