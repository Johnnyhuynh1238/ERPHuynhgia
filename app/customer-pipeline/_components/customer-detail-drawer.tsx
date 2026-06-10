"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Row = {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  stage: number;
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

type StepKind = "mat_bang" | "mat_tien_3d" | "noi_that" | "shop_drawing";
type StepStatus = "pending" | "in_progress" | "customer_review" | "approved";

type ContractDetail = {
  id: string;
  customerName: string;
  customerPhone: string;
  signedAt: string;
  totalValue: number | null;
  status: "active" | "done" | "cancelled";
  notes: string | null;
  leadId: string | null;
  projectId: string | null;
  steps: { id: string; kind: StepKind; status: StepStatus; approvedAt: string | null; notes: string | null }[];
};

const STEP_LABEL: Record<StepKind, string> = {
  mat_bang: "Mặt bằng công năng",
  mat_tien_3d: "Phối cảnh 3D mặt tiền",
  noi_that: "Thiết kế nội thất",
  shop_drawing: "Bộ bản vẽ thi công",
};

const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: "Chưa làm",
  in_progress: "Đang làm",
  customer_review: "Chờ KH duyệt",
  approved: "KH đã duyệt",
};

const STEP_STATUS_OPTIONS: StepStatus[] = ["pending", "in_progress", "customer_review", "approved"];

function formatVnd(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("vi-VN") + "đ";
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function CustomerDetailDrawer({
  row,
  onClose,
  onChanged,
}: {
  row: Row;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingStepId, setSavingStepId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!row.designContractId) {
      setContract(null);
      return;
    }
    setLoading(true);
    fetch(`/api/admin/design-contracts/${row.designContractId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setContract(d))
      .catch(() => toast.error("Không tải được HĐ Thiết kế"))
      .finally(() => setLoading(false));
  }, [row.designContractId]);

  async function createContract() {
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/design-contracts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          leadId: row.leadId,
          signedAt: new Date().toISOString().slice(0, 10),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setContract(data);
      toast.success("Đã tạo HĐ Thiết kế");
      onChanged();
    } catch (e) {
      toast.error("Lỗi tạo HĐ: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setCreating(false);
    }
  }

  async function updateStep(stepId: string, patch: Partial<{ status: StepStatus; notes: string }>) {
    if (!contract) return;
    setSavingStepId(stepId);
    try {
      const res = await fetch(`/api/admin/design-contracts/${contract.id}/steps/${stepId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setContract((c) =>
        c ? { ...c, steps: c.steps.map((s) => (s.id === updated.id ? updated : s)) } : c,
      );
      onChanged();
    } catch (e) {
      toast.error("Lỗi update: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setSavingStepId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative ml-auto flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[#252840] bg-[#0f1117]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#252840] bg-[#0f1117] px-5 py-3">
          <div>
            <div className="text-sm text-[#8892b0]">Chi tiết khách hàng</div>
            <div className="text-lg font-semibold">{row.customerName}</div>
            <div className="text-xs text-[#8892b0]">{row.customerPhone}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-3 py-1 text-sm text-[#8892b0] hover:bg-[#252840] hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <section>
            <div className="text-xs uppercase tracking-wide text-[#8892b0]">Stage hiện tại</div>
            <div className="mt-1 text-base font-medium">
              [{row.stage}] {row.stageLabel}
              {row.subLabel && <span className="ml-2 text-sm text-[#8892b0]">— {row.subLabel}</span>}
            </div>
            <div className="text-xs text-[#8892b0]">
              {row.daysInStage} ngày trong stage · Hoạt động cuối {formatDate(row.lastActivityAt)}
            </div>
            {row.hotFlag && (
              <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                ⚠ {row.hotFlag}
              </div>
            )}
            <div className="mt-2 rounded-lg border border-[#252840] bg-[#13151f] px-3 py-2 text-sm">
              <div className="text-xs text-[#8892b0]">Cần làm tiếp</div>
              <div>{row.nextAction}</div>
            </div>
          </section>

          <PipelineTimeline currentStage={row.stage} />

          <section>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">HĐ Thiết kế (4 sub-step)</div>
              {!row.designContractId && (
                <Button size="sm" onClick={createContract} disabled={creating}>
                  {creating ? "Đang tạo…" : "Tạo HĐ Thiết kế"}
                </Button>
              )}
            </div>
            {!row.designContractId ? (
              <div className="rounded-lg border border-dashed border-[#252840] bg-[#13151f] px-3 py-4 text-sm text-[#8892b0]">
                Chưa có HĐ Thiết kế. Bấm &quot;Tạo HĐ Thiết kế&quot; để bắt đầu track 4 sub-step.
              </div>
            ) : loading ? (
              <div className="text-sm text-[#8892b0]">Đang tải…</div>
            ) : contract ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs text-[#8892b0]">
                  <div>Ngày ký: <span className="text-white">{formatDate(contract.signedAt)}</span></div>
                  <div>Giá trị: <span className="text-white">{formatVnd(contract.totalValue)}</span></div>
                </div>
                {(["mat_bang", "mat_tien_3d", "noi_that", "shop_drawing"] as StepKind[]).map((kind) => {
                  const step = contract.steps.find((s) => s.kind === kind);
                  if (!step) return null;
                  const saving = savingStepId === step.id;
                  return (
                    <div key={step.id} className="rounded-lg border border-[#252840] bg-[#13151f] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">{STEP_LABEL[kind]}</div>
                        <select
                          value={step.status}
                          disabled={saving}
                          onChange={(e) => updateStep(step.id, { status: e.target.value as StepStatus })}
                          className="rounded-lg border border-[#2d3249] bg-[#0f1117] px-2 py-1 text-xs"
                        >
                          {STEP_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{STEP_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      </div>
                      {step.approvedAt && (
                        <div className="mt-1 text-xs text-emerald-300">Duyệt {formatDate(step.approvedAt)}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>

          <section className="flex flex-wrap gap-2 border-t border-[#252840] pt-3">
            {row.leadId && (
              <Link href={`/leads?lead=${row.leadId}`} className="rounded-lg border border-[#252840] bg-[#13151f] px-3 py-2 text-sm hover:text-amber-300">
                → Mở Lead
              </Link>
            )}
            {row.projectId && (
              <Link href={`/projects/${row.projectId}`} className="rounded-lg border border-[#252840] bg-[#13151f] px-3 py-2 text-sm hover:text-amber-300">
                → Mở Dự án {row.projectCode ?? ""}
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function PipelineTimeline({ currentStage }: { currentStage: number }) {
  const stages = [
    { n: 1, label: "Lead" },
    { n: 2, label: "Liên hệ" },
    { n: 3, label: "Thiết kế" },
    { n: 4, label: "CB Thi công" },
    { n: 5, label: "Thi công" },
    { n: 6, label: "Bàn giao" },
    { n: 7, label: "Bảo hành" },
  ];
  return (
    <section>
      <div className="text-xs uppercase tracking-wide text-[#8892b0]">Tiến độ pipeline</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {stages.map((s) => {
          const done = s.n < currentStage;
          const active = s.n === currentStage;
          return (
            <div
              key={s.n}
              className={`flex-1 min-w-[64px] rounded-md border px-2 py-1.5 text-center text-[11px] ${
                active
                  ? "border-amber-400 bg-amber-500/15 text-amber-300"
                  : done
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-[#252840] bg-[#13151f] text-[#5b6275]"
              }`}
            >
              <div className="font-medium">{s.n}</div>
              <div>{s.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
