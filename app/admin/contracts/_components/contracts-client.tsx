"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type ContractItem = {
  id: string;
  type: "design" | "construction";
  typeLabel: string;
  title: string;
  subtitle: string;
  customerName: string;
  phone: string | null;
  code: string | null;
  value: number | null;
  thu: number;
  chi: number;
  net: number;
  status: string;
  signedAt: string | null;
  projectId: string | null;
  needsInfo: boolean;
  needsInfoReasons: string[];
  preConstruction: boolean;
};
type Summary = { count: number; thu: number; chi: number; needsInfo: number; preConstruction: number };
type CashLine = { id: string; occurredAt: string; direction: "in" | "out"; amount: number; note: string | null };

type Filter = "all" | "pre" | "needs" | "design" | "construction";

const STATUS_LABEL: Record<string, string> = {
  active: "Đang làm",
  done: "Xong",
  cancelled: "Huỷ",
  planning: "Chuẩn bị",
  in_progress: "Đang thi công",
  completed: "Hoàn thành",
  paused: "Tạm dừng",
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("vi-VN");
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function ContractsClient() {
  const [items, setItems] = useState<ContractItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<ContractItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/contracts", { cache: "no-store" });
      const j = await r.json();
      setItems(j.items ?? []);
      setSummary(j.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    switch (filter) {
      case "pre":
        return items.filter((i) => i.preConstruction);
      case "needs":
        return items.filter((i) => i.needsInfo);
      case "design":
        return items.filter((i) => i.type === "design");
      case "construction":
        return items.filter((i) => i.type === "construction");
      default:
        return items;
    }
  }, [items, filter]);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: `Tất cả (${items.length})` },
    { key: "pre", label: `Chưa thi công (${summary?.preConstruction ?? 0})` },
    { key: "needs", label: `Cần bổ sung (${summary?.needsInfo ?? 0})` },
    { key: "design", label: "HĐ thiết kế" },
    { key: "construction", label: "HĐ thi công" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 text-[#e6e8f0]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Hợp đồng</h1>
          <p className="text-sm text-[#9aa0b5]">HĐ thiết kế + HĐ thi công · thu/chi từ sổ quỹ</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-[#E36122] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          + Tạo HĐ thiết kế
        </button>
      </div>

      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Số HĐ" value={String(summary.count)} />
          <Stat label="Tổng đã thu" value={fmt(summary.thu)} tone="good" />
          <Stat label="Tổng đã chi" value={fmt(summary.chi)} tone="warn" />
          <Stat label="Cần bổ sung" value={String(summary.needsInfo)} tone={summary.needsInfo ? "danger" : undefined} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              filter === f.key ? "bg-[#E36122] text-white" : "bg-[#232739] text-[#c3c8dc] hover:bg-[#2c3147]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[#2d3249]">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#1b1e2c] text-left text-xs uppercase tracking-wide text-[#8990a8]">
              <th className="px-3 py-2.5">Loại</th>
              <th className="px-3 py-2.5">Hợp đồng</th>
              <th className="px-3 py-2.5 text-right">Giá trị</th>
              <th className="px-3 py-2.5 text-right">Đã thu</th>
              <th className="px-3 py-2.5 text-right">Đã chi</th>
              <th className="px-3 py-2.5 text-right">Ròng</th>
              <th className="px-3 py-2.5">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[#8990a8]">
                  Đang tải…
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[#8990a8]">
                  Không có hợp đồng.
                </td>
              </tr>
            ) : (
              shown.map((it) => (
                <tr
                  key={`${it.type}_${it.id}`}
                  onClick={() => setSel(it)}
                  className="cursor-pointer border-t border-[#252a3d] hover:bg-[#1e2231]"
                >
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        it.type === "design" ? "bg-[#2a3550] text-[#9cc0ff]" : "bg-[#3a2f22] text-[#f2b184]"
                      }`}
                    >
                      {it.typeLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-[#8990a8]">{it.subtitle}</div>
                    {it.needsInfo && (
                      <div className="mt-0.5 text-xs text-[#ff9d7a]">⚠ Cần bổ sung: {it.needsInfoReasons.join(", ")}</div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(it.value)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#7fd6a3]">{fmt(it.thu)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#f2b184]">{fmt(it.chi)}</td>
                  <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${it.net >= 0 ? "text-[#7fd6a3]" : "text-[#ff8f8f]"}`}>
                    {fmt(it.net)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-xs text-[#c3c8dc]">{STATUS_LABEL[it.status] ?? it.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sel && (
        <ContractDrawer
          item={sel}
          onClose={() => setSel(null)}
          onSaved={() => {
            setSel(null);
            load();
          }}
          flash={flash}
        />
      )}
      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
            flash("Đã tạo HĐ thiết kế");
          }}
        />
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#e6e8f0] px-4 py-2 text-sm font-medium text-[#171a27] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "danger" }) {
  const c =
    tone === "good" ? "text-[#7fd6a3]" : tone === "warn" ? "text-[#f2b184]" : tone === "danger" ? "text-[#ff8f8f]" : "text-[#e6e8f0]";
  return (
    <div className="rounded-xl border border-[#2d3249] bg-[#1b1e2c] px-3 py-2.5">
      <div className="text-xs text-[#8990a8]">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function ContractDrawer({
  item,
  onClose,
  onSaved,
  flash,
}: {
  item: ContractItem;
  onClose: () => void;
  onSaved: () => void;
  flash: (m: string) => void;
}) {
  const isDesign = item.type === "design";
  const [name, setName] = useState(item.customerName);
  const [phone, setPhone] = useState(item.phone ?? "");
  const [value, setValue] = useState(item.value != null ? String(item.value) : "");
  const [signedAt, setSignedAt] = useState(item.signedAt ? item.signedAt.slice(0, 10) : "");
  const [notes, setNotes] = useState(item.subtitle === "HĐ thiết kế" ? "" : item.subtitle);
  const [saving, setSaving] = useState(false);

  const [attached, setAttached] = useState<CashLine[]>([]);
  const [candidates, setCandidates] = useState<CashLine[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const loadCash = useCallback(
    async (query = "") => {
      const r = await fetch(`/api/admin/contracts/${item.id}/cash?q=${encodeURIComponent(query)}`, { cache: "no-store" });
      const j = await r.json();
      setAttached(j.attached ?? []);
      setCandidates(j.candidates ?? []);
    },
    [item.id],
  );

  useEffect(() => {
    if (isDesign) loadCash("");
  }, [isDesign, loadCash]);

  const saveDesign = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/contracts/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim() || undefined,
          customerPhone: phone.trim() ? phone.trim() : null,
          totalValue: value.trim() ? Number(value.replace(/[^\d]/g, "")) : null,
          signedAt: signedAt || undefined,
          notes: notes.trim() ? notes.trim() : null,
        }),
      });
      if (!r.ok) {
        flash("Lưu lỗi");
        return;
      }
      flash("Đã lưu");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const attachPicked = async () => {
    if (picked.size === 0) return;
    await fetch(`/api/admin/contracts/${item.id}/cash`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attach: Array.from(picked) }),
    });
    setPicked(new Set());
    setShowPicker(false);
    await loadCash("");
    flash("Đã gắn khoản vào HĐ");
  };

  const detach = async (id: string) => {
    await fetch(`/api/admin/contracts/${item.id}/cash`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detach: [id] }),
    });
    await loadCash("");
  };

  const thu = attached.filter((a) => a.direction === "in").reduce((s, a) => s + a.amount, 0);
  const chi = attached.filter((a) => a.direction === "out").reduce((s, a) => s + a.amount, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[#2d3249] bg-[#141726] p-4 text-[#e6e8f0]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xs text-[#8990a8]">{item.typeLabel}</div>
            <h2 className="text-lg font-semibold">{item.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg bg-[#232739] px-3 py-1.5 text-sm" aria-label="Đóng">
            ✕
          </button>
        </div>

        {item.needsInfo && (
          <div className="mt-3 rounded-lg border border-[#5a3a2a] bg-[#2a1d15] px-3 py-2 text-sm text-[#ff9d7a]">
            ⚠ Cần bổ sung: {item.needsInfoReasons.join(", ")}
          </div>
        )}

        {isDesign ? (
          <div className="mt-4 space-y-3">
            <Field label="Tên khách">
              <input className="mh-inp" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="SĐT">
              <input className="mh-inp" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Chưa có" />
            </Field>
            <Field label="Giá trị HĐ (đ)">
              <input className="mh-inp" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Chưa có" />
            </Field>
            <Field label="Ngày ký">
              <input type="date" className="mh-inp" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
            </Field>
            <Field label="Ghi chú">
              <input className="mh-inp" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="VD: Phước Thái" />
            </Field>
            <button
              type="button"
              onClick={saveDesign}
              disabled={saving}
              className="w-full rounded-lg bg-[#E36122] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Đang lưu…" : "Lưu thông tin"}
            </button>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-[#2d3249] bg-[#1b1e2c] p-3 text-sm">
            <div className="text-[#9aa0b5]">Khách: {item.customerName}</div>
            <div className="text-[#9aa0b5]">Mã: {item.code}</div>
            <Link href={`/projects/${item.id}/finance`} className="mt-2 inline-block text-[#7aa2ff] hover:underline">
              Xem tài chính dự án →
            </Link>
            {item.needsInfo && <div className="mt-1 text-xs text-[#8990a8]">Giá trị HĐ sửa trong màn dự án.</div>}
          </div>
        )}

        {/* Thu / chi */}
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Thu / chi từ sổ quỹ</h3>
            {isDesign && (
              <button
                type="button"
                onClick={() => {
                  setShowPicker((s) => !s);
                  if (!showPicker) loadCash("");
                }}
                className="rounded-lg bg-[#232739] px-3 py-1.5 text-xs hover:bg-[#2c3147]"
              >
                {showPicker ? "Đóng" : "+ Gắn khoản sổ quỹ"}
              </button>
            )}
          </div>

          {isDesign ? (
            <>
              <div className="mt-2 flex gap-4 text-sm">
                <span className="text-[#7fd6a3]">Thu: {fmt(thu)}</span>
                <span className="text-[#f2b184]">Chi: {fmt(chi)}</span>
                <span className={thu - chi >= 0 ? "text-[#7fd6a3]" : "text-[#ff8f8f]"}>Ròng: {fmt(thu - chi)}</span>
              </div>
              <div className="mt-2 space-y-1">
                {attached.length === 0 && <div className="text-xs text-[#8990a8]">Chưa gắn khoản nào.</div>}
                {attached.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg border border-[#252a3d] bg-[#1b1e2c] px-2.5 py-1.5 text-xs">
                    <span className={a.direction === "in" ? "text-[#7fd6a3]" : "text-[#f2b184]"}>
                      {a.direction === "in" ? "Thu" : "Chi"}
                    </span>
                    <span className="tabular-nums">{fmt(a.amount)}</span>
                    <span className="flex-1 truncate text-[#9aa0b5]">{a.note}</span>
                    <span className="text-[#6b7085]">{fmtDate(a.occurredAt)}</span>
                    <button type="button" onClick={() => detach(a.id)} className="text-[#ff8f8f] hover:underline">
                      gỡ
                    </button>
                  </div>
                ))}
              </div>

              {showPicker && (
                <div className="mt-3 rounded-lg border border-[#2d3249] bg-[#12141f] p-2.5">
                  <input
                    className="mh-inp mb-2"
                    placeholder="Tìm theo nội dung… (VD: A Tâm)"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      loadCash(e.target.value);
                    }}
                  />
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {candidates.length === 0 && <div className="text-xs text-[#8990a8]">Không có khoản trôi nổi phù hợp.</div>}
                    {candidates.map((c) => {
                      const on = picked.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setPicked((prev) => {
                              const n = new Set(prev);
                              if (n.has(c.id)) n.delete(c.id);
                              else n.add(c.id);
                              return n;
                            })
                          }
                          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs ${
                            on ? "border-[#E36122] bg-[#2a1d15]" : "border-[#252a3d] bg-[#1b1e2c]"
                          }`}
                        >
                          <span>{on ? "☑" : "☐"}</span>
                          <span className={c.direction === "in" ? "text-[#7fd6a3]" : "text-[#f2b184]"}>
                            {c.direction === "in" ? "Thu" : "Chi"}
                          </span>
                          <span className="tabular-nums">{fmt(c.amount)}</span>
                          <span className="flex-1 truncate text-[#9aa0b5]">{c.note}</span>
                          <span className="text-[#6b7085]">{fmtDate(c.occurredAt)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={attachPicked}
                    disabled={picked.size === 0}
                    className="mt-2 w-full rounded-lg bg-[#E36122] py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Gắn {picked.size > 0 ? `${picked.size} khoản` : ""}
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-[#7fd6a3]">Thu: {fmt(item.thu)}</span>
              <span className="text-[#f2b184]">Chi: {fmt(item.chi)}</span>
              <span className={item.net >= 0 ? "text-[#7fd6a3]" : "text-[#ff8f8f]"}>Ròng: {fmt(item.net)}</span>
            </div>
          )}
        </div>

        <style jsx>{`
          :global(.mh-inp) {
            width: 100%;
            border-radius: 9px;
            border: 1px solid #2d3249;
            background: #1b1e2c;
            padding: 9px 11px;
            font-size: 14px;
            color: #e6e8f0;
            color-scheme: dark;
          }
        `}</style>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-[#8990a8]">{label}</span>
      {children}
    </label>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [value, setValue] = useState("");
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) {
      setErr("Nhập tên khách");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.trim() ? phone.trim() : null,
          totalValue: value.trim() ? Number(value.replace(/[^\d]/g, "")) : null,
          signedAt,
          notes: notes.trim() ? notes.trim() : null,
        }),
      });
      if (!r.ok) {
        setErr("Tạo lỗi");
        return;
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-[#2d3249] bg-[#141726] p-4 text-[#e6e8f0]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Tạo HĐ thiết kế</h2>
        <p className="mt-0.5 text-xs text-[#8990a8]">Thiếu SĐT / giá trị cứ để trống — màn sẽ đánh dấu cần bổ sung.</p>
        <div className="mt-3 space-y-3">
          <Field label="Tên khách *">
            <input className="mh-inp" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="SĐT">
            <input className="mh-inp" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Giá trị HĐ (đ)">
            <input className="mh-inp" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Ngày ký">
            <input type="date" className="mh-inp" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
          </Field>
          <Field label="Ghi chú">
            <input className="mh-inp" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {err && <div className="mt-2 text-sm text-[#ff8f8f]">{err}</div>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-[#232739] py-2.5 text-sm">
            Huỷ
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-lg bg-[#E36122] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Đang tạo…" : "Tạo"}
          </button>
        </div>
        <style jsx>{`
          :global(.mh-inp) {
            width: 100%;
            border-radius: 9px;
            border: 1px solid #2d3249;
            background: #1b1e2c;
            padding: 9px 11px;
            font-size: 14px;
            color: #e6e8f0;
            color-scheme: dark;
          }
        `}</style>
      </div>
    </div>
  );
}
