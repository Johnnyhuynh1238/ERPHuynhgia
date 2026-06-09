"use client";

import { BellOff, BellRing } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { enablePush, isPushSupported } from "@/lib/push-client";

type State = "loading" | "off" | "default" | "denied" | "on" | "unsupported";

export function PushEnableButton({ className }: { className?: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") {
      setState("denied");
      return;
    }
    if (perm === "default") {
      setState("default");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw-push.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "default");
    } catch {
      setState("default");
    }
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (state === "loading" || state === "unsupported" || state === "on") return null;

  async function handle() {
    if (!publicKey) {
      setMsg("Thiếu VAPID public key.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await enablePush(publicKey);
    setBusy(false);
    if (res.ok) {
      setState("on");
    } else {
      setMsg(res.reason);
      refresh();
    }
  }

  const label =
    state === "denied" ? "Mở cài đặt trình duyệt để bật thông báo" : busy ? "Đang bật..." : "Bật thông báo";

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={handle}
        disabled={busy || state === "denied"}
        className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-60"
        title={label}
      >
        {state === "denied" ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{state === "denied" ? "Bị chặn" : "Bật TB"}</span>
      </button>
      {msg ? (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-[#252840] bg-[#1a1d2e] px-2 py-1.5 text-[11px] text-amber-300 shadow-lg">
          {msg}
        </div>
      ) : null}
    </div>
  );
}
