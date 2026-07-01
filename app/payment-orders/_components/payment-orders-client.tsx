"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Clock, Loader2, Wallet, XCircle } from "lucide-react";
import { KetoanBackButton } from "@/app/ketoan/_components/back-button";

type Status = "pending" | "approved" | "paid" | "rejected" | "cancelled";

type Order = {
  id: string;
  code: string;
  status: Status;
  totalAmount: number;
  paymentMethod: "cash" | "transfer" | null;
  note: string | null;
  itemCount: number;
  supplier: { id: string; code: string; name: string };
  creator: { id: string; fullName: string } | null;
  approver: { id: string; fullName: string } | null;
  payer: { id: string; fullName: string } | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Chờ admin duyệt",
  approved: "Đã duyệt — chờ chi",
  paid: "Đã chi",
  rejected: "Bị từ chối",
  cancelled: "Đã huỷ",
};
const STATUS_CHIP: Record<Status, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  approved: "bg-blue-500/15 text-blue-300",
  paid: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-red-500/15 text-red-300",
  cancelled: "bg-slate-500/15 text-slate-300",
};
const STATUS_ICON: Record<Status, JSX.Element> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  paid: <Wallet className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
  cancelled: <XCircle className="h-3.5 w-3.5" />,
};

const FILTERS: { key: string; label: string }[] = [
  { key: "pending", label: "Chờ duyệt" },
  { key: "approved", label: "Chờ chi" },
  { key: "paid", label: "Đã chi" },
  { key: "rejected", label: "Từ chối" },
  { key: "all", label: "Tất cả" },
];

const vnd = (n: number) => n.toLocaleString("vi-VN") + "đ";
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PaymentOrdersClient({ isAdmin }: { isAdmin: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>(isAdmin ? "pending" : "pending");
  const [scope, setScope] = useState<"mine" | "all">(isAdmin ? "all" : "mine");

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/payment-orders?status=${status}&scope=${scope}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (res.ok) setOrders(json.orders || []);
    else toast.error(json.message || "Lỗi tải dữ liệu");
  }, [status, scope]);

  useEffect(() => {
    reload();
  }, [reload]);

  const totalSelected = useMemo(() => orders.reduce((s, o) => s + o.totalAmount, 0), [orders]);

  return (
    <div className="space-y-3">
      <KetoanBackButton />
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-orange-300">Lệnh thanh toán NCC</h1>
            <p className="mt-1 text-xs text-[#8892b0]">
              {isAdmin ? "Admin duyệt — KT chi sau khi được duyệt." : "Lệnh bạn đã tạo + chờ chi."}
            </p>
          </div>
          <Link
            href="/payables"
            className="shrink-0 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-1.5 text-xs text-[#f0f2ff] hover:border-orange-400"
          >
            Công nợ NCC
          </Link>
        </div>

        {isAdmin && (
          <div className="mt-3 flex gap-2">
            {(["all", "mine"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-full px-3 py-1 text-xs ${
                  scope === s
                    ? "bg-orange-500 text-[#0b0d16]"
                    : "border border-[#2d3249] bg-[#13151f] text-[#8892b0]"
                }`}
              >
                {s === "all" ? "Toàn công ty" : "Tôi tạo"}
              </button>
            ))}
          </div>
        )}

        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                status === f.key
                  ? "bg-orange-500 text-[#0b0d16]"
                  : "border border-[#2d3249] bg-[#13151f] text-[#8892b0]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="mt-3 rounded-xl bg-[#13151f] p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">
            Hiển thị {orders.length} lệnh · Tổng {vnd(totalSelected)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" /> Đang tải…
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Không có lệnh nào.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/payment-orders/${o.id}`}
              className="block rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 transition active:bg-[#13151f]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-[#8892b0]">{o.code}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_CHIP[o.status]}`}
                    >
                      {STATUS_ICON[o.status]}
                      {STATUS_LABEL[o.status]}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-base font-semibold text-[#f0f2ff]">
                    {o.supplier.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[#8892b0]">
                    <span>{o.itemCount} món</span>
                    <span>·</span>
                    <span>KT: {o.creator?.fullName ?? "—"}</span>
                    <span>·</span>
                    <span>{fmtDate(o.createdAt)}</span>
                  </div>
                  {o.status === "rejected" && o.rejectedAt && (
                    <div className="mt-0.5 text-[11px] text-red-300">
                      Từ chối {fmtDate(o.rejectedAt)}
                    </div>
                  )}
                  {o.status === "paid" && o.paidAt && (
                    <div className="mt-0.5 text-[11px] text-emerald-300">
                      Đã chi {fmtDate(o.paidAt)}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-base font-bold text-orange-400">{vnd(o.totalAmount)}</div>
                  <ChevronRight className="ml-auto mt-1 h-4 w-4 text-[#8892b0]" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
