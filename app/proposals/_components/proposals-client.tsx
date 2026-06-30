"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  Clock,
  HardHat,
  Loader2,
  PackageCheck,
  ShoppingCart,
  Truck,
  UserCircle2,
  Wallet,
} from "lucide-react";

type ParsedItem = { ten: string; sl: number; dvt: string };

type ProposalRow = {
  id: string;
  description: string;
  status: "pending" | "accepted" | "declined";
  orderStatus: "not_ordered" | "ordered" | "received" | "paid";
  parsedItems: ParsedItem[] | null;
  createdAt: string;
  acceptedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  paidAt: string | null;
  ks: { id: string; fullName: string };
  project: { id: string; code: string; name: string };
};

type ListResponse = {
  items: ProposalRow[];
  page: number;
  total: number;
  totalPages: number;
  viewMode: "accountant" | "ks";
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const HH = String(d.getHours()).padStart(2, "0");
  const MM = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${HH}:${MM}`;
}

const STATUS_LABEL: Record<ProposalRow["status"], string> = {
  pending: "Chờ duyệt",
  accepted: "Đã duyệt",
  declined: "Từ chối",
};

const STATUS_CHIP: Record<ProposalRow["status"], string> = {
  pending: "bg-amber-500/15 text-amber-300",
  accepted: "bg-blue-500/15 text-blue-300",
  declined: "bg-red-500/15 text-red-300",
};

const ORDER_LABEL: Record<ProposalRow["orderStatus"], string> = {
  not_ordered: "Chưa đặt",
  ordered: "Đã đặt",
  received: "Đã nhận",
  paid: "Đã TT",
};

const ORDER_CHIP: Record<ProposalRow["orderStatus"], string> = {
  not_ordered: "bg-slate-500/15 text-slate-300",
  ordered: "bg-cyan-500/15 text-cyan-300",
  received: "bg-emerald-500/15 text-emerald-300",
  paid: "bg-emerald-600/25 text-emerald-200",
};

const ORDER_ICON: Record<ProposalRow["orderStatus"], JSX.Element> = {
  not_ordered: <ShoppingCart className="h-3 w-3" />,
  ordered: <Truck className="h-3 w-3" />,
  received: <PackageCheck className="h-3 w-3" />,
  paid: <Wallet className="h-3 w-3" />,
};

const ORDER_STRIPE: Record<ProposalRow["orderStatus"], string> = {
  not_ordered: "bg-slate-500",
  ordered: "bg-cyan-400",
  received: "bg-emerald-400",
  paid: "bg-emerald-500",
};

const STATUS_FILTERS: { key: "all" | ProposalRow["status"]; label: string }[] = [
  { key: "all", label: "Tất cả duyệt" },
  { key: "pending", label: "Chờ duyệt" },
  { key: "accepted", label: "Đã duyệt" },
  { key: "declined", label: "Từ chối" },
];

const ORDER_FILTERS: { key: "all" | ProposalRow["orderStatus"]; label: string }[] = [
  { key: "all", label: "Tất cả đơn" },
  { key: "not_ordered", label: "Chưa đặt" },
  { key: "ordered", label: "Đã đặt" },
  { key: "received", label: "Đã nhận" },
  { key: "paid", label: "Đã TT" },
];

export function ProposalsClient({
  currentRole,
  projectId,
}: {
  currentRole: string;
  projectId?: string;
}) {
  const isAccountantView = currentRole === "accountant" || currentRole === "admin";
  const scopedToProject = Boolean(projectId);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ProposalRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [status, setStatus] = useState<"all" | ProposalRow["status"]>("all");
  const [orderStatus, setOrderStatus] = useState<"all" | ProposalRow["orderStatus"]>("all");

  useEffect(() => {
    setPage(1);
  }, [status, orderStatus]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (status !== "all") params.set("status", status);
      if (orderStatus !== "all") params.set("orderStatus", orderStatus);
      if (projectId) params.set("projectId", projectId);
      const res = await fetch(`/api/proposals?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ListResponse;
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setItems([]);
        return;
      }
      setItems(data.items || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [page, status, orderStatus, projectId]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#13151f] p-4 slide-up">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff8a3d]/15 text-[#fb923c]">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-[#f0f2ff]">
              {scopedToProject ? "Đề xuất của dự án" : "Đề xuất vật tư"}
            </h1>
            <p className="mt-0.5 text-[11px] text-[#8892b0]">
              {scopedToProject
                ? "Lịch sử đề xuất vật tư của dự án này."
                : isAccountantView
                ? "Tất cả đề xuất từ kỹ sư công trình."
                : "Đề xuất anh đã gửi cho kế toán."}
            </p>
          </div>
        </div>

        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                status === f.key
                  ? "bg-orange-500 text-[#0b0d16] font-semibold"
                  : "border border-[#2d3249] bg-[#13151f] text-[#8892b0]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="-mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {ORDER_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setOrderStatus(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                orderStatus === f.key
                  ? "bg-cyan-500 text-[#0b0d16] font-semibold"
                  : "border border-[#2d3249] bg-[#13151f] text-[#8892b0]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-xl bg-[#13151f] px-3 py-2 text-[11px] uppercase tracking-wide text-[#8892b0]">
          {loading ? "Đang tải…" : `${total} đề xuất`}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Đang tải dữ liệu…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-8 text-center text-sm text-[#8892b0]">
          <ClipboardList className="mx-auto mb-2 h-6 w-6 opacity-50" />
          Không có đề xuất phù hợp.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <ProposalCard
              key={p.id}
              p={p}
              isAccountantView={isAccountantView}
              showProject={!scopedToProject}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-xs text-[#8892b0]">
          <div>{total ? `Tổng ${total}` : "—"}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs hover:text-[#f0f2ff] disabled:opacity-40"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Trước
            </button>
            <span className="tabular-nums">
              {page}/{totalPages}
            </span>
            <button
              type="button"
              className="rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs hover:text-[#f0f2ff] disabled:opacity-40"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProposalCard({
  p,
  isAccountantView,
  showProject,
}: {
  p: ProposalRow;
  isAccountantView: boolean;
  showProject: boolean;
}) {
  return (
    <Link
      href={`/proposals/${p.id}`}
      className="relative block overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 pl-4 transition hover:border-[#ff8a3d]/60 active:bg-[#13151f]"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${ORDER_STRIPE[p.orderStatus]}`} />

      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CHIP[p.status]}`}
        >
          {STATUS_LABEL[p.status]}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ORDER_CHIP[p.orderStatus]}`}
        >
          {ORDER_ICON[p.orderStatus]}
          {ORDER_LABEL[p.orderStatus]}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-[#5a627a]">
          <Clock className="h-3 w-3" />
          {fmtTime(p.createdAt)}
        </span>
      </div>

      {showProject && (
        <div className="mt-1.5 flex items-start gap-1.5">
          <HardHat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#fb923c]" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-[#f0f2ff]">{p.project.name}</div>
            <div className="text-[10px] text-[#5a627a]">{p.project.code}</div>
          </div>
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#5a627a]" />
        </div>
      )}

      <div className="mt-2 text-[12.5px] leading-snug text-[#cfd4e8] line-clamp-2">
        {p.description}
      </div>

      {p.parsedItems && p.parsedItems.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {p.parsedItems.slice(0, 6).map((it, i) => (
            <span
              key={i}
              className="rounded-md bg-[#0f1220] px-1.5 py-0.5 text-[10px] text-[#8892b0]"
            >
              <b className="text-[#cfd4e8]">{it.ten}</b> · {it.sl}
              {it.dvt}
            </span>
          ))}
          {p.parsedItems.length > 6 && (
            <span className="rounded-md px-1.5 py-0.5 text-[10px] text-[#5a627a]">
              +{p.parsedItems.length - 6}
            </span>
          )}
        </div>
      )}

      {isAccountantView && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-[#8892b0]">
          <UserCircle2 className="h-3 w-3" />
          KS {p.ks.fullName}
        </div>
      )}
    </Link>
  );
}
