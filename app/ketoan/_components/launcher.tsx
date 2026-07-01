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
  Sparkles,
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
  ring: string;
  glow: string;
  disabled?: boolean;
};

const APPS: AppDef[] = [
  {
    key: "thu-chi",
    label: "Thu - Chi",
    emoji: "💵",
    gradient: "from-orange-400 via-orange-500 to-rose-500",
    ring: "ring-orange-300/60",
    glow: "shadow-orange-500/40",
  },
  {
    key: null,
    label: "Lương",
    emoji: "💰",
    gradient: "from-emerald-400 via-emerald-500 to-teal-600",
    ring: "ring-emerald-300/60",
    glow: "shadow-emerald-500/40",
    disabled: true,
  },
  {
    key: null,
    label: "Vật tư",
    emoji: "🏗️",
    gradient: "from-amber-400 via-amber-500 to-orange-500",
    ring: "ring-amber-300/60",
    glow: "shadow-amber-500/40",
    disabled: true,
  },
  {
    key: null,
    label: "HĐ - Nợ KH",
    emoji: "📋",
    gradient: "from-sky-400 via-blue-500 to-indigo-600",
    ring: "ring-blue-300/60",
    glow: "shadow-blue-500/40",
    disabled: true,
  },
  {
    key: null,
    label: "Báo cáo",
    emoji: "📊",
    gradient: "from-violet-400 via-purple-500 to-fuchsia-600",
    ring: "ring-violet-300/60",
    glow: "shadow-violet-500/40",
    disabled: true,
  },
  {
    key: null,
    label: "Chứng từ",
    emoji: "🧾",
    gradient: "from-pink-400 via-rose-500 to-red-500",
    ring: "ring-pink-300/60",
    glow: "shadow-pink-500/40",
    disabled: true,
  },
  {
    key: null,
    label: "Thuế",
    emoji: "🏛️",
    gradient: "from-slate-500 via-slate-600 to-zinc-700",
    ring: "ring-slate-300/60",
    glow: "shadow-slate-500/40",
    disabled: true,
  },
  {
    key: null,
    label: "Cài đặt",
    emoji: "⚙️",
    gradient: "from-neutral-400 via-neutral-500 to-stone-600",
    ring: "ring-neutral-300/60",
    glow: "shadow-neutral-500/40",
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
    <div className="relative min-h-[calc(100vh-4rem)] -mx-4 -mt-4 px-4 pt-4 pb-8 sm:-mx-6 sm:px-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-emerald-100/70 via-teal-50/40 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 top-10 h-56 w-56 rounded-full bg-emerald-300/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-16 top-40 h-64 w-64 rounded-full bg-teal-300/25 blur-3xl"
        aria-hidden
      />

      <div className="relative space-y-6">
        <BalanceCard
          data={data}
          loading={loading}
          error={error}
          refreshedAt={refreshedAt}
          onRefresh={load}
        />

        <div className="slide-up delay-2">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Ứng dụng
            </span>
          </div>
          <div className="grid grid-cols-4 gap-x-2 gap-y-5 sm:gap-x-4 sm:gap-y-6">
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
    <div className="slide-up delay-1 relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-5 text-white shadow-xl shadow-emerald-900/20">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-teal-300/20 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-6 top-16 h-2 w-2 rounded-full bg-white/40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-14 top-24 h-1.5 w-1.5 rounded-full bg-white/25"
        aria-hidden
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 backdrop-blur">
            <Wallet className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium tracking-wide text-white/90">
            Số dư hiện tại
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="smooth-press flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur hover:bg-white/25"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          {refreshedAt
            ? refreshedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })
            : "—"}
        </button>
      </div>

      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tabular-nums tracking-tight drop-shadow-sm">
          {formatVnd(animated)}
        </span>
        <span className="text-lg font-medium text-white/80">đ</span>
      </div>

      {error ? (
        <div className="relative mt-4 rounded-xl bg-red-500/20 px-3 py-2 text-xs text-white ring-1 ring-white/20 backdrop-blur">
          {error}
        </div>
      ) : accounts.length === 0 && loading ? (
        <div className="relative mt-4 space-y-2">
          <div className="skeleton h-10" />
          <div className="skeleton h-10" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="relative mt-4 rounded-xl bg-amber-400/25 px-3 py-2 text-xs text-white ring-1 ring-white/20 backdrop-blur">
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
              className="flex items-center justify-between rounded-xl bg-white/12 px-3 py-2 text-sm backdrop-blur ring-1 ring-white/15"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-base">{kindIcon(a.kind)}</span>
                <span className="truncate font-medium text-white">{a.name}</span>
                <span className="hidden text-xs text-white/60 sm:inline">
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
    <div className={`slide-up ${delayClass} flex flex-col items-center gap-1.5`}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`smooth-press relative flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br ${app.gradient} text-[34px] shadow-lg ${app.glow} ring-1 ${app.ring} sm:h-[68px] sm:w-[68px] ${
          disabled ? "opacity-45 grayscale saturate-50 cursor-not-allowed shadow-none" : ""
        }`}
      >
        <span
          className="pointer-events-none absolute inset-x-2 top-1.5 h-1/3 rounded-full bg-white/25 blur-[1px]"
          aria-hidden
        />
        <span className="relative drop-shadow-sm">{app.emoji}</span>
        {badge > 0 && (
          <span className="pulse-glow absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white ring-2 ring-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      <span
        className={`text-center text-[11px] font-medium leading-tight sm:text-xs ${
          disabled ? "text-slate-400" : "text-slate-700"
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
      className="modal-backdrop-in fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-sheet-in w-full max-w-md rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{emoji}</span>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="smooth-press rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
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
        iconBg="bg-gradient-to-br from-emerald-400 to-teal-500"
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
        iconBg="bg-gradient-to-br from-orange-400 to-rose-500"
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
        iconBg="bg-gradient-to-br from-slate-500 to-slate-700"
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
    <div className="flex items-center gap-3 px-3 py-3">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm ${iconBg}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {href && <ChevronRight className="h-5 w-5 text-slate-400" />}
    </div>
  );
  return (
    <div className="smooth-press overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {href ? (
        <Link href={href} className="block hover:bg-slate-50">
          {inner}
        </Link>
      ) : (
        inner
      )}
      {children && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function SubLink({ href, label, count }: { href: string; label: string; count?: number }) {
  return (
    <Link
      href={href}
      className="smooth-press flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs hover:border-emerald-200 hover:bg-emerald-50"
    >
      <span className="font-medium text-slate-700">{label}</span>
      <span className="flex items-center gap-1">
        {count !== undefined && count > 0 ? (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {count}
          </span>
        ) : count !== undefined ? (
          <span className="text-slate-400">—</span>
        ) : null}
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
      </span>
    </Link>
  );
}
