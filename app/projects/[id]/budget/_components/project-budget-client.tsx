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
    Omit<ItemRow, "breakdown" | "_local"> & {
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

const CAT_ACCENT: Record<Category, { text: string; bg: string; ring: string; dot: string }> = {
  labor: { text: "text-blue-300", bg: "bg-blue-500/10", ring: "ring-blue-500/40", dot: "bg-blue-400" },
  material: { text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/40", dot: "bg-emerald-400" },
  equipment: { text: "text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/40", dot: "bg-amber-400" },
};

const CAT_SHORT: Record<Category, string> = {
  labor: "NC",
  material: "VT",
  equipment: "MM",
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

function effectiveQty(row: ItemRow): number {
  if (row.breakdown.length > 0) return sumBreakdown(row.breakdown);
  return row.quantity;
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

  const itemCountByPhase = useMemo(() => {
    const m = new Map<PhaseCode, number>();
    for (const code of PHASE_CODES) m.set(code, 0);
    for (const r of rows) m.set(r.phaseCode, (m.get(r.phaseCode) ?? 0) + 1);
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

  function addBreakdownToRow(local: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r._local !== local) return r;
        const breakdown = [...r.breakdown, emptyBreakdown()];
        const qty = sumBreakdown(breakdown);
        return { ...r, breakdown, quantity: qty, amount: Math.round(qty * r.unitPrice) };
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
      {/* Header + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-[#5a6080]">Dự toán công trình</div>
          <div className="mt-0.5 flex items-center gap-2 text-base font-semibold text-[#f0f2ff]">
            {data?.budget ? (
              locked ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Đã chốt
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Bản nháp
                </span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#252840] px-2.5 py-0.5 text-xs font-medium text-[#8892b0]">
                Chưa lập
              </span>
            )}
            {data?.budget?.lockedAt && (
              <span className="text-xs font-normal text-[#8892b0]">
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

      {/* Top summary card: NC / VT / MM / TỔNG — mỗi cột 2 hàng (Dự toán + Thực tế) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Nhân công"
          short="NC"
          color={CAT_ACCENT.labor}
          planned={totals.labor}
        />
        <SummaryCard
          label="Vật tư"
          short="VT"
          color={CAT_ACCENT.material}
          planned={totals.material}
        />
        <SummaryCard
          label="Máy móc TB"
          short="MM"
          color={CAT_ACCENT.equipment}
          planned={totals.equipment}
        />
        <SummaryCard
          label="Tổng dự toán"
          short="TỔNG"
          color={{ text: "text-orange-200", bg: "bg-orange-500/10", ring: "ring-orange-500/40", dot: "bg-orange-400" }}
          planned={totals.total}
          subline={
            contractValue !== null && contractValue > 0
              ? `= ${((totals.total / contractValue) * 100).toFixed(1)}% giá trị HĐ`
              : undefined
          }
          emphasis
        />
      </div>

      {/* Main 2-col layout: sidebar 9 phases + content */}
      <div className="grid grid-cols-[180px_1fr] gap-3 md:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-2">
          <div className="px-2 pb-1 pt-1 text-[10px] uppercase tracking-wide text-[#5a6080]">
            9 giai đoạn (SOP 47)
          </div>
          <nav className="flex flex-col gap-0.5">
            {PHASE_CODES.map((code) => {
              const sum = totalsByPhase.get(code) ?? 0;
              const count = itemCountByPhase.get(code) ?? 0;
              const active = activePhaseCode === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActivePhaseCode(code)}
                  className={`group rounded-lg px-2 py-1.5 text-left transition ${
                    active
                      ? "bg-[#252840] ring-1 ring-orange-500/50"
                      : "hover:bg-[#0f1220]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-mono font-semibold ${
                          active ? "bg-orange-500 text-white" : "bg-[#0f1220] text-[#8892b0]"
                        }`}
                      >
                        {code}
                      </span>
                      <span className={`truncate text-xs font-medium ${active ? "text-white" : "text-[#c0c8e0]"}`}>
                        {PHASE_CODE_SHORT[code]}
                      </span>
                    </div>
                    {count > 0 && (
                      <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${active ? "bg-orange-400" : "bg-[#5a6080]"}`} />
                    )}
                  </div>
                  {sum > 0 && (
                    <div className={`mt-0.5 pl-7 text-[10px] ${active ? "text-orange-300" : "text-[#5a6080]"}`}>
                      {fmtVND(sum)}đ
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <section className="min-w-0 rounded-2xl border border-[#252840] bg-[#1a1d2e]">
          {/* Phase header */}
          <div className="border-b border-[#252840] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wide text-[#5a6080]">Giai đoạn {activePhaseCode}</div>
                <div className="truncate text-sm font-semibold text-[#f0f2ff]">{PHASE_CODE_LABEL[activePhaseCode]}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] uppercase tracking-wide text-[#5a6080]">Cộng giai đoạn</div>
                <div className="text-sm font-semibold text-orange-300">{fmtVND(totalsByPhase.get(activePhaseCode) ?? 0)}đ</div>
              </div>
            </div>

            {/* Category tabs */}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {BUDGET_CATEGORIES.map((cat) => {
                const active = activeCategory === cat;
                const c = CAT_ACCENT[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                      active
                        ? `${c.bg} ${c.text} ring-1 ${c.ring}`
                        : "bg-[#0f1220] text-[#8892b0] hover:text-white"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
                      <span>{CAT_SHORT[cat]} · {CATEGORY_LABEL[cat]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active rows */}
          <div className="space-y-2 p-3">
            {activeRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#252840] bg-[#0f1220]/50 px-3 py-6 text-center text-xs text-[#5a6080]">
                Chưa có hạng mục {CAT_SHORT[activeCategory]} trong giai đoạn này.
              </div>
            ) : (
              activeRows.map((r) => (
                <ItemCard
                  key={r._local}
                  row={r}
                  readOnly={readOnly}
                  onUpdate={(patch) => updateRow(r._local!, patch)}
                  onRemove={() => removeRow(r._local!)}
                  onAddBreakdown={() => addBreakdownToRow(r._local!)}
                  onUpdateBreakdown={(bLocal, patch) => updateBreakdown(r._local!, bLocal, patch)}
                  onRemoveBreakdown={(bLocal) => removeBreakdown(r._local!, bLocal)}
                />
              ))
            )}
            {!readOnly && (
              <button
                type="button"
                onClick={() => addRow(activeCategory, activePhaseCode)}
                className="w-full rounded-lg border border-dashed border-orange-500/40 bg-orange-500/5 px-3 py-2 text-xs font-medium text-orange-300 hover:bg-orange-500/10"
              >
                + Thêm hạng mục {CAT_SHORT[activeCategory]} vào {PHASE_CODE_SHORT[activePhaseCode]}
              </button>
            )}

            <div className="mt-2 flex items-center justify-between rounded-lg bg-[#0f1220] px-3 py-2 text-xs">
              <span className="text-[#8892b0]">
                Cộng {CAT_SHORT[activeCategory]} trong {PHASE_CODE_SHORT[activePhaseCode]}
              </span>
              <span className={`font-semibold ${CAT_ACCENT[activeCategory].text}`}>
                {fmtVND(activePhaseTotal)}đ
              </span>
            </div>
          </div>

          {!readOnly && (
            <div className="border-t border-[#252840] p-3">
              <label className="text-[10px] uppercase tracking-wide text-[#5a6080]">Ghi chú dự toán</label>
              <textarea
                className="mt-1 w-full rounded-lg bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú chung về dự toán…"
              />
            </div>
          )}
        </section>
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
                  <div key={r._local} className="rounded-lg bg-[#1a1d2e] p-2 ring-1 ring-[#252840]">
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <select
                        className="rounded bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
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
                        className="rounded bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
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
                        className="rounded bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                        value={r.unit}
                        onChange={(e) => updateAmendmentRow(r._local, { unit: e.target.value })}
                        placeholder="ĐV"
                      />
                      <button
                        type="button"
                        onClick={() => removeAmendmentRow(r._local)}
                        className="rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/20"
                      >
                        Xóa dòng
                      </button>
                    </div>
                    <input
                      className="mt-1.5 w-full rounded bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                      value={r.name}
                      onChange={(e) => updateAmendmentRow(r._local, { name: e.target.value })}
                      placeholder="Tên hạng mục điều chỉnh"
                    />
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      <input
                        type="number"
                        step="0.001"
                        className="rounded bg-[#0f1220] px-2 py-1 text-right text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                        value={r.quantity || ""}
                        onChange={(e) => updateAmendmentRow(r._local, { quantity: Number(e.target.value) || 0 })}
                        placeholder="KL (âm = giảm)"
                      />
                      <input
                        type="number"
                        step="1000"
                        className="rounded bg-[#0f1220] px-2 py-1 text-right text-xs text-[#f0f2ff] ring-1 ring-[#252840]"
                        value={r.unitPrice || ""}
                        onChange={(e) => updateAmendmentRow(r._local, { unitPrice: Math.round(Number(e.target.value) || 0) })}
                        placeholder="Đơn giá"
                      />
                      <div className="flex items-center justify-end rounded bg-[#0f1220] px-2 py-1 text-right text-xs font-semibold text-orange-300 ring-1 ring-[#252840]">
                        {fmtVND(Math.round(r.quantity * r.unitPrice))}đ
                      </div>
                    </div>
                  </div>
                ))}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => addAmendmentRow(activeCategory, activePhaseCode)}
                    className="w-full rounded-lg border border-dashed border-orange-500/40 bg-orange-500/5 px-2 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-500/10"
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

type SummaryColor = { text: string; bg: string; ring: string; dot: string };

function SummaryCard({
  label,
  short,
  color,
  planned,
  subline,
  emphasis,
}: {
  label: string;
  short: string;
  color: SummaryColor;
  planned: number;
  subline?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-[#252840] p-3 ${
        emphasis ? `${color.bg} ring-1 ${color.ring}` : "bg-[#1a1d2e]"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-[#5a6080]">{label}</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${emphasis ? "bg-orange-500/30 text-orange-200" : "bg-[#0f1220] text-[#8892b0]"}`}>
          {short}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-[#5a6080]">Dự toán</span>
          <span className={`truncate text-sm font-semibold ${color.text}`}>{fmtVND(planned)}đ</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wide text-[#5a6080]">Thực tế</span>
          <span className="text-sm font-medium text-[#5a6080]" title="Chưa link với tiến độ">—</span>
        </div>
      </div>
      {subline && <div className="mt-1.5 text-[10px] text-[#8892b0]">{subline}</div>}
    </div>
  );
}

type ItemCardProps = {
  row: ItemRow;
  readOnly: boolean;
  onUpdate: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
  onAddBreakdown: () => void;
  onUpdateBreakdown: (bLocal: string, patch: Partial<BreakdownRow>) => void;
  onRemoveBreakdown: (bLocal: string) => void;
};

function ItemCard({
  row,
  readOnly,
  onUpdate,
  onRemove,
  onAddBreakdown,
  onUpdateBreakdown,
  onRemoveBreakdown,
}: ItemCardProps) {
  const hasBreakdown = row.breakdown.length > 0;
  const qtyLocked = hasBreakdown;
  const qty = effectiveQty(row);
  const amount = Math.round(qty * row.unitPrice);

  return (
    <div className="rounded-xl bg-[#0f1220] p-2.5 ring-1 ring-[#252840]">
      {/* Row 1: name */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <div className="truncate text-sm font-medium text-[#f0f2ff]">{row.name}</div>
          ) : (
            <input
              className="w-full rounded bg-[#1a1d2e] px-2 py-1 text-sm font-medium text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Tên hạng mục (VD: Đào móng / Xi măng PC40 / Máy trộn)"
            />
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/20"
          >
            Xóa
          </button>
        )}
      </div>

      {/* Row 2: ĐV · KL · Đơn giá · Thành tiền */}
      <div className="mt-1.5 grid grid-cols-[60px_1fr_1fr_1fr] gap-1.5 sm:grid-cols-[80px_1fr_1.2fr_1.2fr]">
        <FieldCell label="ĐV">
          {readOnly ? (
            <span className="text-xs text-[#f0f2ff]">{row.unit}</span>
          ) : (
            <input
              className="w-full bg-transparent text-xs text-[#f0f2ff] outline-none"
              value={row.unit}
              onChange={(e) => onUpdate({ unit: e.target.value })}
              placeholder="m³"
            />
          )}
        </FieldCell>
        <FieldCell label={qtyLocked ? "KL (tự cộng)" : "KL"}>
          {readOnly || qtyLocked ? (
            <span
              className={`text-xs ${qtyLocked ? "text-orange-300" : "text-[#f0f2ff]"}`}
              title={qtyLocked ? "Tự cộng từ công tác con" : undefined}
            >
              {qty}
            </span>
          ) : (
            <input
              type="number"
              step="0.001"
              className="w-full bg-transparent text-right text-xs text-[#f0f2ff] outline-none"
              value={row.quantity || ""}
              onChange={(e) => onUpdate({ quantity: Number(e.target.value) || 0 })}
            />
          )}
        </FieldCell>
        <FieldCell label="Đơn giá">
          {readOnly ? (
            <span className="text-xs text-[#f0f2ff]">{fmtVND(row.unitPrice)}</span>
          ) : (
            <input
              type="number"
              step="1000"
              className="w-full bg-transparent text-right text-xs text-[#f0f2ff] outline-none"
              value={row.unitPrice || ""}
              onChange={(e) => onUpdate({ unitPrice: Math.round(Number(e.target.value) || 0) })}
            />
          )}
        </FieldCell>
        <FieldCell label="Thành tiền" emphasize>
          <span className="text-xs font-semibold text-orange-300">{fmtVND(amount)}đ</span>
        </FieldCell>
      </div>

      {/* Row 3: ghi chú (optional, narrow) */}
      {(!readOnly || row.note) && (
        <div className="mt-1.5">
          {readOnly ? (
            row.note && <div className="text-[11px] text-[#8892b0]">Ghi chú: {row.note}</div>
          ) : (
            <input
              className="w-full rounded bg-[#1a1d2e] px-2 py-1 text-[11px] text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.note ?? ""}
              onChange={(e) => onUpdate({ note: e.target.value })}
              placeholder="Ghi chú (tuỳ chọn)"
            />
          )}
        </div>
      )}

      {/* Breakdown nested (always visible) */}
      <div className="mt-2 rounded-lg border border-dashed border-[#252840] bg-[#1a1d2e]/40 p-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-[#5a6080]">
            Công tác con {hasBreakdown && `(${row.breakdown.length})`}
          </div>
          {hasBreakdown && (
            <div className="text-[10px] text-orange-300">Tổng KL: {qty}</div>
          )}
        </div>
        {hasBreakdown ? (
          <div className="mt-1 space-y-1">
            {row.breakdown.map((b) => (
              <div key={b._local} className="grid grid-cols-[1fr_70px_24px] gap-1.5 sm:grid-cols-[1fr_90px_1fr_24px]">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="shrink-0 text-[#5a6080]">└</span>
                  {readOnly ? (
                    <span className="truncate text-xs text-[#f0f2ff]">{b.name}</span>
                  ) : (
                    <input
                      className="w-full rounded bg-[#0f1220] px-1.5 py-0.5 text-xs text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                      value={b.name}
                      onChange={(e) => onUpdateBreakdown(b._local, { name: e.target.value })}
                      placeholder="Tên công tác con (VD: Trục A)"
                    />
                  )}
                </div>
                {readOnly ? (
                  <span className="text-right text-xs text-[#f0f2ff]">{b.quantity}</span>
                ) : (
                  <input
                    type="number"
                    step="0.001"
                    className="rounded bg-[#0f1220] px-1.5 py-0.5 text-right text-xs text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                    value={b.quantity || ""}
                    onChange={(e) => onUpdateBreakdown(b._local, { quantity: Number(e.target.value) || 0 })}
                    placeholder="KL"
                  />
                )}
                <div className="hidden sm:block">
                  {readOnly ? (
                    <span className="text-[11px] text-[#8892b0]">{b.note}</span>
                  ) : (
                    <input
                      className="w-full rounded bg-[#0f1220] px-1.5 py-0.5 text-[11px] text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                      value={b.note ?? ""}
                      onChange={(e) => onUpdateBreakdown(b._local, { note: e.target.value })}
                      placeholder="Ghi chú (tuỳ chọn)"
                    />
                  )}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => onRemoveBreakdown(b._local)}
                    className="rounded text-xs text-rose-300 hover:text-rose-200"
                    title="Xóa công tác con"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-[#5a6080]">
            Chưa chia nhỏ — KL nhập trực tiếp ở dòng cha.
          </div>
        )}
        {!readOnly && (
          <button
            type="button"
            onClick={onAddBreakdown}
            className="mt-1.5 text-[11px] text-orange-300 hover:text-orange-200"
          >
            + Thêm công tác con
          </button>
        )}
      </div>
    </div>
  );
}

function FieldCell({
  label,
  children,
  emphasize,
}: {
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded px-1.5 py-0.5 ring-1 ${
        emphasize ? "bg-orange-500/5 ring-orange-500/30" : "bg-[#1a1d2e] ring-[#252840]"
      }`}
    >
      <div className="text-[9px] uppercase tracking-wide text-[#5a6080]">{label}</div>
      <div className="text-right">{children}</div>
    </div>
  );
}
