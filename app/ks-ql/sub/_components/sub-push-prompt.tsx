"use client";

import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import { enablePush, isPushSupported } from "@/lib/push-client";

const DISMISS_KEY = "ksql:sub:pushPromptDismissedDate";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SubPushPrompt() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission !== "default") return;

    let dismissed: string | null = null;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY);
    } catch {}
    if (dismissed === todayKey()) return;

    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  async function handleEnable() {
    if (!publicKey) {
      setErr("Thiếu cấu hình push (VAPID key)");
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await enablePush(publicKey);
    setBusy(false);
    if (res.ok) {
      setVisible(false);
    } else {
      setErr(res.reason);
    }
  }

  function handleLater() {
    try {
      localStorage.setItem(DISMISS_KEY, todayKey());
    } catch {}
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 px-4 pb-6 pt-10 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border-2 border-[#ff8a3d]/40 bg-[#13151f] p-5 shadow-2xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#ff8a3d]/20 text-orange-300">
            <BellRing className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold text-[#f0f2ff]">Bật thông báo</div>
            <div className="mt-1 text-sm text-[#aab2cf]">
              Nhận cập nhật ngay khi kế toán duyệt đơn vật tư, đặt NCC hoặc trao đổi trên đề xuất của anh.
            </div>
          </div>
          <button
            type="button"
            onClick={handleLater}
            aria-label="Đóng"
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#8892b0] hover:bg-[#1a1d2e] hover:text-[#f0f2ff]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {err ? (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {err}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleEnable}
            disabled={busy}
            className="w-full rounded-xl bg-[#ff8a3d] px-4 py-3 text-base font-bold text-[#1a120a] transition hover:bg-[#fb923c] disabled:opacity-60"
          >
            {busy ? "Đang bật..." : "Bật ngay"}
          </button>
          <button
            type="button"
            onClick={handleLater}
            className="w-full rounded-xl border border-[#252840] bg-[#1a1d2e] px-4 py-2.5 text-sm font-medium text-[#8892b0] transition hover:text-[#f0f2ff]"
          >
            Để sau
          </button>
        </div>
      </div>
    </div>
  );
}
