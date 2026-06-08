"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

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

export function ProposalsClient({ currentRole }: { currentRole: string }) {
  const isAccountantView = currentRole === "accountant" || currentRole === "admin";

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
  }, [page, status, orderStatus]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 slide-up">
        <h1 className="text-xl font-bold text-[#f0f2ff]">Nhật ký đề xuất vật tư</h1>
        <p className="mt-1 text-xs text-[#8892b0]">
          {isAccountantView
            ? "Tất cả đề xuất từ kỹ sư công trình. Bấm vào dòng để xử lý."
            : "Đề xuất anh đã gửi cho kế toán. Bấm vào dòng để xem chi tiết."}
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <select
            className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="all">Tất cả trạng thái duyệt</option>
            <option value="pending">Chờ duyệt</option>
            <option value="accepted">Đã duyệt</option>
            <option value="declined">Từ chối</option>
          </select>
          <select
            className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
            value={orderStatus}
            onChange={(e) => setOrderStatus(e.target.value as any)}
          >
            <option value="all">Tất cả trạng thái đơn</option>
            <option value="not_ordered">Chưa đặt NCC</option>
            <option value="ordered">Đã đặt NCC</option>
            <option value="received">Đã nhận hàng</option>
            <option value="paid">Đã thanh toán</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-center text-sm text-[#8892b0]">
          Đang tải dữ liệu...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          <div className="mb-2 text-2xl">📋</div>
          <div>Không có đề xuất phù hợp.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#252840] bg-[#1a1d2e]">
          <table className="w-full text-sm">
            <thead className="bg-[#13151f] text-[11px] uppercase tracking-wide text-[#8892b0]">
              <tr>
                <th className="px-3 py-2 text-left">Thời gian</th>
                {isAccountantView && <th className="px-3 py-2 text-left">KS</th>}
                <th className="px-3 py-2 text-left">Công trình</th>
                <th className="px-3 py-2 text-left">Đề xuất</th>
                <th className="px-3 py-2 text-left">Duyệt</th>
                <th className="px-3 py-2 text-left">Đơn hàng</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr
                  key={p.id}
                  className="border-t border-[#252840] text-[#f0f2ff] transition hover:bg-[#1f2436]"
                >
                  <td className="px-3 py-2 align-top text-xs text-[#8892b0]">{fmtTime(p.createdAt)}</td>
                  {isAccountantView && (
                    <td className="px-3 py-2 align-top text-xs text-[#f0f2ff]">{p.ks.fullName}</td>
                  )}
                  <td className="px-3 py-2 align-top">
                    <div className="text-xs text-[#8892b0]">{p.project.code}</div>
                    <div className="text-[13px] font-medium">{p.project.name}</div>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Link href={`/proposals/${p.id}`} className="block">
                      <div className="text-[13px] text-[#f0f2ff] hover:text-[#fb923c]">
                        {p.description.length > 80 ? `${p.description.slice(0, 77)}…` : p.description}
                      </div>
                      {p.parsedItems && p.parsedItems.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.parsedItems.slice(0, 4).map((it, i) => (
                            <span
                              key={i}
                              className="rounded-md bg-[#13151f] px-1.5 py-0.5 text-[10px] text-[#8892b0]"
                            >
                              {it.ten} · {it.sl}{it.dvt}
                            </span>
                          ))}
                          {p.parsedItems.length > 4 && (
                            <span className="text-[10px] text-[#8892b0]">+{p.parsedItems.length - 4}</span>
                          )}
                        </div>
                      )}
                    </Link>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ORDER_CHIP[p.orderStatus]}`}
                    >
                      {ORDER_LABEL[p.orderStatus]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-xs text-[#8892b0]">
        <div>{total ? `Tổng ${total} đề xuất` : "Không có đề xuất"}</div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-8 border-[#2d3249] bg-[#13151f]"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Trước
          </Button>
          <span>{page}/{totalPages}</span>
          <Button
            variant="outline"
            className="h-8 border-[#2d3249] bg-[#13151f]"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
