import Link from "next/link";
import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { PushEnableButton } from "@/components/push-enable-button";
import { SubPushPrompt } from "./sub-push-prompt";

export function SubLayout({
  title,
  subtitle,
  backHref,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0f1015] text-[#f0f2ff]">
      <SubPushPrompt />
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-4 pb-10 pt-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          {backHref ? (
            <Link
              href={backHref}
              className="inline-flex w-fit items-center gap-2 rounded-full bg-[#1a1d2e] px-4 py-2 text-base font-medium text-[#f0f2ff] hover:bg-[#252840]"
            >
              <ArrowLeft className="h-5 w-5" />
              Quay lại
            </Link>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <PushEnableButton />
            <NotificationsBell apiBase="/api/notifications" listHref="/notifications" />
          </div>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-orange-300">{title}</h1>
          {subtitle ? <p className="mt-2 text-base text-[#8892b0]">{subtitle}</p> : null}
        </div>

        <div className="flex flex-col gap-4">{children}</div>
      </div>
    </div>
  );
}

export function BigCard({
  icon,
  title,
  subtitle,
  href,
  onClick,
  tone = "primary",
  disabled,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  href?: string;
  onClick?: () => void;
  tone?: "primary" | "muted" | "danger" | "success" | "warn";
  disabled?: boolean;
}) {
  const palette = {
    primary: "bg-[#1a1d2e] border-[#ff8a3d]/40 hover:border-[#ff8a3d] active:scale-[0.99]",
    muted: "bg-[#13151f] border-[#252840] opacity-60",
    danger: "bg-[#2a1518] border-[#f87171]/50 hover:border-[#f87171]",
    success: "bg-[#152418] border-[#34d399]/50 hover:border-[#34d399]",
    warn: "bg-[#2a2415] border-[#fbbf24]/50 hover:border-[#fbbf24]",
  }[tone];

  const inner = (
    <div
      className={`flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-6 text-left transition ${palette} ${disabled ? "pointer-events-none" : ""}`}
    >
      {icon ? <div className="shrink-0 text-orange-300">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <div className="text-xl font-bold text-[#f0f2ff]">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-[#8892b0]">{subtitle}</div> : null}
      </div>
    </div>
  );

  if (href && !disabled) return <Link href={href}>{inner}</Link>;
  if (onClick && !disabled)
    return (
      <button type="button" onClick={onClick} className="w-full">
        {inner}
      </button>
    );
  return inner;
}
