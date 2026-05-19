"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

type PromptState = "idle" | "registering" | "ready" | "denied" | "unsupported" | "error";

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) view[i] = rawData.charCodeAt(i);
  return buffer;
}

export function CustomerPushPrompt({ token }: { token: string }) {
  const [state, setState] = useState<PromptState>("idle");
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw-push.js");
        await navigator.serviceWorker.ready;
        if (cancelled) return;

        const permission = Notification.permission;
        const existing = await registration.pushManager.getSubscription();

        if (existing && permission === "granted") {
          await persistSubscription(existing);
          setState("ready");
          return;
        }

        if (permission === "denied") {
          setState("denied");
          return;
        }

        // Need to ask — show banner; actual prompt fires on user click.
        setState("idle");
        setShowBanner(true);
      } catch (err) {
        console.error("[push] SW register failed:", err);
        setState("error");
      }
    }

    async function persistSubscription(sub: PushSubscription) {
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await fetch(`/api/customer/${token}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {});
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function enablePush() {
    if (typeof window === "undefined") return;
    const vapidKey = (window as unknown as { __VAPID_PUBLIC_KEY?: string }).__VAPID_PUBLIC_KEY
      || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setState("error");
      return;
    }

    setState("registering");
    try {
      const registration = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "idle");
        return;
      }
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setState("error");
        return;
      }
      await fetch(`/api/customer/${token}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent,
        }),
      });
      setState("ready");
      setShowBanner(false);
    } catch (err) {
      console.error("[push] subscribe failed:", err);
      setState("error");
    }
  }

  if (!showBanner || state === "ready" || state === "unsupported") return null;

  return (
    <div className="mx-3 my-2 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      <div className="flex min-w-0 items-center gap-2">
        {state === "denied" ? <BellOff className="h-4 w-4 shrink-0" /> : <Bell className="h-4 w-4 shrink-0" />}
        <div className="min-w-0">
          {state === "denied"
            ? "Bạn đã chặn thông báo. Vào cài đặt trình duyệt để mở lại."
            : "Bật thông báo để nhận tin khi KS cập nhật tiến độ"}
        </div>
      </div>
      {state !== "denied" ? (
        <button
          type="button"
          onClick={enablePush}
          disabled={state === "registering"}
          className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-[11px] font-semibold text-amber-950 disabled:opacity-60"
        >
          {state === "registering" ? "Đang bật..." : "Bật"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShowBanner(false)}
          className="shrink-0 rounded-full border border-amber-400/40 px-3 py-1 text-[11px] text-amber-100"
        >
          Ẩn
        </button>
      )}
    </div>
  );
}
