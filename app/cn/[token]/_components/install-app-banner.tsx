"use client";

import { useEffect, useState } from "react";

const DISMISS_COOKIE = "cn_pwa_dismissed";

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppBanner() {
  const [promptEvent, setPromptEvent] = useState<DeferredPrompt | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const alreadyDismissed = document.cookie
      .split(";")
      .map((v) => v.trim())
      .some((v) => v.startsWith(`${DISMISS_COOKIE}=`));
    if (alreadyDismissed) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as DeferredPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  if (!promptEvent || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[calc(100%-16px)] max-w-[430px] -translate-x-1/2 rounded-xl border border-[#2d3249] bg-[#1a1d2e] p-3 text-sm shadow-xl">
      <div className="font-semibold">Cài app Cổng Chủ Nhà</div>
      <div className="mt-1 text-xs text-[#8892b0]">Thêm vào màn hình chính để mở nhanh và nhận trải nghiệm giống app.</div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs"
          onClick={() => {
            const maxAge = 60 * 60 * 24 * 90;
            document.cookie = `${DISMISS_COOKIE}=1; path=/; max-age=${maxAge}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
            setDismissed(true);
          }}
        >
          Để sau
        </button>
        <button
          className="rounded-lg bg-[#f97316] px-3 py-1 text-xs font-semibold text-black"
          onClick={async () => {
            await promptEvent.prompt();
            await promptEvent.userChoice;
            setPromptEvent(null);
          }}
        >
          Cài đặt
        </button>
      </div>
    </div>
  );
}
