import { jsonError, jsonOk } from "@/lib/api";
import { sendChecklistPushReminders } from "@/lib/push";

/**
 * Vercel Cron (or manual) entry — send due checklist Web Push reminders.
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
