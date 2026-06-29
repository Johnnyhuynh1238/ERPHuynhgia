"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Plus } from "lucide-react";

export type PickedMaterial = { name: string; unit: string; budgetQty: number | null };

type BudgetItem = { name: string; unit: string; budgetQty: number };

export function MaterialPicker({
  projectId,
  onPick,
  onClose,
}: {
  projectId: string;
  onPick: (m: PickedMaterial) => void;
  onClose: () => void;
}) {
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUnit, setCustomUnit] = useState("");

  useEffect(() => {
    fetch(`/api/ks-ql/sub/${projectId}/material-picker`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setBudgetItems(Array.isArray(j.items) ? j.items : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return budgetItems;
    return budgetItems.filter((it) => it.name.toLowerCase().includes(qq));
  }, [budgetItems, q]);

  function pickFromBudget(it: BudgetItem) {
    onPick({ name: it.name, unit: it.unit, budgetQty: it.budgetQty });
  }

  function pickCustom() {
    if (!customName.trim() || !customUnit.trim()) return;
    onPick({ name: customName.trim(), unit: customUnit.trim(), budgetQty: null });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1320] text-[#f5ede4]">
      <div className="flex items-center justify-between border-b border-[#252840] px-4 py-4">
        <h2 className="text-xl font-bold text-orange-300">Chọn loại vật tư</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-full bg-[#1a1d2e] p-2 hover:bg-[#252840]"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {!customMode ? (
        <>
          <div className="px-4 pt-4">
            <div className="flex items-center gap-2 rounded-xl border-2 border-[#2d3249] bg-[#13151f] px-4 py-3">
              <Search className="h-5 w-5 text-[#8892b0]" />
              <input
                autoFocus
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Tìm vật tư..."
                className="w-full bg-transparent text-lg text-[#f5ede4] outline-none placeholder:text-[#5b6481]"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="text-center text-base text-[#8892b0]">Đang tải...</div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border-2 border-[#252840] bg-[#13151f] px-4 py-6 text-center text-base text-[#8892b0]">
                {budgetItems.length === 0
                  ? "Dự án chưa có dự toán vật tư"
                  : "Không tìm thấy"}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map((it, i) => (
                  <button
                    key={`${it.name}-${it.unit}-${i}`}
                    type="button"
                    onClick={() => pickFromBudget(it)}
                    className="flex items-center justify-between rounded-2xl border-2 border-[#252840] bg-[#13151f] px-5 py-4 text-left transition hover:border-[#ff8a3d]/40"
                  >
                    <div>
                      <div className="text-lg font-medium text-[#f5ede4]">{it.name}</div>
                      <div className="mt-1 text-sm text-[#8892b0]">Đơn vị: {it.unit}</div>
                    </div>
                    <div className="text-sm text-orange-300">
                      DT: {Math.round(it.budgetQty).toLocaleString("vi-VN")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-[#252840] px-4 py-4">
            <button
              type="button"
              onClick={() => setCustomMode(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#ff8a3d]/40 px-4 py-4 text-base font-semibold text-orange-300 hover:bg-[#ff8a3d]/10"
            >
              <Plus className="h-5 w-5" />
              VẬT TƯ PHỤ (không có trong dự toán)
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col gap-4 px-4 py-6">
          <div>
            <label className="mb-2 block text-base text-[#8892b0]">Tên vật tư phụ</label>
            <input
              autoFocus
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="VD: Đinh sắt"
              className="w-full rounded-xl border-2 border-[#2d3249] bg-[#13151f] px-4 py-3 text-lg text-[#f5ede4]"
            />
          </div>
          <div>
            <label className="mb-2 block text-base text-[#8892b0]">Đơn vị</label>
            <input
              type="text"
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value)}
              placeholder="VD: kg, hộp, cây..."
              className="w-full rounded-xl border-2 border-[#2d3249] bg-[#13151f] px-4 py-3 text-lg text-[#f5ede4]"
            />
          </div>
          <div className="mt-auto flex gap-3">
            <button
              type="button"
              onClick={() => setCustomMode(false)}
              className="flex-1 rounded-2xl border-2 border-[#252840] bg-[#13151f] px-4 py-4 text-base font-semibold text-[#f5ede4] hover:bg-[#1a1d2e]"
            >
              Quay lại danh sách
            </button>
            <button
              type="button"
              onClick={pickCustom}
              disabled={!customName.trim() || !customUnit.trim()}
              className="flex-1 rounded-2xl bg-[#ff8a3d] px-4 py-4 text-base font-bold text-black hover:bg-[#fb923c] disabled:opacity-50"
            >
              Chọn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
