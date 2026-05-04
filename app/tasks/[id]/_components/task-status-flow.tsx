"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type TaskStatus = "not_started" | "in_progress" | "done" | "internal_approved" | "completed" | "inspected" | "delayed" | "na";

type TaskCategory = "normal" | "internal_milestone" | "major_milestone";

const STEP_META = [
  { key: "in_progress", label: "Đang thực hiện" },
  { key: "done", label: "KS hoàn thành" },
  { key: "internal_approved", label: "TPTC duyệt" },
  { key: "completed", label: "Hoàn tất" },
] as const;

function getStepIndex(status: TaskStatus) {
  if (status === "not_started") return -1;
  if (status === "in_progress" || status === "delayed") return 0;
  if (status === "done") return 1;
  if (status === "internal_approved") return 2;
  if (status === "completed" || status === "inspected") return 3;
  return -1;
}

function normalizeStatus(status: TaskStatus) {
  if (status === "inspected") return "completed";
  return status;
}

export function TaskStatusFlow({
  taskId,
  status,
  category,
  currentUserRole,
  canUpdateQc,
  onStatusChanged,
}: {
  taskId: string;
  status: TaskStatus;
  category: TaskCategory;
  currentUserRole: string;
  canUpdateQc: boolean;
  onStatusChanged: (nextStatus: TaskStatus) => void;
}) {
  const [approverNote, setApproverNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalized = normalizeStatus(status);
  const stepIndex = getStepIndex(normalized);

  const canMarkDone = useMemo(() => {
    if (!canUpdateQc) return false;
    return ["not_started", "in_progress", "delayed"].includes(normalized);
  }, [canUpdateQc, normalized]);

  const canInternalApprove = useMemo(() => {
    if (!(currentUserRole === "admin" || currentUserRole === "construction_manager")) return false;
    return normalized === "done";
  }, [currentUserRole, normalized]);

  async function postAction(endpoint: "mark-done" | "internal-approve", body?: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({} as { message?: string; task?: { status?: TaskStatus } }));
      if (!res.ok) {
        throw new Error(json.message || "Cập nhật trạng thái thất bại");
      }
      const next = json.task?.status;
      if (next) {
        onStatusChanged(next);
      }
      toast.success(json.message || "Đã cập nhật trạng thái");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Cập nhật trạng thái thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
      <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Flow trạng thái QC</div>

      <div className="grid gap-2 md:grid-cols-4">
        {STEP_META.map((step, idx) => {
          const done = idx <= stepIndex;
          const active = idx === stepIndex;
          return (
            <div
              key={step.key}
              className={`rounded-xl border px-3 py-2 text-xs ${done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-[#2e3347] bg-[#222637] text-[#8891aa]"}`}
            >
              <div className="font-semibold">Bước {idx + 1}</div>
              <div>{step.label}</div>
              {active ? <div className="mt-1 text-[10px] uppercase tracking-wide">Hiện tại</div> : null}
            </div>
          );
        })}
      </div>

      {category === "major_milestone" && normalized === "internal_approved" ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          Task milestone đang chờ chủ nhà ký xác nhận để chuyển sang Hoàn tất.
        </div>
      ) : null}

      <div className="flex flex-col gap-2 md:flex-row">
        <Button
          disabled={!canMarkDone || submitting}
          onClick={() => postAction("mark-done")}
          className="bg-amber-500 text-[#0f1117] hover:bg-amber-600"
        >
          {submitting ? "Đang xử lý..." : "KS xác nhận Done"}
        </Button>

        {canInternalApprove ? (
          <div className="flex flex-1 flex-col gap-2 md:flex-row">
            <input
              value={approverNote}
              onChange={(e) => setApproverNote(e.target.value)}
              placeholder="Ghi chú duyệt nội bộ"
              className="h-10 flex-1 rounded-xl border border-[#2e3347] bg-[#222637] px-3 text-sm"
            />
            <Button
              disabled={submitting}
              onClick={() => postAction("internal-approve", { note: approverNote || undefined })}
              className="bg-indigo-500 text-white hover:bg-indigo-600"
            >
              {submitting ? "Đang duyệt..." : "TPTC duyệt nội bộ"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
