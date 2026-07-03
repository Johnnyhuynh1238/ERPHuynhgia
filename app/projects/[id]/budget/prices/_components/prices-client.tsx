"use client";

import { confirmDialog } from "@/components/confirm-dialog";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Material = { id: string; name: string; unit: string; price: number; source: string | null; note: string | null };
type Labor = { id: string; grade: string; price: number; source: string | null; note: string | null };
type Machine = { id: string; name: string; price: number; source: string | null; note: string | null };

type Props = {
  projectId: string;
  canEdit: boolean;
  initialTab: "vt" | "nc" | "mm";
};

const fmtVND = (n: number) => n.toLocaleString("vi-VN");

export function PricesClient({ projectId, canEdit, initialTab }: Props) {
  const [tab, setTab] = useState<"vt" | "nc" | "mm">(initialTab);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [labor, setLabor] = useState<Labor[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/prices", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      setMaterials(data.materials ?? []);
      setLabor(data.labor ?? []);
      setMachines(data.machines ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      <div>
        <Link
          href={`/projects/${projectId}/budget/catalog`}
          className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Thư viện chung
        </Link>
        <div className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Đơn giá (toàn hệ thống)
        </div>
        <h1 className="text-base font-semibold text-zinc-100 sm:text-lg">VT / NC / MM</h1>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {([
          { key: "vt", emoji: "📦", label: "Vật tư", count: materials.length },
          { key: "nc", emoji: "👥", label: "Nhân công", count: labor.length },
          { key: "mm", emoji: "🏗", label: "Máy thi công", count: machines.length },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex flex-col items-center rounded-xl border p-2 text-xs transition ${
              tab === t.key
                ? "border-sky-500/50 bg-sky-500/10 text-sky-200"
                : "border-[#252840] bg-[#1a1d2e] text-zinc-300 hover:border-[#3a3f5c]"
            }`}
          >
            <span className="text-xl leading-none">{t.emoji}</span>
            <span className="mt-1 font-medium">{t.label}</span>
            <span className="text-[10px] text-zinc-500">{t.count} mục</span>
          </button>
        ))}
      </div>

      {canEdit && (
        <div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            + Thêm {tab === "vt" ? "vật tư" : tab === "nc" ? "bậc thợ" : "máy"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
          Đang tải...
        </div>
      ) : (
        <>
          {tab === "vt" && (
            <MaterialTable rows={materials} canEdit={canEdit} onChange={reload} />
          )}
          {tab === "nc" && <LaborTable rows={labor} canEdit={canEdit} onChange={reload} />}
          {tab === "mm" && <MachineTable rows={machines} canEdit={canEdit} onChange={reload} />}
        </>
      )}

      {showCreate && canEdit && (
        <CreateModal
          kind={tab}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function MaterialTable({
  rows,
  canEdit,
  onChange,
}: {
  rows: Material[];
  canEdit: boolean;
  onChange: () => void;
}) {
  if (rows.length === 0)
    return (
      <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
        Chưa có giá vật tư nào.
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-[#252840] bg-[#1a1d2e]">
      <table className="w-full text-sm">
        <thead className="border-b border-[#252840] bg-[#0f1220] text-[11px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 text-left">Tên vật tư</th>
            <th className="px-2 py-2 text-left">ĐV</th>
            <th className="px-3 py-2 text-right">Đơn giá (đ)</th>
            {canEdit && <th className="px-2 py-2 text-right w-16"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <MaterialRow key={r.id} row={r} canEdit={canEdit} onChange={onChange} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MaterialRow({
  row,
  canEdit,
  onChange,
}: {
  row: Material;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(row.price));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/prices/materials/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(price) || 0 }),
    });
    setSaving(false);
    if (r.ok) {
      setEditing(false);
      onChange();
    } else {
      const j = await r.json().catch(() => ({}));
      alert(j.message || "Lỗi");
    }
  };

  const remove = async () => {
    if (!await confirmDialog(`Xoá "${row.name}" (${row.unit}) khỏi bảng giá?`)) return;
    const r = await fetch(`/api/prices/materials/${row.id}`, { method: "DELETE" });
    if (r.ok) onChange();
  };

  return (
    <tr className="border-b border-[#252840]">
      <td className="px-3 py-2">
        <div className="text-zinc-100">{row.name}</div>
        {row.source && <div className="text-[10px] text-zinc-500">{row.source}</div>}
      </td>
      <td className="px-2 py-2 text-xs text-zinc-400">{row.unit}</td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-32 rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1 text-right text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
            autoFocus
          />
        ) : (
          <span className="font-mono text-zinc-100">{fmtVND(row.price)}</span>
        )}
      </td>
      {canEdit && (
        <td className="px-2 py-2 text-right">
          {editing ? (
            <div className="flex justify-end gap-1">
              <button
                onClick={save}
                disabled={saving}
                className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-sky-500/30"
              >
                ✓
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setPrice(String(row.price));
                }}
                className="rounded bg-zinc-700/50 px-2 py-0.5 text-[11px] text-zinc-300"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-1">
              <button
                onClick={() => setEditing(true)}
                className="rounded bg-zinc-700/40 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-700/60"
              >
                Sửa
              </button>
              <button
                onClick={remove}
                className="rounded bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300 hover:bg-rose-500/25"
              >
                Xoá
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

function LaborTable({
  rows,
  canEdit,
  onChange,
}: {
  rows: Labor[];
  canEdit: boolean;
  onChange: () => void;
}) {
  if (rows.length === 0)
    return (
      <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
        Chưa có giá nhân công.
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-[#252840] bg-[#1a1d2e]">
      <table className="w-full text-sm">
        <thead className="border-b border-[#252840] bg-[#0f1220] text-[11px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 text-left">Bậc</th>
            <th className="px-3 py-2 text-right">Đơn giá (đ/công)</th>
            {canEdit && <th className="px-2 py-2 text-right w-16"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <LaborRow key={r.id} row={r} canEdit={canEdit} onChange={onChange} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaborRow({
  row,
  canEdit,
  onChange,
}: {
  row: Labor;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(row.price));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/prices/labor/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(price) || 0 }),
    });
    setSaving(false);
    if (r.ok) {
      setEditing(false);
      onChange();
    }
  };
  const remove = async () => {
    if (!await confirmDialog(`Xoá bậc ${row.grade}?`)) return;
    const r = await fetch(`/api/prices/labor/${row.id}`, { method: "DELETE" });
    if (r.ok) onChange();
  };

  return (
    <tr className="border-b border-[#252840]">
      <td className="px-3 py-2">
        <div className="text-zinc-100">Bậc {row.grade}/7</div>
        {row.source && <div className="text-[10px] text-zinc-500">{row.source}</div>}
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-32 rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1 text-right text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
            autoFocus
          />
        ) : (
          <span className="font-mono text-zinc-100">{fmtVND(row.price)}</span>
        )}
      </td>
      {canEdit && (
        <td className="px-2 py-2 text-right">
          {editing ? (
            <div className="flex justify-end gap-1">
              <button onClick={save} disabled={saving} className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-200">✓</button>
              <button onClick={() => { setEditing(false); setPrice(String(row.price)); }} className="rounded bg-zinc-700/50 px-2 py-0.5 text-[11px] text-zinc-300">✕</button>
            </div>
          ) : (
            <div className="flex justify-end gap-1">
              <button onClick={() => setEditing(true)} className="rounded bg-zinc-700/40 px-2 py-0.5 text-[11px] text-zinc-300">Sửa</button>
              <button onClick={remove} className="rounded bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">Xoá</button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

function MachineTable({
  rows,
  canEdit,
  onChange,
}: {
  rows: Machine[];
  canEdit: boolean;
  onChange: () => void;
}) {
  if (rows.length === 0)
    return (
      <div className="rounded-xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-zinc-500">
        Chưa có giá máy thi công.
      </div>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-[#252840] bg-[#1a1d2e]">
      <table className="w-full text-sm">
        <thead className="border-b border-[#252840] bg-[#0f1220] text-[11px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 text-left">Tên máy</th>
            <th className="px-3 py-2 text-right">Đơn giá (đ/ca)</th>
            {canEdit && <th className="px-2 py-2 text-right w-16"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <MachineRow key={r.id} row={r} canEdit={canEdit} onChange={onChange} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MachineRow({
  row,
  canEdit,
  onChange,
}: {
  row: Machine;
  canEdit: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(row.price));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const r = await fetch(`/api/prices/machines/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(price) || 0 }),
    });
    setSaving(false);
    if (r.ok) {
      setEditing(false);
      onChange();
    }
  };
  const remove = async () => {
    if (!await confirmDialog(`Xoá "${row.name}"?`)) return;
    const r = await fetch(`/api/prices/machines/${row.id}`, { method: "DELETE" });
    if (r.ok) onChange();
  };

  return (
    <tr className="border-b border-[#252840]">
      <td className="px-3 py-2">
        <div className="text-zinc-100">{row.name}</div>
        {row.source && <div className="text-[10px] text-zinc-500">{row.source}</div>}
      </td>
      <td className="px-3 py-2 text-right">
        {editing ? (
          <input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-32 rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1 text-right text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
            autoFocus
          />
        ) : (
          <span className="font-mono text-zinc-100">{fmtVND(row.price)}</span>
        )}
      </td>
      {canEdit && (
        <td className="px-2 py-2 text-right">
          {editing ? (
            <div className="flex justify-end gap-1">
              <button onClick={save} disabled={saving} className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-200">✓</button>
              <button onClick={() => { setEditing(false); setPrice(String(row.price)); }} className="rounded bg-zinc-700/50 px-2 py-0.5 text-[11px] text-zinc-300">✕</button>
            </div>
          ) : (
            <div className="flex justify-end gap-1">
              <button onClick={() => setEditing(true)} className="rounded bg-zinc-700/40 px-2 py-0.5 text-[11px] text-zinc-300">Sửa</button>
              <button onClick={remove} className="rounded bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-300">Xoá</button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

function CreateModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: "vt" | "nc" | "mm";
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [grade, setGrade] = useState("");
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    let r: Response;
    if (kind === "vt") {
      r = await fetch("/api/prices/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, unit, price: Number(price) || 0, source: source || null }),
      });
    } else if (kind === "nc") {
      r = await fetch("/api/prices/labor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, price: Number(price) || 0, source: source || null }),
      });
    } else {
      r = await fetch("/api/prices/machines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, price: Number(price) || 0, source: source || null }),
      });
    }
    setSaving(false);
    if (r.ok) {
      onCreated();
    } else {
      const j = await r.json().catch(() => ({}));
      setError(j.message || "Lỗi");
    }
  };

  const title = kind === "vt" ? "Thêm vật tư" : kind === "nc" ? "Thêm bậc nhân công" : "Thêm máy";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-sm font-semibold text-zinc-100">{title}</div>
        <div className="space-y-2">
          {kind === "vt" && (
            <>
              <input
                placeholder="Tên vật tư (VD: Xi măng PCB30)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1.5 text-sm text-zinc-100"
              />
              <input
                placeholder="Đơn vị (kg, m³, viên...)"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1.5 text-sm text-zinc-100"
              />
            </>
          )}
          {kind === "nc" && (
            <input
              placeholder="Bậc (VD: 3.0, 3.5, 4.0)"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-full rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1.5 text-sm text-zinc-100"
            />
          )}
          {kind === "mm" && (
            <input
              placeholder="Tên máy (VD: Máy trộn BT 250L)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1.5 text-sm text-zinc-100"
            />
          )}
          <input
            placeholder={
              kind === "vt" ? "Đơn giá (đ/đơn vị)" : kind === "nc" ? "Đơn giá (đ/công)" : "Đơn giá (đ/ca)"
            }
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-full rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1.5 text-sm text-zinc-100"
          />
          <input
            placeholder="Nguồn / ghi chú (tuỳ chọn)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-full rounded border border-[#3a3f5c] bg-[#0f1220] px-2 py-1.5 text-sm text-zinc-100"
          />
        </div>
        {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded bg-zinc-700/50 px-3 py-1.5 text-xs text-zinc-300">
            Huỷ
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="rounded bg-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/40 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Thêm"}
          </button>
        </div>
      </div>
    </div>
  );
}
