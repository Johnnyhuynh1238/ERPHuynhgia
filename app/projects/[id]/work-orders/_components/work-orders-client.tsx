"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WORK_ORDER_STATUS_LABEL } from "@/lib/work-order";
import { PHASE_CODE_SHORT, type PhaseCode } from "@/lib/project-budget";

type Phase = "mong" | "than" | "mai";
type Status = "open" | "done" | "carried";

type BudgetItem = {
  id: string;
  phase: Phase;
  phaseCode: PhaseCode;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  assigned: number;
};

type Worker = {
  id: string;
  fullName: string;
  grade: number | null;
  dailyRate: number;
};

type WorkOrder = {
  id: string;
  date: string;
  groupNo: number;
  budgetItemId: string;
  budgetPhase: Phase;
  budgetPhaseCode: PhaseCode;
  budgetQty: number;
  workItem: string;
  unit: string;
  unitPrice: number;
  targetQty: number;
  techNote: string | null;
  status: Status;
  createdBy: { id: string; fullName: string };
  createdAt: string;
  workers: Array<{ id: string; workerId: string; fullName: string; grade: number | null }>;
};

type Props = {
  projectId: string;
  canEdit: boolean;
};


function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yesterdayStr(from: string) {
  const d = new Date(`${from}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

export function WorkOrdersClient({ projectId, canEdit }: Props) {
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    groupNo: 1,
    budgetItemId: "",
    targetQty: 0,
    techNote: "",
    workerIds: [] as string[],
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/work-orders?date=${date}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Không tải được");
        return;
      }
      const j = await res.json();
      setOrders(j.orders);
      setBudgetItems(j.budgetItems);
      setWorkers(j.workers);
      // suggest next group no
      const used = new Set<number>(j.orders.map((o: WorkOrder) => o.groupNo));
      let next = 1;
      while (used.has(next)) next += 1;
      setForm((f) => ({ ...f, groupNo: next }));
    } finally {
      setLoading(false);
    }
  }, [projectId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const usedWorkerIds = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) for (const w of o.workers) set.add(w.workerId);
    return set;
  }, [orders]);

  const selectedBudgetItem = budgetItems.find((b) => b.id === form.budgetItemId);

  async function submit() {
    if (!form.budgetItemId) return toast.error("Chọn đầu việc");
    if (form.targetQty <= 0) return toast.error("Khối lượng phải > 0");
    if (form.workerIds.length === 0) return toast.error("Chọn ít nhất 1 thợ");
    const res = await fetch(`/api/projects/${projectId}/work-orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        groupNo: form.groupNo,
        budgetItemId: form.budgetItemId,
        targetQty: form.targetQty,
        techNote: form.techNote.trim() || null,
        workerIds: form.workerIds,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message || "Tạo phiếu thất bại");
      return;
    }
    toast.success("Đã tạo phiếu");
    setShowForm(false);
    setForm({ groupNo: form.groupNo + 1, budgetItemId: "", targetQty: 0, techNote: "", workerIds: [] });
    load();
  }

  async function changeStatus(id: string, status: Status) {
    const res = await fetch(`/api/projects/${projectId}/work-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message || "Cập nhật thất bại");
      return;
    }
    load();
  }

  async function remove(id: string) {
    if (!await confirmDialog("Xóa phiếu này?")) return;
    const res = await fetch(`/api/projects/${projectId}/work-orders/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message || "Xóa thất bại");
      return;
    }
    toast.success("Đã xóa");
    load();
  }

  async function duplicateFromYesterday() {
    const sourceDate = yesterdayStr(date);
    if (!await confirmDialog(`Nhân bản từ ${sourceDate} sang ${date}? (Ngày đích phải chưa có phiếu)`)) return;
    const res = await fetch(`/api/projects/${projectId}/work-orders/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceDate, targetDate: date }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(j.message || "Nhân bản thất bại");
      return;
    }
    toast.success(`Đã nhân bản ${j.cloned} phiếu`);
    load();
  }

  function toggleWorker(id: string) {
    setForm((f) => ({
      ...f,
      workerIds: f.workerIds.includes(id) ? f.workerIds.filter((x) => x !== id) : [...f.workerIds, id],
    }));
  }

  if (loading) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-sm text-[#8892b0]">Đang tải…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[#8892b0]">Phiếu giao việc</div>
            <input
              type="date"
              className="mt-1 rounded-lg bg-[#0f1220] px-3 py-1.5 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:ring-orange-500"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={duplicateFromYesterday}>
                Nhân bản hôm qua
              </Button>
              <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Đóng" : "+ Phiếu mới"}</Button>
            </div>
          )}
        </div>
        {budgetItems.length === 0 && (
          <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
            Chưa có dự toán nhân công. Hãy nhập dự toán (tab Dự toán) trước khi giao việc.
          </div>
        )}
        {workers.length === 0 && (
          <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
            Chưa có thợ active thuộc công trình. Hãy thêm thợ trước.
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && canEdit && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-[#8892b0]">Nhóm số</label>
              <input
                type="number"
                min={1}
                max={20}
                className="mt-1 w-full rounded-lg bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:ring-orange-500"
                value={form.groupNo}
                onChange={(e) => setForm({ ...form, groupNo: Math.max(1, Number(e.target.value) || 1) })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-[#8892b0]">Đầu việc (từ dự toán NC)</label>
              <select
                className="mt-1 w-full rounded-lg bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:ring-orange-500"
                value={form.budgetItemId}
                onChange={(e) => {
                  const item = budgetItems.find((b) => b.id === e.target.value);
                  setForm({ ...form, budgetItemId: e.target.value, targetQty: item ? Math.max(0, item.quantity - item.assigned) : 0 });
                }}
              >
                <option value="">-- Chọn --</option>
                {budgetItems.map((b) => (
                  <option key={b.id} value={b.id}>
                    [{b.phaseCode} {PHASE_CODE_SHORT[b.phaseCode]}] {b.name} ({b.unit}) — đã giao {b.assigned}/{b.quantity}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {selectedBudgetItem && (
            <div>
              <label className="text-xs text-[#8892b0]">
                Khối lượng giao ({selectedBudgetItem.unit}) — Đơn giá {fmt(selectedBudgetItem.unitPrice)}đ
              </label>
              <input
                type="number"
                step="0.001"
                className="mt-1 w-full rounded-lg bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:ring-orange-500"
                value={form.targetQty || ""}
                onChange={(e) => setForm({ ...form, targetQty: Number(e.target.value) || 0 })}
              />
              {selectedBudgetItem.assigned + form.targetQty > selectedBudgetItem.quantity && (
                <div className="mt-1 text-xs text-rose-300">
                  ⚠ Lũy kế giao ({fmt(selectedBudgetItem.assigned + form.targetQty)}) vượt dự toán ({fmt(selectedBudgetItem.quantity)})
                </div>
              )}
              <div className="mt-1 text-xs text-[#8892b0]">
                Giá trị phiếu: {fmt(Math.round(form.targetQty * selectedBudgetItem.unitPrice))}đ
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-[#8892b0]">Ghi chú kỹ thuật</label>
            <input
              className="mt-1 w-full rounded-lg bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:ring-orange-500"
              value={form.techNote}
              onChange={(e) => setForm({ ...form, techNote: e.target.value })}
              placeholder="VD: đầm chặt K95, mạch vữa 8mm…"
            />
          </div>
          <div>
            <label className="text-xs text-[#8892b0]">Chọn thợ ({form.workerIds.length})</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {workers.map((w) => {
                const selected = form.workerIds.includes(w.id);
                const alreadyUsed = usedWorkerIds.has(w.id) && !selected;
                return (
                  <button
                    key={w.id}
                    type="button"
                    disabled={alreadyUsed}
                    onClick={() => toggleWorker(w.id)}
                    className={`rounded-full px-2.5 py-1 text-xs ring-1 transition ${
                      selected
                        ? "bg-orange-500 text-white ring-orange-500"
                        : alreadyUsed
                          ? "cursor-not-allowed bg-[#0f1220] text-[#5a6080] ring-[#252840] line-through"
                          : "bg-[#0f1220] text-[#f0f2ff] ring-[#252840] hover:ring-orange-500"
                    }`}
                    title={alreadyUsed ? "Đã thuộc nhóm khác hôm nay" : ""}
                  >
                    {w.fullName}
                    {w.grade ? ` · B${w.grade}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Hủy
            </Button>
            <Button onClick={submit}>Tạo phiếu</Button>
          </div>
        </div>
      )}

      {/* Orders list */}
      <div className="space-y-3">
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
            Chưa có phiếu nào ngày {date}.
          </div>
        ) : (
          orders.map((o) => {
            const budgetItem = budgetItems.find((b) => b.id === o.budgetItemId);
            const overBudget = budgetItem && budgetItem.assigned > budgetItem.quantity;
            return (
              <div key={o.id} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-sm font-semibold text-orange-300">
                      Nhóm {o.groupNo}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        o.status === "done"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : o.status === "carried"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-blue-500/15 text-blue-300"
                      }`}
                    >
                      {WORK_ORDER_STATUS_LABEL[o.status]}
                    </span>
                    <span className="text-xs text-[#8892b0]">[{o.budgetPhaseCode} {PHASE_CODE_SHORT[o.budgetPhaseCode]}]</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1">
                      {o.status !== "done" && (
                        <Button variant="outline" onClick={() => changeStatus(o.id, "done")}>
                          ✓ Xong
                        </Button>
                      )}
                      {o.status === "open" && (
                        <Button variant="outline" onClick={() => changeStatus(o.id, "carried")}>
                          → Dở dang
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => remove(o.id)}>
                        Xóa
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 text-sm font-semibold text-[#f0f2ff]">{o.workItem}</div>
                <div className="mt-1 text-sm text-[#8892b0]">
                  Khối lượng: {fmt(o.targetQty)} {o.unit} · Đơn giá: {fmt(o.unitPrice)}đ · Giá trị:{" "}
                  <span className="font-semibold text-orange-300">{fmt(Math.round(o.targetQty * o.unitPrice))}đ</span>
                </div>
                {overBudget && (
                  <div className="mt-1 text-xs text-rose-300">
                    ⚠ Đầu việc đã giao lũy kế vượt dự toán ({fmt(budgetItem.assigned)}/{fmt(budgetItem.quantity)} {o.unit})
                  </div>
                )}
                {o.techNote && <div className="mt-1 text-xs text-[#8892b0]">📝 {o.techNote}</div>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {o.workers.map((w) => (
                    <span
                      key={w.id}
                      className="rounded-full bg-[#0f1220] px-2 py-0.5 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                    >
                      {w.fullName}
                      {w.grade ? ` · B${w.grade}` : ""}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-[#5a6080]">
                  KS {o.createdBy.fullName} · {new Date(o.createdAt).toLocaleString("vi-VN")}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
