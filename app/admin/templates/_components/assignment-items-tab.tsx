"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AssignmentItemEditor, type AssignmentItemDraft } from "./assignment-item-editor";

type AssignmentItem = {
  id: string;
  taskTemplateId: string;
  displayOrder: number;
  title: string;
  description: string | null;
  guideContent: string | null;
  requirePhoto: boolean;
};

const EMPTY_DRAFT: AssignmentItemDraft = {
  title: "",
  description: "",
  guideContent: "",
  requirePhoto: false,
  displayOrder: 1,
};

export function AssignmentItemsTab({
  templateId,
  canEdit,
}: {
  templateId: string;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/templates/${templateId}/assignment-items`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      toast.error(json.message || "Không tải được nhiệm vụ checklist");
      return;
    }

    setItems((json.items || []) as AssignmentItem[]);
  }, [templateId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const editingItem = useMemo(() => items.find((item) => item.id === editingItemId) || null, [items, editingItemId]);

  function openCreate() {
    setEditorMode("create");
    setEditingItemId(null);
    setEditorOpen(true);
  }

  function openEdit(itemId: string) {
    setEditorMode("edit");
    setEditingItemId(itemId);
    setEditorOpen(true);
  }

  async function submitEditor(draft: AssignmentItemDraft) {
    if (!draft.title.trim()) {
      toast.error("Tiêu đề là bắt buộc");
      return;
    }

    setSaving(true);

    const url = editorMode === "create"
      ? `/api/admin/templates/${templateId}/assignment-items`
      : `/api/admin/assignment-items/${editingItemId}`;
    const method = editorMode === "create" ? "POST" : "PATCH";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        guideContent: draft.guideContent.trim() || null,
        requirePhoto: draft.requirePhoto,
        displayOrder: draft.displayOrder,
      }),
    });

    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      toast.error(json.message || "Lưu nhiệm vụ checklist thất bại");
      return;
    }

    toast.success(json.message || "Đã lưu nhiệm vụ checklist");
    setEditorOpen(false);
    setEditingItemId(null);
    await loadItems();
  }

  async function removeItem(itemId: string) {
    if (!confirm("Xóa nhiệm vụ checklist này?")) return;

    const res = await fetch(`/api/admin/assignment-items/${itemId}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Xóa thất bại");
      return;
    }

    toast.success(json.message || "Đã xóa nhiệm vụ checklist");
    await loadItems();
  }

  async function reorderByIndex(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];

    const res = await fetch(`/api/admin/templates/${templateId}/assignment-items/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: next.map((item) => item.id) }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Cập nhật thứ tự thất bại");
      return;
    }

    setItems((json.items || []) as AssignmentItem[]);
    toast.success("Đã cập nhật thứ tự");
  }

  const editorInitial: AssignmentItemDraft = editingItem
    ? {
        id: editingItem.id,
        title: editingItem.title,
        description: editingItem.description || "",
        guideContent: editingItem.guideContent || "",
        requirePhoto: editingItem.requirePhoto,
        displayOrder: editingItem.displayOrder,
      }
    : {
        ...EMPTY_DRAFT,
        displayOrder: items.length + 1,
      };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border-l-4 border-[#f97316] bg-[#2a1a05] p-3 text-xs text-[#f7c58a]">
        💡 Nhiệm vụ checklist hiện cho KS trong menu Nhiệm vụ. KS tick mỗi ngày khi làm task này.
      </div>

      {loading ? <div className="text-sm text-[#98a0c2]">Đang tải nhiệm vụ checklist...</div> : null}

      <div className="text-xs text-[#9ca3af]">Danh sách nhiệm vụ: {items.length} items</div>

      {items.map((item, index) => (
        <div key={item.id} className="rounded-lg bg-[#2a2a2a] p-3">
          <div className="mb-1 text-sm font-semibold text-[#f0f2ff]">
            {item.displayOrder}. {item.title}
          </div>
          <div className="text-xs text-[#9ca3af]">
            📷 Yêu cầu ảnh: {item.requirePhoto ? "✅" : "❌"}
          </div>
          <div className="text-xs text-[#9ca3af]">📖 {item.guideContent ? "Có hướng dẫn riêng" : "Chưa có hướng dẫn riêng"}</div>

          {canEdit ? (
            <div className="mt-2 flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => openEdit(item.id)}
                className="rounded bg-[#1a1a1a] px-2 py-1 text-[11px] text-[#cfd3e3]"
              >
                Sửa
              </button>
              <button
                type="button"
                onClick={() => reorderByIndex(index, -1)}
                className="rounded bg-[#1a1a1a] px-2 py-1 text-[11px] text-[#cfd3e3]"
                disabled={index === 0}
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => reorderByIndex(index, 1)}
                className="rounded bg-[#1a1a1a] px-2 py-1 text-[11px] text-[#cfd3e3]"
                disabled={index === items.length - 1}
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="rounded bg-[#1a1a1a] px-2 py-1 text-[11px] text-red-400"
              >
                ×
              </button>
            </div>
          ) : null}
        </div>
      ))}

      {canEdit ? (
        <>
          <Button variant="outline" className="w-full border-[#2f3555] bg-[#1a1d2e]" onClick={openCreate}>
            + Thêm nhiệm vụ
          </Button>
          <div className="text-center">
            <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={loadItems}>
              💾 Lưu Nhiệm vụ
            </Button>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-[#2f3555] bg-[#1a1d2e] p-3 text-xs text-[#9ca3af]">Bạn chỉ có quyền xem tab này.</div>
      )}

      <AssignmentItemEditor
        open={editorOpen}
        mode={editorMode}
        initialValue={editorInitial}
        maxDisplayOrder={Math.max(items.length + (editorMode === "create" ? 1 : 0), 1)}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onSubmit={submitEditor}
      />
    </div>
  );
}
