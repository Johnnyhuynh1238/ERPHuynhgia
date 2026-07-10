"use client";

import { ChevronDown, ChevronRight, Flag, Loader2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { api, type CongTac, fmtQty, fmtVnd, type Group, type Item, type Vt } from "./estimate-data";

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
  const [detailId, setDetailId] = useState<string | null>(null);
  const inited = useRef(false);

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

  // Mới mở → thu gọn hết nhóm (chỉ lần đầu có data)
  useEffect(() => {
    if (groups && !inited.current) {
      inited.current = true;
      setCollapsed(new Set(groups.map((g) => g.id)));
    }
  }, [groups]);

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

  // tìm công tác đang mở popup
  let detail: { line: CongTac; itemName: string } | null = null;
  for (const g of groups)
    for (const it of g.items)
      for (const l of it.lines)
        if (l.id === detailId) detail = { line: l, itemName: it.name };

  return (
    <div className="w-full">
      {groups.length === 0 && (
        <div className="p-8 text-center text-sm text-zinc-500">
          Chưa có khối lượng. Thêm nhóm → hạng mục → công tác, gắn vật tư dùng cho từng công tác.
        </div>
      )}

      {groups.map((g) => {
        const gCollapsed = collapsed.has(g.id);
        const nCongTac = g.items.reduce((s, it) => s + it.lines.length, 0);
        return (
          <section key={g.id} className="border-b border-[#252840]">
            <div className="flex items-center gap-2 bg-[#171a26] px-3 py-2">
              <button onClick={() => toggle(g.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                {gCollapsed ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" />}
                <span className="truncate text-sm font-bold text-zinc-100">{g.name}</span>
                <span className="shrink-0 text-[11px] text-zinc-500">({nCongTac})</span>
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

            {!gCollapsed && (
              <div>
                {g.items.map((it) => (
                  <ItemBlock key={it.id} item={it} projectId={projectId} run={run} onOpen={setDetailId} />
                ))}
                <div className="px-3 py-2">
                  <AddInline placeholder="+ hạng mục" onAdd={(name) => run(() => api(`/api/estimate/groups/${g.id}/items`, { method: "POST", body: JSON.stringify({ name }) }))} />
                </div>
              </div>
            )}
          </section>
        );
      })}

      <div className="px-3 py-3">
        <AddInline placeholder="+ nhóm (VD: Phần thô)" onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/groups`, { method: "POST", body: JSON.stringify({ name }) }))} />
      </div>

      {detail && <LineDetailModal line={detail.line} itemName={detail.itemName} projectId={projectId} run={run} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function ItemBlock({ item, projectId, run, onOpen }: { item: Item; projectId: string; run: (fn: () => Promise<unknown>) => Promise<void>; onOpen: (id: string) => void }) {
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
        {item.lines.map((line) => {
          const total = line.vtChildren.reduce((s, vt) => s + vt.quantity * (vt.directUnitPrice ?? 0), 0);
          return (
            <button
              key={line.id}
              onClick={() => onOpen(line.id)}
              className="flex w-full items-center gap-2 border-t border-[#1c1f2e] px-3 py-2 text-left active:bg-[#171a26]"
            >
              {line.fixRequest ? <Flag className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" /> : <span className="w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{line.name}</span>
              <span className="shrink-0 text-xs text-zinc-400">
                {fmtQty(line.quantity)} {line.unit}
              </span>
              {line.vtChildren.length > 0 && <span className="shrink-0 text-[11px] text-zinc-600">· {line.vtChildren.length} VT</span>}
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
            </button>
          );
        })}
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

// Popup chi tiết 1 công tác: diễn giải bằng lời + công thức + vật tư dùng + ô yêu cầu sửa
function LineDetailModal({
  line,
  itemName,
  projectId,
  run,
  onClose,
}: {
  line: CongTac;
  itemName: string;
  projectId: string;
  run: (fn: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const patch = (body: Record<string, unknown>) => run(() => api(`/api/estimate/lines/${line.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  const patchVt = (vt: Vt, body: Record<string, unknown>) => run(() => api(`/api/estimate/lines/${vt.id}`, { method: "PATCH", body: JSON.stringify(body) }));
  const total = line.vtChildren.reduce((s, vt) => s + vt.quantity * (vt.directUnitPrice ?? 0), 0);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-[#252840] bg-[#0f1119] sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-start gap-2 border-b border-[#252840] bg-[#0f1119] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-zinc-500">{itemName}</div>
            <div className="text-base font-bold text-zinc-100">
              <EditableText value={line.name} onSave={(v) => patch({ name: v })} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
              <span className="text-zinc-600">KL</span>
              <NumCell value={line.quantity} onSave={(n) => patch({ quantity: n ?? 0 })} />
              <span className="text-zinc-600">ĐVT</span>
              <EditableText value={line.unit} onSave={(v) => patch({ unit: v })} />
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-zinc-800">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Diễn giải bằng lời */}
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Diễn giải (bằng lời)</h4>
            <div className="rounded-lg border border-[#252840] bg-[#13151f] px-3 py-2 text-sm text-zinc-200">
              <EditableText value={line.note ?? ""} multiline placeholder="Mô tả công tác này bằng lời dễ hiểu…" onSave={(v) => patch({ note: v })} />
            </div>
          </section>

          {/* Công thức tính KL */}
          <section>
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Cách tính khối lượng</h4>
            <div className="rounded-lg border border-[#252840] bg-[#13151f] px-3 py-2 text-sm text-zinc-200">
              <EditableText value={line.formula ?? ""} multiline placeholder="VD: (dài × rộng × cao) × số cấu kiện…" onSave={(v) => patch({ formula: v })} />
            </div>
          </section>

          {/* Vật tư dùng cho công tác */}
          <section>
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Vật tư sử dụng</h4>
              {total > 0 && <span className="text-xs text-zinc-400">Tạm tính <b className="text-emerald-400">{fmtVnd(Math.round(total))}đ</b></span>}
            </div>
            <div className="overflow-hidden rounded-lg border border-[#252840]">
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="border-b border-[#252840] bg-[#13151f] text-left text-[11px] text-zinc-500">
                    <th className="px-2 py-1.5 font-medium">Vật tư</th>
                    <th className="w-12 px-1 py-1.5 text-right font-medium">KL</th>
                    <th className="w-9 px-1 py-1.5 font-medium">ĐVT</th>
                    <th className="w-20 px-1 py-1.5 text-right font-medium">Giá mua</th>
                    <th className="w-7" />
                  </tr>
                </thead>
                <tbody>
                  {line.vtChildren.map((vt) => (
                    <tr key={vt.id} className="border-b border-[#1c1f2e] align-top">
                      <td className="break-words px-2 py-1 text-zinc-200">
                        <EditableText value={vt.name} onSave={(v) => patchVt(vt, { name: v })} />
                      </td>
                      <td className="px-1 py-1 text-right text-zinc-300">
                        <NumCell value={vt.quantity} onSave={(n) => patchVt(vt, { quantity: n ?? 0 })} />
                      </td>
                      <td className="break-words px-1 py-1 text-zinc-400">
                        <EditableText value={vt.unit} onSave={(v) => patchVt(vt, { unit: v })} />
                      </td>
                      <td className="px-1 py-1 text-right text-zinc-200">
                        <NumCell value={vt.directUnitPrice} onSave={(n) => patchVt(vt, { directUnitPrice: n })} />
                      </td>
                      <td className="px-0.5 py-1 text-right">
                        <button
                          onClick={async () => {
                            if (await confirmDialog({ title: "Xoá vật tư?", message: vt.name, confirmText: "Xoá" }))
                              void run(() => api(`/api/estimate/lines/${vt.id}`, { method: "DELETE" }));
                          }}
                          className={delBtn}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {line.vtChildren.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-2 text-center text-[11px] text-zinc-600">Chưa có vật tư</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-2">
              <AddInline
                placeholder="+ vật tư"
                onAdd={(name) => run(() => api(`/api/projects/${projectId}/estimate/lines`, { method: "POST", body: JSON.stringify({ kind: "vt", parentLineId: line.id, name, unit: line.unit || "cái", quantity: 0 }) }))}
              />
            </div>
          </section>

          {/* Yêu cầu chỉnh sửa (đánh dấu) */}
          <section>
            <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-400">
              <Flag className="h-3.5 w-3.5" /> Yêu cầu chỉnh sửa
            </h4>
            <div className={`rounded-lg border px-3 py-2 text-sm ${line.fixRequest ? "border-amber-500/40 bg-amber-500/5 text-amber-100" : "border-[#252840] bg-[#13151f] text-zinc-200"}`}>
              <EditableText value={line.fixRequest ?? ""} multiline placeholder="Ghi điều cần sửa để đánh dấu — rồi nhắn Claude vào sửa…" onSave={(v) => patch({ fixRequest: v })} />
            </div>
            <p className="mt-1 text-[11px] text-zinc-600">Đánh dấu ở đây; công tác sẽ hiện cờ 🚩 ngoài danh sách.</p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
