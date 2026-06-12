"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BUDGET_CATEGORIES, BUDGET_PHASES, CATEGORY_LABEL, PHASE_LABEL } from "@/lib/project-budget";
import type { UserRole } from "@prisma/client";

type Category = (typeof BUDGET_CATEGORIES)[number];
type Phase = (typeof BUDGET_PHASES)[number];
type Status = "draft" | "locked";
type AmendmentStatus = "draft" | "approved" | "rejected";

type ItemRow = {
  id?: string;
  category: Category;
  phase: Phase;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
  sortRank: number;
  _local?: string;
};

type AmendmentItem = {
  id: string;
  category: Category;
  phase: Phase;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  note: string | null;
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
  items: ItemRow[];
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

function emptyRow(category: Category, phase: Phase): ItemRow {
  return {
    category,
    phase,
    name: "",
    unit: "",
    quantity: 0,
    unitPrice: 0,
    amount: 0,
    note: "",
    sortRank: 0,
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
  const [amendmentRows, setAmendmentRows] = useState<ItemRow[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category>("labor");

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
        setRows(json.budget.items.map((it) => ({ ...it, _local: it.id })));
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
    const labor = rows.filter((r) => r.category === "labor").reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0);
    const material = rows.filter((r) => r.category === "material").reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0);
    const equipment = rows.filter((r) => r.category === "equipment").reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0);
    return { labor, material, equipment, total: labor + material + equipment };
  }, [rows]);

  const rowsByCategoryPhase = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const r of rows) {
      const key = `${r.category}|${r.phase}`;
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
        next.amount = Math.round(next.quantity * next.unitPrice);
        return next;
      }),
    );
  }

  function addRow(category: Category, phase: Phase) {
    setRows((prev) => [...prev, emptyRow(category, phase)]);
  }

  function removeRow(local: string) {
    setRows((prev) => prev.filter((r) => r._local !== local));
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    try {
      const payload = {
        note: note.trim() || null,
        items: rows
          .filter((r) => r.name.trim() && r.unit.trim() && r.quantity > 0 && r.unitPrice >= 0)
          .map((r, idx) => ({
            category: r.category,
            phase: r.phase,
            name: r.name.trim(),
            unit: r.unit.trim(),
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            note: r.note?.trim() || null,
            sortRank: idx,
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

  function addAmendmentRow(category: Category, phase: Phase) {
    setAmendmentRows((prev) => [...prev, emptyRow(category, phase)]);
  }
  function updateAmendmentRow(local: string, patch: Partial<ItemRow>) {
    setAmendmentRows((prev) =>
      prev.map((r) => {
        if (r._local !== local) return r;
        const next = { ...r, ...patch };
        next.amount = Math.round(next.quantity * next.unitPrice);
        return next;
      }),
    );
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
        phase: r.phase,
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

        <div className="mt-4 space-y-5">
          {BUDGET_PHASES.map((phase) => {
            const phaseRows = rowsByCategoryPhase.get(`${activeCategory}|${phase}`) ?? [];
            const phaseTotal = phaseRows.reduce((s, r) => s + Math.round(r.quantity * r.unitPrice), 0);
            return (
              <div key={phase} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-[#f0f2ff]">Giai đoạn {PHASE_LABEL[phase]}</div>
                  <div className="text-xs text-[#8892b0]">{fmtVND(phaseTotal)}đ</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[#8892b0]">
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
                      {phaseRows.length === 0 ? (
                        <tr>
                          <td colSpan={readOnly ? 6 : 7} className="py-2 text-xs text-[#5a6080]">
                            (chưa có hạng mục)
                          </td>
                        </tr>
                      ) : (
                        phaseRows.map((r) => (
                          <tr key={r._local} className="border-t border-[#252840]">
                            <td className="py-1 pr-2">
                              {readOnly ? (
                                <span className="text-[#f0f2ff]">{r.name}</span>
                              ) : (
                                <input
                                  className="w-full rounded bg-[#0f1220] px-2 py-1 text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                                  value={r.name}
                                  onChange={(e) => updateRow(r._local!, { name: e.target.value })}
                                  placeholder="VD: Đào móng / Xi măng PC40 / Máy trộn bê tông"
                                />
                              )}
                            </td>
                            <td className="px-2">
                              {readOnly ? (
                                <span className="text-[#f0f2ff]">{r.unit}</span>
                              ) : (
                                <input
                                  className="w-20 rounded bg-[#0f1220] px-2 py-1 text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                                  value={r.unit}
                                  onChange={(e) => updateRow(r._local!, { unit: e.target.value })}
                                  placeholder="m³"
                                />
                              )}
                            </td>
                            <td className="px-2 text-right">
                              {readOnly ? (
                                <span className="text-[#f0f2ff]">{r.quantity}</span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.001"
                                  className="w-24 rounded bg-[#0f1220] px-2 py-1 text-right text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                                  value={r.quantity || ""}
                                  onChange={(e) => updateRow(r._local!, { quantity: Number(e.target.value) || 0 })}
                                />
                              )}
                            </td>
                            <td className="px-2 text-right">
                              {readOnly ? (
                                <span className="text-[#f0f2ff]">{fmtVND(r.unitPrice)}</span>
                              ) : (
                                <input
                                  type="number"
                                  step="1000"
                                  className="w-28 rounded bg-[#0f1220] px-2 py-1 text-right text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                                  value={r.unitPrice || ""}
                                  onChange={(e) => updateRow(r._local!, { unitPrice: Math.round(Number(e.target.value) || 0) })}
                                />
                              )}
                            </td>
                            <td className="px-2 text-right font-semibold text-orange-300">
                              {fmtVND(Math.round(r.quantity * r.unitPrice))}
                            </td>
                            <td className="px-2">
                              {readOnly ? (
                                <span className="text-xs text-[#8892b0]">{r.note}</span>
                              ) : (
                                <input
                                  className="w-full rounded bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                                  value={r.note ?? ""}
                                  onChange={(e) => updateRow(r._local!, { note: e.target.value })}
                                />
                              )}
                            </td>
                            {!readOnly && (
                              <td className="pl-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeRow(r._local!)}
                                  className="text-xs text-rose-300 hover:text-rose-200"
                                >
                                  Xóa
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => addRow(activeCategory, phase)}
                    className="text-xs text-orange-300 hover:text-orange-200"
                  >
                    + Thêm hạng mục
                  </button>
                )}
              </div>
            );
          })}
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
              <div className="mt-3 space-y-3">
                {BUDGET_CATEGORIES.map((cat) =>
                  BUDGET_PHASES.map((phase) => {
                    const aRows = amendmentRows.filter((r) => r.category === cat && r.phase === phase);
                    if (aRows.length === 0) return null;
                    return (
                      <div key={`${cat}|${phase}`} className="space-y-1">
                        <div className="text-xs font-semibold text-[#8892b0]">
                          {CATEGORY_LABEL[cat]} · {PHASE_LABEL[phase]}
                        </div>
                        {aRows.map((r) => (
                          <div key={r._local} className="flex flex-wrap items-center gap-1">
                            <input
                              className="flex-1 min-w-[140px] rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                              value={r.name}
                              onChange={(e) => updateAmendmentRow(r._local!, { name: e.target.value })}
                              placeholder="Tên hạng mục"
                            />
                            <input
                              className="w-16 rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                              value={r.unit}
                              onChange={(e) => updateAmendmentRow(r._local!, { unit: e.target.value })}
                              placeholder="ĐV"
                            />
                            <input
                              type="number"
                              step="0.001"
                              className="w-20 rounded bg-[#1a1d2e] px-2 py-1 text-right text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                              value={r.quantity || ""}
                              onChange={(e) => updateAmendmentRow(r._local!, { quantity: Number(e.target.value) || 0 })}
                              placeholder="KL (âm = giảm)"
                            />
                            <input
                              type="number"
                              step="1000"
                              className="w-24 rounded bg-[#1a1d2e] px-2 py-1 text-right text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                              value={r.unitPrice || ""}
                              onChange={(e) => updateAmendmentRow(r._local!, { unitPrice: Math.round(Number(e.target.value) || 0) })}
                              placeholder="Đơn giá"
                            />
                            <span className="w-24 text-right text-xs text-orange-300">
                              {fmtVND(Math.round(r.quantity * r.unitPrice))}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeAmendmentRow(r._local!)}
                              className="text-xs text-rose-300"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  }),
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  {BUDGET_CATEGORIES.map((cat) =>
                    BUDGET_PHASES.map((phase) => (
                      <button
                        key={`${cat}|${phase}`}
                        type="button"
                        onClick={() => addAmendmentRow(cat, phase)}
                        className="rounded bg-[#1a1d2e] px-2 py-1 text-xs text-[#8892b0] ring-1 ring-[#252840] hover:text-white"
                      >
                        + {CATEGORY_LABEL[cat]} {PHASE_LABEL[phase]}
                      </button>
                    )),
                  )}
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
                            <span className="text-[#8892b0]">[{CATEGORY_LABEL[it.category]} · {PHASE_LABEL[it.phase]}]</span> {it.name}: {it.quantity} {it.unit} ×{" "}
                            {fmtVND(it.unitPrice)} = {fmtVND(it.amount)}đ
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
