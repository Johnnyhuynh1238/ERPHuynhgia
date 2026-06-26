"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BUDGET_CATEGORIES,
  CATEGORY_LABEL,
  PHASE_CODES,
  PHASE_CODE_LABEL,
  PHASE_CODE_SHORT,
  type PhaseCode,
} from "@/lib/project-budget";
import type { UserRole } from "@prisma/client";

type Category = (typeof BUDGET_CATEGORIES)[number];
type Status = "draft" | "locked";
type AmendmentStatus = "draft" | "approved" | "rejected";

type BreakdownRow = {
  name: string;
  quantity: number;
  note: string | null;
  _local: string;
};

type ItemRow = {
  id?: string;
  category: Category;
  phaseCode: PhaseCode;
  standardTaskId: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
  sortRank: number;
  breakdown: BreakdownRow[];
  _local?: string;
  _expanded?: boolean;
};

type AmendmentItem = {
  id: string;
  category: Category;
  phaseCode: PhaseCode;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
};

type AmendmentEditRow = {
  category: Category;
  phaseCode: PhaseCode;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  _local: string;
};

type Amendment = {
  id: string;
  reason: string;
  status: AmendmentStatus;
  deltaLabor: number;
  deltaMaterial: number;
  deltaEquipment: number;
  deltaAmount: number;
  proposedBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
  approvedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  items: AmendmentItem[];
};

type Budget = {
  id: string;
  status: Status;
  totalLabor: number;
  totalMaterial: number;
  totalEquipment: number;
  totalAmount: number;
  note: string | null;
  createdBy: { id: string; fullName: string };
  lockedBy: { id: string; fullName: string } | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<
    Omit<ItemRow, "breakdown" | "_local" | "_expanded"> & {
      breakdown: Array<{ name: string; quantity: number; note: string | null }>;
    }
  >;
  amendments: Amendment[];
};

type ApiResponse = {
  project: { id: string; code: string; name: string; customerName: string; contractValue: number | null };
  budget: Budget | null;
};

type Props = {
  projectId: string;
  projectName: string;
  contractValue: number | null;
  canEdit: boolean;
  canLock: boolean;
  canPropose: boolean;
  canApprove: boolean;
  currentUserRole: UserRole;
};

function fmtVND(value: number) {
  return value.toLocaleString("vi-VN");
}

function genLocalId() {
  return `local-${Math.random().toString(36).slice(2, 10)}`;
}

function sumBreakdown(rows: BreakdownRow[]) {
  return rows.reduce((s, b) => s + (Number.isFinite(b.quantity) ? b.quantity : 0), 0);
}

function emptyRow(category: Category, phaseCode: PhaseCode): ItemRow {
  return {
    category,
    phaseCode,
    standardTaskId: null,
    name: "",
    unit: "",
    quantity: 0,
    unitPrice: 0,
    amount: 0,
    note: "",
    sortRank: 0,
    breakdown: [],
    _local: genLocalId(),
    _expanded: false,
  };
}

function emptyBreakdown(): BreakdownRow {
  return { name: "", quantity: 0, note: null, _local: genLocalId() };
}

function emptyAmendmentRow(category: Category, phaseCode: PhaseCode): AmendmentEditRow {
  return {
    category,
    phaseCode,
    name: "",
    unit: "",
    quantity: 0,
    unitPrice: 0,
    note: null,
    _local: genLocalId(),
  };
}

export function ProjectBudgetClient({
  projectId,
  contractValue,
  canEdit,
  canLock,
  canPropose,
  canApprove,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [note, setNote] = useState("");
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState("");
  const [amendmentRows, setAmendmentRows] = useState<AmendmentEditRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>("labor");
  const [activePhaseCode, setActivePhaseCode] = useState<PhaseCode>("02");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Không tải được dự toán");
        return;
      }
      const json: ApiResponse = await res.json();
      setData(json);
      if (json.budget) {
        setRows(
          json.budget.items.map((it) => ({
            ...it,
            breakdown: (it.breakdown ?? []).map((b) => ({
              name: b.name,
              quantity: b.quantity,
              note: b.note ?? null,
              _local: genLocalId(),
            })),
            _local: it.id,
            _expanded: false,
          })),
        );
        setNote(json.budget.note ?? "");
      } else {
        setRows([]);
        setNote("");
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const locked = data?.budget?.status === "locked";
  const readOnly = !canEdit || locked;

  const totals = useMemo(() => {
    const labor = rows
      .filter((r) => r.category === "labor")
      .reduce((s, r) => s + Math.round(effectiveQty(r) * r.unitPrice), 0);
    const material = rows
      .filter((r) => r.category === "material")
      .reduce((s, r) => s + Math.round(effectiveQty(r) * r.unitPrice), 0);
    const equipment = rows
      .filter((r) => r.category === "equipment")
      .reduce((s, r) => s + Math.round(effectiveQty(r) * r.unitPrice), 0);
    return { labor, material, equipment, total: labor + material + equipment };
  }, [rows]);

  const totalsByPhase = useMemo(() => {
    const m = new Map<PhaseCode, number>();
    for (const code of PHASE_CODES) m.set(code, 0);
    for (const r of rows) {
      m.set(r.phaseCode, (m.get(r.phaseCode) ?? 0) + Math.round(effectiveQty(r) * r.unitPrice));
    }
    return m;
  }, [rows]);

  const rowsByCategoryPhase = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const r of rows) {
      const key = `${r.category}|${r.phaseCode}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  function updateRow(local: string, patch: Partial<ItemRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._local !== local) return r;
        const next = { ...r, ...patch };
        const qty = effectiveQty(next);
        next.amount = Math.round(qty * next.unitPrice);
        return next;
      }),
    );
  }

  function addRow(category: Category, phaseCode: PhaseCode) {
    setRows((prev) => [...prev, emptyRow(category, phaseCode)]);
  }

  function removeRow(local: string) {
    setRows((prev) => prev.filter((r) => r._local !== local));
  }

  function toggleBreakdown(local: string) {
    setRows((prev) => prev.map((r) => (r._local === local ? { ...r, _expanded: !r._expanded } : r)));
  }

  function addBreakdownToRow(local: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._local !== local) return r;
        const breakdown = [...r.breakdown, emptyBreakdown()];
        const qty = sumBreakdown(breakdown);
        return { ...r, breakdown, quantity: qty, amount: Math.round(qty * r.unitPrice), _expanded: true };
      }),
    );
  }

  function updateBreakdown(rowLocal: string, bLocal: string, patch: Partial<BreakdownRow>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._local !== rowLocal) return r;
        const breakdown = r.breakdown.map((b) => (b._local === bLocal ? { ...b, ...patch } : b));
        const qty = sumBreakdown(breakdown);
        return { ...r, breakdown, quantity: qty, amount: Math.round(qty * r.unitPrice) };
      }),
    );
  }

  function removeBreakdown(rowLocal: string, bLocal: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._local !== rowLocal) return r;
        const breakdown = r.breakdown.filter((b) => b._local !== bLocal);
        const qty = breakdown.length > 0 ? sumBreakdown(breakdown) : r.quantity;
        return { ...r, breakdown, quantity: qty, amount: Math.round(qty * r.unitPrice) };
      }),
    );
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    try {
      const payload = {
        note: note.trim() || null,
        items: rows
          .filter((r) => r.name.trim() && r.unit.trim() && effectiveQty(r) > 0 && r.unitPrice >= 0)
          .map((r, idx) => ({
            category: r.category,
            phaseCode: r.phaseCode,
            standardTaskId: r.standardTaskId,
            name: r.name.trim(),
            unit: r.unit.trim(),
            quantity: effectiveQty(r),
            unitPrice: r.unitPrice,
            note: r.note?.trim() || null,
            sortRank: idx,
            breakdown: r.breakdown
              .filter((b) => b.name.trim() && b.quantity > 0)
              .map((b) => ({
                name: b.name.trim(),
                quantity: b.quantity,
                note: b.note?.trim() || null,
              })),
          })),
      };
      const res = await fetch(`/api/projects/${projectId}/budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Lưu không thành công");
        return;
      }
      toast.success("Đã lưu dự toán");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function lockBudget() {
    if (!canLock || locked) return;
    if (!confirm("Chốt dự toán? Sau khi chốt sẽ không thể sửa trực tiếp, mọi thay đổi phải qua đề xuất điều chỉnh.")) return;
    const res = await fetch(`/api/projects/${projectId}/budget/lock`, { method: "POST" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message || "Chốt thất bại");
      return;
    }
    toast.success("Đã chốt dự toán");
    await load();
  }

  function addAmendmentRow(category: Category, phaseCode: PhaseCode) {
    setAmendmentRows((prev) => [...prev, emptyAmendmentRow(category, phaseCode)]);
  }
  function updateAmendmentRow(local: string, patch: Partial<AmendmentEditRow>) {
    setAmendmentRows((prev) => prev.map((r) => (r._local === local ? { ...r, ...patch } : r)));
  }
  function removeAmendmentRow(local: string) {
    setAmendmentRows((prev) => prev.filter((r) => r._local !== local));
  }

  async function submitAmendment() {
    if (!canPropose || !locked) return;
    if (amendmentReason.trim().length < 3) {
      toast.error("Lý do tối thiểu 3 ký tự");
      return;
    }
    const items = amendmentRows
      .filter((r) => r.name.trim() && r.unit.trim() && r.quantity !== 0)
      .map((r) => ({
        category: r.category,
        phaseCode: r.phaseCode,
        name: r.name.trim(),
        unit: r.unit.trim(),
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        note: r.note?.trim() || null,
      }));
    if (items.length === 0) {
      toast.error("Cần ít nhất 1 hạng mục điều chỉnh");
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/budget/amendments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: amendmentReason.trim(), items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message || "Gửi đề xuất thất bại");
      return;
    }
    toast.success("Đã gửi đề xuất");
    setShowAmendmentForm(false);
    setAmendmentReason("");
    setAmendmentRows([]);
    await load();
  }

  async function decideAmendment(amendmentId: string, action: "approve" | "reject") {
    let rejectReason: string | null = null;
    if (action === "reject") {
      const r = prompt("Lý do từ chối?");
      if (r === null) return;
      rejectReason = r;
    } else {
      if (!confirm("Duyệt điều chỉnh? Hệ thống sẽ cộng dồn delta vào dự toán hiện tại.")) return;
    }
    const res = await fetch(`/api/projects/${projectId}/budget/amendments/${amendmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectReason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message || "Thao tác thất bại");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt" : "Đã từ chối");
    await load();
  }

  if (loading) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-sm text-[#8892b0]">Đang tải dự toán…</div>;
  }

  const activeRows = rowsByCategoryPhase.get(`${activeCategory}|${activePhaseCode}`) ?? [];
  const activePhaseTotal = activeRows.reduce(
    (s, r) => s + Math.round(effectiveQty(r) * r.unitPrice),
    0,
  );

  return (
    <div className="space-y-4">
      {/* Tổng quan */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs text-[#8892b0]">Dự toán công trình</div>
            <div className="text-lg font-bold text-[#f0f2ff]">
              {data?.budget ? (locked ? "Đã chốt" : "Bản nháp") : "Chưa lập"}
              {data?.budget?.lockedAt && (
                <span className="ml-2 text-xs font-normal text-[#8892b0]">
                  bởi {data.budget.lockedBy?.fullName} · {new Date(data.budget.lockedAt).toLocaleString("vi-VN")}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canEdit && !locked && (
              <Button onClick={save} disabled={saving}>
                {saving ? "Đang lưu…" : "Lưu dự toán"}
              </Button>
            )}
            {canLock && !locked && data?.budget && (
              <Button variant="outline" onClick={lockBudget}>
                Chốt dự toán
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-[#0f1220] p-3">
            <div className="text-xs text-[#8892b0]">Nhân công</div>
            <div className="mt-1 text-base font-semibold text-blue-300">{fmtVND(totals.labor)}đ</div>
          </div>
          <div className="rounded-xl bg-[#0f1220] p-3">
            <div className="text-xs text-[#8892b0]">Vật tư</div>
            <div className="mt-1 text-base font-semibold text-emerald-300">{fmtVND(totals.material)}đ</div>
          </div>
          <div className="rounded-xl bg-[#0f1220] p-3">
            <div className="text-xs text-[#8892b0]">Máy móc TB</div>
            <div className="mt-1 text-base font-semibold text-amber-300">{fmtVND(totals.equipment)}đ</div>
          </div>
          <div className="rounded-xl bg-orange-500/10 p-3 ring-1 ring-orange-500/30">
            <div className="text-xs text-orange-300">Tổng dự toán</div>
            <div className="mt-1 text-base font-bold text-orange-200">{fmtVND(totals.total)}đ</div>
            {contractValue !== null && contractValue > 0 && (
              <div className="text-xs text-[#8892b0]">
                = {((totals.total / contractValue) * 100).toFixed(1)}% giá trị HĐ ({fmtVND(contractValue)}đ)
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs hạng mục */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        {/* Category tabs */}
        <div className="flex flex-wrap gap-2 border-b border-[#252840] pb-3">
          {BUDGET_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                activeCategory === cat
                  ? "bg-orange-500 text-white"
                  : "bg-[#0f1220] text-[#8892b0] hover:text-white"
              }`}
            >
              {CATEGORY_LABEL[cat]}
            </button>
          ))}
        </div>

        {/* Phase chips: 9 phases */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PHASE_CODES.map((code) => {
            const sum = totalsByPhase.get(code) ?? 0;
            const active = activePhaseCode === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setActivePhaseCode(code)}
                className={`group rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-[#252840] text-white ring-1 ring-orange-500"
                    : "bg-[#0f1220] text-[#8892b0] hover:text-white"
                }`}
                title={PHASE_CODE_LABEL[code]}
              >
                <span className={active ? "text-orange-300" : "text-[#5a6080] group-hover:text-orange-300"}>
                  {code}
                </span>{" "}
                {PHASE_CODE_SHORT[code]}
                {sum > 0 && (
                  <span className="ml-1 text-[10px] text-[#5a6080]">· {fmtVND(sum)}đ</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active phase content */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[#f0f2ff]">{PHASE_CODE_LABEL[activePhaseCode]}</div>
            <div className="text-xs text-[#8892b0]">{fmtVND(activePhaseTotal)}đ</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[#8892b0]">
                  <th className="w-6 py-1"></th>
                  <th className="py-1 pr-2">Tên hạng mục</th>
                  <th className="px-2">Đơn vị</th>
                  <th className="px-2 text-right">KL</th>
                  <th className="px-2 text-right">Đơn giá</th>
                  <th className="px-2 text-right">Thành tiền</th>
                  <th className="px-2">Ghi chú</th>
                  {!readOnly && <th className="pl-2"></th>}
                </tr>
              </thead>
              <tbody>
                {activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={readOnly ? 7 : 8} className="py-2 text-xs text-[#5a6080]">
                      (chưa có hạng mục — bấm “+ Thêm hạng mục” ở dưới)
                    </td>
                  </tr>
                ) : (
                  activeRows.map((r) => {
                    const hasBreakdown = r.breakdown.length > 0;
                    const qtyLocked = hasBreakdown;
                    const qty = effectiveQty(r);
                    return (
                      <ItemRowView
                        key={r._local}
                        row={r}
                        qty={qty}
                        qtyLocked={qtyLocked}
                        readOnly={readOnly}
                        onUpdate={(patch) => updateRow(r._local!, patch)}
                        onRemove={() => removeRow(r._local!)}
                        onToggleBreakdown={() => toggleBreakdown(r._local!)}
                        onAddBreakdown={() => addBreakdownToRow(r._local!)}
                        onUpdateBreakdown={(bLocal, patch) => updateBreakdown(r._local!, bLocal, patch)}
                        onRemoveBreakdown={(bLocal) => removeBreakdown(r._local!, bLocal)}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => addRow(activeCategory, activePhaseCode)}
              className="text-xs text-orange-300 hover:text-orange-200"
            >
              + Thêm hạng mục vào {PHASE_CODE_SHORT[activePhaseCode]}
            </button>
          )}
        </div>

        {!readOnly && (
          <div className="mt-4 border-t border-[#252840] pt-3">
            <label className="text-xs text-[#8892b0]">Ghi chú dự toán</label>
            <textarea
              className="mt-1 w-full rounded-lg bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú chung về dự toán…"
            />
          </div>
        )}
      </div>

      {/* Amendments */}
      {locked && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-[#f0f2ff]">Đề xuất điều chỉnh</div>
            {canPropose && !showAmendmentForm && (
              <Button variant="outline" onClick={() => setShowAmendmentForm(true)}>
                + Tạo đề xuất
              </Button>
            )}
          </div>

          {showAmendmentForm && canPropose && (
            <div className="mt-3 rounded-xl bg-[#0f1220] p-3 ring-1 ring-[#252840]">
              <label className="text-xs text-[#8892b0]">Lý do điều chỉnh *</label>
              <textarea
                className="mt-1 w-full rounded-lg bg-[#1a1d2e] px-3 py-2 text-sm text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                rows={2}
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="VD: Chủ nhà yêu cầu bổ sung lan can, đào sâu hơn 0.5m do gặp đá…"
              />
              <div className="mt-3 space-y-2">
                {amendmentRows.map((r) => (
                  <div key={r._local} className="flex flex-wrap items-center gap-1.5">
                    <select
                      className="rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                      value={r.category}
                      onChange={(e) => updateAmendmentRow(r._local, { category: e.target.value as Category })}
                    >
                      {BUDGET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                      value={r.phaseCode}
                      onChange={(e) => updateAmendmentRow(r._local, { phaseCode: e.target.value as PhaseCode })}
                    >
                      {PHASE_CODES.map((c) => (
                        <option key={c} value={c}>
                          {c} · {PHASE_CODE_SHORT[c]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="flex-1 min-w-[140px] rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                      value={r.name}
                      onChange={(e) => updateAmendmentRow(r._local, { name: e.target.value })}
                      placeholder="Tên hạng mục"
                    />
                    <input
                      className="w-16 rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                      value={r.unit}
                      onChange={(e) => updateAmendmentRow(r._local, { unit: e.target.value })}
                      placeholder="ĐV"
                    />
                    <input
                      type="number"
                      step="0.001"
                      className="w-20 rounded bg-[#1a1d2e] px-2 py-1 text-right text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                      value={r.quantity || ""}
                      onChange={(e) => updateAmendmentRow(r._local, { quantity: Number(e.target.value) || 0 })}
                      placeholder="KL (âm = giảm)"
                    />
                    <input
                      type="number"
                      step="1000"
                      className="w-24 rounded bg-[#1a1d2e] px-2 py-1 text-right text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                      value={r.unitPrice || ""}
                      onChange={(e) => updateAmendmentRow(r._local, { unitPrice: Math.round(Number(e.target.value) || 0) })}
                      placeholder="Đơn giá"
                    />
                    <span className="w-24 text-right text-xs text-orange-300">
                      {fmtVND(Math.round(r.quantity * r.unitPrice))}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeAmendmentRow(r._local)}
                      className="text-xs text-rose-300"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => addAmendmentRow(activeCategory, activePhaseCode)}
                    className="rounded bg-[#1a1d2e] px-2 py-1 text-xs text-orange-300 ring-1 ring-[#252840] hover:text-orange-200"
                  >
                    + Thêm dòng điều chỉnh
                  </button>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAmendmentForm(false);
                    setAmendmentReason("");
                    setAmendmentRows([]);
                  }}
                >
                  Hủy
                </Button>
                <Button onClick={submitAmendment}>Gửi đề xuất</Button>
              </div>
            </div>
          )}

          <div className="mt-3 space-y-2">
            {(data?.budget?.amendments ?? []).length === 0 ? (
              <div className="text-xs text-[#5a6080]">Chưa có đề xuất nào.</div>
            ) : (
              data!.budget!.amendments.map((a) => (
                <div key={a.id} className="rounded-xl bg-[#0f1220] p-3 ring-1 ring-[#252840]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          a.status === "approved"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : a.status === "rejected"
                              ? "bg-rose-500/15 text-rose-300"
                              : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {a.status === "approved" ? "Đã duyệt" : a.status === "rejected" ? "Từ chối" : "Chờ duyệt"}
                      </span>
                      <span className="text-xs text-[#8892b0]">
                        {a.proposedBy.fullName} · {new Date(a.createdAt).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <div className={`text-sm font-bold ${a.deltaAmount >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {a.deltaAmount >= 0 ? "+" : ""}
                      {fmtVND(a.deltaAmount)}đ
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-[#f0f2ff]">{a.reason}</div>
                  <div className="mt-2 text-xs text-[#8892b0]">
                    NC {a.deltaLabor >= 0 ? "+" : ""}
                    {fmtVND(a.deltaLabor)} · VT {a.deltaMaterial >= 0 ? "+" : ""}
                    {fmtVND(a.deltaMaterial)} · MM {a.deltaEquipment >= 0 ? "+" : ""}
                    {fmtVND(a.deltaEquipment)}
                  </div>
                  {a.items.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-[#8892b0]">Chi tiết ({a.items.length})</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-[#f0f2ff]">
                        {a.items.map((it) => (
                          <li key={it.id}>
                            <span className="text-[#8892b0]">
                              [{CATEGORY_LABEL[it.category]} · {it.phaseCode} {PHASE_CODE_SHORT[it.phaseCode]}]
                            </span>{" "}
                            {it.name}: {it.quantity} {it.unit} × {fmtVND(it.unitPrice)} = {fmtVND(it.amount)}đ
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {a.status === "rejected" && a.rejectReason && (
                    <div className="mt-1 text-xs text-rose-300">Lý do từ chối: {a.rejectReason}</div>
                  )}
                  {a.status === "approved" && a.approvedBy && (
                    <div className="mt-1 text-xs text-emerald-300">
                      Duyệt bởi {a.approvedBy.fullName}
                      {a.approvedAt && ` · ${new Date(a.approvedAt).toLocaleString("vi-VN")}`}
                    </div>
                  )}
                  {a.status === "draft" && canApprove && (
                    <div className="mt-2 flex justify-end gap-2">
                      <Button variant="outline" onClick={() => decideAmendment(a.id, "reject")}>
                        Từ chối
                      </Button>
                      <Button onClick={() => decideAmendment(a.id, "approve")}>Duyệt</Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function effectiveQty(row: ItemRow): number {
  if (row.breakdown.length > 0) return sumBreakdown(row.breakdown);
  return row.quantity;
}

type ItemRowViewProps = {
  row: ItemRow;
  qty: number;
  qtyLocked: boolean;
  readOnly: boolean;
  onUpdate: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
  onToggleBreakdown: () => void;
  onAddBreakdown: () => void;
  onUpdateBreakdown: (bLocal: string, patch: Partial<BreakdownRow>) => void;
  onRemoveBreakdown: (bLocal: string) => void;
};

function ItemRowView({
  row,
  qty,
  qtyLocked,
  readOnly,
  onUpdate,
  onRemove,
  onToggleBreakdown,
  onAddBreakdown,
  onUpdateBreakdown,
  onRemoveBreakdown,
}: ItemRowViewProps) {
  const hasBreakdown = row.breakdown.length > 0;
  return (
    <>
      <tr className="border-t border-[#252840]">
        <td className="py-1 text-center">
          <button
            type="button"
            onClick={onToggleBreakdown}
            className={`h-5 w-5 rounded text-xs ${
              hasBreakdown
                ? "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/50"
                : "bg-[#0f1220] text-[#5a6080] ring-1 ring-[#252840] hover:text-orange-300"
            }`}
            title={hasBreakdown ? "Có công tác con" : "Bấm để mở/đóng"}
          >
            {row._expanded ? "▾" : "▸"}
          </button>
        </td>
        <td className="py-1 pr-2">
          {readOnly ? (
            <span className="text-[#f0f2ff]">{row.name}</span>
          ) : (
            <input
              className="w-full rounded bg-[#0f1220] px-2 py-1 text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="VD: Đào móng / Xi măng PC40 / Máy trộn bê tông"
            />
          )}
        </td>
        <td className="px-2">
          {readOnly ? (
            <span className="text-[#f0f2ff]">{row.unit}</span>
          ) : (
            <input
              className="w-20 rounded bg-[#0f1220] px-2 py-1 text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.unit}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              placeholder="m³"
            />
          )}
        </td>
        <td className="px-2 text-right">
          {readOnly || qtyLocked ? (
            <span className={qtyLocked ? "text-orange-300" : "text-[#f0f2ff]"} title={qtyLocked ? "Tự cộng từ công tác con" : undefined}>
              {qty}
            </span>
          ) : (
            <input
              type="number"
              step="0.001"
              className="w-24 rounded bg-[#0f1220] px-2 py-1 text-right text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.quantity || ""}
              onChange={(e) => onUpdate({ quantity: Number(e.target.value) || 0 })}
            />
          )}
        </td>
        <td className="px-2 text-right">
          {readOnly ? (
            <span className="text-[#f0f2ff]">{fmtVND(row.unitPrice)}</span>
          ) : (
            <input
              type="number"
              step="1000"
              className="w-28 rounded bg-[#0f1220] px-2 py-1 text-right text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.unitPrice || ""}
              onChange={(e) => onUpdate({ unitPrice: Math.round(Number(e.target.value) || 0) })}
            />
          )}
        </td>
        <td className="px-2 text-right font-semibold text-orange-300">{fmtVND(Math.round(qty * row.unitPrice))}</td>
        <td className="px-2">
          {readOnly ? (
            <span className="text-xs text-[#8892b0]">{row.note}</span>
          ) : (
            <input
              className="w-full rounded bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.note ?? ""}
              onChange={(e) => onUpdate({ note: e.target.value })}
            />
          )}
        </td>
        {!readOnly && (
          <td className="pl-2 text-right">
            <button type="button" onClick={onRemove} className="text-xs text-rose-300 hover:text-rose-200">
              Xóa
            </button>
          </td>
        )}
      </tr>
      {row._expanded && (
        <tr className="bg-[#0f1220]/40">
          <td colSpan={readOnly ? 7 : 8} className="px-3 py-2">
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-[#8892b0]">
                Công tác con — chỉ cần ô khối lượng, KL tổng tự cộng vào dòng cha
              </div>
              {row.breakdown.length === 0 ? (
                <div className="text-xs text-[#5a6080]">(chưa có công tác con)</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-[#5a6080]">
                      <th className="py-0.5 pr-2">Tên công tác con</th>
                      <th className="px-2 text-right">Khối lượng</th>
                      <th className="px-2">Ghi chú (vd: trục A)</th>
                      {!readOnly && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {row.breakdown.map((b) => (
                      <tr key={b._local} className="border-t border-[#252840]/60">
                        <td className="py-0.5 pr-2">
                          {readOnly ? (
                            <span className="text-[#f0f2ff]">{b.name}</span>
                          ) : (
                            <input
                              className="w-full rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                              value={b.name}
                              onChange={(e) => onUpdateBreakdown(b._local, { name: e.target.value })}
                              placeholder="VD: Xây tường trục A / Đào móng cọc 1"
                            />
                          )}
                        </td>
                        <td className="px-2 text-right">
                          {readOnly ? (
                            <span className="text-[#f0f2ff]">{b.quantity}</span>
                          ) : (
                            <input
                              type="number"
                              step="0.001"
                              className="w-24 rounded bg-[#1a1d2e] px-2 py-1 text-right text-xs text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                              value={b.quantity || ""}
                              onChange={(e) => onUpdateBreakdown(b._local, { quantity: Number(e.target.value) || 0 })}
                            />
                          )}
                        </td>
                        <td className="px-2">
                          {readOnly ? (
                            <span className="text-[#8892b0]">{b.note}</span>
                          ) : (
                            <input
                              className="w-full rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                              value={b.note ?? ""}
                              onChange={(e) => onUpdateBreakdown(b._local, { note: e.target.value })}
                              placeholder="(tuỳ chọn)"
                            />
                          )}
                        </td>
                        {!readOnly && (
                          <td className="pl-2 text-right">
                            <button
                              type="button"
                              onClick={() => onRemoveBreakdown(b._local)}
                              className="text-xs text-rose-300 hover:text-rose-200"
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                    <tr className="border-t border-[#252840]/60">
                      <td className="py-0.5 pr-2 text-right text-[10px] uppercase tracking-wide text-[#5a6080]">Tổng</td>
                      <td className="px-2 text-right font-semibold text-orange-300">{qty}</td>
                      <td className="px-2"></td>
                      {!readOnly && <td></td>}
                    </tr>
                  </tbody>
                </table>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={onAddBreakdown}
                  className="text-xs text-orange-300 hover:text-orange-200"
                >
                  + Thêm công tác con
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
