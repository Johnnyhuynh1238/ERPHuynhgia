"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EditableText } from "./editable-text";
import { api, type EstimateData, fmtQty, fmtVnd, type Vt } from "./estimate-data";

type FlatVt = {
  vt: Vt;
  groupName: string;
  itemId: string;
  itemName: string;
  congTacId: string;
  congTacName: string;
};

type ViewKey = "tong" | "hang-muc" | "chi-tiet";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "tong", label: "Tổng hợp" },
  { key: "hang-muc", label: "Theo hạng mục" },
  { key: "chi-tiet", label: "Chi tiết công tác" },
];

// Ô giá sửa tại chỗ
function PriceCell({ value, onSave }: { value: number | null; onSave: (n: number | null) => Promise<void> }) {
  return (
    <EditableText
      value={value == null ? "" : String(value)}
      className="text-right"
      placeholder="nhập giá"
      onSave={async (v) => {
        const t = v.replace(/[^\d]/g, "");
        if (t === "") return onSave(null);
        const n = Number(t);
        if (!Number.isFinite(n) || n < 0) {
          toast.error("Giá không hợp lệ");
          return;
        }
        await onSave(n);
      }}
    />
  );
}

export function VatTuTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<EstimateData | null>(null);
  const [view, setView] = useState<ViewKey>("tong");

  const reload = useCallback(async () => {
    try {
      setData(await api(`/api/projects/${projectId}/estimate/lines`));
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
  const patchVt = (id: string, body: Record<string, unknown>) =>
    api(`/api/estimate/lines/${id}`, { method: "PATCH", body: JSON.stringify(body) });

  const flat = useMemo<FlatVt[]>(() => {
    if (!data) return [];
    const out: FlatVt[] = [];
    for (const g of data.groups)
      for (const it of g.items)
        for (const ct of it.lines)
          for (const vt of ct.vtChildren)
            out.push({ vt, groupName: g.name, itemId: it.id, itemName: it.name, congTacId: ct.id, congTacName: ct.name });
    return out;
  }, [data]);

  if (data === null) {
    return (
      <div className="grid place-items-center rounded-2xl border border-[#252840] bg-[#13151f] p-16">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  const grand = flat.reduce((s, f) => s + f.vt.quantity * (f.vt.directUnitPrice ?? 0), 0);

  return (
    <div className="space-y-3 px-3 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border border-[#252840] bg-[#13151f] p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === v.key ? "bg-[#f97316]/20 text-[#fb923c]" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-zinc-400">
          Tổng dự kiến mua: <b className="text-emerald-400">{fmtVnd(Math.round(grand))}đ</b>
        </div>
      </div>

      {flat.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#252840] bg-[#13151f] p-8 text-center text-sm text-zinc-500">
          Chưa có vật tư. Qua tab <b className="text-zinc-300">Khối lượng</b> gắn vật tư vào công tác.
        </div>
      ) : view === "tong" ? (
        <TongView flat={flat} run={run} patchVt={patchVt} />
      ) : view === "hang-muc" ? (
        <HangMucView flat={flat} run={run} patchVt={patchVt} />
      ) : (
        <ChiTietView flat={flat} run={run} patchVt={patchVt} />
      )}
    </div>
  );
}

type ViewProps = {
  flat: FlatVt[];
  run: (fn: () => Promise<unknown>) => Promise<void>;
  patchVt: (id: string, body: Record<string, unknown>) => Promise<unknown>;
};

// View Tổng hợp: gộp theo tên+đơn vị, giá sửa 1 lần áp cho mọi dòng cùng vật tư
function TongView({ flat, run, patchVt }: ViewProps) {
  const rows = useMemo(() => {
    const m = new Map<
      string,
      { name: string; unit: string; qty: number; price: number | null; multiPrice: boolean; ids: string[]; refs: { name: string; qty: number }[] }
    >();
    for (const f of flat) {
      const key = `${f.vt.name.toLowerCase()}|${f.vt.unit.toLowerCase()}`;
      const cur = m.get(key);
      const price = f.vt.directUnitPrice;
      if (!cur) {
        m.set(key, { name: f.vt.name, unit: f.vt.unit, qty: f.vt.quantity, price, multiPrice: false, ids: [f.vt.id], refs: [{ name: f.congTacName, qty: f.vt.quantity }] });
      } else {
        cur.qty += f.vt.quantity;
        cur.ids.push(f.vt.id);
        cur.refs.push({ name: f.congTacName, qty: f.vt.quantity });
        if (price != null && cur.price != null && price !== cur.price) cur.multiPrice = true;
        if (cur.price == null) cur.price = price;
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [flat]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#252840] bg-[#13151f]">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-[#252840] text-left text-xs text-zinc-500">
            <th className="px-3 py-2 font-medium">Vật tư</th>
            <th className="w-16 px-2 py-2 font-medium">ĐVT</th>
            <th className="w-28 px-2 py-2 text-right font-medium">Tổng KL</th>
            <th className="w-32 px-2 py-2 text-right font-medium">Giá mua</th>
            <th className="w-32 px-2 py-2 text-right font-medium">Thành tiền</th>
            <th className="px-3 py-2 font-medium">Dùng cho</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name + r.unit} className="border-b border-[#1c1f2e] align-top">
              <td className="px-3 py-2 font-medium text-zinc-100">{r.name}</td>
              <td className="px-2 py-2 text-zinc-400">{r.unit}</td>
              <td className="px-2 py-2 text-right text-zinc-200">{fmtQty(r.qty)}</td>
              <td className="px-2 py-2 text-right text-zinc-200">
                <PriceCell
                  value={r.multiPrice ? null : r.price}
                  onSave={(n) => run(async () => { for (const id of r.ids) await patchVt(id, { directUnitPrice: n }); })}
                />
                {r.multiPrice && <div className="text-[10px] text-amber-400">nhiều giá</div>}
              </td>
              <td className="px-2 py-2 text-right text-emerald-400">
                {r.price != null && !r.multiPrice ? fmtVnd(Math.round(r.qty * r.price)) : "—"}
              </td>
              <td className="px-3 py-2 text-xs text-zinc-500">
                {r.refs.map((x, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {x.name} <span className="text-zinc-600">({fmtQty(x.qty)})</span>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// View theo hạng mục: nhóm VT theo hạng mục, subtotal mỗi hạng mục
function HangMucView({ flat, run, patchVt }: ViewProps) {
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; items: FlatVt[] }>();
    for (const f of flat) {
      const cur = m.get(f.itemId) ?? { name: `${f.groupName} · ${f.itemName}`, items: [] };
      cur.items.push(f);
      m.set(f.itemId, cur);
    }
    return Array.from(m.values());
  }, [flat]);

  return (
    <div className="space-y-3">
      {groups.map((g, gi) => {
        const sub = g.items.reduce((s, f) => s + f.vt.quantity * (f.vt.directUnitPrice ?? 0), 0);
        return (
          <div key={gi} className="overflow-hidden rounded-2xl border border-[#252840] bg-[#13151f]">
            <div className="flex items-center justify-between border-b border-[#252840] px-3 py-2">
              <span className="text-sm font-bold text-zinc-100">{g.name}</span>
              <span className="text-xs text-zinc-400">{fmtVnd(Math.round(sub))}đ</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <tbody>
                  {g.items.map((f) => (
                    <tr key={f.vt.id} className="border-b border-[#1c1f2e]">
                      <td className="px-3 py-1.5 text-zinc-100">{f.vt.name}</td>
                      <td className="w-16 px-2 py-1.5 text-zinc-400">{f.vt.unit}</td>
                      <td className="w-24 px-2 py-1.5 text-right text-zinc-200">{fmtQty(f.vt.quantity)}</td>
                      <td className="w-28 px-2 py-1.5 text-right text-zinc-200">
                        <PriceCell value={f.vt.directUnitPrice} onSave={(n) => run(() => patchVt(f.vt.id, { directUnitPrice: n }))} />
                      </td>
                      <td className="w-28 px-3 py-1.5 text-right text-emerald-400">
                        {f.vt.directUnitPrice != null ? fmtVnd(Math.round(f.vt.quantity * f.vt.directUnitPrice)) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// View chi tiết: mỗi dòng VT theo công tác (phẳng)
function ChiTietView({ flat, run, patchVt }: ViewProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#252840] bg-[#13151f]">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-[#252840] text-left text-xs text-zinc-500">
            <th className="px-3 py-2 font-medium">Công tác</th>
            <th className="px-3 py-2 font-medium">Vật tư</th>
            <th className="w-16 px-2 py-2 font-medium">ĐVT</th>
            <th className="w-24 px-2 py-2 text-right font-medium">KL</th>
            <th className="w-28 px-2 py-2 text-right font-medium">Giá mua</th>
            <th className="w-28 px-2 py-2 text-right font-medium">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {flat.map((f) => (
            <tr key={f.vt.id} className="border-b border-[#1c1f2e]">
              <td className="px-3 py-1.5 text-xs text-zinc-400">
                <div className="text-zinc-200">{f.congTacName}</div>
                <div className="text-zinc-600">{f.groupName} · {f.itemName}</div>
              </td>
              <td className="px-3 py-1.5 text-zinc-100">{f.vt.name}</td>
              <td className="px-2 py-1.5 text-zinc-400">{f.vt.unit}</td>
              <td className="px-2 py-1.5 text-right text-zinc-200">{fmtQty(f.vt.quantity)}</td>
              <td className="px-2 py-1.5 text-right text-zinc-200">
                <PriceCell value={f.vt.directUnitPrice} onSave={(n) => run(() => patchVt(f.vt.id, { directUnitPrice: n }))} />
              </td>
              <td className="px-2 py-1.5 text-right text-emerald-400">
                {f.vt.directUnitPrice != null ? fmtVnd(Math.round(f.vt.quantity * f.vt.directUnitPrice)) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
