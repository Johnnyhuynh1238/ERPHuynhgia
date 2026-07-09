"use client";

import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Contrib = {
  itemId: string;
  itemName: string;
  componentName: string; // tên hạng mục
  stage: string; // tên nhóm
  quantity: number;
  qtyPerUnit: number;
  k: number;
  contrib: number;
};

type NccInfo = {
  materialPriceId: string;
  name: string;
  unit: string;
  price: number;
  factor: number; // 1 đơn vị NCC = factor đơn vị định mức
  qty: number; // số lượng theo đơn vị NCC (giữ lẻ)
  note: string | null;
};

type ResourceRow = {
  name?: string;
  grade?: string;
  unit?: string;
  total: number;
  price: number | null;
  amount: number | null;
  contributions: Contrib[];
  ncc?: NccInfo | null; // hàng NCC đã map (vật tư định mức)
  direct?: boolean; // line vật tư mua thẳng NCC (thép bóc chi tiết)
  lineName?: string;
  lineId?: string; // direct: id estimate_line để đổi hàng NCC
  materialPriceId?: string; // direct: hàng NCC hiện tại
};

type NccPrice = { id: string; name: string; unit: string; price: number; source: string | null };

type Consumption = {
  materials: ResourceRow[];
  labor: ResourceRow[];
  machines: ResourceRow[];
  itemsWithoutNorm: Array<{ id: string; stage: string | null; name: string; componentName: string }>;
  itemsWithNormNoData: Array<{ id: string; stage: string | null; name: string; componentName: string; normCode: string }>;
  totals: {
    materialAmount: number;
    laborAmount: number;
    machineAmount: number;
    grandTotal: number;
    materialsMissingPrice: number;
    laborMissingPrice: number;
    machinesMissingPrice: number;
  };
  lineCount: number;
  draftCount: number;
};

const fmt = (n: number, d = 3) => n.toLocaleString("vi-VN", { maximumFractionDigits: d });

export function HaoPhiTab({ projectId, kind }: { projectId: string; kind: "vt" | "ncmm" }) {
  const [data, setData] = useState<Consumption | null>(null);

  const reload = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/estimate/consumption`, { cache: "no-store" });
    if (!r.ok) {
      toast.error("Không tải được hao phí");
      return;
    }
    setData(await r.json());
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!data) {
    return (
      <div className="grid place-items-center rounded-2xl border border-[#252840] bg-[#13151f] p-16">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (data.lineCount === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#252840] bg-[#13151f] p-10 text-center">
        <p className="text-sm font-semibold text-zinc-300">Chưa có công tác nào</p>
        <p className="mt-1 text-xs text-zinc-500">Hao phí tính từ tab Khối lượng — cần AI bóc xong công tác trước.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SummaryBar data={data} kind={kind} />

      {data.draftCount > 0 && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
          ⚠ Đang tính cả {data.draftCount} công tác AI nháp chưa duyệt — số liệu sẽ chốt khi anh duyệt hết ở tab Khối lượng.
        </p>
      )}

      {kind === "vt" ? (
        <ResourceTable
          title="Hao phí vật tư"
          rows={data.materials}
          cols={{ name: "Vật tư", qty: "Tổng KL", priceUnit: "Đơn giá" }}
          missingPrice={data.totals.materialsMissingPrice}
          projectId={projectId}
          onMapChanged={reload}
          getKey={(r) => `${r.name}__${r.unit}${r.direct ? `__${r.lineName}` : ""}`}
          getName={(r) => r.name ?? ""}
          getUnit={(r) => r.unit ?? ""}
        />
      ) : (
        <>
          <ResourceTable
            title="Hao phí nhân công"
            rows={data.labor}
            cols={{ name: "Bậc thợ", qty: "Số công", priceUnit: "Đơn giá công" }}
            missingPrice={data.totals.laborMissingPrice}
            getKey={(r) => r.grade ?? ""}
            getName={(r) => `Thợ bậc ${r.grade}`}
            getUnit={() => "công"}
          />
          <ResourceTable
            title="Hao phí máy móc thiết bị"
            rows={data.machines}
            cols={{ name: "Máy / thiết bị", qty: "Số ca", priceUnit: "Đơn giá ca" }}
            missingPrice={data.totals.machinesMissingPrice}
            getKey={(r) => r.name ?? ""}
            getName={(r) => r.name ?? ""}
            getUnit={() => "ca"}
          />
        </>
      )}

      {(data.itemsWithoutNorm.length > 0 || data.itemsWithNormNoData.length > 0) && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-bold text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Công tác chưa tính được hao phí
          </p>
          <ul className="mt-2 space-y-1 text-zinc-400">
            {data.itemsWithoutNorm.map((it) => (
              <li key={it.id}>
                • <span className="text-zinc-300">{it.name}</span> ({it.componentName}) — chưa map mã định mức, sửa ở tab Khối lượng
              </li>
            ))}
            {data.itemsWithNormNoData.map((it) => (
              <li key={it.id}>
                • <span className="text-zinc-300">{it.name}</span> ({it.componentName}) — định mức {it.normCode} chưa nhập hao phí, bổ sung ở tab Định mức
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SummaryBar({ data, kind }: { data: Consumption; kind: "vt" | "ncmm" }) {
  const t = data.totals;
  const tiles =
    kind === "vt"
      ? [{ label: "Thành tiền vật tư", value: t.materialAmount, accent: true }]
      : [
          { label: "Thành tiền nhân công", value: t.laborAmount, accent: false },
          { label: "Thành tiền máy", value: t.machineAmount, accent: false },
          { label: "Tổng NC + máy", value: t.laborAmount + t.machineAmount, accent: true },
        ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className={`rounded-xl border p-3 ${tile.accent ? "border-[#f97316]/40 bg-[#f97316]/10" : "border-[#252840] bg-[#13151f]"}`}>
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">{tile.label}</p>
          <p className={`mt-0.5 text-base font-bold tabular-nums ${tile.accent ? "text-[#fb923c]" : "text-zinc-100"}`}>
            {fmt(tile.value, 0)} ₫
          </p>
        </div>
      ))}
      <div className="rounded-xl border border-[#252840] bg-[#13151f] p-3">
        <p className="text-[10px] uppercase tracking-wide text-zinc-500">Tổng dự toán (VT+NC+MM)</p>
        <p className="mt-0.5 text-base font-bold tabular-nums text-zinc-100">{fmt(data.totals.grandTotal, 0)} ₫</p>
      </div>
    </div>
  );
}

function ResourceTable({
  title,
  rows,
  cols,
  missingPrice,
  projectId,
  onMapChanged,
  getKey,
  getName,
  getUnit,
}: {
  title: string;
  rows: ResourceRow[];
  cols: { name: string; qty: string; priceUnit: string };
  missingPrice: number;
  projectId?: string; // có = bảng vật tư, cho phép chọn hàng NCC
  onMapChanged?: () => void;
  getKey: (r: ResourceRow) => string;
  getName: (r: ResourceRow) => string;
  getUnit: (r: ResourceRow) => string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [mapping, setMapping] = useState<ResourceRow | null>(null);
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#252840] bg-[#13151f]">
      <div className="flex items-center justify-between border-b border-[#252840] px-3 py-2.5">
        <h3 className="text-[13px] font-bold text-[#fb923c]">{title}</h3>
        {missingPrice > 0 && (
          <span className="text-[10px] font-semibold text-amber-400">⚠ {missingPrice} dòng thiếu đơn giá — bổ sung ở tab Đơn giá</span>
        )}
      </div>
      <table className="w-full min-w-[720px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[#252840] text-[11px] uppercase tracking-wide text-zinc-500">
            <th className="w-[34%] px-3 py-2 font-semibold">{cols.name}</th>
            <th className="w-[8%] px-3 py-2 font-semibold">ĐV</th>
            <th className="w-[16%] px-3 py-2 text-right font-semibold">{cols.qty}</th>
            <th className="w-[18%] px-3 py-2 text-right font-semibold">{cols.priceUnit}</th>
            <th className="w-[24%] px-3 py-2 text-right font-semibold">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-zinc-600">Không có dòng nào</td>
            </tr>
          )}
          {rows.map((r) => {
            const key = getKey(r);
            const isOpen = open.has(key);
            return (
              <Fragment key={key}>
                <tr onClick={() => toggle(key)} className="cursor-pointer border-b border-[#1c1f30] transition-colors hover:bg-[#171a28]">
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5 text-zinc-200">
                      {isOpen ? <ChevronDown className="h-3 w-3 text-zinc-500" /> : <ChevronRight className="h-3 w-3 text-zinc-500" />}
                      {getName(r)}
                      {r.direct && (
                        <span className="rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold text-violet-400">MUA THẲNG</span>
                      )}
                    </span>
                    {projectId && !r.direct ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMapping(r); }}
                        className="pl-[18px] text-left text-[10px] text-zinc-500 hover:text-[#fb923c]"
                      >
                        {r.ncc ? (
                          <>NCC: <span className="text-[#fb923c]">{r.ncc.name}</span> · {fmt(r.ncc.qty, 2)} {r.ncc.unit} — đổi ▾</>
                        ) : (
                          <>chưa chọn NCC — chọn ▾</>
                        )}
                      </button>
                    ) : projectId && r.direct ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setMapping(r); }}
                        className="block pl-[18px] text-left text-[10px] text-zinc-500 hover:text-[#fb923c]"
                      >
                        <span className="text-zinc-600">{r.lineName}</span> — NCC: <span className="text-[#fb923c]">{getName(r)}</span> đổi ▾
                      </button>
                    ) : (
                      <p className="pl-[18px] text-[10px] text-zinc-600">
                        {r.direct ? r.lineName : `${r.contributions.length} công tác đóng góp`}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-400">{r.ncc ? r.ncc.unit : getUnit(r)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-zinc-100">
                    {r.ncc ? (
                      <>
                        {fmt(r.ncc.qty, 2)}
                        <p className="text-[10px] font-normal text-zinc-600">= {fmt(r.total)} {getUnit(r)}</p>
                      </>
                    ) : (
                      fmt(r.total)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                    {r.ncc ? fmt(r.ncc.price, 0) : r.price != null ? fmt(r.price, 0) : <span className="text-amber-500">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-zinc-100">
                    {r.amount != null ? fmt(r.amount, 0) : <span className="text-amber-500">thiếu giá</span>}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-[#1c1f30] bg-[#0f1220]/60">
                    <td colSpan={5} className="px-3 py-2">
                      <div className="space-y-1 pl-[18px] text-[11px]">
                        {r.contributions.map((c, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-zinc-400">
                            <span className="truncate">
                              <span className="text-zinc-600">[{c.stage}]</span> <span className="text-zinc-500">{c.componentName} /</span> {c.itemName}
                            </span>
                            <span className="shrink-0 font-mono tabular-nums">
                              {fmt(c.quantity)} × {fmt(c.qtyPerUnit, 4)}
                              {c.k !== 1 ? ` × ${fmt(c.k, 2)}` : ""} = <span className="text-zinc-200">{fmt(c.contrib)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {mapping && projectId && (
        <MapNccModal
          projectId={projectId}
          row={mapping}
          onClose={() => setMapping(null)}
          onSaved={() => {
            setMapping(null);
            onMapChanged?.();
          }}
        />
      )}
    </div>
  );
}

// Modal chọn hàng NCC cho 1 vật tư định mức + hệ số quy đổi
function MapNccModal({
  projectId,
  row,
  onClose,
  onSaved,
}: {
  projectId: string;
  row: ResourceRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prices, setPrices] = useState<NccPrice[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>(row.direct ? (row.materialPriceId ?? "") : (row.ncc?.materialPriceId ?? ""));
  const [factor, setFactor] = useState(String(row.ncc?.factor ?? 1));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/projects/${projectId}/estimate/material-map`, { cache: "no-store" });
      if (r.ok) setPrices((await r.json()).prices);
    })();
  }, [projectId]);

  const save = async (materialPriceId: string | null) => {
    setSaving(true);
    // Direct (mua thẳng): đổi hàng NCC thẳng trên estimate_line. Định mức: lưu qua material-map.
    const r = row.direct && row.lineId
      ? await fetch(`/api/estimate/lines/${row.lineId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ materialPriceId }),
        })
      : await fetch(`/api/projects/${projectId}/estimate/material-map`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ srcName: row.name, srcUnit: row.unit, materialPriceId, factor: Number(factor) || 1 }),
        });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      toast.error(j.message || "Lỗi lưu");
      return;
    }
    onSaved();
  };

  const q = search.trim().toLowerCase();
  const filtered = q ? prices.filter((p) => p.name.toLowerCase().includes(q)) : prices;
  const sel = prices.find((p) => p.id === selected);
  const sameUnit = sel && sel.unit === row.unit;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#13151f] p-4" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-sm font-bold text-zinc-100">Chọn hàng NCC</h4>
        <p className="mt-0.5 text-xs text-zinc-500">
          {row.direct ? (
            <>Vật tư mua thẳng: <b className="text-zinc-300">{row.lineName}</b> — {fmt(row.total)} {row.unit}. Đổi hàng NCC (đơn giá lấy theo hàng chọn).</>
          ) : (
            <>Cho vật tư định mức: <b className="text-zinc-300">{row.name}</b> ({row.unit}) — cần {fmt(row.total)} {row.unit}</>
          )}
        </p>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm vật tư NCC…"
          className="mt-3 w-full rounded-lg border border-[#374151] bg-[#0d0f17] px-2.5 py-1.5 text-xs text-zinc-100 outline-none focus:border-[#f97316]/60"
        />

        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setSelected(p.id);
                if (p.unit === row.unit) setFactor("1");
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                selected === p.id ? "border-[#f97316]/60 bg-[#f97316]/10 text-zinc-100" : "border-[#252840] text-zinc-300 hover:bg-[#1a1d2e]"
              }`}
            >
              <span className="truncate">
                {p.name}
                {p.source && <span className="block truncate text-[9px] text-zinc-600">{p.source}</span>}
              </span>
              <span className="shrink-0 tabular-nums text-zinc-400">{fmt(p.price, 0)}đ/{p.unit}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="py-4 text-center text-xs text-zinc-600">Không tìm thấy</p>}
        </div>

        {sel && !sameUnit && !row.direct && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-xs text-zinc-300">
            <span>1 {sel.unit} =</span>
            <input
              type="number"
              min={0}
              step="any"
              value={factor}
              onChange={(e) => setFactor(e.target.value)}
              className="w-20 rounded-md border border-[#374151] bg-[#0d0f17] px-1.5 py-1 text-right text-zinc-100 outline-none focus:border-[#f97316]/60"
            />
            <span>{row.unit}</span>
            <span className="ml-auto text-[10px] text-zinc-500">VD: 1 bao = 50 kg</span>
          </div>
        )}

        <div className="mt-3 flex justify-between gap-2">
          {row.ncc && (
            <button
              onClick={() => save(null)}
              disabled={saving}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
            >
              Bỏ map
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
              Huỷ
            </button>
            <button
              onClick={() => selected && save(selected)}
              disabled={!selected || saving}
              className="rounded-lg bg-[#f97316] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#ea580c] disabled:opacity-50"
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
