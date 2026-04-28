"use client";

/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type QcStatus = "unchecked" | "passed" | "failed";

type QcPhoto = {
  id: string;
  url: string;
  uploadedAt: string;
};

type QcProgress = {
  status: QcStatus;
  note: string | null;
  noPhotoReason: boolean;
};

type QcItem = {
  id: string;
  content: string;
  requirePhoto: boolean;
  requireNote: boolean;
  orderIndex: number;
  progress: QcProgress | null;
  photos: QcPhoto[];
};

export function QcSection({
  taskId,
  canUpdateQc,
  canManageItem,
}: {
  taskId: string;
  canUpdateQc: boolean;
  canManageItem: boolean;
}) {
  const [items, setItems] = useState<QcItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [showSubmitQc, setShowSubmitQc] = useState(false);
  const [overallComment, setOverallComment] = useState("");
  const [issueNote, setIssueNote] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [viewer, setViewer] = useState<{ itemId: string; index: number } | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editRequirePhoto, setEditRequirePhoto] = useState(false);
  const [editRequireNote, setEditRequireNote] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  async function loadItems() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/qc-items`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Không tải được QC items");
      setItems(json.items || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Không tải được QC items");
    } finally {
      setLoading(false);
    }
  }

  async function updateItem(
    itemId: string,
    payload: Partial<{
      status: QcStatus;
      note: string;
      noPhotoReason: boolean;
      content: string;
      requirePhoto: boolean;
      requireNote: boolean;
    }>,
  ) {
    const res = await fetch(`/api/tasks/${taskId}/qc-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Cập nhật QC thất bại");
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === itemId ? json.item : x)));
  }

  function closeAddItemModal() {
    setShowAddItem(false);
    setNewContent("");
  }

  function startEditItem(item: QcItem) {
    setEditingItemId(item.id);
    setEditContent(item.content);
    setEditRequirePhoto(Boolean(item.requirePhoto));
    setEditRequireNote(Boolean(item.requireNote));
  }

  function cancelEditItem() {
    setEditingItemId(null);
    setEditContent("");
    setEditRequirePhoto(false);
    setEditRequireNote(false);
  }

  async function saveEditItem(itemId: string) {
    const content = editContent.trim();
    if (!content) {
      toast.error("Nội dung mục QC là bắt buộc");
      return;
    }

    const res = await fetch(`/api/tasks/${taskId}/qc-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content,
        requirePhoto: editRequirePhoto,
        requireNote: editRequireNote,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Sửa mục QC thất bại");
      return;
    }

    setItems((prev) => prev.map((x) => (x.id === itemId ? json.item : x)));
    toast.success(json.message || "Đã cập nhật mục QC");
    cancelEditItem();
  }

  async function deleteItem(item: QcItem) {
    const confirmed = window.confirm(`Xóa mục QC: ${item.content}?`);
    if (!confirmed) return;

    const res = await fetch(`/api/tasks/${taskId}/qc-items/${item.id}`, {
      method: "DELETE",
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Xóa mục QC thất bại");
      return;
    }

    setItems((prev) => prev.filter((x) => x.id !== item.id));
    toast.success(json.message || "Đã xóa mục QC");
  }

  function closeSubmitQcModal() {
    setShowSubmitQc(false);
    setOverallComment("");
    setIssueNote("");
    setSuggestion("");
  }

  async function addItem() {
    if (!newContent.trim()) {
      toast.error("Nhập nội dung mục QC");
      return;
    }
    const res = await fetch(`/api/tasks/${taskId}/qc-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newContent.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Thêm mục QC thất bại");
      return;
    }
    setItems((prev) => [...prev, json.item].sort((a, b) => a.orderIndex - b.orderIndex));
    closeAddItemModal();
  }

  async function uploadFiles(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    const formData = new FormData();
    formData.append("qcItemId", itemId);
    Array.from(files).forEach((f) => formData.append("files", f));

    const res = await fetch(`/api/tasks/${taskId}/qc-photos`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Upload ảnh QC thất bại");
      return;
    }
    toast.success(json.message || "Đã upload ảnh QC");
    await loadItems();
  }

  async function deletePhoto(photoId: string) {
    const res = await fetch(`/api/tasks/${taskId}/qc-photos/${photoId}`, {
      method: "DELETE",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Xóa ảnh thất bại");
      return;
    }
    toast.success(json.message || "Đã xóa ảnh QC");
    await loadItems();
  }

  async function submitQc() {
    const res = await fetch(`/api/tasks/${taskId}/qc-submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overallComment, issueNote, suggestion }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Gửi báo cáo QC thất bại");
      return;
    }
    toast.success(json.message || "Đã gửi báo cáo QC");
    closeSubmitQcModal();
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!sectionRef.current) return;
      if (viewer || showAddItem || showSubmitQc) return;
      if (!sectionRef.current.contains(event.target as Node)) {
        setExpandedItemId(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [viewer, showAddItem, showSubmitQc]);

  const total = items.length;
  const passed = useMemo(() => items.filter((x) => x.progress?.status === "passed").length, [items]);
  const progress = total > 0 ? Math.round((passed / total) * 100) : 0;

  const currentItem = useMemo(() => items.find((x) => x.id === viewer?.itemId) ?? null, [items, viewer?.itemId]);
  const currentPhotos = currentItem?.photos ?? [];
  const currentIndex = viewer?.index ?? 0;
  const currentPhoto = currentPhotos[currentIndex] ?? null;

  function prevPhoto() {
    if (!viewer || currentPhotos.length === 0) return;
    setViewer({ ...viewer, index: (currentIndex - 1 + currentPhotos.length) % currentPhotos.length });
  }

  function nextPhoto() {
    if (!viewer || currentPhotos.length === 0) return;
    setViewer({ ...viewer, index: (currentIndex + 1) % currentPhotos.length });
  }

  function toggleExpanded(itemId: string) {
    setExpandedItemId((prev) => (prev === itemId ? null : itemId));
  }

  function getItemStatus(item: QcItem): QcStatus {
    return item.progress?.status ?? "unchecked";
  }

  function getItemCardClass(item: QcItem) {
    const status = getItemStatus(item);
    if (status === "passed") return "border-emerald-400 bg-emerald-50";
    if (status === "failed") return "border-rose-400 bg-rose-50";
    return "border-slate-200 bg-white";
  }

  return (
    <div ref={sectionRef} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">QC Checklist mới</div>
          <div className="text-xs text-slate-500">
            Đã đạt {passed}/{total} ({progress}%)
          </div>
        </div>
        <div className="flex items-center gap-2">
          {progress === 100 && total > 0 ? (
            <Button size="sm" onClick={() => setShowSubmitQc(true)} title="Gửi duyệt QC">
              Gửi duyệt
            </Button>
          ) : null}
          {canManageItem ? (
            <Button variant="outline" size="sm" onClick={() => setShowAddItem(true)} title="Thêm mục QC">
              +
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={loadItems} disabled={loading}>
            {loading ? "Đang tải..." : "Làm mới QC"}
          </Button>
        </div>
      </div>

      <div className="h-2 rounded bg-slate-200">
        <div className="h-2 rounded bg-emerald-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const expanded = expandedItemId === item.id;
          const status = getItemStatus(item);
          return (
            <div key={item.id} className={`rounded-lg border p-3 ${getItemCardClass(item)}`}>
              {canManageItem ? (
                <div className="mb-2 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => startEditItem(item)}>
                    Sửa
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deleteItem(item)}>
                    Xóa
                  </Button>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => toggleExpanded(item.id)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="text-sm font-semibold">{item.content}</div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded px-2 py-0.5 bg-black/5">
                    {status === "passed" ? "Hoàn thành" : status === "failed" ? "Không đạt" : "Chưa làm"}
                  </span>
                  <span>{expanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {expanded ? (
                <div className="mt-3">
                  <div className="mb-2 text-[11px] text-slate-600">
                    {item.requirePhoto ? "Bắt buộc ảnh" : "Ảnh tùy chọn"} · {item.requireNote ? "Bắt buộc ghi chú" : "Ghi chú tùy chọn"}
                  </div>

                  <div className="mb-2 flex gap-2">
                    <Button
                      size="sm"
                      variant={item.progress?.status === "unchecked" ? "default" : "outline"}
                      disabled={!canUpdateQc}
                      onClick={() => updateItem(item.id, { status: "unchecked" })}
                    >
                      ⬜
                    </Button>
                    <Button
                      size="sm"
                      variant={item.progress?.status === "passed" ? "default" : "outline"}
                      disabled={!canUpdateQc}
                      onClick={() => updateItem(item.id, { status: "passed" })}
                    >
                      ✅
                    </Button>
                    <Button
                      size="sm"
                      variant={item.progress?.status === "failed" ? "destructive" : "outline"}
                      disabled={!canUpdateQc}
                      onClick={() => updateItem(item.id, { status: "failed" })}
                    >
                      ❌
                    </Button>
                  </div>

                  <textarea
                    className="w-full rounded border px-2 py-1 text-sm"
                    rows={2}
                    placeholder="Ghi chú mục QC..."
                    defaultValue={item.progress?.note || ""}
                    onBlur={(e) => updateItem(item.id, { note: e.target.value })}
                    disabled={!canUpdateQc}
                  />

                  <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={Boolean(item.progress?.noPhotoReason)}
                      onChange={(e) => updateItem(item.id, { noPhotoReason: e.target.checked })}
                      disabled={!canUpdateQc}
                    />
                    Task không có ảnh
                  </label>

                  <div className="mt-3 rounded border border-slate-200 p-2">
                    <div className="mb-2 text-xs font-semibold text-slate-600">Ảnh bằng chứng ({item.photos.length})</div>

                    {item.photos.length > 0 ? (
                      <div className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {item.photos.map((photo, idx) => (
                          <div key={photo.id} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => setViewer({ itemId: item.id, index: idx })}
                              className="block w-full overflow-hidden rounded border border-slate-200"
                            >
                              <img
                                src={`/api/tasks/${taskId}/qc-photos/${photo.id}/file`}
                                alt={`QC photo ${idx + 1}`}
                                className="h-20 w-full object-cover"
                                loading="lazy"
                              />
                            </button>
                            {canUpdateQc ? (
                              <button className="text-[11px] text-red-500 underline" onClick={() => deletePhoto(photo.id)}>
                                Xóa
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mb-2 text-xs text-slate-500">Chưa có ảnh</div>
                    )}

                    {canUpdateQc ? (
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={async (e) => {
                          await uploadFiles(item.id, e.target.files);
                          e.currentTarget.value = "";
                        }}
                        className="block w-full text-xs"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>


      {editingItemId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cancelEditItem}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold">Sửa mục QC</div>
              <button className="text-sm text-slate-500" onClick={cancelEditItem}>
                Đóng
              </button>
            </div>

            <textarea
              autoFocus
              className="w-full rounded border px-3 py-2 text-sm"
              rows={4}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Nhập nội dung mục QC..."
            />

            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editRequirePhoto} onChange={(e) => setEditRequirePhoto(e.target.checked)} />
              Bắt buộc ảnh
            </label>

            <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={editRequireNote} onChange={(e) => setEditRequireNote(e.target.checked)} />
              Bắt buộc ghi chú
            </label>

            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={cancelEditItem}>
                Hủy
              </Button>
              <Button size="sm" onClick={() => saveEditItem(editingItemId)}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeAddItemModal}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-base font-semibold">Thêm mục QC</div>
              <button className="text-sm text-slate-500" onClick={closeAddItemModal}>
                Đóng
              </button>
            </div>
            <textarea
              autoFocus
              className="w-full rounded border px-3 py-2 text-sm"
              rows={4}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Nhập tiêu đề mục QC mới..."
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={closeAddItemModal}>
                Hủy
              </Button>
              <Button size="sm" onClick={addItem}>
                Lưu mục QC
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showSubmitQc ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeSubmitQcModal}>
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-base font-semibold">Gửi duyệt QC</div>
                <div className="text-xs text-slate-500">QC đã đạt 100%. KS nhập đánh giá tổng thể trước khi gửi TPTC.</div>
              </div>
              <button className="text-sm text-slate-500" onClick={closeSubmitQcModal}>
                Đóng
              </button>
            </div>
            <div className="space-y-2">
              <textarea
                autoFocus
                className="w-full rounded border px-3 py-2 text-sm"
                rows={3}
                placeholder="Nhận xét tổng thể *"
                value={overallComment}
                onChange={(e) => setOverallComment(e.target.value)}
              />
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                rows={2}
                placeholder="Vấn đề phát sinh"
                value={issueNote}
                onChange={(e) => setIssueNote(e.target.value)}
              />
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                rows={2}
                placeholder="Đề xuất"
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={closeSubmitQcModal}>
                Hủy
              </Button>
              <Button size="sm" onClick={submitQc}>
                Gửi lên TPTC
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {viewer && currentPhoto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewer(null)}>
          <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-0 top-0 rounded bg-black/50 px-3 py-1 text-sm text-white" onClick={() => setViewer(null)}>
              Đóng
            </button>
            <div className="relative mt-8 aspect-[16/10] w-full overflow-hidden rounded-lg bg-black">
              <Image src={`/api/tasks/${taskId}/qc-photos/${currentPhoto.id}/file`} alt="QC full" fill unoptimized className="object-contain" />
            </div>
            {currentPhotos.length > 1 ? (
              <div className="mt-3 flex items-center justify-between">
                <Button variant="outline" onClick={prevPhoto}>
                  ← Trước
                </Button>
                <div className="text-xs text-slate-200">
                  Ảnh {currentIndex + 1}/{currentPhotos.length} (cùng mục QC)
                </div>
                <Button variant="outline" onClick={nextPhoto}>
                  Sau →
                </Button>
              </div>
            ) : (
              <div className="mt-3 text-center text-xs text-slate-300">Chỉ có 1 ảnh trong mục QC này</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
