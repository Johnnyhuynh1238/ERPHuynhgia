"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export type AssignmentItemDraft = {
  id?: string;
  title: string;
  description: string;
  guideContent: string;
  requirePhoto: boolean;
  displayOrder: number;
};

export function AssignmentItemEditor({
  open,
  mode,
  initialValue,
  maxDisplayOrder,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initialValue: AssignmentItemDraft;
  maxDisplayOrder: number;
  saving: boolean;
  onClose: () => void;
  onSubmit: (draft: AssignmentItemDraft) => void;
}) {
  const [draft, setDraft] = useState<AssignmentItemDraft>(initialValue);

  useEffect(() => {
    if (!open) return;
    setDraft(initialValue);
  }, [initialValue, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#f97316]/50 bg-[#1a1d2e] p-4 shadow-2xl">
        <div className="mb-4">
          <div className="text-base font-semibold text-[#f0f2ff]">{mode === "create" ? "Thêm nhiệm vụ" : "Sửa nhiệm vụ"}</div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[#98a0c2]">Tiêu đề *</label>
            <input
              autoFocus
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#98a0c2]">Mô tả ngắn</label>
            <textarea
              value={draft.description}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              className="min-h-[70px] w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-[#98a0c2]">Hướng dẫn riêng</label>
            <textarea
              value={draft.guideContent}
              onChange={(event) => setDraft((prev) => ({ ...prev, guideContent: event.target.value }))}
              className="min-h-[140px] w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-[#2f3555] bg-[#11182d] px-3 py-2 text-sm text-[#d9def3]">
            <input
              type="checkbox"
              checked={draft.requirePhoto}
              onChange={(event) => setDraft((prev) => ({ ...prev, requirePhoto: event.target.checked }))}
              className="mt-1"
            />
            Bắt buộc upload ảnh khi tick hoàn thành
          </label>

          <div>
            <label className="mb-1 block text-xs text-[#98a0c2]">Vị trí trong checklist</label>
            <select
              value={draft.displayOrder}
              onChange={(event) => setDraft((prev) => ({ ...prev, displayOrder: Number(event.target.value) || 1 }))}
              className="w-full rounded-lg border border-[#30364d] bg-[#11182d] px-3 py-2 text-sm text-[#f0f2ff]"
            >
              {Array.from({ length: Math.max(1, maxDisplayOrder) }).map((_, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {idx + 1}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Hủy
          </Button>
          <Button
            className="bg-[#f97316] text-black hover:bg-[#fb923c]"
            disabled={saving}
            onClick={() => onSubmit(draft)}
          >
            {saving ? "Đang lưu..." : "✓ Lưu"}
          </Button>
        </div>
      </div>
    </div>
  );
}
