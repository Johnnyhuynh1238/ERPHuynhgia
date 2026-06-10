"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CustomerDetailDrawer } from "./customer-detail-drawer";

type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type Row = {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  stage: Stage;
  stageLabel: string;
  subLabel: string | null;
  daysInStage: number;
  hotFlag: string | null;
  nextAction: string;
  contractValue: number | null;
  projectId: string | null;
  projectCode: string | null;
  designContractId: string | null;
  leadId: string | null;
  lastActivityAt: string;
};

type ApiResponse = {
  counts: Record<Stage, number>;
  total: number;
  items: Row[];
};

const STAGE_TABS: { value: "all" | Stage; label: string; short: string }[] = [
  { value: "all", label: "Tất cả", short: "Tất cả" },
  { value: 1, label: "Lead mới", short: "Lead" },
  { value: 2, label: "Đã liên hệ", short: "Liên hệ" },
  { value: 3, label: "HĐ Thiết kế", short: "Thiết kế" },
  { value: 4, label: "Chuẩn bị TC", short: "CB TC" },
  { value: 5, label: "Đang thi công", short: "Thi công" },
  { value: 6, label: "Bàn giao", short: "Bàn giao" },
  { value: 7, label: "Bảo hành", short: "Bảo hành" },
];

const STAGE_PILL: Record<Stage, string> = {
  1: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  2: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  3: "bg-violet-500/15 text-violet-300 border-violet-500/40",
  4: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
  5: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  6: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  7: "bg-slate-500/15 text-slate-300 border-slate-500/40",
};

function formatVnd(n: number | null) {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2).replace(/\.00$/, "") + " tỷ";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + " tr";
  return n.toLocaleString("vi-VN") + "đ";
}

export function CustomerPipelineClient() {
  const [items, setItems] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<Stage, number>>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Stage>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (tab !== "all") params.set("stage", String(tab));
      if (search) params.set("q", search);
      const res = await fetch(`/api/admin/customer-pipeline?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("load failed");
      const data: ApiResponse = await res.json();
      setItems(data.items);
      setCounts(data.counts);
      setTotal(data.total);
    } catch {
      toast.error("Không tải được pipeline khách hàng");
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    load();
  }, [load]);

  const totalAll = useMemo(
    () => Object.values(counts).reduce((a, b) => a + b, 0),
    [counts],
  );
  const hotCount = useMemo(() => items.filter((it) => it.hotFlag).length, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline khách hàng</h1>
          <p className="text-sm text-[#8892b0]">
            Tổng quan từng khách hàng từ lead → bảo hành. Tổng <b>{totalAll}</b> khách
            {hotCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300">
                {hotCount} cần xử lý
              </span>
            )}
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Tìm tên / SĐT / mã DA"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline" className="h-9">Tìm</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {([1, 2, 3, 4, 5, 6, 7] as Stage[]).map((s) => {
          const active = tab === s;
          const label = STAGE_TABS.find((t) => t.value === s)!.short;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setTab(active ? "all" : s)}
              className={`rounded-2xl border px-3 py-2 text-left transition ${
                active
                  ? STAGE_PILL[s] + " ring-1 ring-current"
                  : "border-[#252840] bg-[#13151f] text-[#8892b0] hover-bright"
              }`}
            >
              <div className="text-xs">{`[${s}] ${label}`}</div>
              <div className="text-2xl font-semibold tabular-nums text-white">{counts[s]}</div>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-[#252840]">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-[#13151f] text-left text-xs uppercase tracking-wide text-[#8892b0]">
            <tr>
              <th className="px-4 py-3">Khách hàng</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3 text-right">Ngày trong stage</th>
              <th className="px-4 py-3">Cần làm tiếp</th>
              <th className="px-4 py-3 text-right">Giá trị HĐ</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[#8892b0]">Đang tải…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[#8892b0]">Không có khách hàng nào ở stage này</td></tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.customerKey}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer border-t border-[#252840] transition hover-row"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.customerName}</div>
                    <div className="text-xs text-[#8892b0]">{row.customerPhone}{row.projectCode ? ` · ${row.projectCode}` : ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${STAGE_PILL[row.stage]}`}>
                      [{row.stage}] {row.stageLabel}
                    </span>
                    {row.subLabel && (
                      <div className="mt-1 text-xs text-[#8892b0]">{row.subLabel}</div>
                    )}
                    {row.hotFlag && (
                      <div className="mt-1 inline-flex items-center rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-medium text-rose-300">
                        ⚠ {row.hotFlag}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.daysInStage} ngày</td>
                  <td className="px-4 py-3 text-[#cdd3e1]">{row.nextAction}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatVnd(row.contractValue)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <CustomerDetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}

      <style jsx>{`
        @media (hover: hover) {
          .hover-row:hover { background: rgba(45, 50, 73, 0.4); }
          .hover-bright:hover { color: white; }
        }
      `}</style>
    </div>
  );
}
