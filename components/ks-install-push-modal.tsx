"use client";

import { useEffect, useState } from "react";
import { Bell, Download, X } from "lucide-react";
import { enablePush, isPushSupported } from "@/lib/push-client";

const DISMISS_KEY = "ks_install_push_dismissed_at";
const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "ios_safari" | "ios_in_app" | "android_chrome" | "android_in_app" | "desktop" | "other";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(mq || iosStandalone);
}

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

type Step = "install" | "push";

export function KsInstallPushModal({ publicKey }: { publicKey?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("install");
  const [platform, setPlatform] = useState<Platform>("other");
  const [promptEvent, setPromptEvent] = useState<DeferredPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isRecentlyDismissed()) return;

    const standalone = isStandalone();
    const pushOk = isPushSupported() && Notification.permission === "granted";
    if (standalone && pushOk) return;

    setPlatform(detectPlatform(window.navigator.userAgent));
    setStep(!standalone ? "install" : "push");
    setOpen(true);

    if (!standalone) {
      const handler = (e: Event) => {
        e.preventDefault();
        setPromptEvent(e as DeferredPrompt);
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);
      return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
    }
  }, []);

  if (!open) return null;

  function dismiss() {
    markDismissed();
    setOpen(false);
  }

  async function handleInstall() {
    if (platform === "android_chrome" && promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setStep("push");
        return;
      }
    }
    if (platform === "android_chrome" && !promptEvent) {
      setMsg("Mở menu Chrome (⋮) → 'Cài đặt ứng dụng'");
      return;
    }
    if (platform === "ios_safari") {
      setShowIosHelp(true);
      return;
    }
    if (platform === "ios_in_app" || platform === "android_in_app") {
      try {
        await navigator.clipboard.writeText(window.location.href);
        setMsg("Đã sao chép link. Mở Safari/Chrome rồi dán để cài.");
      } catch {
        setMsg("Mở Safari/Chrome rồi truy cập lại để cài đặt.");
      }
      return;
    }
    setStep("push");
  }

  async function handleEnablePush() {
    if (!publicKey) {
      setMsg("Thiếu VAPID public key.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await enablePush(publicKey);
    setBusy(false);
    if (res.ok) {
      markDismissed();
      setOpen(false);
    } else {
      setMsg(res.reason);
    }
  }

  return (
    <>
      <div
        role="dialog"
        aria-label="Cài app và bật thông báo"
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      >
        <div className="relative w-full max-w-sm rounded-2xl border border-[#252840] bg-[#13151f] p-5 text-sm text-[#d9def3] shadow-2xl">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Đóng"
            className="absolute right-2 top-2 rounded-lg p-1.5 text-[#8892b0] hover:bg-[#1a1d2e]"
          >
            <X className="h-4 w-4" />
          </button>

          {step === "install" ? (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fb923c]/15 text-[#fb923c]">
                  <Download className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Cài app Huỳnh Gia</div>
                  <div className="text-xs text-[#8892b0]">Để nhận thông báo ngay cả khi tắt app</div>
                </div>
              </div>

              {platform === "ios_safari" ? (
                <p className="mt-4 text-xs text-[#aab2cf]">
                  iPhone: bấm <span className="font-semibold text-white">Cài</span> để xem hướng dẫn.
                </p>
              ) : platform === "android_chrome" ? (
                <p className="mt-4 text-xs text-[#aab2cf]">
                  Bấm <span className="font-semibold text-white">Cài</span> để thêm app vào màn hình chính.
                </p>
              ) : platform === "ios_in_app" || platform === "android_in_app" ? (
                <p className="mt-4 text-xs text-[#aab2cf]">
                  Bạn đang ở trong webview của ứng dụng khác. Hãy mở trình duyệt chính rồi cài.
                </p>
              ) : (
                <p className="mt-4 text-xs text-[#aab2cf]">Mở trên điện thoại để cài app.</p>
              )}

              {msg ? <div className="mt-3 text-xs text-amber-300">{msg}</div> : null}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs text-[#d9def3]"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={handleInstall}
                  className="rounded-lg bg-[#fb923c] px-3 py-1.5 text-xs font-semibold text-black"
                >
                  {platform === "ios_safari" || platform === "android_chrome" ? "Cài" : "Sao chép link"}
                </button>
              </div>

              {isPushSupported() ? (
                <button
                  type="button"
                  onClick={() => setStep("push")}
                  className="mt-3 block w-full text-center text-xs text-[#8892b0] underline"
                >
                  Bỏ qua, chỉ bật thông báo
                </button>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fb923c]/15 text-[#fb923c]">
                  <Bell className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Bật thông báo</div>
                  <div className="text-xs text-[#8892b0]">Nhận thông báo từ hệ thống</div>
                </div>
              </div>

              <p className="mt-4 text-xs text-[#aab2cf]">
                Khi nhấn <span className="font-semibold text-white">Bật</span>, trình duyệt sẽ hỏi quyền thông báo — chọn <span className="font-semibold text-white">Cho phép</span>.
              </p>

              {msg ? <div className="mt-3 text-xs text-amber-300">{msg}</div> : null}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded-lg border border-[#2d3249] px-3 py-1.5 text-xs text-[#d9def3]"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleEnablePush}
                  className="rounded-lg bg-[#fb923c] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-60"
                >
                  {busy ? "Đang bật..." : "Bật ngay"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {showIosHelp ? (
        <div
          role="dialog"
          aria-label="Hướng dẫn cài app iOS"
          onClick={() => setShowIosHelp(false)}
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#1a1d2e] p-4 text-sm text-[#d9def3] shadow-2xl"
          >
            <div className="text-base font-semibold text-white">Cài app trên iPhone</div>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fb923c] font-bold text-black">1</span>
                <div>
                  Bấm nút <span className="inline-flex items-center gap-1 rounded bg-[#252840] px-2 py-0.5 font-semibold text-white">Chia sẻ <span aria-hidden>⬆︎</span></span> ở Safari.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fb923c] font-bold text-black">2</span>
                <div>
                  Chọn <span className="font-semibold text-white">&ldquo;Thêm vào màn hình chính&rdquo;</span>.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fb923c] font-bold text-black">3</span>
                <div>
                  Mở app từ icon trên màn hình rồi quay lại đây để bật thông báo.
                </div>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => {
                markDismissed();
                setShowIosHelp(false);
                setOpen(false);
              }}
              className="mt-4 w-full rounded-lg bg-[#fb923c] px-3 py-2 text-sm font-semibold text-black"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
