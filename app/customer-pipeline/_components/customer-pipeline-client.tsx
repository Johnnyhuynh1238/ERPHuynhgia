"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CustomerDetailDrawer } from "./customer-detail-drawer";
import { CreateCustomerModal } from "./create-customer-modal";
import { StageTransitionMenu } from "./stage-transition-menu";

type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Row = {
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

const STAGE_ACCENT: Record<Stage, string> = {
  1: "before:bg-amber-400",
  2: "before:bg-blue-400",
  3: "before:bg-violet-400",
  4: "before:bg-cyan-400",
  5: "before:bg-orange-400",
  6: "before:bg-emerald-400",
  7: "before:bg-slate-400",
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | Stage>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [transitionRow, setTransitionRow] = useState<Row | null>(null);

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
        <div className="flex flex-wrap items-center gap-2">
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
          <Button onClick={() => setShowCreate(true)} className="h-9 bg-amber-500 text-black hover:bg-amber-400">
            + Tạo khách
          </Button>
        </div>
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

      {loading && items.length === 0 ? (
        <div className="rounded-2xl border border-[#252840] bg-[#13151f] px-4 py-12 text-center text-[#8892b0]">
          Đang tải…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#252840] bg-[#13151f] px-4 py-12 text-center text-[#8892b0]">
          Không có khách hàng nào ở {tab === "all" ? "hệ thống" : "stage này"}.
          <div className="mt-3">
            <Button onClick={() => setShowCreate(true)} variant="outline" className="h-9">+ Tạo khách mới</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((row) => (
            <article
              key={row.customerKey}
              className={`relative overflow-hidden rounded-2xl border border-[#252840] bg-[#13151f] p-4 transition before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${STAGE_ACCENT[row.stage]} hover-card`}
            >
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="block w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-white">{row.customerName}</div>
                    <div className="truncate text-xs text-[#8892b0]">
                      {row.customerPhone}
                      {row.projectCode ? ` · ${row.projectCode}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STAGE_PILL[row.stage]}`}>
                    [{row.stage}] {row.stageLabel}
                  </span>
                </div>

                {row.subLabel && (
                  <div className="mt-1 text-xs text-[#8892b0]">{row.subLabel}</div>
                )}

                {row.hotFlag && (
                  <div className="mt-2 inline-flex items-center rounded-md bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-300">
                    ⚠ {row.hotFlag}
                  </div>
                )}

                <div className="mt-3 rounded-lg border border-[#252840] bg-[#0f1117] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-[#8892b0]">Cần làm tiếp</div>
                  <div className="text-sm text-[#cdd3e1]">{row.nextAction}</div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8892b0]">
                  <span>⏱ {row.daysInStage} ngày</span>
                  <span className="tabular-nums">{formatVnd(row.contractValue)}</span>
                </div>
              </button>

              <div className="mt-3 flex flex-wrap gap-2 border-t border-[#252840] pt-3">
                <Button
                  variant="outline"
                  className="h-8 flex-1 text-xs"
                  onClick={() => setSelected(row)}
                >
                  Chi tiết
                </Button>
                <Button
                  className="h-8 flex-1 bg-amber-500/90 text-xs text-black hover:bg-amber-400"
                  onClick={() => setTransitionRow(row)}
                >
                  Chuyển giai đoạn →
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <CustomerDetailDrawer
          row={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      )}

      {showCreate && (
        <CreateCustomerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {transitionRow && (
        <StageTransitionMenu
          row={transitionRow}
          onClose={() => setTransitionRow(null)}
          onChanged={() => {
            setTransitionRow(null);
            load();
          }}
        />
      )}

      <style jsx>{`
        @media (hover: hover) {
          .hover-card:hover { border-color: #3a4060; transform: translateY(-1px); }
          .hover-bright:hover { color: white; }
        }
      `}</style>
    </div>
  );
}
