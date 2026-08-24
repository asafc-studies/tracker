import { jsonError, jsonOk } from "@/lib/api";
import { sendChecklistPushReminders } from "@/lib/push";

/**
 * Vercel Cron (Hobby: once/day) — morning digest of today’s checklist reminders.
 * Exact due-times fire via in-app Notification ticker when the app is open.
 * Secure with CRON_SECRET: Authorization: Bearer <secret>
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

  try {
    const result = await sendChecklistPushReminders();
    return jsonOk(result);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Failed", 500);
  }
}
