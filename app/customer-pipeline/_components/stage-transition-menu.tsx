"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Row } from "./customer-pipeline-client";

type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STAGE_LABEL: Record<Stage, string> = {
  1: "Lead mới",
  2: "Đã liên hệ",
  3: "HĐ Thiết kế",
  4: "Chuẩn bị thi công",
  5: "Đang thi công",
  6: "Bàn giao",
  7: "Bảo hành",
};

function describeTransition(row: Row, target: Stage): string {
  if (target === row.stage) return "Giai đoạn hiện tại";
  if (target < row.stage) {
    return target === 1
      ? "Quay lại Lead (reset trạng thái lead)"
      : target === 2
      ? "Quay lại Liên hệ"
      : target === 3
      ? "Mở lại HĐ Thiết kế"
      : "Quay lại giai đoạn trước";
  }
  if (target === 2 && row.stage === 1) return "Bump lead → contacted";
  if (target === 3 && row.stage <= 2)
    return row.designContractId
      ? "Active lại HĐ Thiết kế"
      : "Tạo HĐ Thiết kế (4 sub-step)";
  if (target === 4 && row.stage <= 3)
    return row.projectId
      ? "Chuyển Project → planning"
      : "Cần tạo Project mới";
  if (target === 5) return "Project → in_progress";
  if (target === 6) return "Project → completed + actualEndDate = hôm nay";
  if (target === 7) return "Đưa vào bảo hành (sau cửa sổ 30d bàn giao)";
  return "";
}

export function StageTransitionMenu({
  row,
  onClose,
  onChanged,
}: {
  row: Row;
  onClose: () => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<Stage | null>(null);

  async function transition(target: Stage) {
    setSaving(target);
    try {
      const res = await fetch(`/api/admin/customer-pipeline/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: row.leadId,
          designContractId: row.designContractId,
          projectId: row.projectId,
          targetStage: target,
        }),
      });
      if (res.status === 409) {
        const data = await res.json();
        if (data.redirect) {
          toast.message("Cần tạo dự án mới");
          const params = new URLSearchParams({
            customerName: row.customerName,
            customerPhone: row.customerPhone,
          });
          router.push(`${data.redirect}?${params}`);
          return;
        }
      }
      if (!res.ok) throw new Error(await res.text());
      toast.success(`Đã chuyển sang [${target}] ${STAGE_LABEL[target as Stage]}`);
      onChanged();
    } catch (e) {
      toast.error("Lỗi: " + (e instanceof Error ? e.message : "unknown"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Đóng"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[#252840] bg-[#0f1117] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Chuyển giai đoạn</h2>
            <p className="text-xs text-[#8892b0]">
              {row.customerName} · hiện tại [{row.stage}] {STAGE_LABEL[row.stage as Stage]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-0.5 text-[#8892b0] hover:bg-[#252840] hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-1.5">
          {([1, 2, 3, 4, 5, 6, 7] as Stage[]).map((target) => {
            const current = target === row.stage;
            const isSaving = saving === target;
            const desc = describeTransition(row, target);
            return (
              <button
                key={target}
                type="button"
                disabled={current || saving !== null}
                onClick={() => transition(target)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  current
                    ? "border-amber-400/40 bg-amber-500/5"
                    : "border-[#2d3249] bg-[#13151f] hover:border-amber-400 hover:bg-amber-500/5"
                }`}
              >
                <span className="text-[11px] font-semibold tabular-nums text-amber-300">[{target}]</span>
                <span className="flex-1">
                  <span className="font-medium">{STAGE_LABEL[target]}</span>
                  <span className="block text-xs text-[#8892b0]">{desc}</span>
                </span>
                {current && <span className="text-xs text-amber-300">Hiện tại</span>}
                {isSaving && <span className="text-xs text-[#8892b0]">…</span>}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] text-[#8892b0]">
          Lưu ý: chuyển giai đoạn thay đổi trạng thái thực tế của Lead / HĐ Thiết kế / Project.
        </p>
      </div>
    </div>
  );
}
