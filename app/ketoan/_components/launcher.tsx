"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ClipboardList,
  ClipboardCheck,
  ShoppingCart,
  PackageCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  Send,
  Clock,
  ChevronRight,
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
  counts: {
    create: number;
    process: number;
    journal: number;
    congNo: number;
    donHang: number;
  };
  processBreakdown: { expense: number; receipt: number; paymentOrder: number };
  congNoBreakdown: {
    payableNccActive: number;
    paymentDueKhActive: number;
  };
  donHangBreakdown: {
    proposalPending: number;
    proposalToOrder: number;
    receiptNeedsDebt: number;
    proposalPaid: number;
  };
  todos?: {
    proposalPending: number;
    proposalToOrder: number;
    receiptNeedsDebt: number;
    expensePending: number;
    receiptPending: number;
    paymentOrderApproved: number;
  };
};

const formatVnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n));

const kindIcon = (kind: string) => (kind === "cash" ? "💵" : "🏦");

type AppKey = "thu-chi" | "cong-no" | "don-hang" | "cham-cong";

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
  // Direct-navigation apps (e.g., Chấm công) use `href`; multi-action apps use `buildItems`.
  href?: string;
  buildItems?: (data: SummaryDto | null) => Array<PopItem | "divider">;
};

// Đồng bộ palette /admin/menu — dark card + orange accent
const BRAND_BG = "#0b0d16";
const BRAND_GOLD = "#f97316";
const BRAND_GOLD_BRIGHT = "#fb923c";
const BRAND_GLYPH = "#f0f2ff";
const BRAND_TEXT = "#f0f2ff";
const BRAND_TEXT_MUTED = "#8892b0";

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
  {
    key: "don-hang",
    label: "Đơn hàng",
    Icon: PackageCheck,
    buildItems: (data) => {
      const d = data?.donHangBreakdown;
      return [
        { label: "Chờ duyệt đề xuất", href: "/proposals?status=pending", badge: d?.proposalPending ?? 0 },
        { label: "Cần đặt NCC", href: "/proposals?status=accepted&orderStatus=not_ordered", badge: d?.proposalToOrder ?? 0 },
        { label: "Chờ ghi công nợ", href: "/proposals?filter=needs_debt", badge: d?.receiptNeedsDebt ?? 0 },
        { label: "Đã thanh toán", href: "/proposals?orderStatus=paid", badge: d?.proposalPaid ?? 0 },
        "divider",
        { label: "Tất cả đơn hàng", href: "/proposals" },
      ];
    },
  },
  {
    key: "cong-no",
    label: "Công nợ",
    Icon: Receipt,
    buildItems: (data) => {
      const cn = data?.congNoBreakdown;
      return [
        { label: "Công nợ KH", href: "/payments", badge: cn?.paymentDueKhActive ?? 0 },
        { label: "Công nợ NCC", href: "/payables", badge: cn?.payableNccActive ?? 0 },
        "divider",
        { label: "Lệnh TT NCC", href: "/payment-orders" },
      ];
    },
  },
  {
    key: "cham-cong",
    label: "Chấm công",
    Icon: Clock,
    href: "/cham-cong",
  },
  { key: null, label: "Lương",      Icon: Banknote,      disabled: true },
  { key: null, label: "Vật tư",     Icon: Package,       disabled: true },
  { key: null, label: "Báo cáo",    Icon: BarChart3,     disabled: true },
  { key: null, label: "Chứng từ",   Icon: ScrollText,    disabled: true },
  { key: null, label: "Thuế",       Icon: Landmark,      disabled: true },
  { key: null, label: "Cài đặt",    Icon: Settings,      disabled: true },
];

export function KetoanLauncher() {
  const router = useRouter();
  const [data, setData] = useState<SummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState<AppDef | null>(null);

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
          radial-gradient(60% 45% at 88% 12%, rgba(251,146,60,0.10) 0%, transparent 55%),
          radial-gradient(50% 35% at 8% 92%, rgba(249,115,22,0.09) 0%, transparent 55%),
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
                  "linear-gradient(90deg, rgba(249,115,22,0.35) 0%, transparent 100%)",
              }}
            />
          </div>
          <div className="grid grid-cols-4 gap-x-3 gap-y-5 sm:gap-x-5 sm:gap-y-6">
            {APPS.map((app, idx) => {
              const badge =
                app.key === "thu-chi"
                  ? data?.counts.process ?? 0
                  : app.key === "cong-no"
                    ? data?.counts.congNo ?? 0
                    : app.key === "don-hang"
                      ? data?.counts.donHang ?? 0
                      : 0;
              const onClick = app.buildItems
                ? () => setOpen(app)
                : app.href
                  ? () => router.push(app.href!)
                  : undefined;
              return (
                <AppIcon
                  key={app.label}
                  app={app}
                  delayClass={`delay-${Math.min(idx + 1, 6)}`}
                  badge={badge}
                  onClick={onClick}
                />
              );
            })}
          </div>
        </div>

        <WorkQueue data={data} loading={loading} />
      </div>

      {open && open.buildItems && (
        <AppPopover
          app={open}
          items={open.buildItems(data)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

type TodoRow = {
  key: string;
  label: string;
  href: string;
  count: number;
  Icon: LucideIcon;
};

function buildTodoRows(t: SummaryDto["todos"] | undefined): TodoRow[] {
  if (!t) return [];
  const raw: TodoRow[] = [
    {
      key: "proposal-pending",
      label: "KS gửi đề xuất — cần duyệt",
      href: "/proposals?status=pending",
      count: t.proposalPending,
      Icon: Send,
    },
    {
      key: "proposal-to-order",
      label: "Đề xuất đã duyệt — cần đặt NCC",
      href: "/proposals?status=accepted&orderStatus=not_ordered",
      count: t.proposalToOrder,
      Icon: ShoppingCart,
    },
    {
      key: "receipt-needs-debt",
      label: "KS đã nhận hàng — chờ ghi công nợ",
      href: "/proposals?filter=needs_debt",
      count: t.receiptNeedsDebt,
      Icon: PackageCheck,
    },
    {
      key: "expense-pending",
      label: "Lệnh chi — chờ chuyển",
      href: "/expenses?status=pending",
      count: t.expensePending,
      Icon: ArrowUpCircle,
    },
    {
      key: "receipt-pending",
      label: "Lệnh thu — chờ nhận",
      href: "/receipts?status=pending",
      count: t.receiptPending,
      Icon: ArrowDownCircle,
    },
    {
      key: "payment-order-approved",
      label: "Lệnh TT NCC đã duyệt — chờ chi",
      href: "/payment-orders?status=approved",
      count: t.paymentOrderApproved,
      Icon: Banknote,
    },
  ];
  return raw.filter((r) => r.count > 0);
}

function WorkQueue({
  data,
  loading,
}: {
  data: SummaryDto | null;
  loading: boolean;
}) {
  const rows = buildTodoRows(data?.todos);

  if (!data && loading) {
    return (
      <div className="slide-up delay-3 space-y-2">
        <div className="h-4 w-32 rounded-md bg-white/5" />
        <div className="h-14 rounded-2xl bg-white/[0.04]" />
        <div className="h-14 rounded-2xl bg-white/[0.04]" />
      </div>
    );
  }

  return (
    <div className="slide-up delay-3">
      <div
        className="mb-3 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
        style={{ color: BRAND_TEXT_MUTED }}
      >
        <ClipboardList className="h-3 w-3" style={{ color: BRAND_GOLD_BRIGHT }} />
        <span>Việc cần làm</span>
        {rows.length > 0 && (
          <span
            className="rounded-full px-1.5 py-[1px] text-[10px] font-bold tracking-normal"
            style={{ backgroundColor: BRAND_GOLD, color: "#0b0d16" }}
          >
            {rows.length}
          </span>
        )}
        <span
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(90deg, rgba(249,115,22,0.35) 0%, transparent 100%)",
          }}
        />
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl px-4 py-4 text-center text-[13px]"
          style={{
            background: `
              radial-gradient(circle at 12% 15%, rgba(251,146,60,0.08) 0%, transparent 55%),
              radial-gradient(circle at 90% 95%, rgba(0,0,0,0.3) 0%, transparent 55%),
              #13151f
            `,
            boxShadow: [
              "inset 0 0 0 0.5px rgba(249,115,22,0.35)",
              "inset 0 1px 0 rgba(251,146,60,0.35)",
            ].join(", "),
            color: BRAND_TEXT_MUTED,
          }}
        >
          Đã xử lý xong — không có việc đang chờ.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <TodoCard key={r.key} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function TodoCard({ row }: { row: TodoRow }) {
  const Icon = row.Icon;
  return (
    <Link
      href={row.href}
      className="smooth-press group flex items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 transition-all duration-150 hover:brightness-110"
      style={{
        background: `
          radial-gradient(circle at 12% 15%, rgba(251,146,60,0.10) 0%, transparent 55%),
          radial-gradient(circle at 90% 95%, rgba(0,0,0,0.3) 0%, transparent 55%),
          #13151f
        `,
        boxShadow: [
          "inset 0 0 0 0.5px rgba(249,115,22,0.42)",
          "inset 0 1px 0 rgba(251,146,60,0.42)",
          "0 8px 22px -10px rgba(0,0,0,0.55)",
        ].join(", "),
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: `
            radial-gradient(circle at 20% 15%, rgba(251,146,60,0.16) 0%, transparent 55%),
            radial-gradient(circle at 85% 90%, rgba(0,0,0,0.35) 0%, transparent 55%),
            #13151f
          `,
          boxShadow: [
            "inset 0 0 0 0.5px rgba(249,115,22,0.5)",
            "inset 0 1px 0 rgba(251,146,60,0.55)",
          ].join(", "),
        }}
      >
        <Icon
          className="h-[18px] w-[18px]"
          strokeWidth={1.8}
          style={{ color: BRAND_GOLD_BRIGHT }}
        />
      </span>
      <span
        className="flex-1 truncate text-[13.5px] font-medium leading-tight"
        style={{ color: BRAND_TEXT }}
      >
        {row.label}
      </span>
      <span
        className="ml-1 shrink-0 rounded-full px-2 py-[3px] text-[11px] font-bold leading-none tabular-nums"
        style={{ backgroundColor: BRAND_GOLD_BRIGHT, color: BRAND_BG }}
      >
        {row.count > 99 ? "99+" : row.count}
      </span>
      <ChevronRight
        className="ml-0.5 h-4 w-4 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80"
        style={{ color: BRAND_GOLD_BRIGHT }}
      />
    </Link>
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
        <span style={{ color: "rgba(240,242,255,0.25)" }}>·</span>
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
            textShadow: "0 2px 26px rgba(251,146,60,0.28)",
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
            "linear-gradient(90deg, rgba(249,115,22,0.35) 0%, rgba(249,115,22,0.08) 60%, transparent 100%)",
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
        <div className="mt-2 divide-y" style={{ borderColor: "rgba(249,115,22,0.14)" }}>
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between border-t py-1.5 text-[13px] first:border-t-0"
              style={{ borderColor: "rgba(249,115,22,0.14)" }}
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
  onClick?: () => void;
  delayClass: string;
}) {
  const disabled = !!app.disabled;
  const Icon = app.Icon;
  return (
    <div className={`slide-up ${delayClass} flex flex-col items-center gap-2`}>
      <span className="relative inline-block">
        <button
          type="button"
          onClick={() => onClick?.()}
          disabled={disabled}
          className={`smooth-press relative flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[20px] sm:h-[68px] sm:w-[68px] ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          }`}
          style={{
            background: `
              radial-gradient(circle at 20% 15%, rgba(251,146,60,0.16) 0%, transparent 55%),
              radial-gradient(circle at 85% 90%, rgba(0,0,0,0.35) 0%, transparent 55%),
              #13151f
            `,
            boxShadow: [
              "inset 0 0 0 0.5px rgba(249,115,22,0.5)",
              "inset 0 1px 0 rgba(251,146,60,0.55)",
              "inset 0 -1px 0 rgba(249,115,22,0.15)",
              "0 0 22px -8px rgba(249,115,22,0.28)",
              "0 8px 20px -10px rgba(0,0,0,0.6)",
            ].join(", "),
          }}
        >
          <Icon
            className="relative h-[26px] w-[26px] sm:h-[28px] sm:w-[28px]"
            strokeWidth={1.6}
            style={{ color: BRAND_GOLD_BRIGHT }}
          />
        </button>
        {badge > 0 && (
          <span
            className="pointer-events-none absolute -right-1.5 -top-1.5 z-10 flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums"
            style={{
              backgroundColor: BRAND_GOLD_BRIGHT,
              color: BRAND_BG,
              boxShadow: `0 0 0 2px ${BRAND_BG}`,
            }}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span
        className="text-center text-[11px] font-medium leading-tight sm:text-[12px]"
        style={{ color: disabled ? "rgba(240,242,255,0.35)" : BRAND_TEXT }}
      >
        {app.label}
      </span>
    </div>
  );
}

const POPOVER_WIDTH = 300;

function AppPopover({
  app,
  items,
  onClose,
}: {
  app: AppDef;
  items: Array<PopItem | "divider">;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const AppIconGlyph = app.Icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={handleClose}
    >
      {/* Backdrop mờ */}
      <div
        className="absolute inset-0 transition-opacity duration-200 ease-out"
        style={{
          background: "rgba(11,13,22,0.62)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: visible ? 1 : 0,
        }}
      />
      {/* Popup zoom */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col gap-[8px] rounded-[22px] p-3"
        style={{
          width: POPOVER_WIDTH,
          maxWidth: "calc(100vw - 32px)",
          transform: visible ? "scale(1)" : "scale(0.9)",
          opacity: visible ? 1 : 0,
          transition: "transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-out",
          background: `
            radial-gradient(circle at 15% 10%, rgba(251,146,60,0.10) 0%, transparent 55%),
            radial-gradient(circle at 90% 95%, rgba(0,0,0,0.3) 0%, transparent 55%),
            #13151f
          `,
          boxShadow: [
            "inset 0 0 0 0.5px rgba(249,115,22,0.35)",
            "inset 0 1px 0 rgba(251,146,60,0.35)",
            "0 30px 60px -20px rgba(0,0,0,0.75)",
            "0 0 0 1px rgba(249,115,22,0.10)",
          ].join(", "),
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-1.5 pb-1 pt-0.5">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-[10px]"
            style={{
              background: `
                radial-gradient(circle at 20% 15%, rgba(251,146,60,0.18) 0%, transparent 55%),
                #13151f
              `,
              boxShadow: [
                "inset 0 0 0 0.5px rgba(249,115,22,0.55)",
                "inset 0 1px 0 rgba(251,146,60,0.55)",
              ].join(", "),
            }}
          >
            <AppIconGlyph className="h-4 w-4" strokeWidth={1.8} style={{ color: BRAND_GOLD_BRIGHT }} />
          </span>
          <span className="flex-1 text-[14px] font-semibold" style={{ color: BRAND_TEXT }}>
            {app.label}
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="smooth-press flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: BRAND_TEXT_MUTED,
              boxShadow: "inset 0 0 0 0.5px rgba(249,115,22,0.25)",
            }}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        {items.map((it, idx) =>
          it === "divider" ? (
            <div
              key={`d-${idx}`}
              className="mx-2 my-0.5 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(249,115,22,0.28), transparent)" }}
            />
          ) : (
            <PopItemCard key={it.href + idx} item={it} />
          )
        )}
      </div>
    </div>
  );
}

function PopItemCard({ item }: { item: PopItem }) {
  return (
    <Link
      href={item.href}
      className="smooth-press group flex items-center justify-between overflow-hidden rounded-[14px] px-3.5 py-2.5 text-[13.5px] transition-all duration-150 hover:brightness-110"
      style={{
        background: `
          radial-gradient(circle at 12% 15%, rgba(251,146,60,0.10) 0%, transparent 55%),
          radial-gradient(circle at 90% 95%, rgba(0,0,0,0.3) 0%, transparent 55%),
          #13151f
        `,
        boxShadow: [
          "inset 0 0 0 0.5px rgba(249,115,22,0.42)",
          "inset 0 1px 0 rgba(251,146,60,0.42)",
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
