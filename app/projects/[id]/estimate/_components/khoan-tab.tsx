"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/confirm-dialog";
import { EditableText } from "./editable-text";
import { api, type EstimateData, fmtVnd, type Khoan } from "./estimate-data";

const GROUPS: { key: "nc" | "khac"; label: string }[] = [
  { key: "nc", label: "Khoán nhân công" },
  { key: "khac", label: "Khoán khác" },
];

function Num({ value, onSave, placeholder }: { value: number | null; onSave: (n: number | null) => Promise<void>; placeholder: string }) {
  return (
    <EditableText
      value={value == null ? "" : String(value)}
      className="est-ed-num"
      placeholder={placeholder}
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

function AddKhoan({ onAdd }: { onAdd: (name: string, unit: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd(name.trim(), unit.trim() || "khoán");
      setName("");
      setUnit("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="est-add">
      <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} placeholder="+ nội dung khoán" />
      <input className="w-unit" value={unit} onChange={(e) => setUnit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void submit()} placeholder="ĐVT" />
      <button className="go" onClick={() => void submit()} disabled={busy} aria-label="Thêm">
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function KhoanTab({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Khoan[] | null>(null);

  const reload = useCallback(async () => {
    try {
      const data: EstimateData = await api(`/api/projects/${projectId}/estimate/lines`);
      setRows(data.khoan);
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
  const patch = (id: string, body: Record<string, unknown>) => run(() => api(`/api/estimate/lines/${id}`, { method: "PATCH", body: JSON.stringify(body) }));

  if (rows === null) {
    return (
      <div className="est-empty">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </div>
    );
  }

  const grand = rows.reduce((s, r) => s + r.quantity * (r.directUnitPrice ?? 0), 0);

  return (
    <div>
      <div className="est-sum">
        <div className="k">Tổng khoán</div>
        <div className="v">
          {fmtVnd(Math.round(grand))}
          <span className="u">đ</span>
        </div>
        <div className="note">Khoán nhân công + các loại khoán khác</div>
      </div>

      {GROUPS.map((grp) => {
        const list = rows.filter((r) => (r.khoanGroup === "nc" ? "nc" : "khac") === grp.key);
        const sub = list.reduce((s, r) => s + r.quantity * (r.directUnitPrice ?? 0), 0);
        return (
          <section className="est-phase" key={grp.key}>
            <div className="est-phase-h">
              <span className="nm" style={{ cursor: "default" }}>{grp.label}</span>
              <span className="tot">{sub > 0 ? fmtVnd(Math.round(sub)) : ""}</span>
            </div>

            {list.map((r) => (
              <div className="est-row" key={r.id} style={{ cursor: "default" }}>
                <div className="body">
                  <div className="name">
                    <EditableText value={r.name} onSave={(v) => patch(r.id, { name: v })} />
                  </div>
                  <div className="calc num">
                    <span className="est-ed-num" style={{ display: "inline-block", minWidth: 30 }}>
                      <Num value={r.quantity} placeholder="—" onSave={(n) => patch(r.id, { quantity: n ?? 0 })} />
                    </span>{" "}
                    <EditableText value={r.unit} onSave={(v) => patch(r.id, { unit: v })} className="inline" /> ×{" "}
                    <span className="est-ed-num" style={{ display: "inline-block", minWidth: 52 }}>
                      <Num value={r.directUnitPrice} placeholder="giá?" onSave={(n) => patch(r.id, { directUnitPrice: n })} />
                    </span>
                  </div>
                </div>
                <div className="amt num">
                  {r.directUnitPrice != null ? (
                    <>
                      {fmtVnd(Math.round(r.quantity * r.directUnitPrice))}
                      <span className="u">đ</span>
                    </>
                  ) : (
                    <span style={{ color: "var(--mut2)" }}>—</span>
                  )}
                </div>
                <button
                  className="est-iconbtn"
                  onClick={async () => {
                    if (await confirmDialog({ title: "Xoá khoán?", message: r.name, confirmText: "Xoá" })) void run(() => api(`/api/estimate/lines/${r.id}`, { method: "DELETE" }));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <AddKhoan onAdd={(name, unit) => run(() => api(`/api/projects/${projectId}/estimate/lines`, { method: "POST", body: JSON.stringify({ kind: "khoan", khoanGroup: grp.key, name, unit, quantity: 1 }) }))} />

            {sub > 0 && (
              <div className="est-subt">
                <span className="k">Cộng {grp.label.toLowerCase()}</span>
                <span className="v num">{fmtVnd(Math.round(sub))} đ</span>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
