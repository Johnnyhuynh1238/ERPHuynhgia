"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ProjectInfo = { id: string; code: string; name: string };
type PayrollStatus = "draft" | "ready_to_pay" | "paid";

type ClosedListItem = {
  id: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  status: PayrollStatus;
  totalPayable: number;
  weekDelta: number;
  negStreak: number;
};

type Line = {
  id?: string;
  workerId: string;
  fullName: string;
  grade: number | null;
  bankAccount: string | null;
  bankName: string | null;
  phone: string | null;
  totalDays: number;
  dailyRate: number;
  dailyWage: number;
  bonus: number;
  adjustment: number;
  payable: number;
  absentDaysP: number;
  absentDaysKp: number;
  absentDaysMua: number;
  absentDaysCho: number;
  note?: string | null;
};

type AdjustmentItem = {
  id: string;
  workerId: string;
  workerName?: string;
  amount: number;
  reason: string;
  createdAt?: string;
};

type ExistingPayroll = {
  id: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  status: PayrollStatus;
  totalDays: number;
  totalDailyWage: number;
  totalOutputValue: number;
  weekDelta: number;
  carryoverPrev: number;
  carryoverNew: number;
  bonusPool: number;
  shareRate: number;
  totalBonus: number;
  totalPayable: number;
  negStreak: number;
  note: string | null;
  paidNote: string | null;
  closedBy: { id: string; fullName: string };
  closedAt: string;
  readiedBy: { id: string; fullName: string } | null;
  readiedAt: string | null;
  paidBy: { id: string; fullName: string } | null;
  paidAt: string | null;
  lines: Line[];
  adjustments: AdjustmentItem[];
};

type PreviewData = {
  totalDays: number;
  totalDailyWage: number;
  totalOutputValue: number;
  weekDelta: number;
  carryoverPrev: number;
  carryoverNew: number;
  bonusPool: number;
  shareRate: number;
  totalBonus: number;
  totalPayable: number;
  lines: Line[];
  pendingAdjustmentsCount: number;
  pendingAdjustments: AdjustmentItem[];
  prevPayroll: { carryoverNew: number; negStreak: number } | null;
};

type ApiResponse = {
  project: ProjectInfo;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  shareRate: number;
  closedList: ClosedListItem[];
  payroll: ExistingPayroll | null;
  preview: PreviewData | null;
  statusLabels?: Record<PayrollStatus, string>;
};

const STATUS_LABEL: Record<PayrollStatus, string> = {
  draft: "Nháp",
  ready_to_pay: "Chờ chi",
  paid: "Đã chi",
};

const STATUS_CLASS: Record<PayrollStatus, string> = {
  draft: "bg-slate-500/15 text-slate-300",
  ready_to_pay: "bg-amber-500/15 text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-300",
};

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}
function fmtSigned(n: number) {
  if (n > 0) return "+" + n.toLocaleString("vi-VN");
  return n.toLocaleString("vi-VN");
}
function fmtDate(s: string) {
  const d = new Date(s);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtDateTime(s: string) {
  const d = new Date(s);
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

function currentWeekKey(): string {
  const now = new Date();
  // ISO week
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

type Props = {
  projectId: string;
  canClose: boolean;
  canReady: boolean;
  canMarkPaid: boolean;
  canExport: boolean;
};

export function PayrollClient({ projectId, canClose, canReady, canMarkPaid, canExport }: Props) {
  const [weekKey, setWeekKey] = useState<string>(currentWeekKey());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [adjModal, setAdjModal] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [paidNoteDraft, setPaidNoteDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/payroll?week=${weekKey}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.message || "Không tải được dữ liệu");
        return;
      }
      const j: ApiResponse = await r.json();
      setData(j);
      setNoteDraft("");
      setPaidNoteDraft("");
    } finally {
      setLoading(false);
    }
  }, [projectId, weekKey]);

  useEffect(() => { void load(); }, [load]);

  const closeWeek = useCallback(async () => {
    if (!data?.preview) return;
    if (!confirm(`Chốt bảng lương tuần ${weekKey}?\n\nSau khi chốt, các điều chỉnh đang chờ sẽ được áp vào tuần này và không thể thay đổi.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/payroll/close-week`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekKey, note: noteDraft.trim() || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.message || "Chốt thất bại"); return; }
      toast.success("Đã chốt tuần");
      await load();
    } finally { setBusy(false); }
  }, [data?.preview, projectId, weekKey, noteDraft, load]);

  const markReady = useCallback(async () => {
    if (!data?.payroll) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/payroll/${data.payroll.id}/ready`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.message || "Thất bại"); return; }
      toast.success("Đã chuyển sang Chờ chi");
      await load();
    } finally { setBusy(false); }
  }, [data?.payroll, projectId, load]);

  const markPaid = useCallback(async () => {
    if (!data?.payroll) return;
    if (!confirm(`Xác nhận ĐÃ CHI bảng lương tuần ${weekKey}?\n\nTổng: ${fmt(data.payroll.totalPayable)}đ`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/payroll/${data.payroll.id}/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidNote: paidNoteDraft.trim() || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.message || "Thất bại"); return; }
      toast.success("Đã đánh dấu Đã chi");
      await load();
    } finally { setBusy(false); }
  }, [data?.payroll, projectId, weekKey, paidNoteDraft, load]);

  const exportCsv = useCallback(() => {
    if (!data?.payroll) return;
    window.open(`/api/projects/${projectId}/payroll/${data.payroll.id}/export`, "_blank");
  }, [data?.payroll, projectId]);

  const openPayslip = useCallback((workerId: string) => {
    if (!data?.payroll) return;
    window.open(`/api/projects/${projectId}/payroll/${data.payroll.id}/payslip/${workerId}`, "_blank");
  }, [data?.payroll, projectId]);

  const onAdjustmentCreated = useCallback(async () => {
    setAdjModal(false);
    await load();
  }, [load]);

  // Display info — prefer payroll over preview
  const display = useMemo(() => {
    if (!data) return null;
    if (data.payroll) {
      const p = data.payroll;
      return {
        status: p.status,
        totalDays: p.totalDays,
        totalDailyWage: p.totalDailyWage,
        totalOutputValue: p.totalOutputValue,
        weekDelta: p.weekDelta,
        carryoverPrev: p.carryoverPrev,
        carryoverNew: p.carryoverNew,
        bonusPool: p.bonusPool,
        shareRate: p.shareRate,
        totalBonus: p.totalBonus,
        totalPayable: p.totalPayable,
        negStreak: p.negStreak,
        lines: p.lines,
        appliedAdjustments: p.adjustments,
      };
    }
    if (data.preview) {
      const pv = data.preview;
      return {
        status: "draft" as PayrollStatus,
        totalDays: pv.totalDays,
        totalDailyWage: pv.totalDailyWage,
        totalOutputValue: pv.totalOutputValue,
        weekDelta: pv.weekDelta,
        carryoverPrev: pv.carryoverPrev,
        carryoverNew: pv.carryoverNew,
        bonusPool: pv.bonusPool,
        shareRate: pv.shareRate ?? data.shareRate,
        totalBonus: pv.totalBonus,
        totalPayable: pv.totalPayable,
        negStreak: (pv.prevPayroll?.negStreak ?? 0) + (pv.weekDelta < 0 ? 1 : 0),
        lines: pv.lines,
        appliedAdjustments: [] as AdjustmentItem[],
      };
    }
    return null;
  }, [data]);

  if (loading && !data) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-sm text-[#8892b0]">Đang tải...</div>;
  }
  if (!data || !display) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-sm text-[#8892b0]">Không có dữ liệu</div>;
  }

  const isPreview = !data.payroll;
  const showCloseBtn = isPreview && canClose;
  const showReadyBtn = !isPreview && data.payroll!.status === "draft" && canReady;
  const showPaidBtn = !isPreview && data.payroll!.status === "ready_to_pay" && canMarkPaid;
  const showExportBtn = !isPreview && (data.payroll!.status === "ready_to_pay" || data.payroll!.status === "paid") && canExport;

  return (
    <div className="space-y-4">
      {/* Header + week picker */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#8892b0]">Bảng lương tuần</div>
            <div className="text-lg font-bold text-[#f0f2ff]">{weekKey} · {fmtDate(data.weekStart)} – {fmtDate(data.weekEnd)}</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="week"
              value={weekKey}
              onChange={(e) => setWeekKey(e.target.value)}
              className="rounded-lg border border-[#252840] bg-[#0e1120] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <select
              value={weekKey}
              onChange={(e) => setWeekKey(e.target.value)}
              className="rounded-lg border border-[#252840] bg-[#0e1120] px-3 py-2 text-sm text-[#f0f2ff]"
            >
              <option value={weekKey}>— Đã chốt —</option>
              {data.closedList.map((c) => (
                <option key={c.id} value={c.weekKey}>
                  {c.weekKey} · {STATUS_LABEL[c.status]} · {fmt(c.totalPayable)}đ
                </option>
              ))}
            </select>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[display.status]}`}>
              {STATUS_LABEL[display.status]}
            </span>
          </div>
        </div>
      </div>

      {/* negStreak warning */}
      {display.negStreak >= 2 && (
        <div className="rounded-2xl border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          ⚠ Chuỗi tuần âm liên tiếp: <strong>{display.negStreak}</strong> tuần. Xem lại đơn giá / năng suất nhóm.
        </div>
      )}

      {/* Carryover from prev week (preview only) */}
      {isPreview && data.preview?.prevPayroll && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3 text-sm text-[#a8b3cf]">
          Tuần trước chuyển sang: <strong className={data.preview.prevPayroll.carryoverNew < 0 ? "text-rose-400" : "text-emerald-300"}>
            {fmtSigned(data.preview.prevPayroll.carryoverNew)}đ
          </strong>
          {data.preview.prevPayroll.negStreak > 0 && <span className="ml-2 text-amber-300">(âm {data.preview.prevPayroll.negStreak} tuần)</span>}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard label="Tổng công" value={`${display.totalDays.toLocaleString("vi-VN")} ngày`} />
        <SummaryCard label="Lương công nhật" value={`${fmt(display.totalDailyWage)}đ`} />
        <SummaryCard label="Sản lượng (PASS)" value={`${fmt(display.totalOutputValue)}đ`} />
        <SummaryCard label="Chênh tuần" value={`${fmtSigned(display.weekDelta)}đ`} tone={display.weekDelta < 0 ? "neg" : "pos"} />
        <SummaryCard label={`Quỹ thưởng (${(display.shareRate * 100).toFixed(0)}%)`} value={`${fmt(display.bonusPool)}đ`} />
        <SummaryCard label="Carryover còn" value={`${fmt(display.carryoverNew)}đ`} />
        <SummaryCard label="Tổng thưởng" value={`${fmt(display.totalBonus)}đ`} />
        <SummaryCard label="Tổng phải chi" value={`${fmt(display.totalPayable)}đ`} tone="primary" />
      </div>

      {/* Pending adjustments (preview only) */}
      {isPreview && data.preview && data.preview.pendingAdjustments.length > 0 && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#8892b0]">
            Điều chỉnh sẽ áp khi chốt tuần ({data.preview.pendingAdjustments.length})
          </div>
          <ul className="space-y-1 text-sm text-[#e6e8f3]">
            {data.preview.pendingAdjustments.map((a) => (
              <li key={a.id} className="flex justify-between">
                <span>{a.workerName ?? a.workerId.slice(0, 8)} — {a.reason}</span>
                <span className={a.amount < 0 ? "text-rose-400" : "text-emerald-300"}>{fmtSigned(a.amount)}đ</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Applied adjustments (existing only) */}
      {!isPreview && data.payroll && data.payroll.adjustments.length > 0 && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-[#8892b0]">
            Điều chỉnh đã áp vào tuần này ({data.payroll.adjustments.length})
          </div>
          <ul className="space-y-1 text-sm text-[#e6e8f3]">
            {data.payroll.adjustments.map((a) => (
              <li key={a.id} className="flex justify-between">
                <span>{a.workerName ?? a.workerId.slice(0, 8)} — {a.reason}</span>
                <span className={a.amount < 0 ? "text-rose-400" : "text-emerald-300"}>{fmtSigned(a.amount)}đ</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lines table */}
      <div className="overflow-x-auto rounded-2xl border border-[#252840] bg-[#1a1d2e]">
        <table className="w-full text-sm">
          <thead className="bg-[#0e1120] text-xs uppercase text-[#8892b0]">
            <tr>
              <th className="px-3 py-2 text-left">Thợ</th>
              <th className="px-3 py-2 text-right">Công</th>
              <th className="px-3 py-2 text-right">Đơn giá</th>
              <th className="px-3 py-2 text-right">Lương ngày</th>
              <th className="px-3 py-2 text-right">Thưởng</th>
              <th className="px-3 py-2 text-right">Điều chỉnh</th>
              <th className="px-3 py-2 text-right">Thực nhận</th>
              <th className="px-3 py-2 text-left">STK</th>
              {!isPreview && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {display.lines.length === 0 && (
              <tr>
                <td colSpan={isPreview ? 8 : 9} className="px-3 py-6 text-center text-[#8892b0]">
                  Chưa có thợ nào
                </td>
              </tr>
            )}
            {display.lines.map((l) => (
              <tr key={l.workerId} className="border-t border-[#252840] text-[#e6e8f3]">
                <td className="px-3 py-2">
                  <div className="font-medium">{l.fullName}</div>
                  {(l.absentDaysP + l.absentDaysKp + l.absentDaysMua + l.absentDaysCho) > 0 && (
                    <div className="text-xs text-[#8892b0]">
                      P:{l.absentDaysP} KP:{l.absentDaysKp} Mưa:{l.absentDaysMua} Chờ:{l.absentDaysCho}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{l.totalDays.toLocaleString("vi-VN")}</td>
                <td className="px-3 py-2 text-right">{fmt(l.dailyRate)}</td>
                <td className="px-3 py-2 text-right">{fmt(l.dailyWage)}</td>
                <td className="px-3 py-2 text-right text-emerald-300">{fmt(l.bonus)}</td>
                <td className={`px-3 py-2 text-right ${l.adjustment < 0 ? "text-rose-400" : l.adjustment > 0 ? "text-emerald-300" : ""}`}>
                  {l.adjustment !== 0 ? fmtSigned(l.adjustment) : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{fmt(l.payable)}</td>
                <td className="px-3 py-2 text-xs text-[#a8b3cf]">
                  {l.bankAccount ? `${l.bankAccount}${l.bankName ? " · " + l.bankName : ""}` : <span className="text-rose-400">Chưa có STK</span>}
                </td>
                {!isPreview && (
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => openPayslip(l.workerId)}
                      className="rounded-md border border-[#252840] bg-[#0e1120] px-2 py-1 text-xs text-[#a8b3cf] hover:text-[#f0f2ff]"
                    >
                      Phiếu
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Action bar */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        {/* Existing payroll meta */}
        {!isPreview && data.payroll && (
          <div className="mb-3 grid gap-2 text-xs text-[#8892b0] md:grid-cols-3">
            <div>
              Chốt: <span className="text-[#e6e8f3]">{data.payroll.closedBy.fullName}</span> · {fmtDateTime(data.payroll.closedAt)}
            </div>
            {data.payroll.readiedBy && (
              <div>
                Chờ chi: <span className="text-[#e6e8f3]">{data.payroll.readiedBy.fullName}</span> · {data.payroll.readiedAt && fmtDateTime(data.payroll.readiedAt)}
              </div>
            )}
            {data.payroll.paidBy && (
              <div>
                Đã chi: <span className="text-[#e6e8f3]">{data.payroll.paidBy.fullName}</span> · {data.payroll.paidAt && fmtDateTime(data.payroll.paidAt)}
              </div>
            )}
          </div>
        )}

        {/* Preview-stage note input */}
        {showCloseBtn && (
          <div className="mb-3">
            <input
              type="text"
              placeholder="Ghi chú khi chốt (tùy chọn)"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              className="w-full rounded-lg border border-[#252840] bg-[#0e1120] px-3 py-2 text-sm text-[#f0f2ff]"
              maxLength={500}
            />
          </div>
        )}

        {/* Paid note */}
        {showPaidBtn && (
          <div className="mb-3">
            <input
              type="text"
              placeholder="Ghi chú khi đánh dấu Đã chi (vd: chuyển khoản ngày 15/06)"
              value={paidNoteDraft}
              onChange={(e) => setPaidNoteDraft(e.target.value)}
              className="w-full rounded-lg border border-[#252840] bg-[#0e1120] px-3 py-2 text-sm text-[#f0f2ff]"
              maxLength={500}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canClose && (
            <Button variant="secondary" onClick={() => setAdjModal(true)} disabled={busy}>
              + Điều chỉnh
            </Button>
          )}
          {showCloseBtn && (
            <Button onClick={closeWeek} disabled={busy || display.lines.length === 0}>
              Chốt tuần
            </Button>
          )}
          {showReadyBtn && (
            <Button onClick={markReady} disabled={busy}>
              Chuyển Chờ chi
            </Button>
          )}
          {showExportBtn && (
            <Button variant="secondary" onClick={exportCsv} disabled={busy}>
              Tải CSV chuyển khoản
            </Button>
          )}
          {showPaidBtn && (
            <Button onClick={markPaid} disabled={busy}>
              Đánh dấu Đã chi
            </Button>
          )}
        </div>

        {data.payroll?.note && (
          <div className="mt-3 text-xs text-[#a8b3cf]">Ghi chú chốt: {data.payroll.note}</div>
        )}
        {data.payroll?.paidNote && (
          <div className="mt-1 text-xs text-[#a8b3cf]">Ghi chú chi: {data.payroll.paidNote}</div>
        )}
      </div>

      {adjModal && (
        <AdjustmentModal
          projectId={projectId}
          workers={display.lines.map((l) => ({ id: l.workerId, fullName: l.fullName }))}
          onClose={() => setAdjModal(false)}
          onCreated={onAdjustmentCreated}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" | "primary" }) {
  const toneClass =
    tone === "pos" ? "text-emerald-300" :
    tone === "neg" ? "text-rose-400" :
    tone === "primary" ? "text-blue-300" : "text-[#f0f2ff]";
  return (
    <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-3">
      <div className="text-[11px] uppercase tracking-wide text-[#8892b0]">{label}</div>
      <div className={`mt-1 text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function AdjustmentModal({
  projectId,
  workers,
  onClose,
  onCreated,
}: {
  projectId: string;
  workers: Array<{ id: string; fullName: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [workerId, setWorkerId] = useState(workers[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const amt = Number(amount.replace(/\D/g, "")) * (amount.trim().startsWith("-") ? -1 : 1);
    if (!workerId || !Number.isFinite(amt) || amt === 0 || reason.trim().length < 2) {
      toast.error("Vui lòng chọn thợ, nhập số tiền (≠0) và lý do");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/payroll/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, amount: amt, reason: reason.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.message || "Thất bại"); return; }
      toast.success("Đã tạo điều chỉnh");
      onCreated();
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold text-[#f0f2ff]">Thêm điều chỉnh lương</h3>
        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs text-[#8892b0]">Thợ</label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="w-full rounded-lg border border-[#252840] bg-[#0e1120] px-3 py-2 text-[#f0f2ff]"
            >
              {workers.map((w) => (<option key={w.id} value={w.id}>{w.fullName}</option>))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8892b0]">Số tiền (âm = trừ, dương = cộng, đơn vị VND)</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="vd: -100000 hoặc 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-[#252840] bg-[#0e1120] px-3 py-2 text-[#f0f2ff]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8892b0]">Lý do</label>
            <input
              type="text"
              placeholder="vd: bù tuần trước thiếu công"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              className="w-full rounded-lg border border-[#252840] bg-[#0e1120] px-3 py-2 text-[#f0f2ff]"
            />
          </div>
          <div className="text-xs text-[#8892b0]">
            Điều chỉnh sẽ được áp vào lần Chốt tuần tiếp theo và không thể sửa.
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Hủy</Button>
          <Button onClick={submit} disabled={submitting}>Tạo</Button>
        </div>
      </div>
    </div>
  );
}
