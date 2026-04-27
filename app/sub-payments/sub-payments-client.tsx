"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { SubPaymentStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDate, formatMoney } from "@/lib/sub-contract-view";

type SubPaymentRow = {
  id: string;
  code: string;
  stage: number;
  description: string;
  expectedAmount: number | null;
  percentage: number | null;
  expectedDate: string;
  status: SubPaymentStatus;
  actualAmount: number | null;
  actualPaidDate: string | null;
  receiptUrl: string | null;
  subContract: {
    id: string;
    code: string;
    title: string;
    project: { id: string; code: string; name: string };
    subcontractor: { id: string; code: string; name: string; phone: string };
  };
};

function statusLabel(status: SubPaymentStatus) {
  if (status === SubPaymentStatus.pending) return "Pending";
  if (status === SubPaymentStatus.requested) return "Đã đề xuất";
  if (status === SubPaymentStatus.approved) return "Đã duyệt";
  if (status === SubPaymentStatus.paid) return "Đã chi";
  return "Đã hủy";
}

function statusClass(status: SubPaymentStatus) {
  if (status === SubPaymentStatus.pending) return "bg-zinc-500/15 text-zinc-300";
  if (status === SubPaymentStatus.requested) return "bg-blue-500/15 text-blue-300";
  if (status === SubPaymentStatus.approved) return "bg-yellow-500/15 text-yellow-300";
  if (status === SubPaymentStatus.paid) return "bg-emerald-500/15 text-emerald-300";
  return "bg-red-500/15 text-red-300";
}

export function SubPaymentsClient({ currentRole }: { currentRole: string }) {
  const [rows, setRows] = useState<SubPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>("approved");
  const [search, setSearch] = useState("");

  const [openMarkPaid, setOpenMarkPaid] = useState<string | null>(null);
  const [actualAmount, setActualAmount] = useState("");
  const [actualPaidDate, setActualPaidDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState("chuyển khoản");
  const [note, setNote] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canMarkPaid = currentRole === "admin" || currentRole === "accountant";

  async function load() {
    setLoading(true);
    const qs = new URLSearchParams();
    if (status && status !== "all") qs.set("status", status);
    if (search.trim()) qs.set("search", search.trim());

    const res = await fetch(`/api/sub-payments?${qs.toString()}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được danh sách thanh toán");
      return;
    }

    setRows((json.rows || []) as SubPaymentRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const keyword = search.trim().toLowerCase();
    return rows.filter((row) => {
      return (
        row.code.toLowerCase().includes(keyword) ||
        row.description.toLowerCase().includes(keyword) ||
        row.subContract.code.toLowerCase().includes(keyword) ||
        row.subContract.subcontractor.name.toLowerCase().includes(keyword) ||
        row.subContract.project.code.toLowerCase().includes(keyword)
      );
    });
  }, [rows, search]);

  function openSheet(row: SubPaymentRow) {
    setOpenMarkPaid(row.id);
    setActualAmount(String(row.expectedAmount || ""));
    setActualPaidDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("chuyển khoản");
    setNote("");
    setReceiptUrl(row.receiptUrl || "");
  }

  async function uploadReceipt(paymentId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.append("receipt", files[0]);

    setUploading(true);
    const res = await fetch(`/api/sub-payments/${paymentId}/receipt`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    setUploading(false);

    if (!res.ok) {
      toast.error(json.message || "Upload phiếu chi thất bại");
      return;
    }

    setReceiptUrl(json.receiptUrl || "");
    toast.success("Đã upload phiếu chi");
  }

  async function submitMarkPaid() {
    if (!openMarkPaid) return;

    setSaving(true);
    const res = await fetch(`/api/sub-payments/${openMarkPaid}/mark-paid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actualAmount: Number(actualAmount || 0),
        actualPaidDate,
        paymentMethod,
        receiptUrl,
        note: note || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Mark paid thất bại");
      return;
    }

    if (json.warning) toast.warning(json.warning);
    toast.success(json.message || "Đã mark paid");
    setOpenMarkPaid(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[#f0f2ff]">Thanh toán thầu phụ</h1>
        <p className="text-xs text-[#8892b0]">Danh sách đợt thanh toán cần xử lý</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          className="rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Tất cả</option>
          <option value="pending">Pending</option>
          <option value="requested">Đã đề xuất</option>
          <option value="approved">Đã duyệt</option>
          <option value="paid">Đã chi</option>
          <option value="cancelled">Đã hủy</option>
        </select>

        <input
          className="rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm"
          placeholder="Tìm mã đợt/HĐ/thầu phụ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Đang tải...</div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-4 text-sm text-[#8892b0]">Không có dữ liệu.</div>
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <div key={row.id} className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[#8892b0]">{row.code} • Đợt {row.stage}</div>
                  <div className="text-sm font-semibold text-[#f0f2ff]">{row.description}</div>
                  <div className="text-xs text-[#a4acc8]">
                    HĐ: <Link href={`/sub-contracts/${row.subContract.id}`} className="underline">{row.subContract.code}</Link> • {row.subContract.subcontractor.name}
                  </div>
                  <div className="text-xs text-[#a4acc8]">
                    Dự kiến: {formatDate(row.expectedDate)} • {formatMoney(row.expectedAmount || 0)} ({row.percentage || 0}%)
                  </div>
                </div>

                <span className={`rounded-full px-2 py-1 text-[11px] ${statusClass(row.status)}`}>{statusLabel(row.status)}</span>
              </div>

              {row.status === SubPaymentStatus.approved && canMarkPaid ? (
                <div className="mt-2 flex justify-end">
                  <Button size="xs" onClick={() => openSheet(row)}>Mark paid</Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {openMarkPaid ? (
        <div className="fixed inset-0 z-50 bg-black/60">
          <button type="button" className="h-full w-full" onClick={() => setOpenMarkPaid(null)} aria-label="Đóng" />
          <div className="absolute bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 rounded-t-2xl border border-[#252840] bg-[#13151f] p-4 slide-up">
            <div className="mb-3 text-lg font-semibold text-[#f0f2ff]">Mark đã chi</div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Số tiền thực chi</label>
                <input type="number" className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={actualAmount} onChange={(e) => setActualAmount(e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Ngày chi</label>
                <input type="date" className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={actualPaidDate} onChange={(e) => setActualPaidDate(e.target.value)} />
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Phương thức</label>
                <select className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  <option value="chuyển khoản">Chuyển khoản</option>
                  <option value="tiền mặt">Tiền mặt</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Upload phiếu chi (bắt buộc)</label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff]">
                  {uploading ? "Đang upload..." : "Chọn ảnh phiếu chi"}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadReceipt(openMarkPaid, e.target.files)} />
                </label>
                {receiptUrl ? <div className="mt-1 text-xs text-emerald-300">Đã có chứng từ: {receiptUrl}</div> : null}
              </div>

              <div>
                <label className="mb-1 block text-xs text-[#a4acc8]">Ghi chú</label>
                <textarea rows={2} className="w-full rounded-xl border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOpenMarkPaid(null)}>Hủy</Button>
                <Button onClick={submitMarkPaid} disabled={saving || !receiptUrl}>{saving ? "Đang xử lý..." : "Xác nhận đã chi"}</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
