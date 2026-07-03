"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  BUDGET_STAGES,
  STAGE_LABEL,
  STAGE_DESCRIPTION,
  type BudgetStageCode,
} from "@/lib/project-budget";
import type { UserRole } from "@prisma/client";

type Status = "draft" | "locked";

type Component = {
  id: string;
  stage: BudgetStageCode;
  name: string;
  floor: string | null;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type Item = {
  id: string;
  componentId: string | null;
  stage: BudgetStageCode | null;
  name: string;
  unit: string;
  quantity: number;
  laborUnitPrice: number;
  laborAmount: number;
  materialUnitPrice: number;
  materialAmount: number;
  equipmentUnitPrice: number;
  equipmentAmount: number;
  amount: number;
  note: string | null;
  sortRank: number;
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
  items: Item[];
};

type ApiResponse = {
  project: { id: string; code: string; name: string; customerName: string; contractValue: number | null };
  components: Component[];
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

function fmtVND(value: number) {
  return value.toLocaleString("vi-VN");
}

const STAGE_TONE: Record<BudgetStageCode, { text: string; bg: string; ring: string; activeBg: string }> = {
  CB: { text: "text-sky-300",     bg: "bg-sky-500/10",     ring: "ring-sky-500/30",     activeBg: "bg-sky-500/20" },
  N:  { text: "text-amber-300",   bg: "bg-amber-500/10",   ring: "ring-amber-500/30",   activeBg: "bg-amber-500/20" },
  T:  { text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", activeBg: "bg-emerald-500/20" },
  HT: { text: "text-violet-300",  bg: "bg-violet-500/10",  ring: "ring-violet-500/30",  activeBg: "bg-violet-500/20" },
};

export function ProjectBudgetClient({
  projectId,
  contractValue,
  profitMarginPct,
  canEdit,
  canLock,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [view, setView] = useState<"overview" | BudgetStageCode>("overview");
  const [openCompId, setOpenCompId] = useState<string | null>(null);
  const activeStage: BudgetStageCode = view === "overview" ? "N" : view;

  // forms
  const [addingCompStage, setAddingCompStage] = useState<BudgetStageCode | null>(null);
  const [newCompName, setNewCompName] = useState("");
  const [newCompFloor, setNewCompFloor] = useState("");

  const [editingComp, setEditingComp] = useState<string | null>(null);
  const [editCompName, setEditCompName] = useState("");
  const [editCompFloor, setEditCompFloor] = useState("");

  const [addingItemComp, setAddingItemComp] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);

  const [savingFlag, setSavingFlag] = useState(false);

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
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const locked = data?.budget?.status === "locked";
  const readOnly = !canEdit || locked;

  const components = data?.components ?? [];
  const items = data?.budget?.items ?? [];

  const itemsByComp = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      if (!it.componentId) continue;
      const arr = m.get(it.componentId) ?? [];
      arr.push(it);
      m.set(it.componentId, arr);
    }
    return m;
  }, [items]);

  const compTotals = useMemo(() => {
    const m = new Map<string, { labor: number; material: number; equipment: number; total: number; count: number }>();
    itemsByComp.forEach((arr, cid) => {
      let l = 0, mt = 0, e = 0;
      for (const it of arr) { l += it.laborAmount; mt += it.materialAmount; e += it.equipmentAmount; }
      m.set(cid, { labor: l, material: mt, equipment: e, total: l + mt + e, count: arr.length });
    });
    return m;
  }, [itemsByComp]);

  const stageTotals = useMemo(() => {
    const m = new Map<BudgetStageCode, { labor: number; material: number; equipment: number; total: number; compCount: number; itemCount: number }>();
    for (const s of BUDGET_STAGES) m.set(s, { labor: 0, material: 0, equipment: 0, total: 0, compCount: 0, itemCount: 0 });
    for (const c of components) {
      const t = m.get(c.stage)!;
      t.compCount += 1;
      const ct = compTotals.get(c.id);
      if (ct) {
        t.labor += ct.labor; t.material += ct.material; t.equipment += ct.equipment;
        t.total += ct.total; t.itemCount += ct.count;
      }
    }
    return m;
  }, [components, compTotals]);

  const grandTotal = useMemo(() => {
    let l = 0, mt = 0, e = 0;
    for (const it of items) { l += it.laborAmount; mt += it.materialAmount; e += it.equipmentAmount; }
    return { labor: l, material: mt, equipment: e, total: l + mt + e };
  }, [items]);

  const stageComponents = useMemo(
    () => components.filter((c) => c.stage === activeStage).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)),
    [components, activeStage],
  );

  const openComp = openCompId ? components.find((c) => c.id === openCompId) ?? null : null;

  async function createComponent() {
    if (!addingCompStage || !newCompName.trim()) return;
    setSavingFlag(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: addingCompStage,
          name: newCompName.trim(),
          floor: newCompFloor.trim() || null,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.message || "Tạo cấu kiện thất bại"); return; }
      toast.success("Đã thêm cấu kiện");
      setAddingCompStage(null); setNewCompName(""); setNewCompFloor("");
      await load();
    } finally { setSavingFlag(false); }
  }

  function startEditComponent(c: Component) {
    setEditingComp(c.id); setEditCompName(c.name); setEditCompFloor(c.floor ?? "");
  }

  async function saveEditComponent() {
    if (!editingComp || !editCompName.trim()) return;
    setSavingFlag(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget/components/${editingComp}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editCompName.trim(), floor: editCompFloor.trim() || null }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.message || "Sửa thất bại"); return; }
      toast.success("Đã sửa");
      setEditingComp(null);
      await load();
    } finally { setSavingFlag(false); }
  }

  async function deleteComponent(c: Component) {
    const its = itemsByComp.get(c.id) ?? [];
    const msg = its.length > 0
      ? `Xóa cấu kiện "${c.name}"? Cấu kiện đang có ${its.length} công tác — phải xóa hết công tác trước.`
      : `Xóa cấu kiện "${c.name}"?`;
    if (!await confirmDialog(msg)) return;
    setSavingFlag(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget/components/${c.id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.message || "Xóa thất bại"); return; }
      toast.success("Đã xóa");
      await load();
    } finally { setSavingFlag(false); }
  }

  async function deleteItem(it: Item) {
    if (!await confirmDialog(`Xóa công tác "${it.name}" (${fmtVND(it.amount)}đ)?`)) return;
    setSavingFlag(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/budget/items/${it.id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.message || "Xóa thất bại"); return; }
      toast.success("Đã xóa");
      await load();
    } finally { setSavingFlag(false); }
  }

  async function lockBudget() {
    if (!canLock || locked) return;
    if (!await confirmDialog("Chốt dự toán? Sau khi chốt sẽ không thể sửa trực tiếp.")) return;
    const res = await fetch(`/api/projects/${projectId}/budget/lock`, { method: "POST" });
    if (!res.ok) { const err = await res.json().catch(() => ({})); toast.error(err.message || "Chốt thất bại"); return; }
    toast.success("Đã chốt dự toán");
    await load();
  }

  if (loading) {
    return <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-sm text-[#8892b0]">Đang tải dự toán…</div>;
  }

  return (
    <div className="space-y-4">
      {/* OVERVIEW: header tổng + 4 stage cards lớn */}
      {view === "overview" && (
        <>
          <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#0f1220] p-4 ring-1 ring-orange-500/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-orange-400/80">Dự toán giá vốn · theo cấu kiện</div>
                <div className="mt-1 text-2xl font-bold text-[#f0f2ff] sm:text-3xl">{fmtVND(grandTotal.total)}đ</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {data?.budget ? (locked ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 font-medium text-emerald-300 ring-1 ring-emerald-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Đã chốt
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 font-medium text-amber-300 ring-1 ring-amber-500/30">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Bản nháp
                    </span>
                  )) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#252840] px-2.5 py-0.5 font-medium text-[#8892b0]">Chưa lập</span>
                  )}
                  {contractValue !== null && contractValue > 0 && (
                    <span className="text-[#8892b0]">· {((grandTotal.total / contractValue) * 100).toFixed(1)}% giá trị HĐ ({fmtVND(contractValue)}đ)</span>
                  )}
                  {profitMarginPct !== null && profitMarginPct > 0 && (
                    <span className="text-[#8892b0]">· LN mục tiêu {profitMarginPct.toFixed(0)}%</span>
                  )}
                  {data?.budget?.lockedAt && (
                    <span className="text-[#8892b0]">· Chốt bởi {data.budget.lockedBy?.fullName} · {new Date(data.budget.lockedAt).toLocaleDateString("vi-VN")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canLock && !locked && data?.budget && (
                  <Button onClick={lockBudget} size="sm" className="bg-emerald-600 hover:bg-emerald-500">Chốt dự toán</Button>
                )}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-blue-500/10 p-2 ring-1 ring-blue-500/20">
                <div className="text-[10px] uppercase text-blue-300/70">Nhân công</div>
                <div className="mt-0.5 font-semibold text-blue-200">{fmtVND(grandTotal.labor)}đ</div>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2 ring-1 ring-emerald-500/20">
                <div className="text-[10px] uppercase text-emerald-300/70">Vật tư</div>
                <div className="mt-0.5 font-semibold text-emerald-200">{fmtVND(grandTotal.material)}đ</div>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2 ring-1 ring-amber-500/20">
                <div className="text-[10px] uppercase text-amber-300/70">Máy móc</div>
                <div className="mt-0.5 font-semibold text-amber-200">{fmtVND(grandTotal.equipment)}đ</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BUDGET_STAGES.map((s) => {
            const t = stageTotals.get(s)!;
            const tone = STAGE_TONE[s];
            return (
              <button
                key={s}
                onClick={() => setView(s)}
                className={`group rounded-2xl border border-[#252840] bg-[#1a1d2e] p-5 text-left transition hover:border-transparent hover:${tone.activeBg} hover:ring-2 hover:${tone.ring}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center rounded-lg ${tone.bg} px-2 py-0.5 text-xs font-bold ${tone.text} ring-1 ${tone.ring}`}>
                        {s}
                      </span>
                      <span className="text-base font-semibold text-[#f0f2ff]">{STAGE_LABEL[s]}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[#8892b0]">{STAGE_DESCRIPTION[s]}</p>
                    <div className="mt-3 text-[11px] text-[#8892b0]">{t.compCount} cấu kiện · {t.itemCount} công tác</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xl font-bold text-[#f0f2ff]">{fmtVND(t.total)}<span className="text-sm">đ</span></div>
                    <div className="mt-2 space-y-0.5 text-[10px]">
                      <div className="text-blue-300">NC <span className="font-semibold">{fmtVND(t.labor)}</span></div>
                      <div className="text-emerald-300">VT <span className="font-semibold">{fmtVND(t.material)}</span></div>
                      <div className="text-amber-300">MM <span className="font-semibold">{fmtVND(t.equipment)}</span></div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1 text-xs text-[#8892b0] transition group-hover:text-[#f0f2ff]">
                  Mở chi tiết <span className="transition group-hover:translate-x-0.5">→</span>
                </div>
              </button>
            );
          })}
          </div>
        </>
      )}

      {/* STAGE LIST: header back về overview + grid card cấu kiện */}
      {view !== "overview" && !openComp && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-2">
            <button
              type="button"
              onClick={() => setView("overview")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#252840] px-3 py-1.5 text-xs font-medium text-[#f0f2ff] hover:bg-[#2f334a]"
            >
              ← Quay lại tổng quan
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className={`inline-flex items-center justify-center rounded-md ${STAGE_TONE[activeStage].bg} px-2 py-0.5 font-bold ${STAGE_TONE[activeStage].text} ring-1 ${STAGE_TONE[activeStage].ring}`}>
                {activeStage}
              </span>
              <span className="text-sm font-semibold text-[#f0f2ff]">{STAGE_LABEL[activeStage]}</span>
              <span className="text-[#8892b0]">·</span>
              <span className="font-bold text-[#f0f2ff]">{fmtVND(stageTotals.get(activeStage)!.total)}đ</span>
            </div>
          </div>

          <div className="rounded-xl bg-[#1a1d2e] px-3 py-2 text-xs text-[#8892b0] ring-1 ring-[#252840]">
            {STAGE_DESCRIPTION[activeStage]}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {stageComponents.length === 0 && addingCompStage !== activeStage && (
              <div className="col-span-full rounded-2xl border border-dashed border-[#252840] bg-[#1a1d2e]/50 p-6 text-center text-sm text-[#8892b0]">
                Chưa có cấu kiện cho stage <span className={STAGE_TONE[activeStage].text}>{STAGE_LABEL[activeStage]}</span>
              </div>
            )}

            {stageComponents.map((c) => {
              const ct = compTotals.get(c.id) ?? { labor: 0, material: 0, equipment: 0, total: 0, count: 0 };
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenCompId(c.id)}
                  className={`group rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 text-left transition hover:border-transparent hover:${STAGE_TONE[c.stage].activeBg} hover:ring-2 hover:${STAGE_TONE[c.stage].ring}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-[#f0f2ff]">{c.name}</span>
                        {c.floor && (
                          <span className="inline-flex items-center rounded bg-[#252840] px-1.5 py-0.5 text-[10px] font-medium text-[#8892b0]">
                            {c.floor}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-[#8892b0]">{ct.count} công tác</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-lg font-bold text-[#f0f2ff]">{fmtVND(ct.total)}<span className="text-xs">đ</span></div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
                    <div className="rounded-md bg-blue-500/10 px-2 py-1 ring-1 ring-blue-500/20">
                      <div className="text-blue-300/70">NC</div>
                      <div className="font-semibold text-blue-200">{fmtVND(ct.labor)}</div>
                    </div>
                    <div className="rounded-md bg-emerald-500/10 px-2 py-1 ring-1 ring-emerald-500/20">
                      <div className="text-emerald-300/70">VT</div>
                      <div className="font-semibold text-emerald-200">{fmtVND(ct.material)}</div>
                    </div>
                    <div className="rounded-md bg-amber-500/10 px-2 py-1 ring-1 ring-amber-500/20">
                      <div className="text-amber-300/70">MM</div>
                      <div className="font-semibold text-amber-200">{fmtVND(ct.equipment)}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-[#8892b0] transition group-hover:text-[#f0f2ff]">
                    Mở chi tiết <span className="transition group-hover:translate-x-0.5">→</span>
                  </div>
                </button>
              );
            })}

            {/* Add component form */}
            {addingCompStage === activeStage ? (
              <div className="col-span-full rounded-2xl border border-dashed border-orange-500/40 bg-[#1a1d2e] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={newCompName}
                    onChange={(e) => setNewCompName(e.target.value)}
                    placeholder="Tên cấu kiện (vd: Móng, Cột T1, Tường bao T2…)"
                    className="min-w-[200px] flex-1 rounded-md bg-[#0f1220] px-3 py-1.5 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:outline-none focus:ring-orange-500"
                    autoFocus
                  />
                  <input
                    value={newCompFloor}
                    onChange={(e) => setNewCompFloor(e.target.value)}
                    placeholder="Tầng (T1/T2/ST… để trống nếu không tầng)"
                    className="w-56 rounded-md bg-[#0f1220] px-3 py-1.5 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:outline-none focus:ring-orange-500"
                  />
                  <Button size="sm" onClick={createComponent} disabled={savingFlag || !newCompName.trim()} className="bg-orange-600 hover:bg-orange-500">Tạo</Button>
                  <Button size="sm" variant="outline" onClick={() => { setAddingCompStage(null); setNewCompName(""); setNewCompFloor(""); }}>Hủy</Button>
                </div>
              </div>
            ) : (
              !readOnly && (
                <button
                  type="button"
                  onClick={() => setAddingCompStage(activeStage)}
                  className="rounded-2xl border border-dashed border-[#252840] bg-[#1a1d2e]/30 p-4 text-sm text-[#8892b0] hover:border-orange-500/40 hover:bg-[#1a1d2e] hover:text-[#f0f2ff]"
                >
                  + Thêm cấu kiện vào {STAGE_LABEL[activeStage]}
                </button>
              )
            )}
          </div>
        </>
      )}

      {/* COMPONENT DETAIL: header back về stage + grid card công tác */}
      {view !== "overview" && openComp && (() => {
        const c = openComp;
        const ct = compTotals.get(c.id) ?? { labor: 0, material: 0, equipment: 0, total: 0, count: 0 };
        const its = itemsByComp.get(c.id) ?? [];
        const isEditingComp = editingComp === c.id;
        return (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-2">
              <button
                type="button"
                onClick={() => setOpenCompId(null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#252840] px-3 py-1.5 text-xs font-medium text-[#f0f2ff] hover:bg-[#2f334a]"
              >
                ← Quay lại {STAGE_LABEL[c.stage]}
              </button>
              <div className="flex items-center gap-2 text-xs">
                <span className={`inline-flex items-center justify-center rounded-md ${STAGE_TONE[c.stage].bg} px-2 py-0.5 font-bold ${STAGE_TONE[c.stage].text} ring-1 ${STAGE_TONE[c.stage].ring}`}>
                  {c.stage}
                </span>
                <span className="font-bold text-[#f0f2ff]">{fmtVND(ct.total)}đ</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#252840] bg-gradient-to-br from-[#1a1d2e] to-[#0f1220] p-4">
              {isEditingComp ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={editCompName}
                    onChange={(e) => setEditCompName(e.target.value)}
                    className="min-w-[200px] flex-1 rounded-md bg-[#0f1220] px-3 py-1.5 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:outline-none focus:ring-orange-500"
                    placeholder="Tên cấu kiện"
                  />
                  <input
                    value={editCompFloor}
                    onChange={(e) => setEditCompFloor(e.target.value)}
                    className="w-28 rounded-md bg-[#0f1220] px-3 py-1.5 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:outline-none focus:ring-orange-500"
                    placeholder="Tầng"
                  />
                  <Button size="sm" onClick={saveEditComponent} disabled={savingFlag} className="bg-emerald-600 hover:bg-emerald-500">Lưu</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingComp(null)}>Hủy</Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold text-[#f0f2ff]">{c.name}</span>
                      {c.floor && (
                        <span className="inline-flex items-center rounded bg-[#252840] px-2 py-0.5 text-xs font-medium text-[#8892b0]">{c.floor}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[#8892b0]">{ct.count} công tác · Tổng <span className="font-semibold text-[#f0f2ff]">{fmtVND(ct.total)}đ</span></div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-blue-500/10 p-2 ring-1 ring-blue-500/20">
                        <div className="text-[10px] uppercase text-blue-300/70">Nhân công</div>
                        <div className="font-semibold text-blue-200">{fmtVND(ct.labor)}đ</div>
                      </div>
                      <div className="rounded-lg bg-emerald-500/10 p-2 ring-1 ring-emerald-500/20">
                        <div className="text-[10px] uppercase text-emerald-300/70">Vật tư</div>
                        <div className="font-semibold text-emerald-200">{fmtVND(ct.material)}đ</div>
                      </div>
                      <div className="rounded-lg bg-amber-500/10 p-2 ring-1 ring-amber-500/20">
                        <div className="text-[10px] uppercase text-amber-300/70">Máy móc</div>
                        <div className="font-semibold text-amber-200">{fmtVND(ct.equipment)}đ</div>
                      </div>
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditComponent(c)}
                        className="rounded-md p-2 text-sm text-[#8892b0] hover:bg-[#252840] hover:text-[#f0f2ff]"
                        title="Sửa cấu kiện"
                      >✎</button>
                      <button
                        type="button"
                        onClick={async () => { await deleteComponent(c); setOpenCompId(null); }}
                        className="rounded-md p-2 text-sm text-[#8892b0] hover:bg-rose-500/20 hover:text-rose-300"
                        title="Xóa cấu kiện"
                      >✕</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Item cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {its.length === 0 && addingItemComp !== c.id && (
                <div className="col-span-full rounded-2xl border border-dashed border-[#252840] bg-[#1a1d2e]/50 p-6 text-center text-sm text-[#8892b0]">
                  Chưa có công tác. {!readOnly && "Bấm + để thêm."}
                </div>
              )}

              {its.map((it) => (
                editingItem === it.id ? (
                  <div key={it.id} className="col-span-full">
                    <ItemEditForm
                      projectId={projectId}
                      componentId={c.id}
                      item={it}
                      onDone={async () => { setEditingItem(null); await load(); }}
                      onCancel={() => setEditingItem(null)}
                    />
                  </div>
                ) : (
                  <div key={it.id} className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[#f0f2ff]">{it.name}</div>
                        {it.note && <div className="mt-0.5 text-[11px] text-[#8892b0]">{it.note}</div>}
                        <div className="mt-1 text-[11px] text-[#8892b0]">
                          KL: <span className="font-semibold text-[#f0f2ff]">{it.quantity.toLocaleString("vi-VN")}</span> {it.unit}
                        </div>
                      </div>
                      {!readOnly && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button onClick={() => setEditingItem(it.id)} className="rounded p-1 text-[#8892b0] hover:bg-[#252840] hover:text-[#f0f2ff]" title="Sửa">✎</button>
                          <button onClick={() => deleteItem(it)} className="rounded p-1 text-[#8892b0] hover:bg-rose-500/20 hover:text-rose-300" title="Xóa">✕</button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
                      <div className="rounded-md bg-blue-500/10 px-2 py-1.5 ring-1 ring-blue-500/20">
                        <div className="text-blue-300/70">NC /{it.unit}</div>
                        <div className="font-semibold text-blue-200">{fmtVND(it.laborUnitPrice)}</div>
                      </div>
                      <div className="rounded-md bg-emerald-500/10 px-2 py-1.5 ring-1 ring-emerald-500/20">
                        <div className="text-emerald-300/70">VT /{it.unit}</div>
                        <div className="font-semibold text-emerald-200">{fmtVND(it.materialUnitPrice)}</div>
                      </div>
                      <div className="rounded-md bg-amber-500/10 px-2 py-1.5 ring-1 ring-amber-500/20">
                        <div className="text-amber-300/70">MM /{it.unit}</div>
                        <div className="font-semibold text-amber-200">{fmtVND(it.equipmentUnitPrice)}</div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-[#252840] pt-2">
                      <span className="text-[11px] text-[#8892b0]">Thành tiền</span>
                      <span className="text-sm font-bold text-[#f0f2ff]">{fmtVND(it.amount)}đ</span>
                    </div>
                  </div>
                )
              ))}

              {addingItemComp === c.id ? (
                <div className="col-span-full">
                  <ItemEditForm
                    projectId={projectId}
                    componentId={c.id}
                    item={null}
                    onDone={async () => { setAddingItemComp(null); await load(); }}
                    onCancel={() => setAddingItemComp(null)}
                  />
                </div>
              ) : (
                !readOnly && (
                  <button
                    type="button"
                    onClick={() => setAddingItemComp(c.id)}
                    className="rounded-2xl border border-dashed border-[#252840] bg-[#1a1d2e]/30 p-4 text-sm text-[#8892b0] hover:border-orange-500/40 hover:bg-[#1a1d2e] hover:text-[#f0f2ff]"
                  >
                    + Thêm công tác
                  </button>
                )
              )}
            </div>
          </>
        );
      })()}

      {locked && (
        <div className="rounded-xl bg-emerald-500/5 p-3 text-xs text-emerald-200/80 ring-1 ring-emerald-500/20">
          Dự toán đã chốt — chỉ xem. Để chỉnh sửa phải tạo phiếu điều chỉnh (chức năng đang hoàn thiện).
        </div>
      )}
    </div>
  );
}

// ============================================================
// ItemEditForm: card block dùng cho cả add và edit công tác
// ============================================================
type ItemEditFormProps = {
  projectId: string;
  componentId: string;
  item: Item | null;
  onDone: () => Promise<void> | void;
  onCancel: () => void;
};

function ItemEditForm({ projectId, componentId, item, onDone, onCancel }: ItemEditFormProps) {
  const [name, setName] = useState(item?.name ?? "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [quantity, setQuantity] = useState<string>(item ? String(item.quantity) : "");
  const [labor, setLabor] = useState<string>(item ? String(item.laborUnitPrice) : "0");
  const [material, setMaterial] = useState<string>(item ? String(item.materialUnitPrice) : "0");
  const [equipment, setEquipment] = useState<string>(item ? String(item.equipmentUnitPrice) : "0");
  const [note, setNote] = useState(item?.note ?? "");
  const [saving, setSaving] = useState(false);

  const qty = Number(quantity) || 0;
  const lp = Number(labor) || 0;
  const mp = Number(material) || 0;
  const ep = Number(equipment) || 0;
  const total = Math.round(qty * lp) + Math.round(qty * mp) + Math.round(qty * ep);

  async function save() {
    if (!name.trim() || !unit.trim() || qty <= 0) {
      toast.error("Cần tên + đơn vị + khối lượng > 0");
      return;
    }
    setSaving(true);
    try {
      const url = item
        ? `/api/projects/${projectId}/budget/items/${item.id}`
        : `/api/projects/${projectId}/budget/items`;
      const method = item ? "PATCH" : "POST";
      const body = {
        ...(item ? {} : { componentId }),
        name: name.trim(),
        unit: unit.trim(),
        quantity: qty,
        laborUnitPrice: lp,
        materialUnitPrice: mp,
        equipmentUnitPrice: ep,
        note: note.trim() || null,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Lưu thất bại");
        return;
      }
      toast.success(item ? "Đã sửa" : "Đã thêm");
      await onDone();
    } finally { setSaving(false); }
  }

  const inputCls = "w-full rounded-md bg-[#0f1220] px-2.5 py-1.5 text-sm text-[#f0f2ff] ring-1 ring-[#252840] focus:outline-none focus:ring-orange-500";
  const labelCls = "mb-1 block text-[10px] uppercase tracking-wider text-[#8892b0]";

  return (
    <div className="rounded-2xl border border-orange-500/40 bg-orange-500/5 p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-orange-300">
        {item ? "Sửa công tác" : "Thêm công tác mới"}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Tên công tác</label>
          <input className={inputCls} placeholder="vd: Bê tông đá 1x2 mác 250" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div>
          <label className={labelCls}>Đơn vị</label>
          <input className={inputCls} placeholder="m3, m2, kg…" value={unit} onChange={(e) => setUnit(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Khối lượng</label>
          <input className={inputCls} placeholder="0" type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-blue-500/5 p-2 ring-1 ring-blue-500/20">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-blue-300/80">Đơn giá NC /{unit || "đv"}</label>
          <input className={`${inputCls} bg-[#0f1220]`} placeholder="0" type="number" value={labor} onChange={(e) => setLabor(e.target.value)} />
          <div className="mt-1 text-right text-[11px] text-blue-300">= {fmtVND(Math.round(qty * lp))}đ</div>
        </div>
        <div className="rounded-lg bg-emerald-500/5 p-2 ring-1 ring-emerald-500/20">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-emerald-300/80">Đơn giá VT /{unit || "đv"}</label>
          <input className={`${inputCls} bg-[#0f1220]`} placeholder="0" type="number" value={material} onChange={(e) => setMaterial(e.target.value)} />
          <div className="mt-1 text-right text-[11px] text-emerald-300">= {fmtVND(Math.round(qty * mp))}đ</div>
        </div>
        <div className="rounded-lg bg-amber-500/5 p-2 ring-1 ring-amber-500/20">
          <label className="mb-1 block text-[10px] uppercase tracking-wider text-amber-300/80">Đơn giá MM /{unit || "đv"}</label>
          <input className={`${inputCls} bg-[#0f1220]`} placeholder="0" type="number" value={equipment} onChange={(e) => setEquipment(e.target.value)} />
          <div className="mt-1 text-right text-[11px] text-amber-300">= {fmtVND(Math.round(qty * ep))}đ</div>
        </div>
      </div>

      <div className="mt-3">
        <label className={labelCls}>Ghi chú (tùy chọn)</label>
        <input className={inputCls} placeholder="Ghi chú thêm…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-orange-500/20 pt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-[#8892b0]">Thành tiền</div>
          <div className="text-lg font-bold text-[#f0f2ff]">{fmtVND(total)}đ</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onCancel}>Hủy</Button>
          <Button size="sm" onClick={save} disabled={saving} className={item ? "bg-emerald-600 hover:bg-emerald-500" : "bg-orange-600 hover:bg-orange-500"}>
            {saving ? "Đang lưu…" : item ? "Lưu" : "Thêm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
