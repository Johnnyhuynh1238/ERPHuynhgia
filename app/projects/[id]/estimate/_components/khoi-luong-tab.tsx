"use client";

import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { api, type CongTac, fmtVnd, type Group, type Item, type Vt } from "./estimate-data";

// Ô nhập nhanh (thêm nhóm/hạng mục/công tác): 1 input + nút +
function AddInline({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => Promise<void> }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const name = v.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await onAdd(name);
      setV("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void submit()}
        placeholder={placeholder}
        className="w-56 max-w-full rounded-md border border-[#252840] bg-[#0d0f17] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#f97316]/50"
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

// Ô số sửa tại chỗ (KL/giá): reuse EditableText, parse về number
function NumCell({ value, onSave, className = "" }: { value: number | null; onSave: (n: number | null) => Promise<void>; className?: string }) {
  return (
    <EditableText
      value={value == null ? "" : String(value)}
      className={className}
      placeholder="—"
      onSave={async (v) => {
        const t = v.replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
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

// Bảng VT con của 1 công tác
function VtTable({ line, projectId, run }: { line: CongTac; projectId: string; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const patchVt = (vt: Vt, body: Record<string, unknown>) =>
    run(() => api(`/api/estimate/lines/${vt.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  const total = line.vtChildren.reduce((s, vt) => s + vt.quantity * (vt.directUnitPrice ?? 0), 0);

  return (
    <div className="mt-1 rounded-lg border border-[#1c1f2e] bg-[#0d0f17]/60 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Vật tư dùng cho công tác</span>
        {total > 0 && <span className="text-[11px] text-zinc-400">Tạm tính: <b className="text-emerald-400">{fmtVnd(Math.round(total))}đ</b></span>}
      </div>
      {line.vtChildren.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-left text-[11px] text-zinc-500">
                <th className="px-1 py-0.5 font-medium">Vật tư</th>
                <th className="w-16 px-1 py-0.5 font-medium">ĐVT</th>
                <th className="w-24 px-1 py-0.5 text-right font-medium">KL</th>
                <th className="w-28 px-1 py-0.5 text-right font-medium">Giá mua</th>
                <th className="w-28 px-1 py-0.5 text-right font-medium">Thành tiền</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {line.vtChildren.map((vt) => (
                <tr key={vt.id} className="border-t border-[#1c1f2e]">
                  <td className="px-1 py-0.5">
                    <EditableText value={vt.name} onSave={(v) => patchVt(vt, { name: v })} />
                  </td>
                  <td className="px-1 py-0.5">
                    <EditableText value={vt.unit} onSave={(v) => patchVt(vt, { unit: v })} />
                  </td>
                  <td className="px-1 py-0.5 text-right">
                    <NumCell value={vt.quantity} className="text-right" onSave={(n) => patchVt(vt, { quantity: n ?? 0 })} />
                  </td>
                  <td className="px-1 py-0.5 text-right">
                    <NumCell value={vt.directUnitPrice} className="text-right" onSave={(n) => patchVt(vt, { directUnitPrice: n })} />
                  </td>
                  <td className="px-1 py-0.5 text-right text-zinc-400">
                    {vt.directUnitPrice != null ? fmtVnd(Math.round(vt.quantity * vt.directUnitPrice)) : "—"}
                  </td>
                  <td className="px-1 py-0.5 text-right">
                    <button
                      onClick={async () => {
                        if (await confirmDialog({ title: "Xoá vật tư?", message: vt.name, confirmText: "Xoá" }))
                          void run(() => api(`/api/estimate/lines/${vt.id}`, { method: "DELETE" }));
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
      <div className="mt-1.5">
        <AddInline
          placeholder="+ vật tư (VD: Xi măng)"
          onAdd={(name) =>
            run(() =>
              api(`/api/projects/${projectId}/estimate/lines`, {
                method: "POST",
                body: JSON.stringify({ kind: "vt", parentLineId: line.id, name, unit: line.unit || "cái", quantity: 0 }),
              }),
            )
          }
        />
      </div>
    </div>
  );
}

export function KhoiLuongTab({ projectId }: { projectId: string }) {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const reload = useCallback(async () => {
    try {
      const data = await api(`/api/projects/${projectId}/estimate/lines`);
      setGroups(data.groups);
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

  if (groups === null) {
    return (
      <div className="grid place-items-center rounded-2xl border border-[#252840] bg-[#13151f] p-16">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 sm:px-0">
      {groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#252840] bg-[#13151f] p-8 text-center">
          <p className="text-sm font-semibold text-zinc-300">Chưa có khối lượng</p>
          <p className="mt-1 text-xs text-zinc-500">Thêm nhóm → hạng mục → công tác, rồi gắn vật tư dùng cho từng công tác.</p>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.id} className="rounded-2xl border border-[#252840] bg-[#13151f]">
          <div className="flex items-center justify-between gap-2 border-b border-[#252840] px-3 py-2">
            <button onClick={() => toggle(g.id)} className="flex min-w-0 items-center gap-1.5 text-left">
              {collapsed.has(g.id) ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
              <span className="truncate text-sm font-bold text-zinc-100">{g.name}</span>
            </button>
            <button
              onClick={async () => {
                if (await confirmDialog({ title: "Xoá nhóm?", message: `${g.name} + toàn bộ hạng mục/công tác bên trong`, confirmText: "Xoá" }))
                  void run(() => api(`/api/estimate/groups/${g.id}`, { method: "DELETE" }));
              }}
              className="text-zinc-600 hover:text-rose-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {!collapsed.has(g.id) && (
            <div className="space-y-2 p-3">
              {g.items.map((it) => (
                <ItemBlock key={it.id} item={it} projectId={projectId} run={run} />
              ))}
              <AddInline
                placeholder="+ hạng mục"
                onAdd={(name) => run(() => api(`/api/estimate/groups/${g.id}/items`, { method: "POST", body: JSON.stringify({ name }) }))}
              />
            </div>
          )}
        </div>
      ))}

      <AddInline
        placeholder="+ nhóm (VD: Phần thô)"
        onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ name }) }))}
      />
    </div>
  );
}

function ItemBlock({ item, projectId, run }: { item: Item; projectId: string; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const patchLine = (line: CongTac, body: Record<string, unknown>) =>
    run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify(body) }));

  return (
    <div className="rounded-xl border border-[#1c1f2e] bg-[#0f111a] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-semibold text-zinc-200">
          <EditableText value={item.name} onSave={(v) => run(() => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: v }) }))} />
        </div>
        <button
          onClick={async () => {
            if (await confirmDialog({ title: "Xoá hạng mục?", message: `${item.name} + công tác/vật tư bên trong`, confirmText: "Xoá" }))
              void run(() => api(`/api/estimate/items/${item.id}`, { method: "DELETE" }));
          }}
          className="text-zinc-600 hover:text-rose-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {item.lines.map((line) => (
          <div key={line.id} className="rounded-lg border border-[#1c1f2e] bg-[#13151f] p-2">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="min-w-[140px] flex-1 text-sm font-medium text-zinc-100">
                <EditableText value={line.name} onSave={(v) => patchLine(line, { name: v })} />
              </div>
              <div className="flex items-center gap-1 text-xs text-zinc-400">
                <span className="text-zinc-600">KL</span>
                <NumCell value={line.quantity} onSave={(n) => patchLine(line, { quantity: n ?? 0 })} />
              </div>
              <div className="flex items-center gap-1 text-xs text-zinc-400">
                <span className="text-zinc-600">ĐVT</span>
                <EditableText value={line.unit} onSave={(v) => patchLine(line, { unit: v })} />
              </div>
              <button
                onClick={async () => {
                  if (await confirmDialog({ title: "Xoá công tác?", message: `${line.name} + vật tư bên trong`, confirmText: "Xoá" }))
                    void run(() => api(`/api/estimate/lines/${line.id}`, { method: "DELETE" }));
                }}
                className="text-zinc-600 hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              <EditableText value={line.formula ?? ""} placeholder="+ diễn giải khối lượng" multiline onSave={(v) => patchLine(line, { formula: v })} />
            </div>
            <VtTable line={line} projectId={projectId} run={run} />
          </div>
        ))}

        <AddInline
          placeholder="+ công tác (VD: Đổ bê tông móng)"
          onAdd={(name) =>
            run(() => api(`/api/projects/${projectId}/estimate/lines`, { method: "POST", body: JSON.stringify({ kind: "cong-tac", itemId: item.id, name, unit: "m³", quantity: 0 }) }))
          }
        />
      </div>
    </div>
  );
}
