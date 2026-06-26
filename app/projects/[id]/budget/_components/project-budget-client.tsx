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
  profitMarginPct: number | null;
  canEdit: boolean;
  canLock: boolean;
  canPropose: boolean;
  canApprove: boolean;
  currentUserRole: UserRole;
};

const CAT_TONE: Record<
  Category,
  { text: string; bg: string; ring: string; dot: string; activeBg: string; activeRing: string }
> = {
  labor: {
    text: "text-blue-300",
    bg: "bg-blue-500/5",
    ring: "ring-blue-500/30",
    dot: "bg-blue-400",
    activeBg: "bg-blue-500/15",
    activeRing: "ring-blue-500",
  },
  material: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/5",
    ring: "ring-emerald-500/30",
    dot: "bg-emerald-400",
    activeBg: "bg-emerald-500/15",
    activeRing: "ring-emerald-500",
  },
  equipment: {
    text: "text-amber-300",
    bg: "bg-amber-500/5",
    ring: "ring-amber-500/30",
    dot: "bg-amber-400",
    activeBg: "bg-amber-500/15",
    activeRing: "ring-amber-500",
  },
};

const CAT_SHORT: Record<Category, string> = { labor: "NC", material: "VT", equipment: "MM" };

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
  profitMarginPct,
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
  // Single active branch — click outside collapses
  const [activeBranch, setActiveBranch] = useState<{ phase: PhaseCode; category: Category } | null>(null);
  // Modal: which task's sub-tasks are being edited
  const [breakdownModalLocal, setBreakdownModalLocal] = useState<string | null>(null);

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

  useEffect(() => {
    if (!activeBranch) return;
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-budget-modal]")) return;
      const sec = t.closest("[data-phase-section]") as HTMLElement | null;
      if (sec && sec.dataset.phaseSection === activeBranch!.phase) return;
      setActiveBranch(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [activeBranch]);

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

  const phaseStats = useMemo(() => {
    const m = new Map<string, { sum: number; count: number }>();
    for (const code of PHASE_CODES) {
      for (const cat of BUDGET_CATEGORIES) {
        m.set(`${code}|${cat}`, { sum: 0, count: 0 });
      }
    }
    for (const r of rows) {
      const key = `${r.phaseCode}|${r.category}`;
      const cur = m.get(key) ?? { sum: 0, count: 0 };
      m.set(key, {
        sum: cur.sum + Math.round(effectiveQty(r) * r.unitPrice),
        count: cur.count + 1,
      });
    }
    return m;
  }, [rows]);

  const rowsByKey = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const r of rows) {
      const key = `${r.phaseCode}|${r.category}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  const modalRow = useMemo(
    () => (breakdownModalLocal ? rows.find((r) => r._local === breakdownModalLocal) ?? null : null),
    [breakdownModalLocal, rows],
  );

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
    setActiveBranch({ phase: phaseCode, category });
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

  function toggleBranch(phase: PhaseCode, cat: Category) {
    setActiveBranch((prev) =>
      prev && prev.phase === phase && prev.category === cat ? null : { phase, category: cat },
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

  return (
    <div className="space-y-4">
      {/* Card chính: 1 card tổng thông số + actions */}
      <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#0f1220] p-4 ring-1 ring-orange-500/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-orange-400/80">Dự toán công trình</div>
            <div className="mt-1 text-2xl font-bold text-[#f0f2ff] sm:text-3xl">{fmtVND(totals.total)}đ</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {data?.budget ? (
                locked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Đã chốt
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-medium text-amber-300 ring-1 ring-amber-500/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Bản nháp
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#252840] px-2.5 py-0.5 font-medium text-[#8892b0]">
                  Chưa lập
                </span>
              )}
              {contractValue !== null && contractValue > 0 && (
                <span className="text-[#8892b0]">
                  · {((totals.total / contractValue) * 100).toFixed(1)}% giá trị HĐ ({fmtVND(contractValue)}đ)
                </span>
              )}
              {data?.budget?.lockedAt && (
                <span className="text-[#8892b0]">
                  · Chốt bởi {data.budget.lockedBy?.fullName} · {new Date(data.budget.lockedAt).toLocaleDateString("vi-VN")}
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

        {/* 3 mini stats NC/VT/MM ngay trong card chính */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {BUDGET_CATEGORIES.map((cat) => {
            const sum = totals[cat === "labor" ? "labor" : cat === "material" ? "material" : "equipment"];
            const pct = totals.total > 0 ? (sum / totals.total) * 100 : 0;
            const t = CAT_TONE[cat];
            return (
              <div key={cat} className={`rounded-xl ${t.bg} p-3 ring-1 ${t.ring}`}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-[#8892b0]">{CATEGORY_LABEL[cat]}</div>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${t.text} bg-[#0f1220]`}>
                    {CAT_SHORT[cat]}
                  </span>
                </div>
                <div className={`mt-1.5 text-base font-bold ${t.text} sm:text-lg`}>{fmtVND(sum)}đ</div>
                <div className="mt-1 text-[10px] text-[#5a6080]">{pct.toFixed(1)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Banner ngân sách dự toán (chi phí cho phép) */}
      {contractValue && profitMarginPct !== null && (() => {
        const cap = Math.round(contractValue * (1 - profitMarginPct / 100));
        const used = totals.total;
        const remaining = cap - used;
        const pct = cap > 0 ? (used / cap) * 100 : 0;
        const over = used > cap;
        const warn = !over && pct >= 90;
        const tone = over
          ? { bg: "bg-rose-500/15", ring: "ring-rose-500/40", text: "text-rose-300", bar: "bg-rose-500" }
          : warn
            ? { bg: "bg-amber-500/15", ring: "ring-amber-500/40", text: "text-amber-300", bar: "bg-amber-500" }
            : { bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", text: "text-emerald-300", bar: "bg-emerald-500" };
        return (
          <div className={`rounded-xl ${tone.bg} p-3 ring-1 ${tone.ring}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${tone.text}`}>
                  {over ? "⚠ Vượt ngân sách" : warn ? "⚠ Sắp chạm ngân sách" : "Ngân sách dự toán"}
                </div>
                <div className="mt-0.5 text-xs text-[#c0c8e0]">
                  Biên LN <span className={`font-semibold ${tone.text}`}>{profitMarginPct}%</span> · Trần chi phí{" "}
                  <span className={`font-bold ${tone.text}`}>{fmtVND(cap)}đ</span> ({(100 - profitMarginPct).toFixed(0)}% HD)
                </div>
              </div>
              <div className="text-right">
                <div className={`text-base font-bold ${tone.text}`}>
                  {over ? "+" : ""}{fmtVND(Math.abs(remaining))}đ
                </div>
                <div className="text-[10px] text-[#8892b0]">{over ? "vượt trần" : "còn lại"}</div>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0f1220] ring-1 ring-[#252840]">
              <div
                className={`h-full ${tone.bar} transition-all`}
                style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-[#5a6080]">
              <span>Đã lập: {fmtVND(used)}đ ({pct.toFixed(1)}%)</span>
              <span>Trần: {fmtVND(cap)}đ</span>
            </div>
          </div>
        );
      })()}

      {/* 9 card giai đoạn */}
      <div className="space-y-1.5">
        {PHASE_CODES.map((phase) => {
          const phaseTotal = BUDGET_CATEGORIES.reduce(
            (s, cat) => s + (phaseStats.get(`${phase}|${cat}`)?.sum ?? 0),
            0,
          );
          const phaseCount = BUDGET_CATEGORIES.reduce(
            (s, cat) => s + (phaseStats.get(`${phase}|${cat}`)?.count ?? 0),
            0,
          );
          const activeCat = activeBranch?.phase === phase ? activeBranch.category : null;

          return (
            <section
              key={phase}
              data-phase-section={phase}
              className="rounded-xl border border-[#252840] bg-[#1a1d2e]"
            >
              {/* Phase header */}
              <div className="flex items-center justify-between gap-2 border-b border-[#252840] px-2.5 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-mono font-bold text-orange-300 ring-1 ring-orange-500/30">
                    {phase}
                  </span>
                  <span className="truncate text-xs font-semibold text-[#f0f2ff]">
                    {PHASE_CODE_LABEL[phase].replace(/^\d+\s*·\s*/, "")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-[11px]">
                  <span className="text-[#5a6080]">{phaseCount} hm</span>
                  <span className="font-semibold text-orange-300">{fmtVND(phaseTotal)}đ</span>
                </div>
              </div>

              {/* 3 nhánh NC / VT / MM */}
              <div className="grid grid-cols-3 gap-1.5 p-1.5">
                {BUDGET_CATEGORIES.map((cat) => {
                  const st = phaseStats.get(`${phase}|${cat}`) ?? { sum: 0, count: 0 };
                  const active = activeCat === cat;
                  const t = CAT_TONE[cat];
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleBranch(phase, cat)}
                      className={`flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5 text-left transition ring-1 ${
                        active ? `${t.activeBg} ring-2 ${t.activeRing}` : `${t.bg} ${t.ring} hover:ring-2`
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${t.text}`}>
                          {CAT_SHORT[cat]}
                        </span>
                        <span className="text-[9px] text-[#5a6080]">{st.count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-bold ${t.text}`}>{fmtVND(st.sum)}đ</span>
                        <span className={`text-[9px] ${active ? "text-white" : "text-[#5a6080]"}`}>
                          {active ? "▴" : "▾"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Expanded task list */}
              {activeCat && (
                <BranchTasks
                  phase={phase}
                  category={activeCat}
                  rows={rowsByKey.get(`${phase}|${activeCat}`) ?? []}
                  readOnly={readOnly}
                  onAdd={() => addRow(activeCat, phase)}
                  onUpdate={(local, patch) => updateRow(local, patch)}
                  onRemove={(local) => removeRow(local)}
                  onOpenBreakdown={(local) => setBreakdownModalLocal(local)}
                />
              )}
            </section>
          );
        })}
      </div>

      {!readOnly && (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
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
                placeholder="VD: Chủ nhà yêu cầu bổ sung lan can…"
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
                    onClick={() => addAmendmentRow("labor", "02")}
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

      {/* Modal sub-task */}
      {modalRow && (
        <BreakdownModal
          row={modalRow}
          readOnly={readOnly}
          onClose={() => setBreakdownModalLocal(null)}
          onAdd={() => addBreakdownToRow(modalRow._local!)}
          onUpdate={(bLocal, patch) => updateBreakdown(modalRow._local!, bLocal, patch)}
          onRemove={(bLocal) => removeBreakdown(modalRow._local!, bLocal)}
        />
      )}
    </div>
  );
}

type BranchTasksProps = {
  phase: PhaseCode;
  category: Category;
  rows: ItemRow[];
  readOnly: boolean;
  onAdd: () => void;
  onUpdate: (local: string, patch: Partial<ItemRow>) => void;
  onRemove: (local: string) => void;
  onOpenBreakdown: (local: string) => void;
};

function BranchTasks({ phase, category, rows, readOnly, onAdd, onUpdate, onRemove, onOpenBreakdown }: BranchTasksProps) {
  const t = CAT_TONE[category];
  return (
    <div className={`border-t border-[#252840] ${t.bg} px-3 py-3`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-[#8892b0]">
          <span className={t.text}>{CAT_SHORT[category]}</span> trong{" "}
          <span className="text-[#c0c8e0]">{phase} {PHASE_CODE_SHORT[phase]}</span> — {rows.length} hạng mục
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#252840] bg-[#0f1220]/50 px-3 py-4 text-center text-xs text-[#5a6080]">
          Chưa có hạng mục.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <TaskRow
              key={r._local}
              row={r}
              readOnly={readOnly}
              onUpdate={(patch) => onUpdate(r._local!, patch)}
              onRemove={() => onRemove(r._local!)}
              onOpenBreakdown={() => onOpenBreakdown(r._local!)}
            />
          ))}
        </div>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={onAdd}
          className={`mt-2 w-full rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium ${t.text} ${t.ring} ${t.bg} hover:opacity-90`}
        >
          + Thêm hạng mục {CAT_SHORT[category]} vào {PHASE_CODE_SHORT[phase]}
        </button>
      )}
    </div>
  );
}

type TaskRowProps = {
  row: ItemRow;
  readOnly: boolean;
  onUpdate: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
  onOpenBreakdown: () => void;
};

function TaskRow({ row, readOnly, onUpdate, onRemove, onOpenBreakdown }: TaskRowProps) {
  const hasBreakdown = row.breakdown.length > 0;
  const qty = effectiveQty(row);
  const amount = Math.round(qty * row.unitPrice);

  return (
    <div className="rounded-lg bg-[#0f1220] p-2 ring-1 ring-[#252840]">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenBreakdown}
          className={`shrink-0 grid h-7 w-7 place-items-center rounded text-xs ${
            hasBreakdown
              ? "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/40"
              : "bg-[#1a1d2e] text-[#5a6080] ring-1 ring-[#252840] hover:text-orange-300"
          }`}
          title={hasBreakdown ? `${row.breakdown.length} công tác con` : "Mở để thêm công tác con"}
        >
          {hasBreakdown ? row.breakdown.length : "+"}
        </button>
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <button
              type="button"
              onClick={onOpenBreakdown}
              className="block w-full truncate text-left text-sm font-medium text-[#f0f2ff] hover:text-orange-300"
            >
              {row.name || "(chưa có tên)"}
            </button>
          ) : (
            <input
              className="w-full rounded bg-[#1a1d2e] px-2 py-1 text-sm font-medium text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
              value={row.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Tên hạng mục"
            />
          )}
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded bg-rose-500/10 px-1.5 py-1 text-[10px] font-medium text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/20"
            title="Xóa hạng mục"
          >
            ×
          </button>
        )}
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5">
        <Cell label="ĐV">
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
        </Cell>
        <Cell label={hasBreakdown ? "KL (tự cộng)" : "KL"}>
          {readOnly || hasBreakdown ? (
            <span
              className={`text-xs ${hasBreakdown ? "text-orange-300" : "text-[#f0f2ff]"}`}
              title={hasBreakdown ? "Tự cộng từ công tác con" : undefined}
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
        </Cell>
        <Cell label="Đơn giá">
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
        </Cell>
        <Cell label="Thành tiền" emphasize>
          <span className="text-xs font-semibold text-orange-300">{fmtVND(amount)}đ</span>
        </Cell>
      </div>
    </div>
  );
}

function Cell({ label, children, emphasize }: { label: string; children: React.ReactNode; emphasize?: boolean }) {
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

type BreakdownModalProps = {
  row: ItemRow;
  readOnly: boolean;
  onClose: () => void;
  onAdd: () => void;
  onUpdate: (bLocal: string, patch: Partial<BreakdownRow>) => void;
  onRemove: (bLocal: string) => void;
};

function BreakdownModal({ row, readOnly, onClose, onAdd, onUpdate, onRemove }: BreakdownModalProps) {
  const qty = effectiveQty(row);
  const amount = Math.round(qty * row.unitPrice);
  return (
    <div
      data-budget-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-[#252840] bg-[#1a1d2e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#252840] p-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-[#5a6080]">
              Công tác con · {row.phaseCode} {PHASE_CODE_SHORT[row.phaseCode]} · {CATEGORY_LABEL[row.category]}
            </div>
            <div className="mt-0.5 truncate text-base font-semibold text-[#f0f2ff]">{row.name || "(chưa có tên)"}</div>
            <div className="mt-1 text-xs text-[#8892b0]">
              Tổng KL: <span className="font-semibold text-orange-300">{qty}</span> {row.unit} · Thành tiền:{" "}
              <span className="font-semibold text-orange-300">{fmtVND(amount)}đ</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded bg-[#0f1220] px-2 py-1 text-sm text-[#8892b0] ring-1 ring-[#252840] hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          {row.breakdown.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[#252840] bg-[#0f1220] px-3 py-6 text-center text-xs text-[#5a6080]">
              Chưa có công tác con. Nhập trực tiếp KL ở dòng cha, hoặc thêm con bên dưới.
            </div>
          ) : (
            <div className="space-y-1.5">
              {row.breakdown.map((b, idx) => (
                <div key={b._local} className="rounded-lg bg-[#0f1220] p-2 ring-1 ring-[#252840]">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-[10px] text-[#5a6080]">#{idx + 1}</span>
                    {readOnly ? (
                      <span className="flex-1 truncate text-sm text-[#f0f2ff]">{b.name}</span>
                    ) : (
                      <input
                        className="flex-1 rounded bg-[#1a1d2e] px-2 py-1 text-sm text-[#f0f2ff] outline-none ring-1 ring-[#252840] focus:ring-orange-500"
                        value={b.name}
                        onChange={(e) => onUpdate(b._local, { name: e.target.value })}
                        placeholder="Tên công tác con (VD: Trục A / Cọc 1)"
                      />
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => onRemove(b._local)}
                        className="shrink-0 rounded bg-rose-500/10 px-2 py-1 text-xs text-rose-300 ring-1 ring-rose-500/30 hover:bg-rose-500/20"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <div className="rounded bg-[#1a1d2e] px-2 py-1 ring-1 ring-[#252840]">
                      <div className="text-[9px] uppercase tracking-wide text-[#5a6080]">Khối lượng</div>
                      {readOnly ? (
                        <div className="text-right text-xs text-[#f0f2ff]">{b.quantity} {row.unit}</div>
                      ) : (
                        <input
                          type="number"
                          step="0.001"
                          className="w-full bg-transparent text-right text-xs text-[#f0f2ff] outline-none"
                          value={b.quantity || ""}
                          onChange={(e) => onUpdate(b._local, { quantity: Number(e.target.value) || 0 })}
                        />
                      )}
                    </div>
                    <div className="rounded bg-[#1a1d2e] px-2 py-1 ring-1 ring-[#252840]">
                      <div className="text-[9px] uppercase tracking-wide text-[#5a6080]">Ghi chú</div>
                      {readOnly ? (
                        <div className="text-[11px] text-[#8892b0]">{b.note || "—"}</div>
                      ) : (
                        <input
                          className="w-full bg-transparent text-[11px] text-[#f0f2ff] outline-none"
                          value={b.note ?? ""}
                          onChange={(e) => onUpdate(b._local, { note: e.target.value })}
                          placeholder="(tuỳ chọn)"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!readOnly && (
            <button
              type="button"
              onClick={onAdd}
              className="mt-2 w-full rounded-lg border border-dashed border-orange-500/40 bg-orange-500/5 px-3 py-2 text-xs font-medium text-orange-300 hover:bg-orange-500/10"
            >
              + Thêm công tác con
            </button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#252840] p-3">
          <Button onClick={onClose}>Xong</Button>
        </div>
      </div>
    </div>
  );
}
