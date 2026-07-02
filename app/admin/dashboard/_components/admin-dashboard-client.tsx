"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardList,
  ClipboardCheck,
  Clock,
  FileCode,
  FileSignature,
  FileText,
  FolderKanban,
  HardHat,
  IdCard,
  Inbox,
  Library,
  ListChecks,
  Package,
  Receipt,
  RefreshCw,
  Settings,
  ShoppingCart,
  Sliders,
  Target,
  TrendingUp,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  Award,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

type SummaryDto = {
  headline: {
    revenueMonth: number;
    activeProjects: number;
    cashBalance: number;
  };
  todos: {
    leadsNew: number;
    proposalPending: number;
    expensePending: number;
    receiptAwaitingApproval: number;
    paymentDue7d: number;
    inboxOpen: number;
  };
};

const BRAND_BG = "#0b0d16";
const BRAND_GOLD = "#f97316";
const BRAND_GOLD_BRIGHT = "#fb923c";
const BRAND_GLYPH = "#f0f2ff";
const BRAND_TEXT = "#f0f2ff";
const BRAND_TEXT_MUTED = "#8892b0";

const formatVnd = (n: number) =>
  new Intl.NumberFormat("vi-VN").format(Math.round(n));

const formatVndShort = (n: number) => {
  if (n >= 1_000_000_000) {
    const b = n / 1_000_000_000;
    return `${b.toFixed(b >= 10 ? 1 : 2).replace(/\.?0+$/, "")} tỷ`;
  }
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} tr`;
  return formatVnd(n);
};

type AppKey =
  | "kinh-doanh"
  | "du-an"
  | "tai-chinh"
  | "nhan-su"
  | "kpi"
  | "cau-hinh"
  | "tro-giup";

type PopItem = {
  label: string;
  href: string;
  badge?: number;
  isNew?: boolean;
};

type AppDef = {
  key: AppKey;
  label: string;
  Icon: LucideIcon;
  buildItems: (data: SummaryDto | null) => Array<PopItem | "divider">;
};

const APPS: AppDef[] = [
  {
    key: "kinh-doanh",
    label: "Kinh doanh",
    Icon: TrendingUp,
    buildItems: (data) => [
      { label: "Pipeline KH", href: "/customer-pipeline" },
      { label: "Lead báo giá", href: "/leads", badge: data?.todos.leadsNew ?? 0 },
      { label: "Analytics", href: "/admin/analytics" },
    ],
  },
  {
    key: "du-an",
    label: "Dự án",
    Icon: FolderKanban,
    buildItems: (data) => [
      { label: "Dự án", href: "/projects" },
      { label: "Báo cáo KS", href: "/reports" },
      { label: "Việc TPTC", href: "/tptc/assignments" },
      { label: "Chấm Đóng góp", href: "/tptc/contribution-rating" },
      "divider",
      { label: "Đề xuất vật tư", href: "/proposals", badge: data?.todos.proposalPending ?? 0 },
      { label: "NCC vật tư", href: "/admin/suppliers" },
      "divider",
      { label: "Thầu phụ", href: "/subcontractors" },
      { label: "HĐ thầu phụ", href: "/sub-contracts" },
      { label: "Chi thầu phụ", href: "/sub-payments" },
    ],
  },
  {
    key: "tai-chinh",
    label: "Tài chính",
    Icon: Banknote,
    buildItems: (data) => [
      { label: "Lệnh thu", href: "/receipts", badge: data?.todos.receiptAwaitingApproval ?? 0 },
      { label: "Lệnh chi", href: "/expenses", badge: data?.todos.expensePending ?? 0 },
      { label: "Công nợ NCC", href: "/payables" },
      { label: "Lệnh TT NCC", href: "/payment-orders" },
      "divider",
      { label: "Sổ quỹ", href: "/treasury" },
    ],
  },
  {
    key: "nhan-su",
    label: "Nhân sự",
    Icon: Users,
    buildItems: () => [
      { label: "Chấm công NV", href: "/admin/attendance" },
      { label: "Bảng công thợ", href: "/admin/worker-attendance" },
      { label: "Hồ sơ thợ", href: "/admin/workers" },
      { label: "Ca làm việc", href: "/admin/shifts" },
      "divider",
      { label: "Lương KS", href: "/admin/engineers/salary" },
      { label: "User & phân quyền", href: "/admin/users" },
    ],
  },
  {
    key: "kpi",
    label: "KPI",
    Icon: Target,
    buildItems: () => [
      { label: "KPI tổng", href: "/admin/kpi" },
      { label: "Cài đặt KPI", href: "/admin/kpi-settings" },
    ],
  },
  {
    key: "cau-hinh",
    label: "Cấu hình",
    Icon: Settings,
    buildItems: () => [
      { label: "Template", href: "/admin/templates" },
      { label: "Danh mục chuẩn", href: "/admin/catalog/standard-tasks" },
      { label: "Chuyên môn", href: "/admin/specialties" },
      { label: "Tiêu chí TP", href: "/admin/evaluation-criteria" },
    ],
  },
  {
    key: "tro-giup",
    label: "Trợ giúp",
    Icon: BookOpen,
    buildItems: () => [
      { label: "Hướng dẫn app", href: "/huongdanapp" },
    ],
  },
];

const APP_BADGE_KEYS: Record<AppKey, Array<keyof SummaryDto["todos"]>> = {
  "kinh-doanh": ["leadsNew"],
  "du-an": ["proposalPending"],
  "tai-chinh": ["expensePending", "receiptAwaitingApproval", "paymentDue7d"],
  "nhan-su": [],
  "kpi": [],
  "cau-hinh": [],
  "tro-giup": [],
};

export function AdminDashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<SummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [open, setOpen] = useState<null | { app: AppDef; anchor: DOMRect }>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/launcher-summary", { cache: "no-store" });
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
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
          }}
          className="smooth-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors"
          style={{
            color: BRAND_TEXT_MUTED,
            borderColor: "#252840",
            background: "#13151f",
          }}
        >
          <ArrowLeft className="h-3 w-3" style={{ color: BRAND_GOLD_BRIGHT }} />
          Quay lại
        </button>

        <Headline
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
              const badge = data
                ? APP_BADGE_KEYS[app.key].reduce(
                    (sum, k) => sum + (data.todos[k] ?? 0),
                    0,
                  )
                : 0;
              return (
                <AppIcon
                  key={app.key}
                  app={app}
                  delayClass={`delay-${Math.min(idx + 1, 6)}`}
                  badge={badge}
                  onClick={(rect) => setOpen({ app, anchor: rect })}
                />
              );
            })}
          </div>
        </div>

        <WorkQueue data={data} loading={loading} />
      </div>

      {open && (
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
      key: "leads-new",
      label: "Lead mới — chưa liên hệ",
      href: "/leads",
      count: t.leadsNew,
      Icon: UserPlus,
    },
    {
      key: "proposal-pending",
      label: "Đề xuất vật tư — chờ duyệt",
      href: "/proposals?status=pending",
      count: t.proposalPending,
      Icon: ShoppingCart,
    },
    {
      key: "expense-pending",
      label: "Lệnh chi — chờ chuyển",
      href: "/expenses?status=pending",
      count: t.expensePending,
      Icon: Receipt,
    },
    {
      key: "receipt-pending",
      label: "Lệnh thu — chờ duyệt",
      href: "/receipts?status=awaiting_approval",
      count: t.receiptAwaitingApproval,
      Icon: Receipt,
    },
    {
      key: "payment-due",
      label: "Mốc thu KH — trong 7 ngày",
      href: "/payments",
      count: t.paymentDue7d,
      Icon: ClipboardCheck,
    },
    {
      key: "inbox-open",
      label: "Inbox — chưa xử lý",
      href: "/admin/dashboard?tab=inbox",
      count: t.inboxOpen,
      Icon: Inbox,
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
          Không còn việc nào chờ xử lý — êm đẹp 👌
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

function Headline({
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
  const revenue = data?.headline.revenueMonth ?? 0;
  const activeProjects = data?.headline.activeProjects ?? 0;
  const cash = data?.headline.cashBalance ?? 0;
  const animatedRevenue = useAnimatedNumber(revenue);

  const monthLabel = new Date().toLocaleDateString("vi-VN", {
    month: "2-digit",
    year: "numeric",
  });

  return (
    <div className="slide-up delay-1 relative px-1 pt-2">
      <div
        className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em]"
        style={{ color: BRAND_TEXT_MUTED }}
      >
        <TrendingUp className="h-3 w-3" style={{ color: BRAND_GOLD_BRIGHT }} />
        <span>Doanh số {monthLabel}</span>
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
          {formatVnd(animatedRevenue)}
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
      ) : (
        <div
          className="mt-2 grid grid-cols-2 divide-x"
          style={{ borderColor: "rgba(249,115,22,0.14)" }}
        >
          <div className="pr-3 py-1.5">
            <div
              className="text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ color: BRAND_TEXT_MUTED }}
            >
              <FolderKanban className="mr-1 inline h-3 w-3" style={{ color: BRAND_GOLD_BRIGHT }} />
              Dự án đang chạy
            </div>
            <div
              className="mt-1 text-[22px] font-bold leading-none tabular-nums"
              style={{ color: BRAND_TEXT }}
            >
              {activeProjects}
            </div>
          </div>
          <div
            className="pl-3 py-1.5"
            style={{ borderColor: "rgba(249,115,22,0.18)" }}
          >
            <div
              className="text-[10px] font-medium uppercase tracking-[0.18em]"
              style={{ color: BRAND_TEXT_MUTED }}
            >
              <Wallet className="mr-1 inline h-3 w-3" style={{ color: BRAND_GOLD_BRIGHT }} />
              Tồn quỹ
            </div>
            <div
              className="mt-1 text-[22px] font-bold leading-none tabular-nums"
              style={{ color: BRAND_TEXT }}
            >
              {formatVndShort(cash)}
              <span
                className="ml-0.5 text-[13px] font-medium"
                style={{ color: BRAND_GOLD_BRIGHT }}
              >
                đ
              </span>
            </div>
          </div>
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
  const Icon = app.Icon;
  return (
    <div className={`slide-up ${delayClass} flex flex-col items-center gap-2`}>
      <span className="relative inline-block">
        <button
          type="button"
          onClick={(e) => onClick?.(e.currentTarget.getBoundingClientRect())}
          className="smooth-press relative flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-[20px] sm:h-[68px] sm:w-[68px]"
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
        style={{ color: BRAND_TEXT }}
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

      let left = anchor.right + POPOVER_GAP;
      let side: "right" | "left" | "bottom" = "right";
      if (left + width > vw - POPOVER_MARGIN) {
        const leftPos = anchor.left - width - POPOVER_GAP;
        if (leftPos >= POPOVER_MARGIN) {
          left = leftPos;
          side = "left";
        } else {
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
