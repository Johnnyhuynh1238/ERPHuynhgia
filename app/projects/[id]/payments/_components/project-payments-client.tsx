"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type PaymentStatus = "not_collected" | "request_sent" | "collected" | "customer_late";

type PaymentRow = {
  id: string;
  phaseNumber: number;
  milestoneDescription: string;
  percent: number;
  amount: number;
  expectedDate: string;
  actualPaidDate: string | null;
  actualPaidAmount: number | null;
  status: PaymentStatus;
  notes: string | null;
};

type ProjectInfo = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  contractValue: number;
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  not_collected: "Chưa thu",
  request_sent: "Đã gửi đề nghị",
  collected: "Đã thu",
  customer_late: "Khách chậm",
};

const STATUS_CLASS: Record<PaymentStatus, string> = {
  not_collected: "bg-slate-100 text-slate-700",
  request_sent: "bg-amber-100 text-amber-700",
  collected: "bg-emerald-100 text-emerald-700",
  customer_late: "bg-red-100 text-red-700",
};

function fmtMoney(v: number | null) {
  if (v == null) return "-";
  return `${Math.round(v).toLocaleString("vi-VN")} đ`;
}

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function toInputDate(dateIso: string | null) {
  if (!dateIso) return "";
  return dateIso.slice(0, 10);
}

function daysDiffFromToday(dateIso: string) {
  const t = new Date();
  const today = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const d = new Date(dateIso);
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((target - today) / (24 * 60 * 60 * 1000));
}

export function ProjectPaymentsClient({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [status, setStatus] = useState<PaymentStatus>("not_collected");
  const [actualPaidDate, setActualPaidDate] = useState("");
  const [actualPaidAmount, setActualPaidAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    const res = await fetch(`/api/projects/${projectId}/payments`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được lịch thanh toán");
      return;
    }

    setProject(json.project);
    setRows(json.payments || []);
    setCanEdit(!!json.canEdit);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const totals = useMemo(() => {
    const percent = rows.reduce((s, x) => s + Number(x.percent || 0), 0);
    const expected = rows.reduce((s, x) => s + Number(x.amount || 0), 0);
    const actual = rows.reduce((s, x) => s + Number(x.actualPaidAmount || 0), 0);
    const collectedCount = rows.filter((x) => !!x.actualPaidDate).length;
    return { percent, expected, actual, collectedCount };
  }, [rows]);

  function openEdit(row: PaymentRow) {
    setEditing(row);
    setStatus(row.status);
    setActualPaidDate(toInputDate(row.actualPaidDate));
    setActualPaidAmount(row.actualPaidAmount != null ? String(row.actualPaidAmount) : String(row.amount));
    setNotes(row.notes || "");
  }

  async function submitEdit() {
    if (!editing) return;

    if (status === "collected") {
      if (!actualPaidDate || !actualPaidAmount || Number(actualPaidAmount) <= 0) {
        toast.error("Khi đã thu tiền, ngày thu và số tiền thu là bắt buộc");
        return;
      }

      const delta = Math.abs(Number(actualPaidAmount) - Number(editing.amount));
      const threshold = Number(editing.amount) * 0.1;
      if (delta > threshold) {
        const ok = window.confirm("Số tiền thu chênh lệch lớn. Xác nhận?");
        if (!ok) return;
      }
    }

    setSaving(true);

    const payload = {
      status,
      actualPaidDate: status === "collected" ? actualPaidDate : null,
      actualPaidAmount: status === "collected" ? Number(actualPaidAmount) : null,
      notes: notes.trim() || null,
    };

    const res = await fetch(`/api/projects/${projectId}/payments/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Cập nhật thất bại");
      return;
    }

    toast.success("Đã cập nhật thanh toán");
    setRows((prev) => prev.map((r) => (r.id === editing.id ? json.payment : r)));
    setEditing(null);
  }

  function paymentHint(row: PaymentRow) {
    const d = daysDiffFromToday(row.expectedDate);
    if (row.status === "not_collected" && d >= 0 && d <= 7) {
      return { icon: "🔔", className: "bg-yellow-50", text: "Sắp đến hạn" };
    }
    if (row.status === "customer_late" || (row.status === "not_collected" && d < 0)) {
      return { icon: "⚠️", className: "bg-red-50", text: "Quá hạn" };
    }
    return null;
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-4 text-sm text-slate-600">Đang tải lịch thanh toán...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Lịch thanh toán (6 đợt)</h2>
          <div className="text-sm text-slate-500">{project?.code}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <th className="px-3 py-2">Đợt</th>
                <th className="px-3 py-2">Mốc hoàn thành</th>
                <th className="px-3 py-2">% HĐ</th>
                <th className="px-3 py-2">Số tiền dự kiến</th>
                <th className="px-3 py-2">Ngày dự kiến</th>
                <th className="px-3 py-2">Ngày thu thực tế</th>
                <th className="px-3 py-2">Số tiền thu thực</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hint = paymentHint(row);
                return (
                  <tr key={row.id} className={`border-b ${hint?.className || ""}`}>
                    <td className="px-3 py-2 font-medium">{row.phaseNumber}</td>
                    <td className="px-3 py-2">
                      {hint ? <span className="mr-1">{hint.icon}</span> : null}
                      {row.milestoneDescription}
                    </td>
                    <td className="px-3 py-2">{Math.round(row.percent)}%</td>
                    <td className="px-3 py-2">{fmtMoney(row.amount)}</td>
                    <td className="px-3 py-2">{fmtDate(row.expectedDate)}</td>
                    <td className="px-3 py-2">{fmtDate(row.actualPaidDate)}</td>
                    <td className="px-3 py-2">{fmtMoney(row.actualPaidAmount)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[row.status]}`}>{STATUS_LABEL[row.status]}</span>
                    </td>
                    <td className="px-3 py-2">
                      {canEdit ? (
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => openEdit(row)}>
                            Sửa
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => toast.info("In đề nghị thanh toán sẽ làm ở Phase 2")}
                          >
                            In đề nghị thanh toán
                          </Button>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              <tr className="bg-slate-100 font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  TỔNG CỘNG
                </td>
                <td className="px-3 py-2">{Math.round(totals.percent)}%</td>
                <td className="px-3 py-2">{fmtMoney(totals.expected)}</td>
                <td className="px-3 py-2">-</td>
                <td className="px-3 py-2">{totals.collectedCount}/{rows.length} đợt</td>
                <td className="px-3 py-2">{fmtMoney(totals.actual)}</td>
                <td className="px-3 py-2" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <h3 className="mb-3 font-semibold">Cập nhật thanh toán - Đợt {editing.phaseNumber}</h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm">Trạng thái</label>
                <select
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PaymentStatus)}
                >
                  <option value="not_collected">Chưa thu</option>
                  <option value="request_sent">Đã gửi đề nghị</option>
                  <option value="collected">Đã thu</option>
                  <option value="customer_late">Khách chậm</option>
                </select>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm">Ngày thu thực tế</label>
                  <input
                    type="date"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={actualPaidDate}
                    onChange={(e) => setActualPaidDate(e.target.value)}
                    required={status === "collected"}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm">Số tiền thu thực tế</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={actualPaidAmount}
                    onChange={(e) => setActualPaidAmount(e.target.value)}
                    required={status === "collected"}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm">Ghi chú</label>
                <textarea
                  rows={3}
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional, đặc biệt khi khách chậm hoặc thu thiếu"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>
                Hủy
              </Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={submitEdit} disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
