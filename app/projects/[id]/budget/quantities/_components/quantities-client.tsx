"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { BudgetStage } from "@prisma/client";
import {
  STAGE_LABEL,
  STAGE_ORDER,
  SUGGESTED_COMPONENTS,
  type SuggestedComponent,
} from "@/lib/budget-suggested-components";

type Component = {
  id: string;
  stage: BudgetStage;
  name: string;
  floor: string | null;
  sortOrder: number;
  note: string | null;
};

type Item = {
  id: string;
  componentId: string;
  stage: BudgetStage;
  name: string;
  unit: string;
  quantity: number;
  note: string | null;
  sortRank: number;
  normCode: string | null;
  laborUnitPrice: number;
  materialUnitPrice: number;
  equipmentUnitPrice: number;
};

type NormSuggestion = {
  code: string;
  name: string;
  unit: string;
  category: string | null;
};

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  canEdit: boolean;
};

const UNIT_SUGGEST = ["m³", "m²", "md", "kg", "tấn", "công", "bộ", "cái", "viên", "lít"];

export function QuantitiesClient({ projectId, projectName, projectCode, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<BudgetStage>("T");
  const [components, setComponents] = useState<Component[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [normsByCode, setNormsByCode] = useState<Map<string, NormSuggestion>>(new Map());
  const [openComponentId, setOpenComponentId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{ componentId: string; item: Item | null } | null>(null);
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/norms`);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        const m = new Map<string, NormSuggestion>();
        for (const n of (data.norms ?? []) as NormSuggestion[]) {
          m.set(n.code, { code: n.code, name: n.name, unit: n.unit, category: n.category ?? null });
        }
        setNormsByCode(m);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rs = await fetch(`/api/projects/${projectId}/budget`);
      if (!rs.ok) throw new Error("Tải dữ liệu thất bại");
      const ds = await rs.json();
      setComponents(ds.components ?? []);
      const rawItems = (ds.budget?.items ?? []) as Array<{
        id: string;
        componentId: string | null;
        stage: BudgetStage | null;
        name: string;
        unit: string;
        quantity: number;
        note: string | null;
        sortRank: number;
        normCode?: string | null;
        laborUnitPrice?: number;
        materialUnitPrice?: number;
        equipmentUnitPrice?: number;
      }>;
      setItems(
        rawItems
          .filter((it) => it.componentId !== null && it.stage !== null)
          .map((it) => ({
            id: it.id,
            componentId: it.componentId as string,
            stage: it.stage as BudgetStage,
            name: it.name,
            unit: it.unit,
            quantity: it.quantity,
            note: it.note,
            sortRank: it.sortRank,
            normCode: it.normCode ?? null,
            laborUnitPrice: it.laborUnitPrice ?? 0,
            materialUnitPrice: it.materialUnitPrice ?? 0,
            equipmentUnitPrice: it.equipmentUnitPrice ?? 0,
          })),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const componentsByStage = useMemo(() => {
    const map: Record<BudgetStage, Component[]> = { CB: [], N: [], T: [], HT: [] };
    for (const c of components) map[c.stage].push(c);
    return map;
  }, [components]);

  const itemsByComponent = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const arr = map.get(it.componentId) ?? [];
      arr.push(it);
      map.set(it.componentId, arr);
    }
    map.forEach((arr) => arr.sort((a, b) => a.sortRank - b.sortRank));
    return map;
  }, [items]);

  const stageStats = useMemo(() => {
    const out: Record<BudgetStage, { components: number; items: number }> = {
      CB: { components: 0, items: 0 },
      N: { components: 0, items: 0 },
      T: { components: 0, items: 0 },
      HT: { components: 0, items: 0 },
    };
    for (const c of components) out[c.stage].components++;
    for (const it of items) out[it.stage].items++;
    return out;
  }, [components, items]);

  const visibleComponents = componentsByStage[stage];

  async function addComponent(name: string, floor: string | null, fromSuggested?: SuggestedComponent) {
    if (!canEdit) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, name, floor }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Tạo cấu kiện thất bại");
      }
      const j = await r.json();
      setComponents((prev) => [...prev, j.component]);
      toast.success("Đã thêm cấu kiện" + (fromSuggested ? " (gợi ý)" : ""));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tạo cấu kiện");
    }
  }

  async function patchComponent(c: Component, name: string, floor: string | null, note: string | null) {
    if (!canEdit) return;
    setSavingId(c.id);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/components/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, floor, note }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Sửa cấu kiện thất bại");
      }
      const j = await r.json();
      setComponents((prev) => prev.map((x) => (x.id === c.id ? j.component : x)));
      toast.success("Đã lưu cấu kiện");
      setEditingComponentId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi sửa cấu kiện");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteComponent(c: Component) {
    if (!canEdit) return;
    if (!window.confirm(`Xoá cấu kiện "${c.name}"?`)) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/components/${c.id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Xoá thất bại");
      }
      setComponents((prev) => prev.filter((x) => x.id !== c.id));
      toast.success("Đã xoá");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi xoá");
    }
  }

  async function saveItem(payload: {
    componentId: string;
    itemId: string | null;
    name: string;
    unit: string;
    quantity: number;
    note: string | null;
    normCode: string | null;
  }) {
    if (!canEdit) return;
    setSavingId(payload.itemId ?? "new");
    try {
      const url = payload.itemId
        ? `/api/projects/${projectId}/budget/items/${payload.itemId}`
        : `/api/projects/${projectId}/budget/items`;
      const method = payload.itemId ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          componentId: payload.componentId,
          name: payload.name,
          unit: payload.unit,
          quantity: payload.quantity,
          note: payload.note,
          normCode: payload.normCode,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Lưu công tác thất bại");
      }
      const j = await r.json();
      setItems((prev) => {
        if (payload.itemId) return prev.map((x) => (x.id === payload.itemId ? j.item : x));
        return [...prev, j.item];
      });
      toast.success("Đã lưu công tác");
      setEditingItem(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu công tác");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(it: Item) {
    if (!canEdit) return;
    if (!window.confirm(`Xoá công tác "${it.name}"?`)) return;
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/items/${it.id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Xoá thất bại");
      }
      setItems((prev) => prev.filter((x) => x.id !== it.id));
      toast.success("Đã xoá");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi xoá");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/projects/${projectId}/budget`}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          ← Dự toán
        </Link>
        <div className="text-right">
          <div className="text-xs text-zinc-500">{projectCode}</div>
          <h1 className="text-sm font-semibold text-zinc-100 sm:text-base">📐 Khối lượng — {projectName}</h1>
        </div>
      </div>

      {/* Stage tabs */}
      <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-[#252840] bg-[#1a1d2e] p-1.5">
        {STAGE_ORDER.map((s) => {
          const st = stageStats[s];
          const active = s === stage;
          return (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={`rounded-xl px-2 py-2 text-center transition ${active ? "bg-orange-500/20 ring-1 ring-orange-500/40" : "hover:bg-zinc-800/40"}`}
            >
              <div className={`text-[10px] font-medium uppercase tracking-wide ${active ? "text-orange-200" : "text-zinc-500"}`}>{s}</div>
              <div className={`mt-0.5 text-[11px] font-medium leading-tight ${active ? "text-zinc-100" : "text-zinc-300"}`}>{STAGE_LABEL[s]}</div>
              <div className="mt-1 text-[9.5px] text-zinc-500">
                {st.components} ck · {st.items} ct
              </div>
            </button>
          );
        })}
      </div>

      {/* Stage summary */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="text-xs text-zinc-400">
          <span className="text-zinc-200">Stage {stage} — {STAGE_LABEL[stage]}</span>
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {stageStats[stage].components} cấu kiện · {stageStats[stage].items} công tác
        </div>
      </div>

      {/* Add component buttons */}
      {canEdit && (
        <div className="flex gap-2">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex-1 rounded-xl border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
          >
            + Cấu kiện chuẩn (gợi ý SOP 47)
          </button>
          <button
            onClick={() => addComponent(`Cấu kiện ${stage}`, null)}
            className="rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            + Tự đặt tên
          </button>
        </div>
      )}

      {/* Components list */}
      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
          Đang tải…
        </div>
      ) : visibleComponents.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
          Chưa có cấu kiện ở stage {stage}. Bấm “+ Cấu kiện chuẩn” để thêm nhanh.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleComponents.map((c) => {
            const its = itemsByComponent.get(c.id) ?? [];
            const open = openComponentId === c.id;
            const editing = editingComponentId === c.id;
            return (
              <div key={c.id} className="overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e]">
                <button
                  type="button"
                  onClick={() => setOpenComponentId(open ? null : c.id)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left active:bg-zinc-800/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-zinc-100">
                      {c.name}
                      {c.floor && <span className="ml-1.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] text-sky-200">T{c.floor}</span>}
                    </div>
                    <div className="text-[10px] text-zinc-500">
                      {its.length === 0 ? "Chưa có công tác" : `${its.length} công tác`}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-zinc-500">{open ? "▲" : "▼"}</div>
                </button>

                {open && (
                  <div className="space-y-2 border-t border-[#252840] bg-zinc-950/30 px-3 py-3">
                    {/* Edit component header */}
                    {canEdit && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingComponentId(editing ? null : c.id)}
                          className="text-[11px] text-zinc-400 hover:text-zinc-200"
                        >
                          {editing ? "Đóng sửa" : "Sửa cấu kiện"}
                        </button>
                        <span className="text-zinc-700">·</span>
                        <button
                          onClick={() => deleteComponent(c)}
                          className="text-[11px] text-rose-400 hover:text-rose-300"
                        >
                          Xoá
                        </button>
                      </div>
                    )}
                    {editing && (
                      <ComponentForm
                        component={c}
                        saving={savingId === c.id}
                        onSave={(name, floor, note) => patchComponent(c, name, floor, note)}
                        onCancel={() => setEditingComponentId(null)}
                      />
                    )}

                    {/* Items list */}
                    {its.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-center text-[11px] text-zinc-500">
                        Chưa có công tác nào
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-[#252840]">
                        {its.map((it, idx) => (
                          <div key={it.id} className={`flex items-start justify-between gap-2 px-3 py-2 ${idx > 0 ? "border-t border-[#252840]" : ""}`}>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[12px] font-medium text-zinc-100">{it.name}</div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-500">
                                <span>{it.quantity.toLocaleString("vi-VN")} {it.unit}</span>
                                {it.normCode && (
                                  <span
                                    title={normsByCode.get(it.normCode)?.name ?? it.normCode}
                                    className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-300"
                                  >
                                    <span className="font-mono">ĐM {it.normCode}</span>
                                    {normsByCode.get(it.normCode) && (
                                      <span className="max-w-[180px] truncate text-sky-200/90">· {normsByCode.get(it.normCode)!.name}</span>
                                    )}
                                  </span>
                                )}
                                {it.note ? <span>· {it.note}</span> : null}
                              </div>
                            </div>
                            {canEdit && (
                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  onClick={() => setEditingItem({ componentId: c.id, item: it })}
                                  className="rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
                                >
                                  Sửa
                                </button>
                                <button
                                  onClick={() => deleteItem(it)}
                                  className="rounded-md border border-rose-500/40 px-2 py-0.5 text-[10px] text-rose-300 hover:bg-rose-500/10"
                                >
                                  Xoá
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {canEdit && (
                      <button
                        onClick={() => setEditingItem({ componentId: c.id, item: null })}
                        className="w-full rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-[11px] text-zinc-400 hover:bg-zinc-800/40"
                      >
                        + Thêm công tác
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Suggested picker */}
      {pickerOpen && (
        <SuggestedPicker
          stage={stage}
          existingNames={new Set(componentsByStage[stage].map((c) => c.name))}
          onPick={(sug) => addComponent(sug.name, null, sug)}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {/* Item form modal */}
      {canEdit && editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-[#252840] bg-[#1a1d2e] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <ItemForm
              initial={editingItem.item}
              componentId={editingItem.componentId}
              saving={savingId === (editingItem.item?.id ?? "new")}
              normsByCode={normsByCode}
              onSave={(name, unit, qty, note, normCode) =>
                saveItem({
                  componentId: editingItem.componentId,
                  itemId: editingItem.item?.id ?? null,
                  name,
                  unit,
                  quantity: qty,
                  note,
                  normCode,
                })
              }
              onCancel={() => setEditingItem(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentForm({
  component,
  saving,
  onSave,
  onCancel,
}: {
  component: Component;
  saving: boolean;
  onSave: (name: string, floor: string | null, note: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(component.name);
  const [floor, setFloor] = useState(component.floor ?? "");
  const [note, setNote] = useState(component.note ?? "");

  return (
    <div className="space-y-2 rounded-lg border border-[#252840] bg-zinc-900/40 p-3">
      <div>
        <label className="text-[10px] text-zinc-500">Tên cấu kiện</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-zinc-500">Tầng (tuỳ chọn)</label>
          <input
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="VD: T1, ST"
            className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Ghi chú</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
          Huỷ
        </button>
        <button
          disabled={saving || !name.trim()}
          onClick={() => onSave(name.trim(), floor.trim() || null, note.trim() || null)}
          className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
    </div>
  );
}

function ItemForm({
  initial,
  componentId,
  saving,
  normsByCode,
  onSave,
  onCancel,
}: {
  initial: Item | null;
  componentId: string;
  saving: boolean;
  normsByCode: Map<string, NormSuggestion>;
  onSave: (name: string, unit: string, qty: number, note: string | null, normCode: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "m³");
  const [qtyStr, setQtyStr] = useState(initial ? String(initial.quantity) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [normCode, setNormCode] = useState<string | null>(initial?.normCode ?? null);

  const [normQuery, setNormQuery] = useState("");
  const [normSuggests, setNormSuggests] = useState<NormSuggestion[]>([]);
  const [normLoading, setNormLoading] = useState(false);
  const [normPickerOpen, setNormPickerOpen] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!normPickerOpen) return;
    const q = normQuery.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      setNormLoading(true);
      try {
        const r = await fetch(`/api/norms${q ? `?q=${encodeURIComponent(q)}` : ""}`);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        setNormSuggests((data.norms ?? []).slice(0, 30));
      } finally {
        if (!cancelled) setNormLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [normQuery, normPickerOpen]);

  function pickNorm(n: NormSuggestion) {
    setNormCode(n.code);
    setUnit(n.unit);
    if (!name.trim()) setName(n.name);
    setNormPickerOpen(false);
  }

  const qtyNum = Number(qtyStr.replace(",", "."));
  const invalid = qtyStr.trim() === "" || !isFinite(qtyNum) || qtyNum < 0 || !name.trim() || !unit.trim();

  return (
    <div className="space-y-2 p-3">
      <div>
        <label className="text-[10px] text-zinc-500">Tên công tác</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Đổ bê tông cột"
          className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </div>

      <div>
        <label className="text-[10px] text-zinc-500">Định mức (tuỳ chọn)</label>
        {normCode ? (
          (() => {
            const ni = normsByCode.get(normCode);
            return (
              <div className="mt-0.5 rounded-lg border border-sky-500/40 bg-sky-500/10 p-2">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-sky-500/30 px-1.5 py-0.5 font-mono text-[10px] text-sky-100">{normCode}</span>
                  <span className="flex-1 text-[11px] text-sky-100">
                    {ni ? ni.name : <span className="italic text-sky-300/70">Mã không có trong bảng ĐM</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setNormCode(null)}
                    className="text-[10px] text-sky-300 underline hover:text-sky-100"
                  >
                    Bỏ gắn
                  </button>
                </div>
                {ni && (
                  <div className="mt-1 text-[10px] text-sky-300/80">
                    Đơn vị ĐM: <span className="font-mono">{ni.unit}</span>
                    {ni.unit !== unit && (
                      <span className="ml-2 text-amber-300">⚠ khác đơn vị công tác ({unit})</span>
                    )}
                  </div>
                )}
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setNormPickerOpen(true); setNormQuery(""); }}
                    className="text-[10px] text-sky-300 underline hover:text-sky-100"
                  >
                    Đổi ĐM khác
                  </button>
                </div>
              </div>
            );
          })()
        ) : (
          <button
            type="button"
            onClick={() => { setNormPickerOpen(true); setNormQuery(""); }}
            className="mt-0.5 w-full rounded-lg border border-dashed border-sky-500/40 bg-sky-500/5 px-2 py-1.5 text-left text-[11px] text-sky-300 hover:bg-sky-500/10"
          >
            + Chọn định mức từ bảng ĐM…
          </button>
        )}
      </div>


      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-zinc-500">Đơn vị</label>
          <input
            list={`unit-${componentId}`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
          <datalist id={`unit-${componentId}`}>
            {UNIT_SUGGEST.map((u) => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-zinc-500">Khối lượng</label>
          <input
            inputMode="decimal"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            placeholder="0"
            className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-right font-mono text-base text-zinc-100"
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-zinc-500">Ghi chú (tuỳ chọn)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="VD: theo bản vẽ KT-03"
          className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
          Huỷ
        </button>
        <button
          disabled={invalid || saving}
          onClick={() => onSave(name.trim(), unit.trim(), qtyNum, note.trim() || null, normCode)}
          className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
      </div>

      {normPickerOpen && (
        <NormPickerModal
          query={normQuery}
          onQueryChange={setNormQuery}
          loading={normLoading}
          suggests={normSuggests}
          onPick={pickNorm}
          onClose={() => setNormPickerOpen(false)}
          initialName={name}
          initialUnit={unit}
        />
      )}
    </div>
  );
}

const NORM_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "be_tong", label: "Bê tông" },
  { value: "cot_thep", label: "Cốt thép" },
  { value: "cop_pha", label: "Cốp pha" },
  { value: "xay", label: "Xây" },
  { value: "to_trat", label: "Tô trát" },
  { value: "op_lat", label: "Ốp lát" },
  { value: "son", label: "Sơn" },
  { value: "tran", label: "Trần" },
  { value: "chong_tham", label: "Chống thấm" },
  { value: "cua", label: "Cửa & cơ khí" },
  { value: "mep", label: "MEP" },
  { value: "khac", label: "Khác" },
];

function NormPickerModal({
  query,
  onQueryChange,
  loading,
  suggests,
  onPick,
  onClose,
  initialName,
  initialUnit,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  loading: boolean;
  suggests: NormSuggestion[];
  onPick: (n: NormSuggestion) => void;
  onClose: () => void;
  initialName: string;
  initialUnit: string;
}) {
  const [mode, setMode] = useState<"search" | "create">("search");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState(initialName);
  const [newUnit, setNewUnit] = useState(initialUnit);
  const [newCategory, setNewCategory] = useState<string>("khac");
  const [creating, setCreating] = useState(false);

  async function createNorm() {
    const code = newCode.trim().toUpperCase();
    const name = newName.trim();
    const unit = newUnit.trim();
    if (!code || !name || !unit) {
      toast.error("Mã, tên, đơn vị bắt buộc");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch("/api/norms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, unit, category: newCategory }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || "Tạo ĐM thất bại");
      toast.success(`Đã tạo ĐM ${j.norm.code}`);
      onPick({ code: j.norm.code, name: j.norm.name, unit: j.norm.unit, category: j.norm.category });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tạo ĐM");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl border border-[#252840] bg-[#0f1220]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[#252840] p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-100">
              {mode === "search" ? "Chọn định mức" : "Tạo định mức mới"}
            </div>
            <button onClick={onClose} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
              Đóng
            </button>
          </div>

          {mode === "search" ? (
            <>
              <input
                autoFocus
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Tìm mã hoặc tên định mức…"
                className="mt-2 w-full rounded-lg border border-[#252840] bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500/40 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setMode("create")}
                className="mt-2 w-full rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-[11px] text-emerald-300 hover:bg-emerald-500/10"
              >
                + Tạo ĐM mới (vào bảng ĐM toàn cục)
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setMode("search")}
              className="mt-2 text-[11px] text-sky-300 underline hover:text-sky-100"
            >
              ← Quay lại tìm ĐM có sẵn
            </button>
          )}
        </div>

        {mode === "search" ? (
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loading && <div className="p-3 text-center text-xs text-zinc-500">Đang tìm…</div>}
            {!loading && suggests.length === 0 && (
              <div className="p-3 text-center text-xs text-zinc-500">
                Không có ĐM khớp. Bấm &ldquo;+ Tạo ĐM mới&rdquo; ở trên để thêm vào bảng ĐM.
              </div>
            )}
            {suggests.map((n) => (
              <button
                key={n.code}
                type="button"
                onClick={() => onPick(n)}
                className="mb-1 flex w-full items-start gap-2 rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-left hover:border-sky-500/40 hover:bg-sky-500/5"
              >
                <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300">{n.code}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-zinc-100">{n.name}</div>
                  <div className="text-[10px] text-zinc-500">/ {n.unit}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2 p-3">
            <div>
              <label className="text-[10px] text-zinc-500">Mã ĐM</label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="VD: BT.1140"
                className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-600"
              />
              <div className="mt-1 text-[10px] text-zinc-500">
                2-4 chữ + dấu chấm + 2-8 ký tự (BT=bê tông, TH=thép, CP=cốp pha, XY=xây, TR=trát, TM=chống thấm…)
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500">Tên ĐM</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="VD: Bê tông lót móng M100"
                className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-500">Đơn vị</label>
                <input
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="m³, m², kg, công…"
                  className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500">Nhóm</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                >
                  {NORM_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/40 p-2 text-[10px] text-zinc-400">
              ĐM sau khi tạo sẽ có sẵn trong bảng ĐM toàn cục để dùng cho các công tác sau.
              Hao phí chi tiết (VT/NC/MM) có thể bổ sung sau ở màn Định mức.
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setMode("search")}
                className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Huỷ
              </button>
              <button
                disabled={creating || !newCode.trim() || !newName.trim() || !newUnit.trim()}
                onClick={createNorm}
                className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {creating ? "Đang tạo…" : "Tạo & gắn"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestedPicker({
  stage,
  existingNames,
  onPick,
  onClose,
}: {
  stage: BudgetStage;
  existingNames: Set<string>;
  onPick: (sug: SuggestedComponent) => void;
  onClose: () => void;
}) {
  const list = SUGGESTED_COMPONENTS.filter((s) => s.stage === stage);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-hidden rounded-2xl border border-[#252840] bg-[#0f1220]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#252840] px-4 py-3">
          <div>
            <div className="text-xs text-zinc-500">Cấu kiện chuẩn — SOP 47</div>
            <div className="text-sm font-semibold text-zinc-100">Stage {stage} — {STAGE_LABEL[stage]}</div>
          </div>
          <button onClick={onClose} className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
            Đóng
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-3">
          {list.map((s) => {
            const used = existingNames.has(s.name);
            return (
              <button
                key={s.name}
                disabled={used}
                onClick={() => { onPick(s); onClose(); }}
                className={`mb-1.5 flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition ${used ? "border-zinc-800 bg-zinc-900/40 opacity-50" : "border-[#252840] bg-[#1a1d2e] hover:border-orange-500/40 hover:bg-orange-500/5"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium text-zinc-100">{s.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                    {s.hasFloor && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-sky-200">Có tầng</span>}
                    {s.optional && <span className="rounded bg-zinc-700/40 px-1.5 py-0.5 text-zinc-400">tuỳ chọn</span>}
                  </div>
                </div>
                <div className="shrink-0 text-[11px] text-zinc-400">
                  {used ? "Đã thêm" : "Thêm →"}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
