"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Entry = {
  id: string;
  reportType: "technical" | "material" | "labor" | "equipment";
  reportDate: string;
  createdAt: string;
  reporter: { fullName: string; email: string };
  payload: Record<string, unknown>;
};

const TYPE_LABEL: Record<Entry["reportType"], string> = {
  technical: "Kỹ thuật",
  material: "Vật tư",
  labor: "Nhân công",
  equipment: "Thiết bị",
};

function fmtDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function JournalSection({ taskId }: { taskId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [activeType, setActiveType] = useState<"all" | Entry["reportType"]>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/tasks/${taskId}/journal`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || "Không tải được nhật ký");
        if (!cancelled) setEntries(json.entries || []);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const filtered = useMemo(
    () => (activeType === "all" ? entries : entries.filter((x) => x.reportType === activeType)),
    [entries, activeType],
  );

  return (
    <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Nhật ký báo cáo task-centric</div>

      <div className="mb-3 flex gap-2 overflow-x-auto">
        {(["all", "technical", "material", "labor", "equipment"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setActiveType(type)}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
              activeType === type ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"
            }`}
          >
            {type === "all" ? "Tất cả" : TYPE_LABEL[type]}
          </button>
        ))}
      </div>

      {loading ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Đang tải nhật ký...</div> : null}
      {!loading && filtered.length === 0 ? <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-4 text-sm text-[#8891aa]">Chưa có dữ liệu báo cáo.</div> : null}

      <div className="space-y-2">
        {filtered.map((entry) => (
          <div key={`${entry.reportType}-${entry.id}`} className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
            <div className="text-sm font-bold">{fmtDate(entry.reportDate)} · {TYPE_LABEL[entry.reportType]}</div>
            <div className="mt-1 text-xs text-[#8891aa]">{entry.reporter?.fullName || entry.reporter?.email || "-"}</div>
            <button className="mt-2 text-xs font-semibold text-amber-400 underline" onClick={() => setSelected(entry)}>Xem chi tiết</button>
          </div>
        ))}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-t-2xl border border-[#2e3347] bg-[#1a1d27] p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">{TYPE_LABEL[selected.reportType]} · {fmtDate(selected.reportDate)}</div>
                <div className="text-sm text-[#8891aa]">Người lập: {selected.reporter?.fullName || selected.reporter?.email || "-"}</div>
              </div>
              <button className="rounded-lg border border-[#2e3347] px-3 py-1 text-sm" onClick={() => setSelected(null)}>Đóng</button>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[#2e3347] bg-[#222637] p-3 text-xs text-[#f0f2f8]">{JSON.stringify(selected.payload, null, 2)}</pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}
