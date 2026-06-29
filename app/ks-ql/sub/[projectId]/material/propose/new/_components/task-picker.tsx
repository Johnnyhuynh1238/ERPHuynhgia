"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X, Check } from "lucide-react";

export type PickedTask = { id: string; name: string; phase?: string };

type ApiTask = {
  id: string;
  code: string;
  name: string;
  phase: string;
  status: string;
  plannedStartDate: string;
  plannedEndDate: string;
};

const PHASE_LABEL: Record<string, string> = {
  P1_CHUAN_BI: "Chuẩn bị",
  P2_MONG: "Móng",
  P3_THAN: "Thân",
  P4_HOAN_THIEN: "Hoàn thiện",
  P5_DIEN_NUOC: "Điện nước",
  P6_BAN_GIAO: "Bàn giao",
};

export function TaskPicker({
  projectId,
  initial,
  onConfirm,
  onClose,
}: {
  projectId: string;
  initial: PickedTask[];
  onConfirm: (tasks: PickedTask[]) => void;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<ApiTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, PickedTask>>(() => {
    const m: Record<string, PickedTask> = {};
    initial.forEach((t) => (m[t.id] = t));
    return m;
  });

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ks-ql/sub/${projectId}/tasks-picker${showAll ? "?all=1" : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setTasks(Array.isArray(j.items) ? j.items : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId, showAll]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return tasks;
    return tasks.filter((t) => t.name.toLowerCase().includes(qq) || t.code.toLowerCase().includes(qq));
  }, [tasks, q]);

  const grouped = useMemo(() => {
    const groups: Record<string, ApiTask[]> = {};
    filtered.forEach((t) => {
      const key = t.phase || "OTHER";
      groups[key] = groups[key] || [];
      groups[key].push(t);
    });
    return groups;
  }, [filtered]);

  function toggle(t: ApiTask) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[t.id]) delete next[t.id];
      else next[t.id] = { id: t.id, name: t.name, phase: t.phase };
      return next;
    });
  }

  const count = Object.keys(selected).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0f1320] text-[#f5ede4]">
      <div className="flex items-center justify-between border-b border-[#252840] px-4 py-4">
        <h2 className="text-xl font-bold text-orange-300">Chọn công tác sử dụng</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="rounded-full bg-[#1a1d2e] p-2 hover:bg-[#252840]"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="border-b border-[#252840] px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center gap-2 rounded-xl border-2 border-[#2d3249] bg-[#13151f] px-4 py-3">
          <Search className="h-5 w-5 text-[#8892b0]" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm công tác..."
            className="w-full bg-transparent text-lg text-[#f5ede4] outline-none placeholder:text-[#5b6481]"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-[#8892b0]">
            {showAll ? "Đang xem TẤT CẢ công tác" : "Đang xem công tác đang/sắp làm"}
          </span>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="rounded-full bg-[#1a1d2e] px-3 py-1 text-xs font-semibold text-orange-300 hover:bg-[#252840]"
          >
            {showAll ? "Chỉ đang làm" : "Xem tất cả"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-32">
        {loading ? (
          <div className="text-center text-base text-[#8892b0]">Đang tải...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border-2 border-[#252840] bg-[#13151f] px-4 py-6 text-center text-base text-[#8892b0]">
            {showAll ? "Dự án chưa có công tác" : "Không có công tác đang/sắp làm — bấm \"Xem tất cả\""}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {Object.entries(grouped).map(([phase, list]) => (
              <div key={phase}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-orange-300">
                  {PHASE_LABEL[phase] || phase}
                </div>
                <div className="flex flex-col gap-2">
                  {list.map((t) => {
                    const isSelected = !!selected[t.id];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(t)}
                        className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left transition ${
                          isSelected
                            ? "border-[#ff8a3d] bg-[#ff8a3d]/10"
                            : "border-[#252840] bg-[#13151f] hover:border-[#ff8a3d]/40"
                        }`}
                      >
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 ${
                            isSelected ? "border-[#ff8a3d] bg-[#ff8a3d]" : "border-[#5b6481] bg-transparent"
                          }`}
                        >
                          {isSelected ? <Check className="h-5 w-5 text-black" /> : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-medium text-[#f5ede4]">{t.name}</div>
                          <div className="mt-0.5 text-xs text-[#8892b0]">
                            {t.code} ·{" "}
                            {t.status === "in_progress"
                              ? "Đang làm"
                              : t.status === "not_started"
                                ? "Chưa làm"
                                : t.status}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-[#0f1320] to-transparent px-4 pb-5 pt-8">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={() => onConfirm(Object.values(selected))}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#ff8a3d] px-6 py-4 text-lg font-bold text-black shadow-lg active:scale-[0.99]"
          >
            <Check className="h-6 w-6" />
            XONG ({count} công tác)
          </button>
        </div>
      </div>
    </div>
  );
}
