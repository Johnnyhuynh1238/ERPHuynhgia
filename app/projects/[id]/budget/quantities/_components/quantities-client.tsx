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

type Quantity = {
  id: string;
  standardTaskId: string;
  componentId: string | null;
  unit: string;
  quantity: number;
  note: string | null;
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
  const [catalog, setCatalog] = useState<CatalogTask[]>([]);
  const [byTask, setByTask] = useState<Record<string, Quantity>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/quantities`);
      if (!r.ok) throw new Error("Tải thất bại");
      const data = await r.json();
      setCatalog(data.catalog);
      const map: Record<string, Quantity> = {};
      for (const q of data.quantities as Quantity[]) {
        if (q.componentId === null) map[q.standardTaskId] = q;
      }
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
      return (
        c.taskName.toLowerCase().includes(q) ||
        c.taskCode.toLowerCase().includes(q) ||
        c.phaseName.toLowerCase().includes(q)
      );
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

  const totalWithQty = Object.keys(byTask).length;

  async function saveOne(task: CatalogTask, unit: string, quantity: number, note: string | null) {
    if (!canEdit) return;
    setSavingId(task.id);
    try {
      const r = await fetch(`/api/projects/${projectId}/budget/quantities`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          standardTaskId: task.id,
          componentId: null,
          unit,
          quantity,
          note,
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

      {/* Summary */}
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-400">Đã nhập</span>
          <span className="font-mono text-zinc-200">{totalWithQty}/{catalog.length} đầu việc</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-sky-500 transition-all"
            style={{ width: catalog.length ? `${(totalWithQty / catalog.length) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {/* Filters */}
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
          {phases.map(([code, name]) => (
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

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
          Đang tải…
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
          Không có đầu việc khớp
        </div>
      ) : (
        grouped.map((g) => (
          <section key={g.phaseCode} className="space-y-1.5">
            <div className="px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              GĐ {g.phaseCode} — {g.phaseName}
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#252840] bg-[#1a1d2e]">
              {g.tasks.map((t, i) => {
                const q = byTask[t.id];
                const open = openTaskId === t.id;
                return (
                  <div key={t.id} className={`${i > 0 ? "border-t border-[#252840]" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setOpenTaskId(open ? null : t.id)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left active:bg-zinc-800/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-zinc-100">{t.taskName}</div>
                        <div className="text-[10px] text-zinc-500">{t.phaseCode}-{t.taskCode}{t.groupLabel ? ` · ${t.groupLabel}` : ""}</div>
                      </div>
                      {q ? (
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-[13px] font-semibold text-emerald-300">{q.quantity.toLocaleString("vi-VN")}</div>
                          <div className="text-[10px] text-zinc-500">{q.unit}</div>
                        </div>
                      ) : (
                        <div className="shrink-0 text-[11px] text-zinc-600">Chưa nhập</div>
                      )}
                    </button>
                    {open && (
                      <TaskQtyForm
                        task={t}
                        initial={q ?? null}
                        canEdit={canEdit}
                        saving={savingId === t.id}
                        onSave={(unit, qty, note) => saveOne(t, unit, qty, note)}
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

function TaskQtyForm({
  task,
  initial,
  canEdit,
  saving,
  onSave,
  onClose,
}: {
  task: CatalogTask;
  initial: Quantity | null;
  canEdit: boolean;
  saving: boolean;
  onSave: (unit: string, qty: number, note: string | null) => void;
  onClose: () => void;
}) {
  const [unit, setUnit] = useState(initial?.unit ?? "m³");
  const [qtyStr, setQtyStr] = useState(initial ? String(initial.quantity) : "");
  const [note, setNote] = useState(initial?.note ?? "");

  const qtyNum = Number(qtyStr.replace(",", "."));
  const invalid = qtyStr.trim() !== "" && (!isFinite(qtyNum) || qtyNum < 0);

  return (
    <div className="space-y-2 border-t border-[#252840] bg-zinc-950/30 px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <label className="text-[10px] text-zinc-500">Đơn vị</label>
          <input
            list={`unit-${task.id}`}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            disabled={!canEdit}
            className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          />
          <datalist id={`unit-${task.id}`}>
            {UNIT_SUGGEST.map((u) => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-zinc-500">Khối lượng</label>
          <input
            inputMode="decimal"
            value={qtyStr}
            onChange={(e) => setQtyStr(e.target.value)}
            disabled={!canEdit}
            placeholder="0"
            className={`mt-0.5 w-full rounded-lg border bg-zinc-900 px-2 py-1.5 text-right font-mono text-base text-zinc-100 ${invalid ? "border-rose-500/60" : "border-[#252840]"}`}
          />
        </div>
      </div>
      <div>
        <label className="text-[10px] text-zinc-500">Ghi chú (tuỳ chọn)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canEdit}
          placeholder="VD: bóc theo bản vẽ KT-03"
          className="mt-0.5 w-full rounded-lg border border-[#252840] bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
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
            disabled={invalid || saving}
            onClick={() => {
              const v = qtyStr.trim() === "" ? 0 : qtyNum;
              onSave(unit.trim(), v, note.trim() || null);
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
