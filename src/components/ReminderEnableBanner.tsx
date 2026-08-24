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
  | "denied";

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
        /* fall through to local */
      }
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
      setStatus("local");
      notifyTicker();
      try {
        new Notification("Recomp Tracker", {
          body: "Reminders are on — you’ll get a ping when due times pass.",
          tag: "recomp-reminders-test",
          icon: "/icons/icon-192.png",
        });
      } catch {
        setError(
          "Permission granted, but this browser blocked the test notification",
        );
      }
      if (pushReady) await enablePush(false);
      else await refresh();
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
        setError("Push not configured (VAPID keys) — local alerts still work");
        setStatus("local");
        notifyTicker();
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
        Notification.permission === "granted" ? "local" : "need-permission",
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
        Notifications are blocked in the browser. Allow them for this site to
        get in-app reminder pings.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 flex flex-wrap items-center gap-2">
      <p className="text-xs text-[var(--muted)] flex-1 min-w-[12rem]">
        {status === "push"
          ? "Alerts on — in-app at due time + morning push digest when closed."
          : status === "local"
            ? "In-app alerts on. Keep this tab open past the due time (checks about every 15s)."
            : "Allow notifications so due-time reminders can ping while the app is open."}
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
      {status === "local" && pushReady ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enablePush()}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs min-h-[40px] hover:border-[var(--accent)]"
        >
          Add morning push
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
