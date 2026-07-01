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
  tint: string;
  disabled?: boolean;
};

const APPS: AppDef[] = [
  { key: "thu-chi", label: "Thu - Chi",  emoji: "💵", tint: "#f97316" },
  { key: null,     label: "Lương",       emoji: "💰", tint: "#10b981", disabled: true },
  { key: null,     label: "Vật tư",      emoji: "🏗️", tint: "#f59e0b", disabled: true },
  { key: null,     label: "HĐ - Nợ KH",  emoji: "📋", tint: "#3b82f6", disabled: true },
  { key: null,     label: "Báo cáo",     emoji: "📊", tint: "#a855f7", disabled: true },
  { key: null,     label: "Chứng từ",    emoji: "🧾", tint: "#ec4899", disabled: true },
  { key: null,     label: "Thuế",        emoji: "🏛️", tint: "#64748b", disabled: true },
  { key: null,     label: "Cài đặt",     emoji: "⚙️", tint: "#737373", disabled: true },
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
        <span className="relative text-[30px] leading-none sm:text-[32px]">
          {app.emoji}
        </span>
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
        className="modal-sheet-in w-full max-w-md rounded-t-[28px] border border-white/10 sm:rounded-[28px]"
        style={{
          maxHeight: "90vh",
          overflowY: "auto",
          background: "rgba(20,22,32,0.72)",
          backdropFilter: "blur(30px) saturate(180%)",
          WebkitBackdropFilter: "blur(30px) saturate(180%)",
        }}
      >
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
        iconTint="#f97316"
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
        iconTint="#ec4899"
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
        iconTint="#64748b"
        title="Sổ cái thu - chi"
        subtitle="Nhật ký đã thực hiện"
      />
    </div>
  );
}

function MenuRow({
  href,
  icon,
  iconTint,
  title,
  subtitle,
  badge,
  children,
}: {
  href?: string;
  icon: React.ReactNode;
  iconTint: string;
  title: string;
  subtitle?: string;
  badge?: number;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          backgroundColor: `${iconTint}33`,
          color: iconTint,
          boxShadow: `inset 0 0 0 1px ${iconTint}55`,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-white">{title}</div>
        {subtitle && <div className="text-[12px] text-white/55">{subtitle}</div>}
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-[#ff3b30] px-2 py-0.5 text-xs font-bold text-white">
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
        backgroundColor: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
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
