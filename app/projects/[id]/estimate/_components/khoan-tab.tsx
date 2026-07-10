"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { api, type EstimateData, fmtVnd, type Khoan } from "./estimate-data";

const GROUPS: { key: "nc" | "khac"; label: string }[] = [
  { key: "nc", label: "Khoán nhân công" },
  { key: "khac", label: "Khoán khác" },
];

function NumCell({ value, onSave, placeholder }: { value: number | null; onSave: (n: number | null) => Promise<void>; placeholder: string }) {
  return (
    <EditableText
      value={value == null ? "" : String(value)}
      className="text-right"
      placeholder={placeholder}
      onSave={async (v) => {
        const t = v.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
        if (t === "") return onSave(null);
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) {
          toast.error("Số không hợp lệ");
          return;
        }
        await onSave(n);
      }}
    />
  );
}

// Thêm dòng khoán: tên + đơn vị
function AddKhoan({ onAdd }: { onAdd: (name: string, unit: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd(name.trim(), unit.trim() || "khoán");
      setName("");
      setUnit("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="+ tên khoán (VD: NC phần MEP)"
        className="w-64 max-w-full rounded-md border border-[#252840] bg-[#0d0f17] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#f97316]/50"
      />
      <input
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder="ĐVT (m²)"
        className="w-24 rounded-md border border-[#252840] bg-[#0d0f17] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#f97316]/50"
      />
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="grid h-6 w-6 place-items-center rounded-md bg-[#f97316]/20 text-[#fb923c] hover:bg-[#f97316]/30 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function KhoanTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Khoan[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const data: EstimateData = await api(`/api/projects/${projectId}/estimate/lines`);
      setRows(data.khoan);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const patch = (id: string, body: Record<string, unknown>) =>
    run(() => api(`/api/estimate/lines/${id}`, { method: "PATCH", body: JSON.stringify(body) }));

  if (rows === null) {
    return (
      <div className="grid place-items-center p-16">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const grand = rows.reduce((s, r) => s + r.quantity * (r.directUnitPrice ?? 0), 0);

  return (
    <div className="w-full space-y-3">
      <div className="flex justify-end px-3 pt-1 text-xs text-zinc-400">
        Tổng khoán: <b className="ml-1 text-emerald-400">{fmtVnd(Math.round(grand))}đ</b>
      </div>

      {GROUPS.map((grp) => {
        const list = rows.filter((r) => (r.khoanGroup === "nc" ? "nc" : "khac") === grp.key);
        const sub = list.reduce((s, r) => s + r.quantity * (r.directUnitPrice ?? 0), 0);
        return (
          <div key={grp.key} className="border-y border-[#252840] bg-[#13151f]">
            <div className="flex items-center justify-between border-b border-[#252840] px-3 py-2">
              <span className="text-sm font-bold text-zinc-100">{grp.label}</span>
              <span className="text-xs text-zinc-400">{fmtVnd(Math.round(sub))}đ</span>
            </div>
            {list.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[#252840] text-left text-xs text-zinc-500">
                      <th className="px-3 py-2 font-medium">Nội dung khoán</th>
                      <th className="w-16 px-2 py-2 font-medium">ĐVT</th>
                      <th className="w-24 px-2 py-2 text-right font-medium">KL</th>
                      <th className="w-32 px-2 py-2 text-right font-medium">Đơn giá</th>
                      <th className="w-32 px-2 py-2 text-right font-medium">Thành tiền</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-b border-[#1c1f2e]">
                        <td className="px-3 py-1.5 text-zinc-100">
                          <EditableText value={r.name} onSave={(v) => patch(r.id, { name: v })} />
                          {r.note != null && (
                            <div className="text-xs text-zinc-500">
                              <EditableText value={r.note} placeholder="+ ghi chú" onSave={(v) => patch(r.id, { note: v })} />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-zinc-400">
                          <EditableText value={r.unit} onSave={(v) => patch(r.id, { unit: v })} />
                        </td>
                        <td className="px-2 py-1.5 text-right text-zinc-200">
                          <NumCell value={r.quantity} placeholder="—" onSave={(n) => patch(r.id, { quantity: n ?? 0 })} />
                        </td>
                        <td className="px-2 py-1.5 text-right text-zinc-200">
                          <NumCell value={r.directUnitPrice} placeholder="nhập giá" onSave={(n) => patch(r.id, { directUnitPrice: n })} />
                        </td>
                        <td className="px-2 py-1.5 text-right text-emerald-400">
                          {r.directUnitPrice != null ? fmtVnd(Math.round(r.quantity * r.directUnitPrice)) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={async () => {
                              if (await confirmDialog({ title: "Xoá khoán?", message: r.name, confirmText: "Xoá" }))
                                void run(() => api(`/api/estimate/lines/${r.id}`, { method: "DELETE" }));
                            }}
                            className="text-zinc-600 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="p-3">
              <AddKhoan
                onAdd={(name, unit) =>
                  run(() =>
                    api(`/api/projects/${projectId}/estimate/lines`, {
                      method: "POST",
                      body: JSON.stringify({ kind: "khoan", khoanGroup: grp.key, name, unit, quantity: 1 }),
                    }),
                  )
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
