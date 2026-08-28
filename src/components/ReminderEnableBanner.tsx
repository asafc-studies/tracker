"use client";

import { useCallback, useEffect, useState } from "react";
import { REMINDERS_READY_EVENT } from "@/components/ReminderLocalTicker";
import { apiFetch } from "@/lib/api-fetch";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type VapidPayload = { configured: boolean; publicKey: string | null };

type Status =
  | "loading"
  | "unsupported"
  | "need-permission"
  | "local"
  | "push"
  | "denied"
  | "need-vapid";

function notifyTicker() {
  window.dispatchEvent(new Event(REMINDERS_READY_EVENT));
}

export function ReminderEnableBanner() {
  const [status, setStatus] = useState<Status>("loading");
  const [pushReady, setPushReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }

    let vapidOk = false;
    try {
      const vapid = await apiFetch<VapidPayload>("/api/push/subscribe");
      vapidOk = Boolean(vapid.configured && vapid.publicKey);
    } catch {
      vapidOk = false;
    }
    setPushReady(vapidOk);

    const perm = Notification.permission;
    if (perm === "denied") {
      setStatus("denied");
      return;
    }
    if (perm !== "granted") {
      setStatus("need-permission");
      return;
    }

    if (
      vapidOk &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    ) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "push" : "local");
        return;
      } catch {
        /* fall through */
      }
    }

    if (!vapidOk) {
      setStatus("need-vapid");
      return;
    }
    setStatus("local");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enableLocal() {
    setBusy(true);
    setError("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "need-permission");
        setError("Notification permission denied");
        return;
      }
      notifyTicker();
      if (pushReady) {
        await enablePush(false);
      } else {
        setStatus("need-vapid");
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function enablePush(fromButton = true) {
    if (fromButton) {
      setBusy(true);
      setError("");
    }
    try {
      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          setError("Notification permission denied");
          return;
        }
      }
      const vapid = await apiFetch<VapidPayload>("/api/push/subscribe");
      if (!vapid.publicKey) {
        setError("Push not configured (VAPID keys) — required on Android");
        setStatus("need-vapid");
        notifyTicker();
        return;
      }
      if (!("serviceWorker" in navigator)) {
        setError("Service worker missing — open the installed app / production site");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      await apiFetch("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          subscription: {
            endpoint: json.endpoint,
            keys: json.keys,
          },
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      setStatus("push");
      notifyTicker();
      try {
        await reg.showNotification("Recomp Tracker", {
          body: "Android push on — due times can alert even if the app is closed.",
          tag: "recomp-reminders-test",
          icon: "/icons/icon-192.png",
          badge: "/icons/notification-badge.png",
        });
      } catch {
        /* ignore test toast failure */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable push");
      setStatus("local");
      notifyTicker();
    } finally {
      if (fromButton) setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setError("");
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await apiFetch("/api/push/subscribe", {
            method: "DELETE",
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
      }
      setStatus(
        Notification.permission === "granted"
          ? pushReady
            ? "local"
            : "need-vapid"
          : "need-permission",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unsupported") return null;

  if (status === "denied") {
    return (
      <p className="text-xs text-[var(--muted)] rounded-md border border-[var(--border)] px-3 py-2">
        Notifications are blocked. On Android: site settings → Notifications →
        Allow (and disable battery optimization for Chrome / the installed app).
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 flex flex-wrap items-center gap-2">
      <p className="text-xs text-[var(--muted)] flex-1 min-w-[12rem]">
        {status === "push"
          ? "Android push on — due-time alerts work with the app closed (needs the 5‑min cron)."
          : status === "need-vapid"
            ? "Android needs Web Push. Set VAPID keys on the server, deploy, then enable push here (dev mode has no service worker)."
            : status === "local"
              ? "Notifications allowed — tap Enable Android push so alerts work when the app is closed."
              : "Allow notifications, then enable Android push. In-page timers alone won’t fire after you leave Chrome."}
      </p>
      {status === "need-permission" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enableLocal()}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-1.5 text-xs font-medium min-h-[40px] disabled:opacity-50"
        >
          Allow notifications
        </button>
      ) : null}
      {status === "local" || status === "need-vapid" ? (
        <button
          type="button"
          disabled={busy || (status === "need-vapid" && !pushReady)}
          onClick={() => void enablePush()}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-1.5 text-xs font-medium min-h-[40px] disabled:opacity-50"
        >
          Enable Android push
        </button>
      ) : null}
      {status === "push" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void disablePush()}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[40px] px-2"
        >
          Disable push
        </button>
      ) : null}
      {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
