"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MaterialItem = { id: string; name: string; isAvailable: boolean; orderIndex: number };

export function MaterialSection({ taskId, canUpdateQc, canManageItem }: { taskId: string; canUpdateQc: boolean; canManageItem: boolean }) {
  const [items, setItems] = useState<MaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const available = useMemo(() => items.filter((item) => item.isAvailable).length, [items]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tasks/${taskId}/material-items`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Không tải được vật tư");
        if (!cancelled) setItems(json.items || []);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [taskId]);

  async function patchItem(item: MaterialItem, patch: Partial<Pick<MaterialItem, "isAvailable" | "name">>) {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, ...patch } : x)));
    const res = await fetch(`/api/tasks/${taskId}/material-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setItems(prev);
      toast.error(json.message || "Cập nhật vật tư thất bại");
      return;
    }
    setItems((xs) => xs.map((x) => (x.id === item.id ? json.item : x)));
  }

  async function addItem() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch(`/api/tasks/${taskId}/material-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thêm được vật tư");
      return;
    }
    setItems((xs) => [...xs, json.item].sort((a, b) => a.orderIndex - b.orderIndex));
    setNewName("");
    setAdding(false);
  }

  async function deleteItem(item: MaterialItem) {
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    const res = await fetch(`/api/tasks/${taskId}/material-items/${item.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setItems(prev);
      toast.error(json.message || "Không xóa được vật tư");
    }
  }

  return (
    <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Vật tư cần dùng</div>
        {canManageItem ? <Button size="sm" className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={() => setAdding(true)}>+ Thêm vật tư</Button> : null}
      </div>

      {loading ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Đang tải vật tư...</div> : null}
      {!loading && items.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Chưa có vật tư.</div> : null}

      <div className="overflow-hidden rounded-xl border border-[#2e3347]">
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-3 border-b border-[#2e3347] bg-[#222637] px-3 py-3 last:border-b-0">
            <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={item.isAvailable} disabled={!canUpdateQc} onChange={(e) => patchItem(item, { isAvailable: e.target.checked })} />
            <div className={`flex-1 text-sm ${item.isAvailable ? "text-[#8891aa] line-through" : "text-[#f0f2f8]"}`}>{item.name}</div>
            {canManageItem ? <button className="opacity-0 transition group-hover:opacity-100 text-red-400" onClick={() => deleteItem(item)} title="Xóa">🗑️</button> : null}
          </div>
        ))}
        {adding ? (
          <div className="flex gap-2 bg-[#222637] p-3">
            <input autoFocus className="flex-1 rounded-xl border border-[#2e3347] bg-[#1a1d27] px-3 py-2 text-sm" placeholder="Tên vật tư" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAdding(false); }} />
            <Button className="bg-amber-500 text-[#0f1117] hover:bg-amber-600" onClick={addItem}>Lưu</Button>
          </div>
        ) : null}
      </div>
      <div className="mt-3 text-right text-xs font-semibold text-[#8891aa]">{available} / {items.length} vật tư đã có sẵn</div>
    </div>
  );
}
