"use client";

import { useEffect, useState } from "react";
import { api, fmt, type Khoan } from "./du-toan-data";

export function KhoanTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Khoan[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // form thêm
  const [name, setName] = useState("");
  const [contractor, setContractor] = useState("");
  const [value, setValue] = useState("");

  const load = () => {
    setLoading(true);
    api
      .listKhoan(projectId)
      .then((d) => {
        setRows(d.items);
        setTotal(d.total);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [projectId]);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    try {
      await api.addKhoan(projectId, {
        name: n,
        contractor: contractor.trim() || null,
        value: value ? Number(value.replace(/[^\d]/g, "")) : 0,
      });
      setName("");
      setContractor("");
      setValue("");
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const patch = async (id: string, body: Partial<Khoan>) => {
    try {
      await api.patchKhoan(id, body);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  const del = async (r: Khoan) => {
    if (!window.confirm(`Xoá hạng mục khoán "${r.name}"?`)) return;
    try {
      await api.delKhoan(r.id);
      load();
    } catch (e) {
      alert((e as Error).message);
    }
  };

  return (
    <div>
      {err && <div className="mb-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="overflow-x-auto rounded border border-slate-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <th className="px-3 py-2 font-medium">Hạng mục khoán</th>
              <th className="px-3 py-2 font-medium">Nhà thầu</th>
              <th className="px-3 py-2 text-right font-medium">Giá trị (đ)</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-3 py-1.5">
                  <input
                    defaultValue={r.name}
                    onBlur={(e) => e.target.value.trim() !== r.name && patch(r.id, { name: e.target.value })}
                    className="w-full bg-transparent outline-none focus:rounded focus:bg-white focus:px-1 focus:ring-1 focus:ring-slate-300"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    defaultValue={r.contractor ?? ""}
                    placeholder="—"
                    onBlur={(e) => (e.target.value.trim() || null) !== r.contractor && patch(r.id, { contractor: e.target.value })}
                    className="w-full bg-transparent text-slate-600 outline-none focus:rounded focus:bg-white focus:px-1 focus:ring-1 focus:ring-slate-300"
                  />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    defaultValue={r.value ? fmt(r.value) : ""}
                    placeholder="0"
                    inputMode="numeric"
                    onBlur={(e) => {
                      const v = Number(e.target.value.replace(/[^\d]/g, "")) || 0;
                      if (v !== r.value) patch(r.id, { value: v });
                    }}
                    className="w-32 bg-transparent text-right font-medium tabular-nums outline-none focus:rounded focus:bg-white focus:px-1 focus:ring-1 focus:ring-slate-300"
                  />
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button onClick={() => del(r)} className="text-slate-300 hover:text-red-500" title="Xoá">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  Chưa có hạng mục khoán.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
              <td className="px-3 py-2" colSpan={2}>
                Tổng khoán
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{fmt(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* thêm dòng */}
      <div className="mt-3 flex flex-wrap items-end gap-2 rounded border border-dashed border-slate-300 p-3">
        <label className="flex flex-col text-xs text-slate-500">
          Hạng mục
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Khoán NC phần thô"
            className="mt-1 w-56 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Nhà thầu
          <input
            value={contractor}
            onChange={(e) => setContractor(e.target.value)}
            placeholder="Đội A Luận"
            className="mt-1 w-40 rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-500">
          Giá trị (đ)
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            className="mt-1 w-36 rounded border border-slate-300 px-2 py-1 text-right text-sm text-slate-900"
          />
        </label>
        <button
          onClick={add}
          disabled={!name.trim()}
          className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          + Thêm
        </button>
      </div>
    </div>
  );
}
