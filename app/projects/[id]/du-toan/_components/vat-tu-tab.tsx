"use client";

import { useEffect, useMemo, useState } from "react";
import { api, fmt, type CatalogTask, type Category, type Material } from "./du-toan-data";

type ViewMode = "chi-tiet" | "gop-vt" | "theo-chung-loai" | "theo-cong-tac";
const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "chi-tiet", label: "Chi tiết" },
  { key: "gop-vt", label: "Gộp vật tư" },
  { key: "theo-chung-loai", label: "Theo chủng loại" },
  { key: "theo-cong-tac", label: "Theo công tác" },
];

export function VatTuTab({
  projectId,
  categories,
  tasks,
}: {
  projectId: string;
  categories: Category[];
  tasks: CatalogTask[];
}) {
  const [rows, setRows] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("chi-tiet");
  const [fCat, setFCat] = useState("");
  const [fTask, setFTask] = useState("");

  // form thêm
  const [nCat, setNCat] = useState("");
  const [nTask, setNTask] = useState("");
  const [nName, setNName] = useState("");
  const [nUnit, setNUnit] = useState("");
  const [nQty, setNQty] = useState("");
  const [nPrice, setNPrice] = useState("");

  const load = () => {
    setLoading(true);
    api
      .listMaterials(projectId)
      .then((d) => {
        setRows(d.items);
        setTotal(d.total);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (!fCat || r.categoryId === fCat) && (!fTask || r.catalogId === fTask),
      ),
    [rows, fCat, fTask],
  );
  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + r.amount, 0), [filtered]);

  const add = async () => {
    const name = nName.trim();
    const unit = nUnit.trim();
    if (!name || !unit) return;
    try {
      await api.addMaterial(projectId, {
        catalogId: nTask || null,
        categoryId: nCat || null,
        name,
        unit,
        quantity: nQty ? Number(nQty.replace(/,/g, ".")) : 0,
        unitPrice: nPrice ? Number(nPrice.replace(/[^\d]/g, "")) : 0,
      });
      setNName("");
      setNUnit("");
      setNQty("");
      setNPrice("");
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const patch = async (id: string, body: Partial<Material>) => {
    try {
      await api.patchMaterial(id, body);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const del = async (r: Material) => {
    if (!window.confirm(`Xoá vật tư "${r.name}"?`)) return;
    try {
      await api.delMaterial(r.id);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div>
      {err && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      {/* Bộ lọc + chế độ xem */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={fCat}
          onChange={(e) => setFCat(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Tất cả chủng loại</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={fTask}
          onChange={(e) => setFTask(e.target.value)}
          className="max-w-[240px] rounded border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Tất cả công tác</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} · {t.taskName}
            </option>
          ))}
        </select>
        {(fCat || fTask) && (
          <button
            onClick={() => {
              setFCat("");
              setFTask("");
            }}
            className="text-xs text-slate-400 hover:text-slate-700"
          >
            xoá lọc
          </button>
        )}
        <div className="ml-auto flex gap-1 rounded bg-slate-100 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                view === v.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === "chi-tiet" && (
        <ChiTietTable rows={filtered} loading={loading} total={filteredTotal} categories={categories} tasks={tasks} onPatch={patch} onDel={del} />
      )}
      {view === "gop-vt" && <GopVtTable rows={filtered} total={filteredTotal} />}
      {view === "theo-chung-loai" && <GroupTable rows={filtered} total={filteredTotal} keyOf={(r) => r.categoryName ?? "— chưa phân loại"} colLabel="Chủng loại" />}
      {view === "theo-cong-tac" && <GroupTable rows={filtered} total={filteredTotal} keyOf={(r) => (r.taskCode ? `${r.taskCode} · ${r.taskName}` : "— chưa gán công tác")} colLabel="Công tác" />}

      {/* thêm dòng — chỉ ở chế độ chi tiết */}
      {view === "chi-tiet" && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-dashed border-slate-300 p-3">
          <label className="flex flex-col text-xs text-slate-500">
            Công tác
            <select value={nTask} onChange={(e) => setNTask(e.target.value)} className="mt-1 w-48 rounded border border-slate-300 px-2 py-1 text-sm">
              <option value="">— chọn —</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code} · {t.taskName}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Chủng loại
            <select value={nCat} onChange={(e) => setNCat(e.target.value)} className="mt-1 w-32 rounded border border-slate-300 px-2 py-1 text-sm">
              <option value="">— chọn —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Tên vật tư
            <input value={nName} onChange={(e) => setNName(e.target.value)} className="mt-1 w-44 rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            ĐVT
            <input value={nUnit} onChange={(e) => setNUnit(e.target.value)} placeholder="kg/m³/md" className="mt-1 w-20 rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            KL
            <input value={nQty} onChange={(e) => setNQty(e.target.value)} inputMode="decimal" className="mt-1 w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
          </label>
          <label className="flex flex-col text-xs text-slate-500">
            Đơn giá
            <input value={nPrice} onChange={(e) => setNPrice(e.target.value)} inputMode="numeric" className="mt-1 w-28 rounded border border-slate-300 px-2 py-1 text-right text-sm" />
          </label>
          <button onClick={add} disabled={!nName.trim() || !nUnit.trim()} className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            + Thêm
          </button>
        </div>
      )}
    </div>
  );
}

function ChiTietTable({
  rows,
  loading,
  total,
  categories,
  tasks,
  onPatch,
  onDel,
}: {
  rows: Material[];
  loading: boolean;
  total: number;
  categories: Category[];
  tasks: CatalogTask[];
  onPatch: (id: string, body: Partial<Material>) => void;
  onDel: (r: Material) => void;
}) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="px-3 py-2 font-medium">Công tác</th>
            <th className="px-3 py-2 font-medium">Chủng loại</th>
            <th className="px-3 py-2 font-medium">Vật tư</th>
            <th className="px-3 py-2 font-medium">ĐVT</th>
            <th className="px-3 py-2 text-right font-medium">KL</th>
            <th className="px-3 py-2 text-right font-medium">Đơn giá</th>
            <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-1.5">
                <select
                  defaultValue={r.catalogId ?? ""}
                  onChange={(e) => onPatch(r.id, { catalogId: e.target.value || null })}
                  className="max-w-[190px] bg-transparent text-xs text-slate-600 outline-none"
                >
                  <option value="">—</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {t.taskName}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <select
                  defaultValue={r.categoryId ?? ""}
                  onChange={(e) => onPatch(r.id, { categoryId: e.target.value || null })}
                  className="bg-transparent text-xs text-slate-600 outline-none"
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-1.5">
                <input
                  defaultValue={r.name}
                  onBlur={(e) => e.target.value.trim() !== r.name && onPatch(r.id, { name: e.target.value })}
                  className="w-full min-w-[120px] bg-transparent outline-none focus:rounded focus:bg-white focus:px-1 focus:ring-1 focus:ring-slate-300"
                />
              </td>
              <td className="px-3 py-1.5">
                <input
                  defaultValue={r.unit}
                  onBlur={(e) => e.target.value.trim() !== r.unit && onPatch(r.id, { unit: e.target.value })}
                  className="w-16 bg-transparent outline-none focus:rounded focus:bg-white focus:px-1 focus:ring-1 focus:ring-slate-300"
                />
              </td>
              <td className="px-3 py-1.5 text-right">
                <input
                  defaultValue={r.quantity}
                  inputMode="decimal"
                  onBlur={(e) => {
                    const v = Number(e.target.value.replace(/,/g, ".")) || 0;
                    if (v !== r.quantity) onPatch(r.id, { quantity: v });
                  }}
                  className="w-20 bg-transparent text-right tabular-nums outline-none focus:rounded focus:bg-white focus:px-1 focus:ring-1 focus:ring-slate-300"
                />
              </td>
              <td className="px-3 py-1.5 text-right">
                <input
                  defaultValue={r.unitPrice ? fmt(r.unitPrice) : ""}
                  placeholder="0"
                  inputMode="numeric"
                  onBlur={(e) => {
                    const v = Number(e.target.value.replace(/[^\d]/g, "")) || 0;
                    if (v !== r.unitPrice) onPatch(r.id, { unitPrice: v });
                  }}
                  className="w-24 bg-transparent text-right tabular-nums outline-none focus:rounded focus:bg-white focus:px-1 focus:ring-1 focus:ring-slate-300"
                />
              </td>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums">{fmt(Math.round(r.amount))}</td>
              <td className="px-2 py-1.5 text-right">
                <button onClick={() => onDel(r)} className="text-slate-300 hover:text-red-500" title="Xoá">
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                Chưa có vật tư (theo bộ lọc hiện tại).
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <td className="px-3 py-2" colSpan={6}>
              Tổng vật tư
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{fmt(Math.round(total))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Gộp theo tên VT (+ĐVT): tổng KL + thành tiền + dùng cho công tác nào — bảng đi mua.
function GopVtTable({ rows, total }: { rows: Material[]; total: number }) {
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; qty: number; amount: number; tasks: Set<string> }>();
    for (const r of rows) {
      const k = `${r.name.toLowerCase()}|${r.unit.toLowerCase()}`;
      const g = m.get(k) ?? { name: r.name, unit: r.unit, qty: 0, amount: 0, tasks: new Set<string>() };
      g.qty += r.quantity;
      g.amount += r.amount;
      if (r.taskName) g.tasks.add(r.taskName);
      m.set(k, g);
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="px-3 py-2 font-medium">Vật tư</th>
            <th className="px-3 py-2 font-medium">ĐVT</th>
            <th className="px-3 py-2 text-right font-medium">Tổng KL</th>
            <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
            <th className="px-3 py-2 font-medium">Dùng cho công tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-medium">{g.name}</td>
              <td className="px-3 py-1.5">{g.unit}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{g.qty.toLocaleString("vi-VN")}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt(Math.round(g.amount))}</td>
              <td className="px-3 py-1.5 text-xs text-slate-500">{Array.from(g.tasks).join(", ") || "—"}</td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                Không có dữ liệu.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <td className="px-3 py-2" colSpan={3}>
              Tổng
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{fmt(Math.round(total))}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Gộp theo 1 khoá bất kỳ (chủng loại / công tác): số dòng + thành tiền.
function GroupTable({
  rows,
  total,
  keyOf,
  colLabel,
}: {
  rows: Material[];
  total: number;
  keyOf: (r: Material) => string;
  colLabel: string;
}) {
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; count: number; amount: number }>();
    for (const r of rows) {
      const k = keyOf(r);
      const g = m.get(k) ?? { key: k, count: 0, amount: 0 };
      g.count += 1;
      g.amount += r.amount;
      m.set(k, g);
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount);
  }, [rows, keyOf]);

  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <th className="px-3 py-2 font-medium">{colLabel}</th>
            <th className="px-3 py-2 text-right font-medium">Số dòng VT</th>
            <th className="px-3 py-2 text-right font-medium">Thành tiền</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g, i) => (
            <tr key={i} className="hover:bg-slate-50">
              <td className="px-3 py-1.5 font-medium">{g.key}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{g.count}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmt(Math.round(g.amount))}</td>
            </tr>
          ))}
          {groups.length === 0 && (
            <tr>
              <td colSpan={3} className="px-3 py-6 text-center text-slate-400">
                Không có dữ liệu.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
            <td className="px-3 py-2">Tổng</td>
            <td></td>
            <td className="px-3 py-2 text-right tabular-nums">{fmt(Math.round(total))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
