"use client";

import { useEffect, useState } from "react";
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
    <div className="space-y-5">
      <BalanceCard data={data} loading={loading} error={error} refreshedAt={refreshedAt} onRefresh={load} />

      <div>
        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Ứng dụng
        </div>
        <div className="grid grid-cols-4 gap-3 sm:gap-4">
          <AppIcon
            label="Thu - Chi"
            emoji="💵"
            tint="bg-orange-50 text-orange-700 ring-orange-200"
            badge={data?.counts.process ?? 0}
            onClick={() => setOpenApp("thu-chi")}
          />
          <AppIcon label="Lương" emoji="💰" tint="bg-emerald-50 text-emerald-700 ring-emerald-200" disabled />
          <AppIcon label="Vật tư" emoji="🏗️" tint="bg-amber-50 text-amber-700 ring-amber-200" disabled />
          <AppIcon label="HĐ - Nợ KH" emoji="📋" tint="bg-blue-50 text-blue-700 ring-blue-200" disabled />
          <AppIcon label="Báo cáo" emoji="📊" tint="bg-violet-50 text-violet-700 ring-violet-200" disabled />
          <AppIcon label="Chứng từ" emoji="🧾" tint="bg-pink-50 text-pink-700 ring-pink-200" disabled />
          <AppIcon label="Thuế" emoji="🏛️" tint="bg-slate-100 text-slate-700 ring-slate-200" disabled />
          <AppIcon label="Cài đặt" emoji="⚙️" tint="bg-slate-100 text-slate-700 ring-slate-200" disabled />
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700">
          <Wallet className="h-5 w-5" />
          <span className="text-sm font-semibold">Số dư hiện tại</span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {refreshedAt ? refreshedAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—"}
        </button>
      </div>

      <div className="mt-2 text-3xl font-bold text-emerald-700">
        {formatVnd(total)} <span className="text-base font-medium text-slate-500">đ</span>
      </div>

      {error ? (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      ) : accounts.length === 0 && !loading ? (
        <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Chưa có tài khoản nào. Anh vào <Link href="/treasury" className="underline">Sổ quỹ</Link> để khai báo TK ngân hàng / quỹ tiền mặt.
        </div>
      ) : (
        <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100 bg-white">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span>{kindIcon(a.kind)}</span>
                <span className="text-slate-700">{a.name}</span>
                <span className="text-xs text-slate-400">· {a.code}</span>
              </div>
              <span className="font-semibold text-slate-900">{formatVnd(a.currentBalance)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AppIcon({
  label,
  emoji,
  tint,
  badge = 0,
  onClick,
  disabled,
}: {
  label: string;
  emoji: string;
  tint: string;
  badge?: number;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base = `relative flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-sm ring-1 transition ${tint}`;
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${base} ${disabled ? "opacity-40 cursor-not-allowed" : "hover:scale-105 active:scale-95"}`}
      >
        <span>{emoji}</span>
        {badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white shadow ring-2 ring-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      <span className={`text-center text-xs ${disabled ? "text-slate-400" : "text-slate-700"}`}>{label}</span>
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        style={{ maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 rounded-t-2xl">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{emoji}</span>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-3 sm:p-4">{children}</div>
      </div>
    </div>
  );
}

function ThuChiContent({ data }: { data: SummaryDto | null }) {
  const pb = data?.processBreakdown;
  return (
    <div className="space-y-3">
      <MenuRow
        icon={<PlusCircle className="h-5 w-5 text-emerald-600" />}
        title="Tạo lệnh thu / chi"
        subtitle="Gửi admin duyệt"
      >
        <div className="mt-2 grid grid-cols-2 gap-2 pl-9">
          <SubLink href="/expenses" label="+ Lệnh chi" />
          <SubLink href="/receipts" label="+ Lệnh thu" />
        </div>
      </MenuRow>

      <MenuRow
        icon={<Inbox className="h-5 w-5 text-orange-600" />}
        title="Xử lý lệnh từ admin"
        subtitle={
          pb && pb.expense + pb.receipt + pb.paymentOrder > 0
            ? "Admin duyệt → KT chuyển khoản"
            : "Không có lệnh đang chờ"
        }
        badge={data?.counts.process ?? 0}
      >
        {pb && (
          <div className="mt-2 grid grid-cols-1 gap-1.5 pl-9">
            <SubLink href="/expenses?status=pending" label="Lệnh chi chờ chuyển" count={pb.expense} />
            <SubLink href="/receipts?status=pending" label="Lệnh thu chờ nhận" count={pb.receipt} />
            <SubLink href="/payment-orders?status=approved" label="Lệnh thanh toán NCC" count={pb.paymentOrder} />
          </div>
        )}
      </MenuRow>

      <MenuRow
        href="/treasury"
        icon={<BookOpen className="h-5 w-5 text-slate-700" />}
        title="Sổ cái thu - chi"
        subtitle="Nhật ký đã thực hiện"
      />
    </div>
  );
}

function MenuRow({
  href,
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  href?: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: number;
  children?: React.ReactNode;
}) {
  const inner = (
    <div className="flex items-center gap-3 px-3 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {href && <ChevronRight className="h-5 w-5 text-slate-400" />}
    </div>
  );
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {href ? (
        <Link href={href} className="block rounded-xl hover:bg-slate-50">
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
      className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs hover:bg-slate-100"
    >
      <span className="text-slate-700">{label}</span>
      <span className="flex items-center gap-1">
        {count !== undefined && count > 0 ? (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{count}</span>
        ) : count !== undefined ? (
          <span className="text-slate-400">—</span>
        ) : null}
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
      </span>
    </Link>
  );
}
