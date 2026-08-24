import { jsonError, jsonOk, requireUser } from "@/lib/api";
import { getVapidPublicKey, removePushSubscription, savePushSubscription } from "@/lib/push";

export async function GET() {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return jsonOk({ configured: false, publicKey: null });
  }
  return jsonOk({ configured: true, publicKey });
}

export async function POST(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  if (!getVapidPublicKey()) {
    return jsonError("Push not configured on server", 503);
  }

  let body: {
    subscription?: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    };
    timezone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return jsonError("Invalid subscription");
  }

  const timezone =
    typeof body.timezone === "string" && body.timezone.length < 80
      ? body.timezone
      : "UTC";

  const id = await savePushSubscription(
    authz.userId,
    { endpoint, keys: { p256dh, auth } },
    timezone,
  );
  return jsonOk({ ok: true, id });
}

export async function DELETE(req: Request) {
  const authz = await requireUser();
  if ("error" in authz) return authz.error;

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON");
  }
  if (!body.endpoint) return jsonError("endpoint required");
  await removePushSubscription(authz.userId, body.endpoint);
  return jsonOk({ ok: true });
}
