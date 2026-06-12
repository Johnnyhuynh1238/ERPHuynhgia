"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OUTPUT_QC_STATUS_LABEL, TIMESHEET_ABSENT_REASON_LABEL } from "@/lib/eod";
import { WORKER_QC_ISSUE_SEVERITY_LABEL } from "@/lib/qc-mapping";

type AbsentReason = "P" | "KP" | "MUA" | "CHO";
type QcStatus = "pending" | "passed" | "failed" | "rework";
type QcCheckStatus = "pending" | "passed" | "failed";
type IssueSeverity = "minor" | "major" | "critical";

type WorkerRow = {
  workerId: string;
  fullName: string;
  grade: number | null;
  dailyRate: number;
  workerStatus: string;
  morningPresent: boolean;
  afternoonPresent: boolean;
  dayValue: number;
  absentReason: AbsentReason | null;
  note: string | null;
  saved: boolean;
};

type QcCheckRow = {
  id: string;
  itemIndex: number;
  itemTitle: string;
  status: QcCheckStatus;
  hasPhoto: boolean;
  note: string | null;
  checkedAt: string | null;
};

type OrderRow = {
  id: string;
  groupNo: number;
  workItem: string;
  unit: string;
  unitPrice: number;
  targetQty: number;
  workerCount: number;
  workerIds: string[];
  qcChecklist: Array<{ title: string; requirePhoto: boolean }>;
  output: {
    id: string;
    actualQty: number;
    approvedQty: number | null;
    qcStatus: QcStatus;
    note: string | null;
    photos: Array<{ id: string; storageKey: string; sortRank: number }>;
    qcChecks: QcCheckRow[];
  } | null;
};

type EodData = {
  date: string;
  weekKey: string;
  workers: WorkerRow[];
  orders: OrderRow[];
};

type OutputDraft = {
  actualQty: string;
  note: string;
};

type Props = {
  projectId: string;
  canEdit: boolean;
  canTickQc: boolean;
  canApproveOutput: boolean;
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

const DAY_VALUE_OPTIONS = [
  { value: 1, label: "1" },
  { value: 0.5, label: "½" },
  { value: 0, label: "0" },
];

export function EodClient({ projectId, canEdit, canTickQc, canApproveOutput }: Props) {
  const [date, setDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<EodData | null>(null);
  const [tsDrafts, setTsDrafts] = useState<Record<string, { dayValue: number; absentReason: AbsentReason | null; note: string }>>({});
  const [outputDrafts, setOutputDrafts] = useState<Record<string, OutputDraft>>({});
  const [tickBusy, setTickBusy] = useState<Record<string, boolean>>({});
  const [decisionBusy, setDecisionBusy] = useState<Record<string, boolean>>({});
  const [issueModal, setIssueModal] = useState<{
    outputId: string;
    workerIds: string[];
    workItem: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/eod?date=${date}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.message || "Không tải được dữ liệu");
        return;
      }
      const j: EodData = await r.json();
      setData(j);
      const ts: typeof tsDrafts = {};
      for (const w of j.workers) {
        ts[w.workerId] = { dayValue: w.dayValue, absentReason: w.absentReason, note: w.note ?? "" };
      }
      setTsDrafts(ts);
      const out: typeof outputDrafts = {};
      for (const o of j.orders) {
        out[o.id] = {
          actualQty: o.output ? String(o.output.actualQty) : "",
          note: o.output?.note ?? "",
        };
      }
      setOutputDrafts(out);
    } catch (e) {
      toast.error(String((e as Error).message || e));
    } finally {
      setLoading(false);
    }
  }, [projectId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const updateTs = (workerId: string, patch: Partial<{ dayValue: number; absentReason: AbsentReason | null; note: string }>) => {
    setTsDrafts((prev) => {
      const cur = prev[workerId] ?? { dayValue: 1, absentReason: null, note: "" };
      const next = { ...cur, ...patch };
      if (next.dayValue !== 0) next.absentReason = null;
      return { ...prev, [workerId]: next };
    });
  };

  const updateOutput = (orderId: string, patch: Partial<OutputDraft>) => {
    setOutputDrafts((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] ?? { actualQty: "", note: "" }), ...patch } }));
  };

  const dirty = useMemo(() => {
    if (!data) return false;
    for (const w of data.workers) {
      const d = tsDrafts[w.workerId];
      if (!d) continue;
      if (d.dayValue !== w.dayValue || (d.absentReason ?? null) !== (w.absentReason ?? null) || (d.note || "") !== (w.note || "")) return true;
    }
    for (const o of data.orders) {
      const d = outputDrafts[o.id];
      if (!d) continue;
      const savedQty = o.output ? String(o.output.actualQty) : "";
      const savedNote = o.output?.note ?? "";
      if (d.actualQty !== savedQty || (d.note || "") !== savedNote) return true;
    }
    return false;
  }, [data, tsDrafts, outputDrafts]);

  const save = async () => {
    if (!data || !canEdit) return;
    // Build payload — chỉ gửi rows có khác snapshot (giảm noise log)
    const timesheets = data.workers
      .map((w) => ({ workerId: w.workerId, draft: tsDrafts[w.workerId] }))
      .filter((x) => x.draft)
      .map((x) => ({
        workerId: x.workerId,
        dayValue: x.draft!.dayValue,
        absentReason: x.draft!.absentReason,
        note: x.draft!.note?.trim() || null,
      }));

    const outputs: Array<{ workOrderId: string; actualQty: number; note: string | null }> = [];
    for (const o of data.orders) {
      const d = outputDrafts[o.id];
      if (!d) continue;
      const qtyRaw = (d.actualQty || "").trim();
      if (qtyRaw === "") continue;
      const qty = Number(qtyRaw);
      if (!Number.isFinite(qty) || qty < 0) {
        toast.error(`Nhóm ${o.groupNo}: khối lượng không hợp lệ`);
        return;
      }
      outputs.push({ workOrderId: o.id, actualQty: qty, note: d.note?.trim() || null });
    }

    // Validate: dayValue=0 → cần lý do
    for (const t of timesheets) {
      if (t.dayValue === 0 && !t.absentReason) {
        const w = data.workers.find((x) => x.workerId === t.workerId);
        toast.error(`Thợ ${w?.fullName || ""}: chọn lý do vắng`);
        return;
      }
    }

    setSaving(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/eod`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, timesheets, outputs }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message || "Lưu thất bại");
        return;
      }
      toast.success(`Đã lưu: ${j.savedTimesheets} chấm công + ${j.savedOutputs} sản lượng`);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const uploadPhotos = async (outputId: string, files: FileList | null) => {
    if (!files || files.length === 0 || !canEdit) return;
    const fd = new FormData();
    fd.append("outputId", outputId);
    for (const f of Array.from(files)) fd.append("files", f);
    const r = await fetch(`/api/projects/${projectId}/eod/photos`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(j.message || "Upload ảnh thất bại");
      return;
    }
    toast.success(`Đã upload ${j.photos?.length || 0} ảnh`);
    await load();
  };

  const tickQc = async (
    outputId: string,
    itemIndex: number,
    itemTitle: string,
    status: QcCheckStatus,
    file: File | null,
  ) => {
    if (!canTickQc) return;
    const key = `${outputId}:${itemIndex}`;
    setTickBusy((s) => ({ ...s, [key]: true }));
    try {
      const fd = new FormData();
      fd.append("outputId", outputId);
      fd.append("itemIndex", String(itemIndex));
      fd.append("status", status);
      if (file) fd.append("file", file);
      const r = await fetch(`/api/projects/${projectId}/eod/qc-check`, { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message || "Tick QC thất bại");
        return;
      }
      await load();
    } finally {
      setTickBusy((s) => ({ ...s, [key]: false }));
    }
  };

  const decideOutput = async (outputId: string, decision: "passed" | "failed" | "rework" | "pending") => {
    if (!canApproveOutput) return;
    setDecisionBusy((s) => ({ ...s, [outputId]: true }));
    try {
      const r = await fetch(`/api/projects/${projectId}/eod/outputs/${outputId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message || "Cập nhật trạng thái thất bại");
        return;
      }
      toast.success(`Trạng thái: ${OUTPUT_QC_STATUS_LABEL[decision]}`);
      await load();
    } finally {
      setDecisionBusy((s) => ({ ...s, [outputId]: false }));
    }
  };

  const submitIssue = async (payload: {
    outputId: string;
    workerIds: string[];
    severity: IssueSeverity;
    reason: string;
  }) => {
    if (!data) return;
    const r = await fetch(`/api/projects/${projectId}/eod/qc-issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, occurredAt: data.date }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(j.message || "Ghi nhận lỗi thất bại");
      return;
    }
    toast.success(`Đã ghi ${j.created || 0} lỗi QC`);
    setIssueModal(null);
  };

  const deletePhoto = async (photoId: string) => {
    if (!canEdit) return;
    if (!confirm("Xoá ảnh này?")) return;
    const r = await fetch(`/api/projects/${projectId}/eod/photos?photoId=${photoId}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      toast.error(j.message || "Xoá thất bại");
      return;
    }
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#f0f2ff]">Cuối ngày</h2>
            <div className="text-xs text-[#8892b0]">
              Chấm công + sản lượng cho ngày đã chọn. Tuần: {data?.weekKey || "—"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              className="rounded-lg border border-[#252840] bg-[#0f1220] px-3 py-2 text-sm text-[#f0f2ff]"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {canEdit && (
              <Button onClick={save} disabled={saving || !dirty}>
                {saving ? "Đang lưu..." : "Lưu cuối ngày"}
              </Button>
            )}
          </div>
        </div>
        {!canEdit && (
          <div className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/30">
            Bạn chỉ có quyền xem.
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-6 text-center text-sm text-[#8892b0]">
          Đang tải...
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="mb-3 text-sm font-semibold text-[#f0f2ff]">Chấm công ({data?.workers.length || 0} thợ)</div>
            {data?.workers.length === 0 ? (
              <div className="text-xs text-[#8892b0]">Chưa có thợ nào trong ngày (chưa giao việc + chưa chấm công).</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-[#8892b0]">
                    <tr className="border-b border-[#252840]">
                      <th className="px-2 py-2 text-left">Thợ</th>
                      <th className="px-2 py-2 text-center">Bậc</th>
                      <th className="px-2 py-2 text-center">Sáng/Chiều</th>
                      <th className="px-2 py-2 text-center">Công</th>
                      <th className="px-2 py-2 text-center">Lý do (nếu 0)</th>
                      <th className="px-2 py-2 text-left">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.workers.map((w) => {
                      const d = tsDrafts[w.workerId] ?? { dayValue: w.dayValue, absentReason: w.absentReason, note: w.note ?? "" };
                      return (
                        <tr key={w.workerId} className="border-b border-[#252840]/60">
                          <td className="px-2 py-2 text-[#f0f2ff]">{w.fullName}</td>
                          <td className="px-2 py-2 text-center text-[#8892b0]">{w.grade ?? "—"}</td>
                          <td className="px-2 py-2 text-center text-xs text-[#8892b0]">
                            {w.morningPresent ? "S" : "·"}/{w.afternoonPresent ? "C" : "·"}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <div className="inline-flex gap-1">
                              {DAY_VALUE_OPTIONS.map((opt) => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => updateTs(w.workerId, { dayValue: opt.value })}
                                  className={`min-w-[36px] rounded px-2 py-1 text-xs ring-1 ${
                                    d.dayValue === opt.value
                                      ? "bg-orange-500 text-white ring-orange-500"
                                      : "bg-[#0f1220] text-[#8892b0] ring-[#252840]"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {d.dayValue === 0 ? (
                              <select
                                disabled={!canEdit}
                                value={d.absentReason ?? ""}
                                onChange={(e) => updateTs(w.workerId, { absentReason: (e.target.value || null) as AbsentReason | null })}
                                className="rounded border border-[#252840] bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff]"
                              >
                                <option value="">— chọn —</option>
                                {(["P", "KP", "MUA", "CHO"] as AbsentReason[]).map((r) => (
                                  <option key={r} value={r}>
                                    {r} ({TIMESHEET_ABSENT_REASON_LABEL[r]})
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-[#3a3f5e]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="text"
                              disabled={!canEdit}
                              value={d.note}
                              onChange={(e) => updateTs(w.workerId, { note: e.target.value })}
                              maxLength={200}
                              className="w-full rounded border border-[#252840] bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
            <div className="mb-3 text-sm font-semibold text-[#f0f2ff]">
              Sản lượng theo phiếu ({data?.orders.length || 0} phiếu)
            </div>
            {data?.orders.length === 0 ? (
              <div className="text-xs text-[#8892b0]">Ngày này chưa có phiếu giao việc.</div>
            ) : (
              <div className="space-y-3">
                {data?.orders.map((o) => {
                  const d = outputDrafts[o.id] ?? { actualQty: "", note: "" };
                  return (
                    <div key={o.id} className="rounded-lg border border-[#252840] bg-[#0f1220] p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-[#f0f2ff]">
                            Nhóm {o.groupNo} · {o.workItem}
                          </div>
                          <div className="text-xs text-[#8892b0]">
                            Giao: {fmt(o.targetQty)} {o.unit} · {fmt(o.unitPrice)}đ · {o.workerCount} thợ
                            {o.output && (
                              <span className="ml-2 rounded bg-[#252840] px-2 py-0.5 text-[10px]">
                                QC: {OUTPUT_QC_STATUS_LABEL[o.output.qcStatus]}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            disabled={!canEdit}
                            value={d.actualQty}
                            onChange={(e) => updateOutput(o.id, { actualQty: e.target.value })}
                            placeholder={`KL thực tế (${o.unit})`}
                            className="w-32 rounded border border-[#252840] bg-[#0f1220] px-2 py-1 text-sm text-[#f0f2ff]"
                          />
                          <span className="text-xs text-[#8892b0]">{o.unit}</span>
                        </div>
                      </div>
                      <div className="mt-2">
                        <input
                          type="text"
                          disabled={!canEdit}
                          value={d.note}
                          onChange={(e) => updateOutput(o.id, { note: e.target.value })}
                          placeholder="Ghi chú (lỗi cty, lý do thiếu KL...)"
                          maxLength={300}
                          className="w-full rounded border border-[#252840] bg-[#0f1220] px-2 py-1 text-xs text-[#f0f2ff]"
                        />
                      </div>
                      {o.output && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {o.output.photos.map((p) => (
                            <div key={p.id} className="relative">
                              <img
                                src={`/api/projects/${projectId}/eod/photos/${p.id}/file`}
                                alt=""
                                className="h-16 w-16 rounded object-cover ring-1 ring-[#252840]"
                              />
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => deletePhoto(p.id)}
                                  className="absolute -right-1 -top-1 rounded-full bg-red-600/80 px-1 text-[10px] text-white"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))}
                          {canEdit && (
                            <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border border-dashed border-[#3a3f5e] text-xl text-[#8892b0]">
                              +
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => uploadPhotos(o.output!.id, e.target.files)}
                              />
                            </label>
                          )}
                        </div>
                      )}
                      {!o.output && canEdit && (
                        <div className="mt-2 text-[11px] text-amber-400">
                          Nhập khối lượng + Lưu cuối ngày trước, sau đó mới upload được ảnh.
                        </div>
                      )}
                      {o.output && o.qcChecklist.length > 0 && (
                        <QcChecklistBlock
                          projectId={projectId}
                          output={o.output}
                          checklist={o.qcChecklist}
                          canTickQc={canTickQc}
                          canApproveOutput={canApproveOutput}
                          tickBusy={tickBusy}
                          decisionBusy={Boolean(decisionBusy[o.output.id])}
                          onTick={(idx, title, status, file) => tickQc(o.output!.id, idx, title, status, file)}
                          onDecision={(decision) => decideOutput(o.output!.id, decision)}
                          onOpenIssue={() =>
                            setIssueModal({ outputId: o.output!.id, workerIds: o.workerIds, workItem: o.workItem })
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {issueModal && data && (
        <QcIssueModal
          workers={data.workers.filter((w) => issueModal.workerIds.includes(w.workerId))}
          workItem={issueModal.workItem}
          onClose={() => setIssueModal(null)}
          onSubmit={(payload) =>
            submitIssue({
              outputId: issueModal.outputId,
              workerIds: payload.workerIds,
              severity: payload.severity,
              reason: payload.reason,
            })
          }
        />
      )}
    </div>
  );
}

function QcChecklistBlock(props: {
  projectId: string;
  output: { id: string; qcChecks: QcCheckRow[] };
  checklist: Array<{ title: string; requirePhoto: boolean }>;
  canTickQc: boolean;
  canApproveOutput: boolean;
  tickBusy: Record<string, boolean>;
  decisionBusy: boolean;
  onTick: (
    itemIndex: number,
    itemTitle: string,
    status: QcCheckStatus,
    file: File | null,
  ) => void;
  onDecision: (decision: "passed" | "failed" | "rework" | "pending") => void;
  onOpenIssue: () => void;
}) {
  const { projectId, output, checklist, canTickQc, canApproveOutput, tickBusy, decisionBusy, onTick, onDecision, onOpenIssue } =
    props;

  const checkByIndex = useMemo(() => {
    const m = new Map<number, QcCheckRow>();
    for (const c of output.qcChecks) m.set(c.itemIndex, c);
    return m;
  }, [output.qcChecks]);

  const blockingItem = useMemo(() => {
    for (let i = 0; i < checklist.length; i += 1) {
      const item = checklist[i];
      const c = checkByIndex.get(i);
      if (!c) return `Mục "${item.title}" chưa kiểm`;
      if (c.status !== "passed") return `Mục "${item.title}" chưa đạt`;
      if (item.requirePhoto && !c.hasPhoto) return `Mục "${item.title}" yêu cầu ảnh`;
    }
    return null;
  }, [checklist, checkByIndex]);

  return (
    <div className="mt-3 rounded-md border border-[#252840] bg-[#0a0d1c] p-2">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#8892b0]">QC checklist</div>
      <div className="space-y-1.5">
        {checklist.map((item, idx) => {
          const c = checkByIndex.get(idx);
          const tickKey = `${output.id}:${idx}`;
          const busy = Boolean(tickBusy[tickKey]);
          const statusColor =
            c?.status === "passed"
              ? "text-emerald-300"
              : c?.status === "failed"
              ? "text-red-400"
              : "text-amber-300";
          return (
            <div key={idx} className="flex flex-wrap items-center gap-2 rounded bg-[#0f1220] px-2 py-1.5">
              <span className="flex-1 text-xs text-[#f0f2ff]">
                <span className="mr-1 text-[#8892b0]">{idx + 1}.</span>
                {item.title}
                {item.requirePhoto && <span className="ml-1 text-[10px] text-amber-300">[ảnh]</span>}
              </span>
              <span className={`text-[10px] uppercase ${statusColor}`}>
                {c?.status === "passed" ? "Đạt" : c?.status === "failed" ? "Không đạt" : "Chờ"}
              </span>
              {c?.hasPhoto && (
                <img
                  src={`/api/projects/${projectId}/eod/qc-checks/${c.id}/file`}
                  alt=""
                  className="h-8 w-8 rounded object-cover ring-1 ring-[#252840]"
                />
              )}
              {canTickQc && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onTick(idx, item.title, "passed", null)}
                    className="rounded bg-emerald-600/20 px-2 py-0.5 text-[10px] text-emerald-300 ring-1 ring-emerald-600/40 disabled:opacity-50"
                  >
                    Đạt
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onTick(idx, item.title, "failed", null)}
                    className="rounded bg-red-600/20 px-2 py-0.5 text-[10px] text-red-300 ring-1 ring-red-600/40 disabled:opacity-50"
                  >
                    Lỗi
                  </button>
                  <label className="cursor-pointer rounded bg-[#252840] px-2 py-0.5 text-[10px] text-[#8892b0]">
                    Ảnh
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        if (f) onTick(idx, item.title, c?.status ?? "passed", f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-[#8892b0]">
          {blockingItem ? <span className="text-amber-300">{blockingItem}</span> : <span>Đủ điều kiện duyệt</span>}
        </div>
        {canApproveOutput && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={decisionBusy}
              onClick={() => {
                onDecision("failed");
                onOpenIssue();
              }}
            >
              Không đạt
            </Button>
            <Button
              variant="outline"
              disabled={decisionBusy}
              onClick={() => onDecision("rework")}
            >
              Làm lại
            </Button>
            <Button
              disabled={decisionBusy || Boolean(blockingItem)}
              onClick={() => onDecision("passed")}
            >
              {decisionBusy ? "..." : "Duyệt"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function QcIssueModal(props: {
  workers: WorkerRow[];
  workItem: string;
  onClose: () => void;
  onSubmit: (payload: { workerIds: string[]; severity: IssueSeverity; reason: string }) => void;
}) {
  const { workers, workItem, onClose, onSubmit } = props;
  const [selected, setSelected] = useState<Set<string>>(() => new Set(workers.map((w) => w.workerId)));
  const [severity, setSeverity] = useState<IssueSeverity>("minor");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handle = async () => {
    if (!reason.trim()) {
      toast.error("Nhập lý do");
      return;
    }
    if (selected.size === 0) {
      toast.error("Chọn ít nhất 1 thợ");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ workerIds: Array.from(selected), severity, reason: reason.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-2 text-sm font-semibold text-[#f0f2ff]">Ghi nhận lỗi QC</div>
        <div className="mb-3 text-xs text-[#8892b0]">Đầu việc: {workItem}</div>

        <div className="mb-3">
          <div className="mb-1 text-xs text-[#8892b0]">Thợ vi phạm</div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded bg-[#0f1220] p-2">
            {workers.length === 0 ? (
              <div className="text-[11px] text-[#8892b0]">Không có thợ nào trên phiếu.</div>
            ) : (
              workers.map((w) => (
                <label key={w.workerId} className="flex items-center gap-2 text-xs text-[#f0f2ff]">
                  <input
                    type="checkbox"
                    checked={selected.has(w.workerId)}
                    onChange={() => toggle(w.workerId)}
                  />
                  <span>{w.fullName}</span>
                  <span className="text-[10px] text-[#8892b0]">(B{w.grade ?? "?"})</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1 text-xs text-[#8892b0]">Mức độ</div>
          <div className="flex gap-2">
            {(["minor", "major", "critical"] as IssueSeverity[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeverity(s)}
                className={`rounded px-3 py-1 text-xs ring-1 ${
                  severity === s
                    ? "bg-orange-500 text-white ring-orange-500"
                    : "bg-[#0f1220] text-[#8892b0] ring-[#252840]"
                }`}
              >
                {WORKER_QC_ISSUE_SEVERITY_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1 text-xs text-[#8892b0]">Lý do</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            rows={3}
            className="w-full rounded border border-[#252840] bg-[#0f1220] px-2 py-1.5 text-sm text-[#f0f2ff]"
            placeholder="VD: Thi công sai cao độ, mạch ngừng không đúng vị trí..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Đóng
          </Button>
          <Button onClick={handle} disabled={submitting}>
            {submitting ? "Đang ghi..." : "Ghi nhận"}
          </Button>
        </div>
      </div>
    </div>
  );
}
