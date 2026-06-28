"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type CatalogTask = {
  id: string;
  phaseCode: string;
  phaseName: string;
  taskCode: string;
  taskName: string;
  groupLabel: string | null;
};

type MaterialItem = { name: string; unit: string; qty: number; note?: string | null };
type MachineItem = { name: string; hours: number; note?: string | null };

type Norm = {
  id: string;
  standardTaskId: string;
  unit: string;
  materialItems: MaterialItem[];
  laborHours: number;
  laborGrade: string | null;
  machineItems: MachineItem[];
  note: string | null;
};

type Props = {
  projectId: string;
  projectName: string;
  projectCode: string;
  canEdit: boolean;
};

const UNIT_SUGGEST = ["m³", "m²", "md", "kg", "tấn", "công", "bộ", "cái", "viên", "lít"];
const GRADE_SUGGEST = ["3/7", "3.5/7", "4/7", "4.5/7"];

export function NormsClient({ projectId, projectName, projectCode, canEdit }: Props) {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState<CatalogTask[]>([]);
  const [byTask, setByTask] = useState<Record<string, Norm>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/norms`);
      if (!r.ok) throw new Error("Tải thất bại");
      const data = await r.json();
      setCatalog(data.catalog);
      const map: Record<string, Norm> = {};
      for (const n of data.norms as Norm[]) map[n.standardTaskId] = n;
      setByTask(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const phases = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of catalog) seen.set(c.phaseCode, c.phaseName);
    return Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => {
      if (phaseFilter !== "all" && c.phaseCode !== phaseFilter) return false;
      if (!q) return true;
      return c.taskName.toLowerCase().includes(q) || c.taskCode.toLowerCase().includes(q);
    });
  }, [catalog, search, phaseFilter]);

  const grouped = useMemo(() => {
    const out: { phaseCode: string; phaseName: string; tasks: CatalogTask[] }[] = [];
    let cur: { phaseCode: string; phaseName: string; tasks: CatalogTask[] } | null = null;
    for (const c of filtered) {
      if (!cur || cur.phaseCode !== c.phaseCode) {
        cur = { phaseCode: c.phaseCode, phaseName: c.phaseName, tasks: [] };
        out.push(cur);
      }
      cur.tasks.push(c);
    }
    return out;
  }, [filtered]);

  const totalSet = Object.keys(byTask).length;

  async function saveOne(task: CatalogTask, payload: Omit<Norm, "id" | "standardTaskId">) {
    if (!canEdit) return;
    setSavingId(task.id);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/norms`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standardTaskId: task.id,
          ...payload,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message || "Lưu thất bại");
      }
      const j = await r.json();
      setByTask((prev) => {
        const next = { ...prev };
        if (j.deleted) delete next[task.id];
        else next[task.id] = j;
        return next;
      });
      toast.success("Đã lưu");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/projects/${projectId}/budget`}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          ← Dự toán
        </Link>
        <div className="text-right">
          <div className="text-xs text-zinc-500">{projectCode}</div>
          <h1 className="text-sm font-semibold text-zinc-100 sm:text-base">📋 Định mức — {projectName}</h1>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">Đã set</span>
          <span className="font-mono text-zinc-200">{totalSet}/{catalog.length} đầu việc</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
            style={{ width: catalog.length ? `${(totalSet / catalog.length) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm tên hoặc mã đầu việc…"
          className="w-full rounded-xl border border-[#252840] bg-[#1a1d2e] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/40 focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPhaseFilter("all")}
            className={`rounded-full px-2.5 py-1 text-[11px] ${phaseFilter === "all" ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40" : "bg-zinc-800 text-zinc-400"}`}
          >
            Tất cả GĐ
          </button>
          {phases.map(([code]) => (
            <button
              key={code}
              onClick={() => setPhaseFilter(code)}
              className={`rounded-full px-2.5 py-1 text-[11px] ${phaseFilter === code ? "bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40" : "bg-zinc-800 text-zinc-400"}`}
            >
              GĐ {code}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">Đang tải…</div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">Không có đầu việc khớp</div>
      ) : (
        grouped.map((g) => (
          <section key={g.phaseCode} className="space-y-1.5">
            <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              GĐ {g.phaseCode} — {g.phaseName}
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e]">
              {g.tasks.map((t, i) => {
                const n = byTask[t.id];
                const open = openTaskId === t.id;
                const matCount = n?.materialItems.length ?? 0;
                const machCount = n?.machineItems.length ?? 0;
                return (
                  <div key={t.id} className={`${i > 0 ? "border-t border-[#252840]" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setOpenTaskId(open ? null : t.id)}
                      className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left active:bg-zinc-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-zinc-100">{t.taskName}</div>
                        <div className="text-[10px] text-zinc-500">{t.phaseCode}-{t.taskCode}</div>
                        {n && (
                          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10px]">
                            {matCount > 0 && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">{matCount} VT</span>}
                            {n.laborHours > 0 && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-200">{n.laborHours} công</span>}
                            {machCount > 0 && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-200">{machCount} máy</span>}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        {n ? (
                          <div className="text-[10px] text-zinc-500">/ {n.unit}</div>
                        ) : (
                          <div className="text-[11px] text-zinc-600">Chưa set</div>
                        )}
                      </div>
                    </button>
                    {open && (
                      <NormForm
                        task={t}
                        initial={n ?? null}
                        canEdit={canEdit}
                        saving={savingId === t.id}
                        onSave={(payload) => saveOne(t, payload)}
                        onClose={() => setOpenTaskId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function NormForm({
  task,
  initial,
  canEdit,
  saving,
  onSave,
  onClose,
}: {
  task: CatalogTask;
  initial: Norm | null;
  canEdit: boolean;
  saving: boolean;
  onSave: (p: { unit: string; materialItems: MaterialItem[]; laborHours: number; laborGrade: string | null; machineItems: MachineItem[]; note: string | null }) => void;
  onClose: () => void;
}) {
  const [unit, setUnit] = useState(initial?.unit ?? "m³");
  const [materials, setMaterials] = useState<MaterialItem[]>(initial?.materialItems ?? []);
  const [laborHoursStr, setLaborHoursStr] = useState(initial ? String(initial.laborHours) : "");
  const [laborGrade, setLaborGrade] = useState(initial?.laborGrade ?? "");
  const [machines, setMachines] = useState<MachineItem[]>(initial?.machineItems ?? []);
  const [note, setNote] = useState(initial?.note ?? "");

  return (
    <div className="space-y-3 border-t border-[#252840] bg-zinc-950/30 px-3 py-3">
      <div>
        <label className="text-[10px] text-zinc-500">Đơn vị công tác (per đơn vị)</label>
        <input
          list={`unit-norm-${task.id}`}
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          disabled={!canEdit}
          className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        />
        <datalist id={`unit-norm-${task.id}`}>
          {UNIT_SUGGEST.map((u) => <option key={u} value={u} />)}
        </datalist>
      </div>

      {/* Vật tư */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-emerald-300">🧱 Vật tư</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => setMaterials([...materials, { name: "", unit: "kg", qty: 0 }])}
              className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-200 hover:bg-emerald-500/30"
            >
              + Thêm
            </button>
          )}
        </div>
        {materials.length === 0 && <div className="text-[10px] text-zinc-600">Chưa có vật tư</div>}
        {materials.map((m, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-1.5">
            <input
              value={m.name}
              onChange={(e) => setMaterials(materials.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
              placeholder="Tên VT"
              disabled={!canEdit}
              className="col-span-6 rounded border border-[#252840] bg-zinc-900 px-1.5 py-1 text-[12px] text-zinc-100"
            />
            <input
              inputMode="decimal"
              value={String(m.qty)}
              onChange={(e) => setMaterials(materials.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value.replace(",", ".")) || 0 } : x))}
              placeholder="0"
              disabled={!canEdit}
              className="col-span-3 rounded border border-[#252840] bg-zinc-900 px-1.5 py-1 text-right font-mono text-[12px] text-zinc-100"
            />
            <input
              value={m.unit}
              onChange={(e) => setMaterials(materials.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
              placeholder="kg"
              disabled={!canEdit}
              className="col-span-2 rounded border border-[#252840] bg-zinc-900 px-1.5 py-1 text-[12px] text-zinc-100"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setMaterials(materials.filter((_, i) => i !== idx))}
                className="col-span-1 rounded bg-rose-500/15 text-[12px] text-rose-300 hover:bg-rose-500/25"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Nhân công */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-zinc-500">👷 Công / đơn vị</label>
          <input
            inputMode="decimal"
            value={laborHoursStr}
            onChange={(e) => setLaborHoursStr(e.target.value)}
            placeholder="0"
            disabled={!canEdit}
            className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-right font-mono text-sm text-zinc-100"
          />
        </div>
        <div>
          <label className="text-[10px] text-zinc-500">Bậc thợ</label>
          <input
            list={`grade-${task.id}`}
            value={laborGrade}
            onChange={(e) => setLaborGrade(e.target.value)}
            placeholder="3/7"
            disabled={!canEdit}
            className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
          <datalist id={`grade-${task.id}`}>
            {GRADE_SUGGEST.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>
      </div>

      {/* Máy */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-violet-300">🚜 Máy thi công</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => setMachines([...machines, { name: "", hours: 0 }])}
              className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-200 hover:bg-violet-500/30"
            >
              + Thêm
            </button>
          )}
        </div>
        {machines.length === 0 && <div className="text-[10px] text-zinc-600">Chưa có máy</div>}
        {machines.map((m, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-1.5">
            <input
              value={m.name}
              onChange={(e) => setMachines(machines.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
              placeholder="Tên máy"
              disabled={!canEdit}
              className="col-span-8 rounded border border-[#252840] bg-zinc-900 px-1.5 py-1 text-[12px] text-zinc-100"
            />
            <input
              inputMode="decimal"
              value={String(m.hours)}
              onChange={(e) => setMachines(machines.map((x, i) => i === idx ? { ...x, hours: Number(e.target.value.replace(",", ".")) || 0 } : x))}
              placeholder="ca"
              disabled={!canEdit}
              className="col-span-3 rounded border border-[#252840] bg-zinc-900 px-1.5 py-1 text-right font-mono text-[12px] text-zinc-100"
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setMachines(machines.filter((_, i) => i !== idx))}
                className="col-span-1 rounded bg-rose-500/15 text-[12px] text-rose-300 hover:bg-rose-500/25"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div>
        <label className="text-[10px] text-zinc-500">Ghi chú</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canEdit}
          placeholder="Nguồn định mức 1776 / nội bộ…"
          className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          Đóng
        </button>
        {canEdit && (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              const cleanMats = materials.filter((m) => m.name.trim());
              const cleanMachs = machines.filter((m) => m.name.trim());
              const laborHours = Number(laborHoursStr.replace(",", ".")) || 0;
              onSave({
                unit: unit.trim(),
                materialItems: cleanMats,
                laborHours,
                laborGrade: laborGrade.trim() || null,
                machineItems: cleanMachs,
                note: note.trim() || null,
              });
            }}
            className="rounded-full bg-orange-500 px-4 py-1.5 text-xs font-medium text-white shadow hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? "Đang lưu…" : "Lưu"}
          </button>
        )}
      </div>
    </div>
  );
}
