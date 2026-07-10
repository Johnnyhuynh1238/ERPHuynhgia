"use client";

import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { api, type CongTac, fmtVnd, type Group, type Item, type Vt } from "./estimate-data";

// Ô nhập nhanh 1 dòng (thêm nhóm/hạng mục/công tác)
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
        className="min-w-0 flex-1 rounded-md border border-[#252840] bg-[#0d0f17] px-2 py-1 text-xs text-zinc-200 outline-none focus:border-[#f97316]/50"
      />
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[#f97316]/20 text-[#fb923c] hover:bg-[#f97316]/30 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// Ô số sửa tại chỗ
function NumCell({ value, onSave }: { value: number | null; onSave: (n: number | null) => Promise<void> }) {
  return (
    <EditableText
      value={value == null ? "" : String(value)}
      className="text-right"
      placeholder="—"
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

const delBtn = "grid h-6 w-6 place-items-center text-zinc-600 hover:text-rose-400";

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
      <div className="grid place-items-center p-16">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {groups.length === 0 && (
        <div className="p-8 text-center text-sm text-zinc-500">
          Chưa có khối lượng. Thêm nhóm → hạng mục → công tác, gắn vật tư dùng cho từng công tác.
        </div>
      )}

      {groups.map((g) => (
        <section key={g.id} className="border-b border-[#252840]">
          <div className="flex items-center gap-2 bg-[#171a26] px-3 py-2">
            <button onClick={() => toggle(g.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              {collapsed.has(g.id) ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
              <span className="truncate text-sm font-bold text-zinc-100">{g.name}</span>
            </button>
            <button
              onClick={async () => {
                if (await confirmDialog({ title: "Xoá nhóm?", message: `${g.name} + toàn bộ bên trong`, confirmText: "Xoá" }))
                  void run(() => api(`/api/estimate/groups/${g.id}`, { method: "DELETE" }));
              }}
              className={delBtn}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {!collapsed.has(g.id) && (
            <div>
              {g.items.map((it) => (
                <ItemBlock key={it.id} item={it} projectId={projectId} run={run} />
              ))}
              <div className="px-3 py-2">
                <AddInline placeholder="+ hạng mục" onAdd={(name) => run(() => api(`/api/estimate/groups/${g.id}/items`, { method: "POST", body: JSON.stringify({ name }) }))} />
              </div>
            </div>
          )}
        </section>
      ))}

      <div className="px-3 py-3">
        <AddInline placeholder="+ nhóm (VD: Phần thô)" onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ name }) }))} />
      </div>
    </div>
  );
}

function ItemBlock({ item, projectId, run }: { item: Item; projectId: string; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const patchLine = (id: string, body: Record<string, unknown>) => run(() => api(`/api/estimate/lines/${id}`, { method: "PATCH", body: JSON.stringify(body) }));
  const delLine = (id: string) => run(() => api(`/api/estimate/lines/${id}`, { method: "DELETE" }));

  return (
    <div className="border-t border-[#1c1f2e]">
      <div className="flex items-center gap-2 bg-[#12141d] px-3 py-1.5">
        <div className="min-w-0 flex-1 text-sm font-semibold text-zinc-200">
          <EditableText value={item.name} onSave={(v) => run(() => api(`/api/estimate/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: v }) }))} />
        </div>
        <button
          onClick={async () => {
            if (await confirmDialog({ title: "Xoá hạng mục?", message: `${item.name} + bên trong`, confirmText: "Xoá" }))
              void run(() => api(`/api/estimate/items/${item.id}`, { method: "DELETE" }));
          }}
          className={delBtn}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div>
        <table className="w-full table-fixed text-xs">
          <thead>
            <tr className="text-left text-[11px] text-zinc-500">
              <th className="py-1 pl-3 pr-1 font-medium">Công tác / Vật tư</th>
              <th className="w-12 px-1 py-1 text-right font-medium">KL</th>
              <th className="w-9 px-1 py-1 font-medium">ĐVT</th>
              <th className="w-16 px-1 py-1 text-right font-medium">Giá</th>
              <th className="hidden w-24 px-2 py-1 text-right font-medium md:table-cell">Thành tiền</th>
              <th className="w-7" />
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => {
              const total = line.vtChildren.reduce((s, vt) => s + vt.quantity * (vt.directUnitPrice ?? 0), 0);
              return (
                <CongTacRows key={line.id} line={line} total={total} projectId={projectId} run={run} patchLine={patchLine} delLine={delLine} />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-1.5">
        <AddInline
          placeholder="+ công tác (VD: Đổ bê tông móng)"
          onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/lines`, { method: "POST", body: JSON.stringify({ kind: "cong-tac", itemId: item.id, name, unit: "m³", quantity: 0 }) }))}
        />
      </div>
    </div>
  );
}

function CongTacRows({
  line,
  total,
  projectId,
  run,
  patchLine,
  delLine,
}: {
  line: CongTac;
  total: number;
  projectId: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  patchLine: (id: string, body: Record<string, unknown>) => Promise<void>;
  delLine: (id: string) => Promise<void>;
}) {
  const patchVt = (vt: Vt, body: Record<string, unknown>) => patchLine(vt.id, body);
  return (
    <>
      <tr className="border-t border-[#1c1f2e] bg-[#13151f]">
        <td className="break-words py-1 pl-3 pr-1 font-medium text-zinc-100">
          <EditableText value={line.name} onSave={(v) => patchLine(line.id, { name: v })} />
        </td>
        <td className="px-1 py-1 text-right text-zinc-300">
          <NumCell value={line.quantity} onSave={(n) => patchLine(line.id, { quantity: n ?? 0 })} />
        </td>
        <td className="break-words px-1 py-1 text-zinc-400">
          <EditableText value={line.unit} onSave={(v) => patchLine(line.id, { unit: v })} />
        </td>
        <td className="px-1 py-1" />
        <td className="hidden px-2 py-1 text-right text-emerald-400 md:table-cell">{total > 0 ? fmtVnd(Math.round(total)) : ""}</td>
        <td className="px-0.5 py-1 text-right">
          <button
            onClick={async () => {
              if (await confirmDialog({ title: "Xoá công tác?", message: `${line.name} + vật tư`, confirmText: "Xoá" })) void delLine(line.id);
            }}
            className={delBtn}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      </tr>

      {line.vtChildren.map((vt) => (
        <tr key={vt.id} className="border-t border-[#1c1f2e]">
          <td className="break-words py-0.5 pl-6 pr-1 text-zinc-300">
            <EditableText value={vt.name} onSave={(v) => patchVt(vt, { name: v })} />
          </td>
          <td className="px-1 py-0.5 text-right text-zinc-300">
            <NumCell value={vt.quantity} onSave={(n) => patchVt(vt, { quantity: n ?? 0 })} />
          </td>
          <td className="break-words px-1 py-0.5 text-zinc-400">
            <EditableText value={vt.unit} onSave={(v) => patchVt(vt, { unit: v })} />
          </td>
          <td className="px-1 py-0.5 text-right text-zinc-200">
            <NumCell value={vt.directUnitPrice} onSave={(n) => patchVt(vt, { directUnitPrice: n })} />
          </td>
          <td className="hidden px-2 py-0.5 text-right text-zinc-400 md:table-cell">
            {vt.directUnitPrice != null ? fmtVnd(Math.round(vt.quantity * vt.directUnitPrice)) : "—"}
          </td>
          <td className="px-0.5 py-0.5 text-right">
            <button
              onClick={async () => {
                if (await confirmDialog({ title: "Xoá vật tư?", message: vt.name, confirmText: "Xoá" })) void delLine(vt.id);
              }}
              className={delBtn}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </td>
        </tr>
      ))}

      <tr className="border-t border-[#1c1f2e]">
        <td colSpan={6} className="py-1 pl-6 pr-3">
          <AddInline
            placeholder="+ vật tư"
            onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/lines`, { method: "POST", body: JSON.stringify({ kind: "vt", parentLineId: line.id, name, unit: line.unit || "cái", quantity: 0 }) }))}
          />
        </td>
      </tr>
    </>
  );
}
