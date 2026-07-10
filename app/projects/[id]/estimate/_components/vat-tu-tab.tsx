"use client";

import { Loader2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EditableText } from "./editable-text";
import { api, type EstimateData, fmtQty, fmtVnd, type Vt } from "./estimate-data";

type FlatVt = { vt: Vt; groupName: string; itemId: string; itemName: string; congTacName: string };

type ViewKey = "tong" | "hang-muc" | "chi-tiet";
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "tong", label: "Tổng hợp" },
  { key: "hang-muc", label: "Theo hạng mục" },
  { key: "chi-tiet", label: "Chi tiết" },
];

// Ô giá sửa tại chỗ
function Price({ value, onSave }: { value: number | null; onSave: (n: number | null) => Promise<void> }) {
  return (
    <EditableText
      value={value == null ? "" : String(value)}
      className="est-ed-num"
      placeholder="giá?"
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

// 1 dòng vật tư: tên + (KL ĐVT × giá) + thành tiền
function VtRow({ name, unit, qty, price, extra, onSavePrice }: { name: string; unit: string; qty: number; price: number | null; extra?: ReactNode; onSavePrice: (n: number | null) => Promise<void> }) {
  return (
    <div className="est-row" style={{ cursor: "default" }}>
      <div className="body">
        <div className="name">{name}</div>
        <div className="calc num">
          {fmtQty(qty)} {unit} ×{" "}
          <span className="est-ed-num" style={{ display: "inline-block", minWidth: 52 }}>
            <Price value={price} onSave={onSavePrice} />
          </span>
          {extra}
        </div>
      </div>
      <div className="amt num">
        {price != null ? (
          <>
            {fmtVnd(Math.round(qty * price))}
            <span className="u">đ</span>
          </>
        ) : (
          <span style={{ color: "var(--mut2)" }}>—</span>
        )}
      </div>
    </div>
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
  const patchVt = (id: string, body: Record<string, unknown>) => api(`/api/estimate/lines/${id}`, { method: "PATCH", body: JSON.stringify(body) });

  const flat = useMemo<FlatVt[]>(() => {
    if (!data) return [];
    const out: FlatVt[] = [];
    for (const g of data.groups) for (const it of g.items) for (const ct of it.lines) for (const vt of ct.vtChildren) out.push({ vt, groupName: g.name, itemId: it.id, itemName: it.name, congTacName: ct.name });
    return out;
  }, [data]);

  if (data === null) {
    return (
      <div className="est-empty">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  const grand = flat.reduce((s, f) => s + f.vt.quantity * (f.vt.directUnitPrice ?? 0), 0);

  return (
    <div>
      <div className="est-sum">
        <div className="k">Tổng dự kiến mua</div>
        <div className="v">
          {fmtVnd(Math.round(grand))}
          <span className="u">đ</span>
        </div>
        <div className="note">Bảng hao phí vật tư · giá mua dự kiến cho kế toán</div>
      </div>

      <div className="est-views">
        {VIEWS.map((v) => (
          <button key={v.key} className={view === v.key ? "active" : ""} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      {flat.length === 0 ? (
        <div className="est-empty">
          Chưa có vật tư. Qua tab <b>Khối lượng</b> gắn vật tư vào công tác.
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

type ViewProps = { flat: FlatVt[]; run: (fn: () => Promise<unknown>) => Promise<void>; patchVt: (id: string, body: Record<string, unknown>) => Promise<unknown> };

// Tổng hợp: gộp theo tên+đơn vị, sửa giá 1 lần áp hết dòng cùng tên
function TongView({ flat, run, patchVt }: ViewProps) {
  const rows = useMemo(() => {
    const m = new Map<string, { name: string; unit: string; qty: number; price: number | null; multi: boolean; ids: string[]; refs: string[] }>();
    for (const f of flat) {
      const key = `${f.vt.name.toLowerCase()}|${f.vt.unit.toLowerCase()}`;
      const cur = m.get(key);
      const price = f.vt.directUnitPrice;
      if (!cur) m.set(key, { name: f.vt.name, unit: f.vt.unit, qty: f.vt.quantity, price, multi: false, ids: [f.vt.id], refs: [f.congTacName] });
      else {
        cur.qty += f.vt.quantity;
        cur.ids.push(f.vt.id);
        cur.refs.push(f.congTacName);
        if (price != null && cur.price != null && price !== cur.price) cur.multi = true;
        if (cur.price == null) cur.price = price;
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [flat]);

  return (
    <div>
      {rows.map((r) => (
        <VtRow
          key={r.name + r.unit}
          name={r.name}
          unit={r.unit}
          qty={r.qty}
          price={r.multi ? null : r.price}
          extra={<span style={{ color: "var(--mut2)" }}> · {r.refs.join(", ")}</span>}
          onSavePrice={(n) => run(async () => { for (const id of r.ids) await patchVt(id, { directUnitPrice: n }); })}
        />
      ))}
    </div>
  );
}

// Theo hạng mục: nhóm + subtotal
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
    <div>
      {groups.map((g, gi) => {
        const sub = g.items.reduce((s, f) => s + f.vt.quantity * (f.vt.directUnitPrice ?? 0), 0);
        return (
          <section className="est-phase" key={gi}>
            <div className="est-phase-h">
              <span className="nm" style={{ cursor: "default" }}>{g.name}</span>
              <span className="tot">{fmtVnd(Math.round(sub))}</span>
            </div>
            {g.items.map((f) => (
              <VtRow key={f.vt.id} name={f.vt.name} unit={f.vt.unit} qty={f.vt.quantity} price={f.vt.directUnitPrice} onSavePrice={(n) => run(() => patchVt(f.vt.id, { directUnitPrice: n }))} />
            ))}
            <div className="est-subt">
              <span className="k">Cộng {g.name}</span>
              <span className="v num">{fmtVnd(Math.round(sub))} đ</span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

// Chi tiết: từng dòng theo công tác
function ChiTietView({ flat, run, patchVt }: ViewProps) {
  return (
    <div>
      {flat.map((f) => (
        <VtRow
          key={f.vt.id}
          name={f.vt.name}
          unit={f.vt.unit}
          qty={f.vt.quantity}
          price={f.vt.directUnitPrice}
          extra={<span style={{ color: "var(--mut2)" }}> · {f.congTacName}</span>}
          onSavePrice={(n) => run(() => patchVt(f.vt.id, { directUnitPrice: n }))}
        />
      ))}
    </div>
  );
}
