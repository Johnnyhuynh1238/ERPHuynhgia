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
  disabled?: boolean;
  buildItems?: (data: SummaryDto | null) => Array<PopItem | "divider">;
};

// Luxury dark + brand brown-gold (kiểu Pinterest Media Kit)
const BRAND_BG = "#0a0806";
const BRAND_GOLD = "#b8763d";
const BRAND_GOLD_BRIGHT = "#d99961";
const BRAND_GLYPH = "#e8c99a";
const BRAND_TEXT = "rgba(240,232,220,0.95)";
const BRAND_TEXT_MUTED = "rgba(240,232,220,0.55)";

const APPS: AppDef[] = [
  {
    key: "thu-chi",
    label: "Thu - Chi",
    Icon: ArrowRightLeft,
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
  { key: null, label: "Lương",      Icon: Banknote,      disabled: true },
  { key: null, label: "Vật tư",     Icon: Package,       disabled: true },
  { key: null, label: "HĐ - Nợ KH", Icon: Receipt,       disabled: true },
  { key: null, label: "Báo cáo",    Icon: BarChart3,     disabled: true },
  { key: null, label: "Chứng từ",   Icon: ScrollText,    disabled: true },
  { key: null, label: "Thuế",       Icon: Landmark,      disabled: true },
  { key: null, label: "Cài đặt",    Icon: Settings,      disabled: true },
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
      className="relative -mx-4 -mt-4 -mb-24 min-h-[calc(100vh-56px)] overflow-hidden px-4 pt-5 pb-28 md:-m-6 md:min-h-[calc(100vh-96px)] md:px-6 md:pt-8 md:pb-8"
      style={{
        background: `
          radial-gradient(60% 45% at 88% 12%, rgba(217,153,97,0.10) 0%, transparent 55%),
          radial-gradient(50% 35% at 8% 92%, rgba(184,118,61,0.09) 0%, transparent 55%),
          ${BRAND_BG}
        `,
      }}
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
          <div
            className="mb-3 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: BRAND_TEXT_MUTED }}
          >
            <span>Ứng dụng</span>
            <span
              className="h-px flex-1"
              style={{
                background:
                  "linear-gradient(90deg, rgba(184,118,61,0.35) 0%, transparent 100%)",
              }}
            />
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
      <div
        className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em]"
        style={{ color: BRAND_TEXT_MUTED }}
      >
        <Wallet className="h-3 w-3" style={{ color: BRAND_GOLD_BRIGHT }} />
        <span>Số dư hiện tại</span>
        <span style={{ color: "rgba(240,232,220,0.25)" }}>·</span>
        <button
          type="button"
          onClick={onRefresh}
          className="smooth-press inline-flex items-center gap-1 transition-colors"
          style={{ color: BRAND_TEXT_MUTED }}
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
          className="text-[44px] font-bold leading-none tabular-nums tracking-tight"
          style={{
            color: BRAND_GLYPH,
            textShadow: "0 2px 26px rgba(217,153,97,0.28)",
          }}
        >
          {formatVnd(animated)}
        </span>
        <span
          className="text-xl font-medium"
          style={{ color: BRAND_GOLD_BRIGHT }}
        >
          đ
        </span>
      </div>

      <div
        className="mt-4 h-px w-full"
        style={{
          background:
            "linear-gradient(90deg, rgba(184,118,61,0.35) 0%, rgba(184,118,61,0.08) 60%, transparent 100%)",
        }}
      />

      {error ? (
        <div className="mt-3 text-xs text-red-300">{error}</div>
      ) : accounts.length === 0 && loading ? (
        <div className="mt-3 space-y-1.5">
          <div className="h-4 w-40 rounded-md bg-white/5" />
          <div className="h-4 w-32 rounded-md bg-white/5" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="mt-3 text-xs" style={{ color: BRAND_GOLD_BRIGHT }}>
          Chưa có tài khoản. Vào{" "}
          <Link href="/treasury" className="font-semibold underline">
            Sổ quỹ
          </Link>{" "}
          khai báo TK.
        </div>
      ) : (
        <div className="mt-2 divide-y" style={{ borderColor: "rgba(184,118,61,0.14)" }}>
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between border-t py-1.5 text-[13px] first:border-t-0"
              style={{ borderColor: "rgba(184,118,61,0.14)" }}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-sm">{kindIcon(a.kind)}</span>
                <span className="truncate" style={{ color: BRAND_TEXT }}>
                  {a.name}
                </span>
                <span
                  className="hidden text-[11px] sm:inline"
                  style={{ color: BRAND_TEXT_MUTED }}
                >
                  · {a.code}
                </span>
              </div>
              <span
                className="ml-2 shrink-0 font-semibold tabular-nums"
                style={{ color: BRAND_GOLD_BRIGHT }}
              >
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
        className={`smooth-press relative flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[20px] sm:h-[68px] sm:w-[68px] ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
        style={{
          background: `
            radial-gradient(circle at 20% 15%, rgba(255,220,175,0.16) 0%, transparent 55%),
            radial-gradient(circle at 85% 90%, rgba(0,0,0,0.35) 0%, transparent 55%),
            #0f0806
          `,
          boxShadow: [
            "inset 0 0 0 0.5px rgba(184,118,61,0.5)",
            "inset 0 1px 0 rgba(217,153,97,0.55)",
            "inset 0 -1px 0 rgba(184,118,61,0.15)",
            "0 0 22px -8px rgba(184,118,61,0.28)",
            "0 8px 20px -10px rgba(0,0,0,0.6)",
          ].join(", "),
        }}
      >
        <Icon
          className="relative h-[26px] w-[26px] sm:h-[28px] sm:w-[28px]"
          strokeWidth={1.6}
          style={{ color: BRAND_GOLD_BRIGHT }}
        />
        {badge > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold"
            style={{
              backgroundColor: BRAND_GOLD_BRIGHT,
              color: BRAND_BG,
              boxShadow: `0 0 0 2px ${BRAND_BG}`,
            }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      <span
        className="text-center text-[11px] font-medium leading-tight sm:text-[12px]"
        style={{ color: disabled ? "rgba(240,232,220,0.35)" : BRAND_TEXT }}
      >
        {app.label}
      </span>
    </div>
  );
}

const POPOVER_WIDTH = 224;
const POPOVER_MARGIN = 10;
const POPOVER_GAP = 12;

function AppPopover({
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
      const anchorCenterY = anchor.top + anchor.height / 2;
      const width = POPOVER_WIDTH;
      const height = rect.height;

      // Prefer right of icon
      let left = anchor.right + POPOVER_GAP;
      let side: "right" | "left" | "bottom" = "right";
      if (left + width > vw - POPOVER_MARGIN) {
        const leftPos = anchor.left - width - POPOVER_GAP;
        if (leftPos >= POPOVER_MARGIN) {
          left = leftPos;
          side = "left";
        } else {
          // Not enough side space (narrow phone): fall back to below icon
          left = Math.max(
            POPOVER_MARGIN,
            Math.min(vw - width - POPOVER_MARGIN, anchor.left + anchor.width / 2 - width / 2),
          );
          side = "bottom";
        }
      }

      let top: number;
      let origin: string;
      if (side === "bottom") {
        top = anchor.bottom + POPOVER_GAP;
        if (top + height > vh - POPOVER_MARGIN) {
          const above = anchor.top - height - POPOVER_GAP;
          top = above >= POPOVER_MARGIN ? above : Math.max(POPOVER_MARGIN, vh - height - POPOVER_MARGIN);
        }
        const anchorCenterX = anchor.left + anchor.width / 2;
        const originXpx = Math.max(0, Math.min(width, anchorCenterX - left));
        origin = `${((originXpx / width) * 100).toFixed(1)}% 0%`;
      } else {
        top = anchorCenterY - height / 2;
        top = Math.max(POPOVER_MARGIN, Math.min(vh - height - POPOVER_MARGIN, top));
        const originYpx = Math.max(0, Math.min(height, anchorCenterY - top));
        const originYpc = (originYpx / height) * 100;
        origin = side === "right" ? `0% ${originYpc.toFixed(1)}%` : `100% ${originYpc.toFixed(1)}%`;
      }

      setPos({ top, left, origin });
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
        className="popover-in fixed flex flex-col gap-[6px]"
        style={{
          width: POPOVER_WIDTH,
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          transformOrigin: pos?.origin ?? "0% 50%",
          visibility: pos ? "visible" : "hidden",
        }}
      >
        {items.map((it, idx) =>
          it === "divider" ? (
            <div key={`d-${idx}`} className="h-[4px]" />
          ) : (
            <PopItemCard key={it.href + idx} item={it} index={idx} />
          )
        )}
      </div>
    </div>
  );
}

function PopItemCard({
  item,
}: {
  item: PopItem;
  index: number;
}) {
  return (
    <Link
      href={item.href}
      className="smooth-press group flex items-center justify-between overflow-hidden rounded-[14px] px-3.5 py-2.5 text-[13.5px] transition-all duration-150 hover:brightness-110"
      style={{
        background: `
          radial-gradient(circle at 12% 15%, rgba(255,220,175,0.10) 0%, transparent 55%),
          radial-gradient(circle at 90% 95%, rgba(0,0,0,0.3) 0%, transparent 55%),
          #0f0806
        `,
        boxShadow: [
          "inset 0 0 0 0.5px rgba(184,118,61,0.42)",
          "inset 0 1px 0 rgba(217,153,97,0.42)",
          "0 8px 22px -10px rgba(0,0,0,0.55)",
        ].join(", "),
      }}
    >
      <span
        className="truncate font-medium leading-none"
        style={{
          color: item.isNew ? BRAND_GOLD_BRIGHT : BRAND_TEXT,
        }}
      >
        {item.label}
      </span>
      {item.badge !== undefined && item.badge > 0 && (
        <span
          className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{ backgroundColor: BRAND_GOLD_BRIGHT, color: BRAND_BG }}
        >
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}
