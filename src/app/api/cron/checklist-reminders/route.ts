import { jsonError, jsonOk } from "@/lib/api";
import { sendChecklistPushReminders } from "@/lib/push";

/**
 * Checklist reminder push.
 *
 * Android needs Web Push (in-page timers die when Chrome backgrounds the tab).
 * Vercel Hobby only allows one cron/day — use an external scheduler every ~5 min:
 *   GET /api/cron/checklist-reminders?mode=window
 *   Authorization: Bearer $CRON_SECRET
 *
 * Optional morning catch-up: ?mode=digest
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return jsonError("Unauthorized", 401);
    }
  } else if (process.env.NODE_ENV === "production") {
    return jsonError("CRON_SECRET not set", 503);
  }

  const url = new URL(req.url);
  const modeParam = url.searchParams.get("mode");
  const mode = modeParam === "digest" ? "digest" : "window";
  const windowRaw = Number(url.searchParams.get("window") || "15");
  const windowMinutes =
    Number.isFinite(windowRaw) && windowRaw > 0 && windowRaw <= 120
      ? windowRaw
      : 15;

  try {
    const result = await sendChecklistPushReminders({ mode, windowMinutes });
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed", 500);
  }
}
