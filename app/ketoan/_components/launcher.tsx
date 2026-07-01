"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  RefreshCw,
  ArrowRightLeft,
  Banknote,
  Package,
  Receipt,
  BarChart3,
  ScrollText,
  Landmark,
  Settings,
  type LucideIcon,
} from "lucide-react";

type AccountDto = {
  id: string;
  code: string;
  name: string;
  kind: string;
  currentBalance: number;
};

type SummaryDto = {
  balance: { total: number; accounts: AccountDto[] };
  counts: { create: number; process: number; journal: number };
  processBreakdown: { expense: number; receipt: number; paymentOrder: number };
};

const formatVnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n));

const kindIcon = (kind: string) => (kind === "cash" ? "💵" : "🏦");

type AppKey = "thu-chi";

type PopItem = {
  label: string;
  href: string;
  badge?: number;
  isNew?: boolean;
};

type AppDef = {
  key: AppKey | null;
  label: string;
  Icon: LucideIcon;
  tint: string;
  disabled?: boolean;
  buildItems?: (data: SummaryDto | null) => Array<PopItem | "divider">;
};

const APPS: AppDef[] = [
  {
    key: "thu-chi",
    label: "Thu - Chi",
    Icon: ArrowRightLeft,
    tint: "#f97316",
    buildItems: (data) => {
      const pb = data?.processBreakdown;
      return [
        { label: "+ Lệnh chi mới", href: "/expenses", isNew: true },
        { label: "+ Lệnh thu mới", href: "/receipts", isNew: true },
        "divider",
        { label: "Lệnh chi chờ chuyển", href: "/expenses?status=pending", badge: pb?.expense ?? 0 },
        { label: "Lệnh thu chờ nhận", href: "/receipts?status=pending", badge: pb?.receipt ?? 0 },
        { label: "Lệnh thanh toán NCC", href: "/payment-orders?status=approved", badge: pb?.paymentOrder ?? 0 },
        "divider",
        { label: "Sổ cái thu - chi", href: "/treasury" },
      ];
    },
  },
  { key: null, label: "Lương",      Icon: Banknote,      tint: "#10b981", disabled: true },
  { key: null, label: "Vật tư",     Icon: Package,       tint: "#f59e0b", disabled: true },
  { key: null, label: "HĐ - Nợ KH", Icon: Receipt,       tint: "#3b82f6", disabled: true },
  { key: null, label: "Báo cáo",    Icon: BarChart3,     tint: "#a855f7", disabled: true },
  { key: null, label: "Chứng từ",   Icon: ScrollText,    tint: "#ec4899", disabled: true },
  { key: null, label: "Thuế",       Icon: Landmark,      tint: "#64748b", disabled: true },
  { key: null, label: "Cài đặt",    Icon: Settings,      tint: "#737373", disabled: true },
];

export function KetoanLauncher() {
  const [data, setData] = useState<SummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState<null | { app: AppDef; anchor: DOMRect }>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/ketoan/thu-chi-summary", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as SummaryDto;
      setData(json);
      setRefreshedAt(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div
      className="relative -mx-4 -mt-4 -mb-24 min-h-[calc(100vh-56px)] px-4 pt-5 pb-28 md:-m-6 md:min-h-[calc(100vh-96px)] md:px-6 md:pt-8 md:pb-8"
      style={{ background: "#0a0b12" }}
    >
      <div className="relative space-y-7">
        <BalanceHeadline
          data={data}
          loading={loading}
          error={error}
          refreshedAt={refreshedAt}
          onRefresh={load}
        />

        <div className="slide-up delay-2">
          <div className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
            Ứng dụng
          </div>
          <div className="grid grid-cols-4 gap-x-3 gap-y-5 sm:gap-x-5 sm:gap-y-6">
            {APPS.map((app, idx) => (
              <AppIcon
                key={app.label}
                app={app}
                delayClass={`delay-${Math.min(idx + 1, 6)}`}
                badge={app.key === "thu-chi" ? data?.counts.process ?? 0 : 0}
                onClick={
                  app.buildItems
                    ? (rect) => setOpen({ app, anchor: rect })
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>

      {open && open.app.buildItems && (
        <AppPopover
          app={open.app}
          anchor={open.anchor}
          items={open.app.buildItems(data)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function useAnimatedNumber(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    let raf = 0;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

function BalanceHeadline({
  data,
  loading,
  error,
  refreshedAt,
  onRefresh,
}: {
  data: SummaryDto | null;
  loading: boolean;
  error: string | null;
  refreshedAt: Date | null;
  onRefresh: () => void;
}) {
  const total = data?.balance.total ?? 0;
  const accounts = data?.balance.accounts ?? [];
  const animated = useAnimatedNumber(total);

  return (
    <div className="slide-up delay-1 relative px-1 pt-2">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">
        <Wallet className="h-3 w-3 text-[#fb923c]" />
        <span>Số dư hiện tại</span>
        <span className="text-white/25">·</span>
        <button
          type="button"
          onClick={onRefresh}
          className="smooth-press inline-flex items-center gap-1 text-white/50 hover:text-white/80"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          <span className="normal-case tracking-normal">
            {refreshedAt
              ? refreshedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
              : "—"}
          </span>
        </button>
      </div>

      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span
          className="text-[44px] font-bold leading-none tabular-nums tracking-tight text-white"
          style={{ textShadow: "0 2px 28px rgba(249,115,22,0.45)" }}
        >
          {formatVnd(animated)}
        </span>
        <span className="text-xl font-medium text-white/55">đ</span>
      </div>

      {error ? (
        <div className="mt-3 text-xs text-red-300">{error}</div>
      ) : accounts.length === 0 && loading ? (
        <div className="mt-3 space-y-1.5">
          <div className="h-4 w-40 rounded-md bg-white/5" />
          <div className="h-4 w-32 rounded-md bg-white/5" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="mt-3 text-xs text-amber-200/80">
          Chưa có tài khoản. Vào{" "}
          <Link href="/treasury" className="font-semibold underline">
            Sổ quỹ
          </Link>{" "}
          khai báo TK.
        </div>
      ) : (
        <div className="mt-3 divide-y divide-white/8">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between py-1.5 text-[13px]"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-sm">{kindIcon(a.kind)}</span>
                <span className="truncate text-white/85">{a.name}</span>
                <span className="hidden text-[11px] text-white/35 sm:inline">
                  · {a.code}
                </span>
              </div>
              <span className="ml-2 shrink-0 font-semibold tabular-nums text-white/95">
                {formatVnd(a.currentBalance)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppIcon({
  app,
  badge = 0,
  onClick,
  delayClass,
}: {
  app: AppDef;
  badge?: number;
  onClick?: (rect: DOMRect) => void;
  delayClass: string;
}) {
  const disabled = !!app.disabled;
  const Icon = app.Icon;
  return (
    <div className={`slide-up ${delayClass} flex flex-col items-center gap-2`}>
      <button
        type="button"
        onClick={(e) => onClick?.(e.currentTarget.getBoundingClientRect())}
        disabled={disabled}
        className={`smooth-press relative flex h-[62px] w-[62px] items-center justify-center rounded-[22px] sm:h-[68px] sm:w-[68px] ${
          disabled ? "cursor-not-allowed opacity-45" : ""
        }`}
        style={{
          backgroundColor: `${app.tint}${disabled ? "22" : "40"}`,
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          boxShadow: `inset 0 0 0 1px ${app.tint}55, inset 0 1px 0 rgba(255,255,255,0.18)`,
        }}
      >
        <Icon
          className="relative h-[28px] w-[28px] sm:h-[30px] sm:w-[30px]"
          strokeWidth={1.75}
          style={{ color: "#ffffff" }}
        />
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff3b30] px-1 text-[10px] font-bold text-white ring-2 ring-[#0a0b12]">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      <span
        className={`text-center text-[11px] font-medium leading-tight sm:text-[12px] ${
          disabled ? "text-white/35" : "text-white/80"
        }`}
      >
        {app.label}
      </span>
    </div>
  );
}

const POPOVER_WIDTH = 260;
const POPOVER_MARGIN = 10;
const POPOVER_GAP = 12;

function AppPopover({
  app,
  anchor,
  items,
  onClose,
}: {
  app: AppDef;
  anchor: DOMRect;
  items: Array<PopItem | "divider">;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    origin: string;
  } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const anchorCenterX = anchor.left + anchor.width / 2;

      // Vertical: prefer below, fallback above
      let top = anchor.bottom + POPOVER_GAP;
      let vertOrigin = "top";
      if (top + rect.height > vh - POPOVER_MARGIN) {
        const above = anchor.top - rect.height - POPOVER_GAP;
        if (above >= POPOVER_MARGIN) {
          top = above;
          vertOrigin = "bottom";
        } else {
          // Neither fits: clamp
          top = Math.max(POPOVER_MARGIN, vh - rect.height - POPOVER_MARGIN);
          vertOrigin = "top";
        }
      }

      // Horizontal: center on icon, clamp to viewport
      let left = anchorCenterX - rect.width / 2;
      left = Math.max(POPOVER_MARGIN, Math.min(vw - rect.width - POPOVER_MARGIN, left));

      // Compute origin X as % relative to popup (for scale anchor near icon)
      const originXpx = Math.max(0, Math.min(rect.width, anchorCenterX - left));
      const originXpc = (originXpx / rect.width) * 100;

      setPos({
        top,
        left,
        origin: `${originXpc.toFixed(1)}% ${vertOrigin === "top" ? "0%" : "100%"}`,
      });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      style={{ background: "transparent" }}
    >
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="popover-in fixed rounded-[18px]"
        style={{
          width: POPOVER_WIDTH,
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          transformOrigin: pos?.origin ?? "50% 0%",
          visibility: pos ? "visible" : "hidden",
          background: "rgba(22,24,34,0.68)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          boxShadow:
            "0 20px 50px -12px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <div className="flex items-center gap-2 px-3.5 pt-3 pb-1.5">
          <app.Icon
            className="h-3.5 w-3.5"
            strokeWidth={2}
            style={{ color: app.tint }}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
            {app.label}
          </span>
        </div>
        <div className="px-1.5 pb-1.5 pt-0.5">
          {items.map((it, idx) =>
            it === "divider" ? (
              <div
                key={`d-${idx}`}
                className="popover-item-in mx-2 my-1 h-px bg-white/8"
                style={{ animationDelay: `${0.05 + idx * 0.035}s` }}
              />
            ) : (
              <PopItemRow key={it.href + idx} item={it} tint={app.tint} index={idx} />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function PopItemRow({
  item,
  tint,
  index,
}: {
  item: PopItem;
  tint: string;
  index: number;
}) {
  return (
    <Link
      href={item.href}
      className="popover-item-in group flex items-center justify-between rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors duration-150 hover:bg-white/[0.07]"
      style={{
        animationDelay: `${0.05 + index * 0.035}s`,
      }}
    >
      <span
        className="truncate font-medium leading-none"
        style={{ color: item.isNew ? tint : "rgba(255,255,255,0.88)" }}
      >
        {item.label}
      </span>
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
          style={{ backgroundColor: "#ff3b30" }}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}
