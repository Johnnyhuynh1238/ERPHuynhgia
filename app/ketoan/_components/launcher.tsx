"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Wallet,
  RefreshCw,
  ArrowRightLeft,
  Banknote,
  Package,
  Receipt,
  FileSignature,
  BarChart3,
  ScrollText,
  Landmark,
  Settings,
  ClipboardList,
  ClipboardCheck,
  LayoutGrid,
  PackageCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  ChevronRight,
  Check,
  CheckCheck,
  RotateCcw,
  X,
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
  todayFlow?: { in: number; out: number; net: number };
  counts: {
    create: number;
    process: number;
    journal: number;
    congNo: number;
    donHang: number;
  };
  processBreakdown: { expense: number; receipt: number };
  congNoBreakdown: {
    paymentDueKhActive: number;
  };
  todos?: {
    expensePending: number;
    receiptPending: number;
    pendingOrders?: { projectId: string; projectName: string; count: number }[];
    payNowOrders?: { projectId: string; projectName: string; count: number }[];
    /** Việc admin giao còn mở */
    tasks?: AccountantTaskDto[];
  };
};

type AccountantTaskDto = {
  id: string;
  title: string;
  note: string | null;
  dueDate: string | null;
  status: string;
  createdByName: string | null;
  createdAt: string;
  doneAt: string | null;
};

const formatVnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n));

const kindIcon = (kind: string) => (kind === "cash" ? "💵" : "🏦");

type AppKey = "thu-chi" | "vay-tam-ung" | "mua-hang" | "hop-dong" | "cong-no" | "don-hang" | "cham-cong";

type PopItem = {
  label: string;
  href: string;
  badge?: number;
  isNew?: boolean;
  /** Tính năng chưa mở — hiện chip "Sắp ra mắt", không điều hướng */
  comingSoon?: boolean;
  Icon?: LucideIcon;
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
        "divider",
        { label: "Sổ cái thu - chi", href: "/treasury" },
        { label: "Kế hoạch thu - chi", href: "/cash-plan" },
      ];
    },
  },
  {
    // Quản lý nợ gốc / lãi vay / tạm ứng / hoàn ứng — cấp công ty.
    key: "vay-tam-ung",
    label: "Vay & Tạm ứng",
    Icon: Wallet,
    href: "/admin/debts",
  },
  {
    // Flow mới: mua hàng bám dự toán theo từng dự án (thay /proposals cũ).
    // Kế toán chọn dự án → icon 🛒 Mua hàng + Công nợ NCC trong màn dự án.
    key: "mua-hang",
    label: "Mua hàng",
    Icon: PackageCheck,
    href: "/projects",
  },
  {
    // Quản lý HĐ thiết kế + thi công + công nợ khách hàng (giá trị, đã thu, còn nợ).
    key: "hop-dong",
    label: "Hợp đồng",
    Icon: FileSignature,
    href: "/admin/contracts",
  },
  {
    // Công nợ KH đã chuyển vào màn Hợp đồng → app này chỉ còn NCC, bấm thẳng.
    key: "cong-no",
    label: "Công nợ NCC",
    Icon: Receipt,
    href: "/projects",
  },
  {
    key: "cham-cong",
    label: "Chấm công",
    Icon: Clock,
    href: "/cham-cong",
  },
  {
    key: null,
    label: "Sắp ra mắt",
    Icon: LayoutGrid,
    buildItems: () => [
      { label: "Lương", href: "#", comingSoon: true, Icon: Banknote },
      { label: "Vật tư", href: "#", comingSoon: true, Icon: Package },
      { label: "Báo cáo", href: "#", comingSoon: true, Icon: BarChart3 },
      { label: "Chứng từ", href: "#", comingSoon: true, Icon: ScrollText },
      { label: "Thuế", href: "#", comingSoon: true, Icon: Landmark },
      { label: "Cài đặt", href: "#", comingSoon: true, Icon: Settings },
    ],
  },
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
                      : app.key === "mua-hang"
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

        <WorkQueue data={data} loading={loading} onChanged={load} />
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
    // Đơn hàng đã đặt NCC nhưng chưa nhận — 1 dòng / dự án, link thẳng tab Đơn hàng.
    ...(t.pendingOrders ?? []).map((o) => ({
      key: `orders-pending-${o.projectId}`,
      label: `Đơn chưa nhận · ${o.projectName}`,
      href: `/projects/${o.projectId}/mua-hang?tab=orders`,
      count: o.count,
      Icon: PackageCheck,
    })),
    // Đơn "thanh toán ngay" (không NCC) đã nhận → KT cần gửi lệnh chi ngay.
    ...(t.payNowOrders ?? []).map((o) => ({
      key: `orders-paynow-${o.projectId}`,
      label: `Cần thanh toán ngay · ${o.projectName}`,
      href: `/projects/${o.projectId}/mua-hang?tab=received`,
      count: o.count,
      Icon: Wallet,
    })),
  ];
  return raw.filter((r) => r.count > 0);
}

function WorkQueue({
  data,
  loading,
  onChanged,
}: {
  data: SummaryDto | null;
  loading: boolean;
  onChanged: () => void;
}) {
  const rows = buildTodoRows(data?.todos);
  const serverTasks = data?.todos?.tasks ?? [];
  // Ẩn ngay việc vừa tick (optimistic) — chờ load() lấy lại danh sách thật.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const tasks = serverTasks.filter((t) => !hiddenIds.has(t.id));
  const total = rows.length + tasks.length;

  const tickDone = async (task: AccountantTaskDto) => {
    setBusyId(task.id);
    try {
      const res = await fetch(`/api/ketoan/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Lỗi cập nhật");
      setHiddenIds((prev) => new Set(prev).add(task.id));
      onChanged();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Lỗi cập nhật");
    } finally {
      setBusyId(null);
    }
  };

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
        {total > 0 && (
          <span
            className="rounded-full px-1.5 py-[1px] text-[10px] font-bold tracking-normal"
            style={{ backgroundColor: BRAND_GOLD, color: "#0b0d16" }}
          >
            {total}
          </span>
        )}
        <span
          className="h-px flex-1"
          style={{
            background:
              "linear-gradient(90deg, rgba(249,115,22,0.35) 0%, transparent 100%)",
          }}
        />
        <button
          type="button"
          onClick={() => setShowDone(true)}
          className="smooth-press inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold normal-case tracking-normal"
          style={{
            background: "rgba(255,255,255,0.05)",
            color: BRAND_GOLD_BRIGHT,
            boxShadow: "inset 0 0 0 0.5px rgba(249,115,22,0.35)",
          }}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Xem việc đã xong
        </button>
      </div>

      {showDone && (
        <DoneTasksModal
          onClose={() => setShowDone(false)}
          onReopened={() => {
            setHiddenIds(new Set());
            onChanged();
          }}
        />
      )}

      {tasks.length > 0 && (
        <div className="mb-2 flex flex-col gap-2">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} busy={busyId === t.id} onDone={() => tickDone(t)} />
          ))}
        </div>
      )}

      {total === 0 ? (
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
      ) : rows.length === 0 ? null : (
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

const CARD_BG = `
  radial-gradient(circle at 12% 15%, rgba(251,146,60,0.10) 0%, transparent 55%),
  radial-gradient(circle at 90% 95%, rgba(0,0,0,0.3) 0%, transparent 55%),
  #13151f
`;

function vnTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

function fmtDdMm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
}

/** Việc admin giao — tick ô tròn = xong. */
function TaskCard({
  task,
  busy,
  onDone,
}: {
  task: AccountantTaskDto;
  busy: boolean;
  onDone: () => void;
}) {
  const overdue = !!task.dueDate && task.dueDate < vnTodayIso();
  return (
    <div
      className="flex items-start gap-3 overflow-hidden rounded-2xl px-3.5 py-3"
      style={{
        background: CARD_BG,
        boxShadow: [
          "inset 0 0 0 0.5px rgba(249,115,22,0.42)",
          "inset 0 1px 0 rgba(251,146,60,0.42)",
          "0 8px 22px -10px rgba(0,0,0,0.55)",
        ].join(", "),
      }}
    >
      <button
        type="button"
        onClick={onDone}
        disabled={busy}
        aria-label="Đánh dấu đã xong"
        className="smooth-press mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:opacity-50"
        style={{
          border: `1.5px solid ${BRAND_GOLD_BRIGHT}`,
          color: BRAND_GOLD_BRIGHT,
        }}
      >
        {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-4 w-4 opacity-30" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium leading-snug" style={{ color: BRAND_TEXT }}>
          {task.title}
        </div>
        {task.note && (
          <div className="mt-0.5 whitespace-pre-line text-[12px] leading-snug" style={{ color: BRAND_TEXT_MUTED }}>
            {task.note}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: BRAND_TEXT_MUTED }}>
          <span>Anh giao {fmtDdMm(task.createdAt)}</span>
          {task.dueDate && (
            <span style={{ color: overdue ? "#f87171" : BRAND_GOLD_BRIGHT, fontWeight: 600 }}>
              {overdue ? "Quá hạn " : "Hạn "}
              {fmtDdMm(task.dueDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Danh sách việc đã xong (100 gần nhất) — có nút "Mở lại" nếu tick nhầm. Portal ra body. */
function DoneTasksModal({ onClose, onReopened }: { onClose: () => void; onReopened: () => void }) {
  const [tasks, setTasks] = useState<AccountantTaskDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/ketoan/tasks?status=done", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.message || "Lỗi tải");
        return r.json() as Promise<{ tasks: AccountantTaskDto[] }>;
      })
      .then((j) => setTasks(j.tasks))
      .catch((e) => setError(e instanceof Error ? e.message : "Lỗi tải"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reopen = async (t: AccountantTaskDto) => {
    if (!window.confirm(`Mở lại việc "${t.title}"? Việc sẽ quay về danh sách cần làm.`)) return;
    setBusyId(t.id);
    try {
      const res = await fetch(`/api/ketoan/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ done: false }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Lỗi cập nhật");
      setTasks((prev) => (prev ? prev.filter((x) => x.id !== t.id) : prev));
      onReopened();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Lỗi cập nhật");
    } finally {
      setBusyId(null);
    }
  };

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center sm:px-4" onClick={onClose}>
      <div
        className="absolute inset-0"
        style={{ background: "rgba(11,13,22,0.62)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85vh] w-full flex-col rounded-t-[22px] sm:max-w-[480px] sm:rounded-[22px]"
        style={{
          background: CARD_BG,
          boxShadow: [
            "inset 0 0 0 0.5px rgba(249,115,22,0.35)",
            "inset 0 1px 0 rgba(251,146,60,0.35)",
            "0 30px 60px -20px rgba(0,0,0,0.75)",
          ].join(", "),
        }}
      >
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <CheckCheck className="h-4 w-4" style={{ color: BRAND_GOLD_BRIGHT }} />
          <span className="flex-1 text-[15px] font-semibold" style={{ color: BRAND_TEXT }}>
            Việc đã xong
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="smooth-press flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.05)", color: BRAND_TEXT_MUTED }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {error ? (
            <div className="px-2 py-6 text-center text-[13px] text-red-400">{error}</div>
          ) : !tasks ? (
            <div className="px-2 py-6 text-center text-[13px]" style={{ color: BRAND_TEXT_MUTED }}>
              Đang tải…
            </div>
          ) : tasks.length === 0 ? (
            <div className="px-2 py-6 text-center text-[13px]" style={{ color: BRAND_TEXT_MUTED }}>
              Chưa có việc nào đã xong.
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/5">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-3 px-1.5 py-2.5">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: "#22c55e", color: BRAND_BG }}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] leading-snug line-through decoration-white/30" style={{ color: BRAND_TEXT }}>
                      {t.title}
                    </div>
                    {t.note && (
                      <div className="mt-0.5 whitespace-pre-line text-[12px]" style={{ color: BRAND_TEXT_MUTED }}>
                        {t.note}
                      </div>
                    )}
                    <div className="mt-0.5 text-[11px]" style={{ color: BRAND_TEXT_MUTED }}>
                      Giao {fmtDdMm(t.createdAt)} · Xong {t.doneAt ? fmtDateTime(t.doneAt) : "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => reopen(t)}
                    disabled={busyId === t.id}
                    className="smooth-press inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.05)", color: BRAND_TEXT_MUTED }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Mở lại
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
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

      {data?.todayFlow && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] tabular-nums">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
            style={{
              background:
                data.todayFlow.net > 0
                  ? "rgba(52,211,153,0.12)"
                  : data.todayFlow.net < 0
                    ? "rgba(248,113,113,0.12)"
                    : "rgba(136,146,176,0.10)",
              color:
                data.todayFlow.net > 0
                  ? "#34d399"
                  : data.todayFlow.net < 0
                    ? "#f87171"
                    : BRAND_TEXT_MUTED,
            }}
          >
            {data.todayFlow.net > 0 ? "▲" : data.todayFlow.net < 0 ? "▼" : "•"}{" "}
            {data.todayFlow.net > 0 ? "+" : ""}
            {formatVnd(data.todayFlow.net)} đ hôm nay
          </span>
          {(data.todayFlow.in > 0 || data.todayFlow.out > 0) && (
            <span style={{ color: BRAND_TEXT_MUTED }}>
              thu {formatVnd(data.todayFlow.in)} · chi {formatVnd(data.todayFlow.out)}
            </span>
          )}
        </div>
      )}

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

const POPOVER_ANIM_DURATION = 260;
const POPOVER_ANIM_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const POPOVER_CLOSE_EASING = "cubic-bezier(0.4, 0, 0.6, 1)";
const POPOVER_CLOSE_DURATION = 200;

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
    setTimeout(onClose, POPOVER_CLOSE_DURATION);
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

  // Đồng bộ backdrop + popup: cùng duration + easing, tránh cảm giác lệch.
  const dur = visible ? POPOVER_ANIM_DURATION : POPOVER_CLOSE_DURATION;
  const easing = visible ? POPOVER_ANIM_EASING : POPOVER_CLOSE_EASING;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      onClick={handleClose}
    >
      {/* Backdrop mờ — cùng duration + easing với popup */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(11,13,22,0.62)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: visible ? 1 : 0,
          transition: `opacity ${dur}ms ${easing}`,
          willChange: "opacity",
        }}
      />
      {/* Popup zoom */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col gap-[8px] rounded-[22px] p-3"
        style={{
          width: POPOVER_WIDTH,
          maxWidth: "calc(100vw - 32px)",
          transform: visible ? "scale(1)" : "scale(0.88)",
          opacity: visible ? 1 : 0,
          transition: `transform ${dur}ms ${easing}, opacity ${dur}ms ${easing}`,
          willChange: "transform, opacity",
          transformOrigin: "center center",
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
  const ItemIcon = item.Icon;
  if (item.comingSoon) {
    return (
      <div
        className="flex items-center justify-between rounded-[14px] px-3.5 py-2.5 text-[13.5px] opacity-60"
        style={{
          background: `
            radial-gradient(circle at 12% 15%, rgba(251,146,60,0.06) 0%, transparent 55%),
            #13151f
          `,
          boxShadow: "inset 0 0 0 0.5px rgba(249,115,22,0.22)",
        }}
      >
        <span className="flex items-center gap-2.5 truncate font-medium leading-none" style={{ color: BRAND_TEXT }}>
          {ItemIcon && (
            <ItemIcon className="h-4 w-4 shrink-0" strokeWidth={1.8} style={{ color: BRAND_TEXT_MUTED }} />
          )}
          {item.label}
        </span>
        <span
          className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{ background: "rgba(249,115,22,0.14)", color: BRAND_GOLD_BRIGHT }}
        >
          Sắp ra mắt
        </span>
      </div>
    );
  }
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
