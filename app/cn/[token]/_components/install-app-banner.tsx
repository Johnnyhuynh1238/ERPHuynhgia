"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

const DISMISS_KEY = "cn_install_dismissed_at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios_safari" | "ios_in_app" | "android_chrome" | "android_in_app" | "desktop" | "other";

function detectPlatform(ua: string): Platform {
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !/Windows/.test(ua);
  const isAndroid = /Android/.test(ua);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Zalo|Line|MicroMessenger|TikTok|Twitter/i.test(ua);

  if (isIOS) {
    if (inApp || !/Safari/.test(ua)) return "ios_in_app";
    return "ios_safari";
  }
  if (isAndroid) {
    if (inApp) return "android_in_app";
    if (/Chrome|EdgA|SamsungBrowser/i.test(ua)) return "android_chrome";
    return "android_in_app";
  }
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

function isRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {}
}

export function InstallAppBanner() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [promptEvent, setPromptEvent] = useState<DeferredPrompt | null>(null);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (isRecentlyDismissed()) return;

    const p = detectPlatform(window.navigator.userAgent);
    setPlatform(p);
    setOpen(true);

    if (p === "android_chrome") {
      const handler = (e: Event) => {
        e.preventDefault();
        setPromptEvent(e as DeferredPrompt);
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);
      return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
    }
  }, []);

  if (!open || !platform) return null;

  function dismiss() {
    markDismissed();
    setOpen(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Đã sao chép link");
    } catch {
      toast.error("Không sao chép được — vui lòng copy thủ công");
    }
  }

  async function triggerAndroidInstall() {
    if (!promptEvent) {
      toast.info("Mở menu Chrome (⋮) → chọn 'Cài đặt ứng dụng'");
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") {
      setOpen(false);
    } else {
      markDismissed();
      setOpen(false);
    }
  }

  const BANNER_TEXT = "Thêm vào màn hình - sử dụng như app.";
  const platformCopy: Record<Platform, { cta: string }> = {
    ios_safari: { cta: "Hướng dẫn cài" },
    ios_in_app: { cta: "Sao chép link" },
    android_chrome: { cta: "Cài đặt" },
    android_in_app: { cta: "Sao chép link" },
    desktop: { cta: "" },
    other: { cta: "" },
  };

  if (platform === "desktop" || platform === "other") return null;

  const copy = platformCopy[platform];

  return (
    <>
      <div className="fixed bottom-20 left-1/2 z-40 w-[calc(100%-16px)] max-w-[430px] -translate-x-1/2 rounded-xl border border-[#2d3249] bg-[#1a1d2e] p-3 text-sm shadow-xl">
        <div className="text-sm text-white">{BANNER_TEXT}</div>
        <div className="mt-2 flex justify-end gap-2">
          <button className="rounded-lg border border-[#2d3249] px-3 py-1 text-xs text-[#d9def3]" onClick={dismiss}>
            Để sau
          </button>
          <button
            className="rounded-lg bg-[#f97316] px-3 py-1 text-xs font-semibold text-black"
            onClick={() => {
              if (platform === "android_chrome") triggerAndroidInstall();
              else if (platform === "ios_safari") setExpanded(true);
              else copyLink();
            }}
          >
            {copy.cta}
          </button>
        </div>
      </div>

      {expanded && platform === "ios_safari" ? (
        <div
          role="dialog"
          aria-label="Hướng dẫn cài app"
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#1a1d2e] p-4 text-sm text-[#d9def3] shadow-2xl"
          >
            <div className="text-base font-semibold text-white">Cài Cổng Chủ Nhà lên iPhone</div>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f97316] font-bold text-black">1</span>
                <div>
                  Bấm nút <span className="inline-flex items-center gap-1 rounded bg-[#252840] px-2 py-0.5 font-semibold text-white">Chia sẻ <span aria-hidden>⬆︎</span></span> ở thanh dưới của Safari.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f97316] font-bold text-black">2</span>
                <div>
                  Vuốt xuống chọn <span className="font-semibold text-white">&ldquo;Thêm vào màn hình chính&rdquo;</span>.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f97316] font-bold text-black">3</span>
                <div>
                  Bấm <span className="font-semibold text-white">Thêm</span> ở góc trên. Icon &ldquo;Nhà của tôi&rdquo; xuất hiện trên màn hình.
                </div>
              </li>
            </ol>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-[#f97316] px-3 py-2 text-sm font-semibold text-black"
              onClick={() => {
                markDismissed();
                setExpanded(false);
                setOpen(false);
              }}
            >
              Đã hiểu
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
