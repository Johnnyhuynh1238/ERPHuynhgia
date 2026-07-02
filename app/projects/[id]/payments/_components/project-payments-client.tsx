"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type PaymentStatus = "not_collected" | "request_sent" | "collected" | "customer_late";

type ReceiptRefStatus = "pending" | "awaiting_approval" | "received" | "cancelled";

type PaymentRow = {
  id: string;
  phaseNumber: number;
  milestoneDescription: string;
  percent: number;
  amount: number;
  expectedDate: string | null;
  actualPaidDate: string | null;
  actualPaidAmount: number | null;
  status: PaymentStatus;
  notes: string | null;
  activeReceipt: { id: string; code: string; status: ReceiptRefStatus } | null;
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

function daysDiffFromToday(dateIso: string | null) {
  if (!dateIso) return null;
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [editing, setEditing] = useState<PaymentRow | null>(null);
  const [status, setStatus] = useState<PaymentStatus>("not_collected");
  const [expectedDate, setExpectedDate] = useState("");
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
    setIsAdmin(!!json.isAdmin);
  }

  async function requestCollection(row: PaymentRow) {
    if (!window.confirm(`Gửi lệnh thu ${fmtMoney(row.amount)} — Đợt ${row.phaseNumber} cho kế toán?`)) return;
    setPendingId(row.id);
    const res = await fetch(`/api/projects/${projectId}/payments/${row.id}/request-collection`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    setPendingId(null);
    if (!res.ok) {
      toast.error(json.message || "Gửi lệnh thu thất bại");
      return;
    }
    toast.success(json.message || "Đã gửi cho KT");
    await loadData();
  }

  async function cancelCollection(row: PaymentRow) {
    if (!row.activeReceipt) return;
    if (!window.confirm(`Huỷ lệnh thu ${row.activeReceipt.code}?`)) return;
    setPendingId(row.id);
    const res = await fetch(`/api/projects/${projectId}/payments/${row.id}/request-collection`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    setPendingId(null);
    if (!res.ok) {
      toast.error(json.message || "Huỷ lệnh thu thất bại");
      return;
    }
    toast.success(json.message || "Đã huỷ lệnh thu");
    await loadData();
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
    setExpectedDate(toInputDate(row.expectedDate));
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
      expectedDate: expectedDate || null,
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
    if (d == null) {
      if (row.status === "customer_late") {
        return { icon: "⚠️", className: "bg-red-50", text: "Quá hạn" };
      }
      return null;
    }
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
          <h2 className="font-semibold">Lịch thanh toán ({rows.length} đợt)</h2>
          <div className="text-sm text-slate-500">{project?.code}</div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const hint = paymentHint(row);
            return (
              <div
                key={row.id}
                className={`flex flex-col rounded-lg border p-3 ${hint?.className || "bg-white"}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-900 px-2 text-xs font-semibold text-white">
                      Đợt {row.phaseNumber}
                    </span>
                    <span className="text-sm font-medium text-slate-600">{Math.round(row.percent)}% HĐ</span>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-xs ${STATUS_CLASS[row.status]}`}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </div>

                <div className="mb-3 text-sm text-slate-800">
                  {hint ? <span className="mr-1">{hint.icon}</span> : null}
                  {row.milestoneDescription}
                  {hint ? (
                    <span className="ml-1 text-xs font-medium text-slate-500">({hint.text})</span>
                  ) : null}
                </div>

                <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Số tiền dự kiến</dt>
                    <dd className="font-semibold text-slate-900">{fmtMoney(row.amount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Ngày dự kiến</dt>
                    <dd className="text-slate-800">{fmtDate(row.expectedDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Số tiền thu thực</dt>
                    <dd className="font-semibold text-emerald-700">{fmtMoney(row.actualPaidAmount)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Ngày thu thực tế</dt>
                    <dd className="text-slate-800">{fmtDate(row.actualPaidDate)}</dd>
                  </div>
                </dl>

                {row.notes ? (
                  <div className="mb-3 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    Ghi chú: {row.notes}
                  </div>
                ) : null}

                {row.activeReceipt ? (
                  <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                    <div className="font-medium">
                      {row.activeReceipt.status === "received" ? "Đã thu" : "Đang chờ KT thu"} — {row.activeReceipt.code}
                    </div>
                  </div>
                ) : null}

                {canEdit ? (
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    {isAdmin && !row.activeReceipt && row.status !== "collected" ? (
                      <Button
                        className="h-8 bg-orange-500 px-3 text-xs hover:bg-orange-600"
                        onClick={() => requestCollection(row)}
                        disabled={pendingId === row.id}
                      >
                        {pendingId === row.id ? "Đang gửi..." : "Yêu cầu KT thu"}
                      </Button>
                    ) : null}
                    {isAdmin && row.activeReceipt && row.activeReceipt.status !== "received" ? (
                      <Button
                        variant="outline"
                        className="h-8 border-red-200 px-3 text-xs text-red-700 hover:bg-red-50"
                        onClick={() => cancelCollection(row)}
                        disabled={pendingId === row.id}
                      >
                        Huỷ lệnh thu
                      </Button>
                    ) : null}
                    <Button variant="outline" className="h-8 px-3 text-xs" onClick={() => openEdit(row)}>
                      Sửa
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border bg-slate-50 p-3 sm:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Tổng % HĐ</div>
            <div className="text-base font-semibold">{Math.round(totals.percent)}%</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Tổng dự kiến</div>
            <div className="text-base font-semibold">{fmtMoney(totals.expected)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Đã thu</div>
            <div className="text-base font-semibold text-emerald-700">{fmtMoney(totals.actual)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Số đợt đã thu</div>
            <div className="text-base font-semibold">
              {totals.collectedCount}/{rows.length}
            </div>
          </div>
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

              <div>
                <label className="mb-1 block text-sm">Ngày dự kiến</label>
                <input
                  type="date"
                  className="w-full rounded border px-3 py-2 text-sm"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">Để trống nếu chưa có ngày.</p>
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
