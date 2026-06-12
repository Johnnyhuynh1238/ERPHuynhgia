"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LABOR_PHASE_LABEL, LABOR_PHASE_OPTIONS, fmtVND } from "@/lib/labor-budget";

type Phase = "mong" | "than" | "mai";

type Item = {
  id?: string;
  phase: Phase;
  workItem: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  amount?: number;
  note?: string | null;
};

type Amendment = {
  id: string;
  reason: string;
  deltaAmount: number;
  status: "draft" | "approved" | "rejected";
  createdAt: string;
  approvedAt: string | null;
  rejectReason: string | null;
  proposedBy: { id: string; fullName: string } | null;
  approvedBy: { id: string; fullName: string } | null;
  items: (Item & { id: string; amount: number })[];
};

type Budget = {
  id: string;
  status: "draft" | "locked";
  totalAmount: number;
  note: string | null;
  lockedAt: string | null;
  lockedBy: { id: string; fullName: string } | null;
  createdBy: { id: string; fullName: string } | null;
  items: (Item & { id: string; amount: number })[];
  amendments: Amendment[];
};

export function LaborBudgetClient({
  projectId,
  projectName,
  initialBudget,
  canEdit,
  canLock,
  canPropose,
  canApprove,
}: {
  projectId: string;
  projectName: string;
  initialBudget: Budget | null;
  canEdit: boolean;
  canLock: boolean;
  canPropose: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [budget, setBudget] = useState<Budget | null>(initialBudget);
  const [items, setItems] = useState<Item[]>(() =>
    initialBudget?.items.map((it) => ({ ...it })) ?? [],
  );
  const [note, setNote] = useState(initialBudget?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [showAmendModal, setShowAmendModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isLocked = budget?.status === "locked";
  const editable = canEdit && !isLocked;

  const totals = useMemo(() => {
    const byPhase: Record<Phase, { qtyCount: number; amount: number }> = {
      mong: { qtyCount: 0, amount: 0 },
      than: { qtyCount: 0, amount: 0 },
      mai: { qtyCount: 0, amount: 0 },
    };
    let total = 0;
    for (const it of items) {
      const amt = Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0));
      byPhase[it.phase].qtyCount += 1;
      byPhase[it.phase].amount += amt;
      total += amt;
    }
    return { byPhase, total };
  }, [items]);

  function addRow(phase: Phase) {
    setItems((prev) => [
      ...prev,
      { phase, workItem: "", unit: "m2", quantity: 0, unitPrice: 0, note: "" },
    ]);
  }

  function updateRow(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function removeRow(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function onImportCsv(file: File) {
    const text = await file.text();
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    if (rows.length === 0) {
      setMsg({ kind: "err", text: "File trống" });
      return;
    }
    const header = rows[0].toLowerCase();
    const startIdx = header.includes("phase") || header.includes("giai") ? 1 : 0;
    const next: Item[] = [];
    let badLines = 0;
    for (let i = startIdx; i < rows.length; i++) {
      const cols = rows[i].split(",").map((s) => s.trim());
      const [phaseRaw, workItem, unit, qStr, upStr, note] = cols;
      const phase = (phaseRaw || "").toLowerCase() as Phase;
      if (!["mong", "than", "mai"].includes(phase) || !workItem || !unit) {
        badLines += 1;
        continue;
      }
      const quantity = Number(qStr);
      const unitPrice = Number(upStr);
      if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
        badLines += 1;
        continue;
      }
      next.push({ phase, workItem, unit, quantity, unitPrice, note: note || "" });
    }
    if (next.length === 0) {
      setMsg({ kind: "err", text: "Không có dòng hợp lệ" });
      return;
    }
    setItems((prev) => [...prev, ...next]);
    setMsg({
      kind: "ok",
      text: `Đã import ${next.length} dòng${badLines > 0 ? ` (bỏ qua ${badLines} dòng lỗi)` : ""}.`,
    });
  }

  async function save() {
    if (items.length === 0) {
      setMsg({ kind: "err", text: "Chưa có đầu việc nào" });
      return;
    }
    for (const it of items) {
      if (!it.workItem.trim() || !it.unit.trim()) {
        setMsg({ kind: "err", text: "Có dòng thiếu đầu việc/đơn vị" });
        return;
      }
      if (!(Number(it.quantity) > 0)) {
        setMsg({ kind: "err", text: `Dòng "${it.workItem}" có khối lượng <= 0` });
        return;
      }
      if (!(Number(it.unitPrice) >= 0)) {
        setMsg({ kind: "err", text: `Dòng "${it.workItem}" có đơn giá < 0` });
        return;
      }
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/labor-budget`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || null,
          items: items.map((it) => ({
            phase: it.phase,
            workItem: it.workItem.trim(),
            unit: it.unit.trim(),
            quantity: Number(it.quantity),
            unitPrice: Math.round(Number(it.unitPrice)),
            note: (it.note ?? "").trim() || null,
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? `HTTP ${res.status}`);
      setBudget(j.budget);
      setItems(j.budget.items.map((it: any) => ({ ...it })));
      setMsg({ kind: "ok", text: "Đã lưu dự toán" });
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Lưu thất bại" });
    } finally {
      setSaving(false);
    }
  }

  async function lockBudget() {
    if (!confirm("Chốt dự toán? Sau khi chốt chỉ tạo điều chỉnh được, không sửa trực tiếp.")) return;
    setLocking(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/labor-budget/lock`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? `HTTP ${res.status}`);
      setMsg({ kind: "ok", text: "Đã chốt dự toán" });
      router.refresh();
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message ?? "Chốt thất bại" });
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-white/50">Dự toán nhân công</div>
            <h2 className="text-lg font-bold text-white">{projectName}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                isLocked ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {isLocked ? "Đã chốt" : "Đang dự toán"}
            </span>
            {isLocked && budget?.lockedAt && (
              <span className="text-xs text-white/50">
                Chốt: {new Date(budget.lockedAt).toLocaleString("vi-VN")}
                {budget.lockedBy && ` · ${budget.lockedBy.fullName}`}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {LABOR_PHASE_OPTIONS.map((p) => (
            <div key={p.value} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-white/50">{p.label}</div>
              <div className="text-sm font-semibold text-white">
                {fmtVND(totals.byPhase[p.value].amount)}
              </div>
              <div className="text-[11px] text-white/40">
                {totals.byPhase[p.value].qtyCount} đầu việc
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3">
            <div className="text-xs text-orange-200/80">Tổng</div>
            <div className="text-sm font-bold text-orange-300">{fmtVND(totals.total)}</div>
            <div className="text-[11px] text-white/40">{items.length} dòng</div>
          </div>
        </div>

        {msg && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              msg.kind === "ok"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300"
            }`}
          >
            {msg.text}
          </div>
        )}
      </div>

      {/* Items editor */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">Danh sách đầu việc</h3>
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImportCsv(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
              >
                Import CSV
              </button>
              {LABOR_PHASE_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => addRow(p.value)}
                  className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
                >
                  + {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-white/50">
            {editable ? "Chưa có dòng. Thêm đầu việc theo giai đoạn ở trên." : "Chưa có dự toán."}
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase text-white/50">
                  <th className="px-2 py-2">GĐ</th>
                  <th className="px-2 py-2">Đầu việc</th>
                  <th className="px-2 py-2">Đơn vị</th>
                  <th className="px-2 py-2 text-right">Khối lượng</th>
                  <th className="px-2 py-2 text-right">Đơn giá</th>
                  <th className="px-2 py-2 text-right">Thành tiền</th>
                  <th className="px-2 py-2">Ghi chú</th>
                  {editable && <th className="px-2 py-2" />}
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const amt = Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0));
                  return (
                    <tr key={idx} className="border-b border-white/5">
                      <td className="px-2 py-1.5">
                        {editable ? (
                          <select
                            value={it.phase}
                            onChange={(e) => updateRow(idx, { phase: e.target.value as Phase })}
                            className="rounded border border-white/10 bg-black/30 px-1 py-1 text-xs text-white"
                          >
                            {LABOR_PHASE_OPTIONS.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-white/80">{LABOR_PHASE_LABEL[it.phase]}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {editable ? (
                          <input
                            value={it.workItem}
                            onChange={(e) => updateRow(idx, { workItem: e.target.value })}
                            className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                            placeholder="Xây tường gạch..."
                          />
                        ) : (
                          <span className="text-white">{it.workItem}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        {editable ? (
                          <input
                            value={it.unit}
                            onChange={(e) => updateRow(idx, { unit: e.target.value })}
                            className="w-16 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                          />
                        ) : (
                          <span className="text-white/80">{it.unit}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editable ? (
                          <input
                            type="number"
                            step="0.001"
                            value={it.quantity}
                            onChange={(e) => updateRow(idx, { quantity: Number(e.target.value) })}
                            className="w-24 rounded border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white"
                          />
                        ) : (
                          <span className="text-white/80">{it.quantity}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editable ? (
                          <input
                            type="number"
                            step="1"
                            value={it.unitPrice}
                            onChange={(e) => updateRow(idx, { unitPrice: Number(e.target.value) })}
                            className="w-32 rounded border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white"
                          />
                        ) : (
                          <span className="text-white/80">{Number(it.unitPrice).toLocaleString("vi-VN")}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right text-orange-300">
                        {fmtVND(amt)}
                      </td>
                      <td className="px-2 py-1.5">
                        {editable ? (
                          <input
                            value={it.note ?? ""}
                            onChange={(e) => updateRow(idx, { note: e.target.value })}
                            className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                          />
                        ) : (
                          <span className="text-white/60">{it.note}</span>
                        )}
                      </td>
                      {editable && (
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => removeRow(idx)}
                            className="text-xs text-rose-300 hover:text-rose-200"
                          >
                            Xóa
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {editable && (
          <div className="mt-4 flex flex-col gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Ghi chú dự toán (tùy chọn)"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu dự toán"}
              </button>
              {canLock && budget && (
                <button
                  type="button"
                  disabled={locking}
                  onClick={lockBudget}
                  className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {locking ? "Đang chốt..." : "Chốt dự toán"}
                </button>
              )}
            </div>
            <div className="text-xs text-white/40">
              Mẹo: CSV format <code>phase,workItem,unit,quantity,unitPrice,note</code> với phase = mong/than/mai.
            </div>
          </div>
        )}
      </div>

      {/* Amendments */}
      {budget && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Điều chỉnh dự toán</h3>
            {isLocked && canPropose && (
              <button
                type="button"
                onClick={() => setShowAmendModal(true)}
                className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
              >
                + Đề xuất điều chỉnh
              </button>
            )}
          </div>
          {budget.amendments.length === 0 ? (
            <div className="mt-3 text-sm text-white/50">Chưa có điều chỉnh nào.</div>
          ) : (
            <div className="mt-3 space-y-3">
              {budget.amendments.map((a) => (
                <AmendmentRow
                  key={a.id}
                  amendment={a}
                  projectId={projectId}
                  canApprove={canApprove}
                  onChanged={() => router.refresh()}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showAmendModal && budget && (
        <AmendmentModal
          projectId={projectId}
          onClose={() => setShowAmendModal(false)}
          onCreated={() => {
            setShowAmendModal(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AmendmentRow({
  amendment,
  projectId,
  canApprove,
  onChanged,
}: {
  amendment: Amendment;
  projectId: string;
  canApprove: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      reason = window.prompt("Lý do từ chối:") ?? undefined;
      if (!reason || reason.trim().length < 3) return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/labor-budget/amendments/${amendment.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "approve" ? { action } : { action, reason }),
        },
      );
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? `HTTP ${res.status}`);
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? "Thất bại");
    } finally {
      setBusy(false);
    }
  }

  const statusClass =
    amendment.status === "approved"
      ? "bg-emerald-500/15 text-emerald-300"
      : amendment.status === "rejected"
        ? "bg-rose-500/15 text-rose-300"
        : "bg-amber-500/15 text-amber-300";
  const statusLabel =
    amendment.status === "approved"
      ? "Đã duyệt"
      : amendment.status === "rejected"
        ? "Đã từ chối"
        : "Chờ duyệt";

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass}`}>
              {statusLabel}
            </span>
            <span className="text-sm font-semibold text-orange-300">
              {amendment.deltaAmount >= 0 ? "+" : ""}
              {fmtVND(amendment.deltaAmount)}
            </span>
          </div>
          <div className="mt-1 text-xs text-white/60">
            {amendment.proposedBy?.fullName ?? "—"} ·{" "}
            {new Date(amendment.createdAt).toLocaleString("vi-VN")}
          </div>
        </div>
        {amendment.status === "draft" && canApprove && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => act("approve")}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
            >
              Duyệt
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => act("reject")}
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-300 hover:bg-rose-500/20 disabled:opacity-50"
            >
              Từ chối
            </button>
          </div>
        )}
      </div>
      <div className="mt-2 rounded bg-white/5 px-3 py-2 text-sm text-white/80">
        <span className="text-white/50">Lý do: </span>
        {amendment.reason}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[600px] text-xs">
          <thead>
            <tr className="text-left text-white/40">
              <th className="px-2 py-1">GĐ</th>
              <th className="px-2 py-1">Đầu việc</th>
              <th className="px-2 py-1">Đơn vị</th>
              <th className="px-2 py-1 text-right">KL</th>
              <th className="px-2 py-1 text-right">Đơn giá</th>
              <th className="px-2 py-1 text-right">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {amendment.items.map((it) => (
              <tr key={it.id} className="border-t border-white/5">
                <td className="px-2 py-1">{LABOR_PHASE_LABEL[it.phase]}</td>
                <td className="px-2 py-1 text-white">{it.workItem}</td>
                <td className="px-2 py-1">{it.unit}</td>
                <td className="px-2 py-1 text-right">{it.quantity}</td>
                <td className="px-2 py-1 text-right">
                  {Number(it.unitPrice).toLocaleString("vi-VN")}
                </td>
                <td className="px-2 py-1 text-right text-orange-300">{fmtVND(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {amendment.status === "rejected" && amendment.rejectReason && (
        <div className="mt-2 rounded bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Lý do từ chối: {amendment.rejectReason}
        </div>
      )}
      {amendment.status === "approved" && amendment.approvedBy && (
        <div className="mt-2 text-xs text-emerald-300/80">
          Duyệt bởi {amendment.approvedBy.fullName} ·{" "}
          {amendment.approvedAt && new Date(amendment.approvedAt).toLocaleString("vi-VN")}
        </div>
      )}
      {err && <div className="mt-2 text-xs text-rose-300">{err}</div>}
    </div>
  );
}

function AmendmentModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<Item[]>([
    { phase: "mong", workItem: "", unit: "m2", quantity: 0, unitPrice: 0, note: "" },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function addRow() {
    setItems((p) => [...p, { phase: "mong", workItem: "", unit: "m2", quantity: 0, unitPrice: 0, note: "" }]);
  }
  function removeRow(i: number) {
    setItems((p) => p.filter((_, idx) => idx !== i));
  }
  function update(i: number, patch: Partial<Item>) {
    setItems((p) => p.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit() {
    if (reason.trim().length < 5) {
      setErr("Lý do tối thiểu 5 ký tự");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.workItem.trim() || !(Number(it.quantity) > 0))) {
      setErr("Mỗi dòng cần đầu việc và khối lượng > 0");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/labor-budget/amendments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason.trim(),
          items: items.map((it) => ({
            phase: it.phase,
            workItem: it.workItem.trim(),
            unit: it.unit.trim(),
            quantity: Number(it.quantity),
            unitPrice: Math.round(Number(it.unitPrice)),
            note: (it.note ?? "").trim() || null,
          })),
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.message ?? `HTTP ${res.status}`);
      onCreated();
    } catch (e: any) {
      setErr(e?.message ?? "Thất bại");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Đề xuất điều chỉnh dự toán</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            ✕
          </button>
        </div>
        <textarea
          rows={2}
          placeholder="Lý do điều chỉnh (vd: chủ nhà phát sinh đập tường, đổi vật liệu...)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mb-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
        />
        <div className="max-h-[40vh] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase text-white/50">
                <th className="px-2 py-2">GĐ</th>
                <th className="px-2 py-2">Đầu việc</th>
                <th className="px-2 py-2">Đơn vị</th>
                <th className="px-2 py-2 text-right">KL</th>
                <th className="px-2 py-2 text-right">Đơn giá</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-b border-white/5">
                  <td className="px-2 py-1.5">
                    <select
                      value={it.phase}
                      onChange={(e) => update(idx, { phase: e.target.value as Phase })}
                      className="rounded border border-white/10 bg-black/30 px-1 py-1 text-xs text-white"
                    >
                      {LABOR_PHASE_OPTIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={it.workItem}
                      onChange={(e) => update(idx, { workItem: e.target.value })}
                      className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      value={it.unit}
                      onChange={(e) => update(idx, { unit: e.target.value })}
                      className="w-16 rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      step="0.001"
                      value={it.quantity}
                      onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
                      className="w-24 rounded border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <input
                      type="number"
                      step="1"
                      value={it.unitPrice}
                      onChange={(e) => update(idx, { unitPrice: Number(e.target.value) })}
                      className="w-28 rounded border border-white/10 bg-black/30 px-2 py-1 text-right text-sm text-white"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-xs text-rose-300 hover:text-rose-200"
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={addRow}
            className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
          >
            + Thêm dòng
          </button>
          {err && <div className="text-xs text-rose-300">{err}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="rounded bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {busy ? "Đang gửi..." : "Gửi đề xuất"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
