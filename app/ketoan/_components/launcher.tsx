"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  PlusCircle,
  Inbox,
  BookOpen,
  RefreshCw,
  X,
  ChevronRight,
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

type AppDef = {
  key: "thu-chi" | null;
  label: string;
  emoji: string;
  gradient: string;
  glow: string;
  disabled?: boolean;
};

const APPS: AppDef[] = [
  {
    key: "thu-chi",
    label: "Thu - Chi",
    emoji: "💵",
    gradient: "from-[#fb923c] via-[#f97316] to-[#ea580c]",
    glow: "shadow-[0_10px_30px_-8px_rgba(249,115,22,0.65)]",
  },
  {
    key: null,
    label: "Lương",
    emoji: "💰",
    gradient: "from-[#34d399] via-[#10b981] to-[#059669]",
    glow: "shadow-[0_10px_30px_-8px_rgba(16,185,129,0.55)]",
    disabled: true,
  },
  {
    key: null,
    label: "Vật tư",
    emoji: "🏗️",
    gradient: "from-[#fbbf24] via-[#f59e0b] to-[#d97706]",
    glow: "shadow-[0_10px_30px_-8px_rgba(245,158,11,0.55)]",
    disabled: true,
  },
  {
    key: null,
    label: "HĐ - Nợ KH",
    emoji: "📋",
    gradient: "from-[#60a5fa] via-[#3b82f6] to-[#1d4ed8]",
    glow: "shadow-[0_10px_30px_-8px_rgba(59,130,246,0.55)]",
    disabled: true,
  },
  {
    key: null,
    label: "Báo cáo",
    emoji: "📊",
    gradient: "from-[#c084fc] via-[#a855f7] to-[#7e22ce]",
    glow: "shadow-[0_10px_30px_-8px_rgba(168,85,247,0.55)]",
    disabled: true,
  },
  {
    key: null,
    label: "Chứng từ",
    emoji: "🧾",
    gradient: "from-[#f472b6] via-[#ec4899] to-[#be185d]",
    glow: "shadow-[0_10px_30px_-8px_rgba(236,72,153,0.55)]",
    disabled: true,
  },
  {
    key: null,
    label: "Thuế",
    emoji: "🏛️",
    gradient: "from-[#94a3b8] via-[#64748b] to-[#334155]",
    glow: "shadow-[0_10px_30px_-8px_rgba(100,116,139,0.55)]",
    disabled: true,
  },
  {
    key: null,
    label: "Cài đặt",
    emoji: "⚙️",
    gradient: "from-[#a3a3a3] via-[#737373] to-[#404040]",
    glow: "shadow-[0_10px_30px_-8px_rgba(115,115,115,0.55)]",
    disabled: true,
  },
];

export function KetoanLauncher() {
  const [data, setData] = useState<SummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [openApp, setOpenApp] = useState<null | "thu-chi">(null);

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
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-4 pt-4 pb-10 sm:px-6">
      <VibrantBackdrop />

      <div className="relative space-y-6">
        <BalanceCard
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
                  app.key === "thu-chi" ? () => setOpenApp("thu-chi") : undefined
                }
              />
            ))}
          </div>
        </div>
      </div>

      {openApp === "thu-chi" && (
        <AppDrawer title="Thu - Chi" emoji="💵" onClose={() => setOpenApp(null)}>
          <ThuChiContent data={data} />
        </AppDrawer>
      )}
    </div>
  );
}

function VibrantBackdrop() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "linear-gradient(180deg, #0d0f18 0%, #0a0b12 100%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-24 -right-20 -z-10 h-[380px] w-[380px] rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, #f97316 0%, transparent 65%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute top-32 -left-24 -z-10 h-[300px] w-[300px] rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(circle, #ec4899 0%, transparent 65%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-0 right-10 -z-10 h-[260px] w-[260px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, #a855f7 0%, transparent 65%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-24 left-8 -z-10 h-[220px] w-[220px] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, #3b82f6 0%, transparent 65%)" }}
        aria-hidden
      />
    </>
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

function BalanceCard({
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
    <div
      className="slide-up delay-1 relative overflow-hidden rounded-[26px] border border-white/10 p-5 shadow-2xl shadow-black/40"
      style={{
        background:
          "linear-gradient(140deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.06) 100%)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)" }}
        aria-hidden
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f97316]/25 ring-1 ring-[#f97316]/40 backdrop-blur">
            <Wallet className="h-4 w-4 text-[#fb923c]" />
          </div>
          <span className="text-[13px] font-medium tracking-wide text-white/75">
            Số dư hiện tại
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="smooth-press flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/75 backdrop-blur hover:bg-white/10"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          {refreshedAt
            ? refreshedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
            : "—"}
        </button>
      </div>

      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span
          className="text-[42px] font-bold leading-none tabular-nums tracking-tight text-white"
          style={{ textShadow: "0 2px 24px rgba(249,115,22,0.35)" }}
        >
          {formatVnd(animated)}
        </span>
        <span className="text-lg font-medium text-white/60">đ</span>
      </div>

      {error ? (
        <div className="relative mt-4 rounded-2xl border border-red-400/25 bg-red-500/15 px-3 py-2 text-xs text-red-200 backdrop-blur">
          {error}
        </div>
      ) : accounts.length === 0 && loading ? (
        <div className="relative mt-4 space-y-2">
          <div className="h-10 rounded-xl bg-white/5" />
          <div className="h-10 rounded-xl bg-white/5" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="relative mt-4 rounded-2xl border border-amber-400/25 bg-amber-500/15 px-3 py-2 text-xs text-amber-100 backdrop-blur">
          Chưa có tài khoản. Vào{" "}
          <Link href="/treasury" className="font-semibold underline">
            Sổ quỹ
          </Link>{" "}
          khai báo TK.
        </div>
      ) : (
        <div className="relative mt-4 grid gap-1.5">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm backdrop-blur"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-base">{kindIcon(a.kind)}</span>
                <span className="truncate font-medium text-white/95">{a.name}</span>
                <span className="hidden text-xs text-white/45 sm:inline">
                  · {a.code}
                </span>
              </div>
              <span className="ml-2 shrink-0 font-semibold tabular-nums text-white">
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
  return (
    <div className={`slide-up ${delayClass} flex flex-col items-center gap-2`}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`smooth-press relative flex h-[62px] w-[62px] items-center justify-center rounded-[20px] bg-gradient-to-br ${app.gradient} ${app.glow} sm:h-[68px] sm:w-[68px] ${
          disabled ? "opacity-40 grayscale saturate-50 cursor-not-allowed" : ""
        }`}
        style={{
          boxShadow: disabled
            ? "0 4px 12px -4px rgba(0,0,0,0.4)"
            : undefined,
        }}
      >
        <span
          className="pointer-events-none absolute inset-x-1.5 top-1 h-[38%] rounded-[16px] bg-gradient-to-b from-white/45 to-transparent"
          aria-hidden
        />
        <span
          className="pointer-events-none absolute inset-0 rounded-[20px] ring-1 ring-inset ring-white/15"
          aria-hidden
        />
        <span className="relative text-[32px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] sm:text-[34px]">
          {app.emoji}
        </span>
        {badge > 0 && (
          <span className="pulse-glow absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#ff3b30] px-1.5 text-[11px] font-bold text-white ring-2 ring-[#0d0f18]">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      <span
        className={`text-center text-[11px] font-medium leading-tight sm:text-[12px] ${
          disabled ? "text-white/35" : "text-white/85"
        }`}
      >
        {app.label}
      </span>
    </div>
  );
}

function AppDrawer({
  title,
  emoji,
  onClose,
  children,
}: {
  title: string;
  emoji: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="modal-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-sheet-in w-full max-w-md rounded-t-[28px] border border-white/10 shadow-2xl shadow-black/60 sm:rounded-[28px]"
        style={{
          maxHeight: "90vh",
          overflowY: "auto",
          background:
            "linear-gradient(160deg, rgba(30,32,45,0.85) 0%, rgba(18,20,30,0.85) 100%)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[28px]"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)" }}
          aria-hidden
        />
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/8 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[22px]">{emoji}</span>
            <h2 className="text-[15px] font-semibold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="smooth-press rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ThuChiContent({ data }: { data: SummaryDto | null }) {
  const pb = data?.processBreakdown;
  const hasPending = pb && pb.expense + pb.receipt + pb.paymentOrder > 0;
  return (
    <div className="space-y-3">
      <MenuRow
        icon={<PlusCircle className="h-5 w-5" />}
        iconBg="bg-gradient-to-br from-[#fb923c] to-[#ea580c]"
        title="Tạo lệnh thu / chi"
        subtitle="Gửi admin duyệt"
      >
        <div className="mt-2 grid grid-cols-2 gap-2 pl-11">
          <SubLink href="/expenses" label="+ Lệnh chi" />
          <SubLink href="/receipts" label="+ Lệnh thu" />
        </div>
      </MenuRow>

      <MenuRow
        icon={<Inbox className="h-5 w-5" />}
        iconBg="bg-gradient-to-br from-[#f472b6] to-[#be185d]"
        title="Xử lý lệnh từ admin"
        subtitle={hasPending ? "Admin duyệt → KT chuyển khoản" : "Không có lệnh đang chờ"}
        badge={data?.counts.process ?? 0}
      >
        {pb && (
          <div className="mt-2 grid grid-cols-1 gap-1.5 pl-11">
            <SubLink href="/expenses?status=pending" label="Lệnh chi chờ chuyển" count={pb.expense} />
            <SubLink href="/receipts?status=pending" label="Lệnh thu chờ nhận" count={pb.receipt} />
            <SubLink
              href="/payment-orders?status=approved"
              label="Lệnh thanh toán NCC"
              count={pb.paymentOrder}
            />
          </div>
        )}
      </MenuRow>

      <MenuRow
        href="/treasury"
        icon={<BookOpen className="h-5 w-5" />}
        iconBg="bg-gradient-to-br from-[#64748b] to-[#334155]"
        title="Sổ cái thu - chi"
        subtitle="Nhật ký đã thực hiện"
      />
    </div>
  );
}

function MenuRow({
  href,
  icon,
  iconBg,
  title,
  subtitle,
  badge,
  children,
}: {
  href?: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle?: string;
  badge?: number;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${iconBg}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-white">{title}</div>
        {subtitle && <div className="text-[12px] text-white/55">{subtitle}</div>}
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-[#ff3b30] px-2 py-0.5 text-xs font-bold text-white shadow-md">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {href && <ChevronRight className="h-5 w-5 text-white/40" />}
    </div>
  );
  return (
    <div
      className="smooth-press overflow-hidden rounded-2xl border border-white/10"
      style={{
        background:
          "linear-gradient(140deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {href ? (
        <Link href={href} className="block hover:bg-white/5">
          {inner}
        </Link>
      ) : (
        inner
      )}
      {children && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  );
}

function SubLink({ href, label, count }: { href: string; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className="smooth-press flex items-center justify-between rounded-xl border border-white/8 bg-white/5 px-3 py-2 text-xs hover:border-[#f97316]/40 hover:bg-[#f97316]/10"
    >
      <span className="font-medium text-white/80">{label}</span>
      <span className="flex items-center gap-1">
        {count !== undefined && count > 0 ? (
          <span className="rounded-full bg-[#ff3b30] px-1.5 py-0.5 text-[10px] font-bold text-white">
            {count}
          </span>
        ) : count !== undefined ? (
          <span className="text-white/35">—</span>
        ) : null}
        <ChevronRight className="h-3.5 w-3.5 text-white/40" />
      </span>
    </Link>
  );
}
