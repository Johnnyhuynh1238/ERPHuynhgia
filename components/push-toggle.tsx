"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { disablePush, enablePush, getPushPermission, isPushSupported } from "@/lib/push-client";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

export function PushToggle({ publicKey }: { publicKey: string | undefined }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushSupported()) {
        if (!cancelled) setState("unsupported");
        return;
      }
      const perm = await getPushPermission();
      if (perm === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const res = await fetch("/api/push/subscribe", { cache: "no-store" });
        if (res.ok) {
          const j = await res.json();
          if (!cancelled) setState(j.enabled ? "on" : "off");
        } else {
          if (!cancelled) setState("off");
        }
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "unsupported") {
    return (
      <div className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-xs text-[#8892b0]">
        Trình duyệt không hỗ trợ thông báo đẩy.
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Bạn đã chặn thông báo. Mở cài đặt trình duyệt để bật lại.
      </div>
    );
  }

  const handleEnable = async () => {
    if (!publicKey) {
      setMsg("Thiếu VAPID public key trên server");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await enablePush(publicKey);
    setBusy(false);
    if (res.ok) {
      setState("on");
      setMsg("Đã bật thông báo đẩy.");
    } else {
      setMsg(res.reason);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    setMsg(null);
    await disablePush();
    setBusy(false);
    setState("off");
    setMsg("Đã tắt thông báo đẩy.");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2">
        <div className="flex items-center gap-2">
          {state === "on" ? <Bell className="h-4 w-4 text-emerald-300" /> : <BellOff className="h-4 w-4 text-[#8892b0]" />}
          <div>
            <div className="text-sm font-medium text-[#f0f2ff]">Thông báo đẩy</div>
            <div className="text-xs text-[#8892b0]">
              {state === "on" ? "Đang bật. Bạn sẽ nhận nhắc trước & quá hạn." : state === "loading" ? "Đang kiểm tra..." : "Bật để nhận nhắc nhiệm vụ trước hạn"}
            </div>
          </div>
        </div>
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin text-[#8892b0]" />
        ) : state === "on" ? (
          <button
            type="button"
            disabled={busy}
            onClick={handleDisable}
            className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs font-medium text-[#d9def3] disabled:opacity-50"
          >
            {busy ? "..." : "Tắt"}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={handleEnable}
            className="rounded-lg bg-[#fb923c] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {busy ? "..." : "Bật"}
          </button>
        )}
      </div>
      {msg ? <div className="text-xs text-[#aab2cf]">{msg}</div> : null}
    </div>
  );
}
