"use client";

import { useCallback, useEffect, useState } from "react";
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

export function ReminderEnableBanner() {
  const [status, setStatus] = useState<
    "loading" | "unsupported" | "off" | "on" | "unavailable"
  >("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    try {
      const vapid = await apiFetch<VapidPayload>("/api/push/subscribe");
      if (!vapid.configured || !vapid.publicKey) {
        setStatus("unavailable");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    } catch {
      setStatus("unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    setError("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError("Notification permission denied");
        return;
      }
      const vapid = await apiFetch<VapidPayload>("/api/push/subscribe");
      if (!vapid.publicKey) {
        setError("Push not configured on server");
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
      setStatus("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiFetch("/api/push/subscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" || status === "unsupported") return null;

  if (status === "unavailable") {
    return (
      <p className="text-xs text-[var(--muted)] rounded-md border border-[var(--border)] px-3 py-2">
        Device reminders need VAPID keys on the server (see env). You can still
        set reminder schedules on items.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 flex flex-wrap items-center gap-2">
      <p className="text-xs text-[var(--muted)] flex-1 min-w-[12rem]">
        {status === "on"
          ? "Push reminders on — you’ll get notified even when the app is closed."
          : "Turn on push reminders for daily / weekly checklist pings."}
      </p>
      {status === "on" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void disable()}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] min-h-[40px] px-2"
        >
          Disable
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="rounded-md bg-[var(--accent)] text-[var(--background)] px-3 py-1.5 text-xs font-medium min-h-[40px] disabled:opacity-50"
        >
          Enable reminders
        </button>
      )}
      {error ? <p className="w-full text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
