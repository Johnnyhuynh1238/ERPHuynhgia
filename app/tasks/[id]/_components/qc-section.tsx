"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TaskPhotoAlbumViewer,
  TaskPhotoImage,
  TaskPhotoUploadStatus,
  createTaskPhotoUploadQueue,
  uploadTaskPhotoBatch,
  type TaskPhotoAlbumState,
  type TaskPhotoUploadItem,
} from "./task-photo-tools";

type QcMissionTemplate = {
  id: string;
  preparationSteps: string | null;
  executionSteps: string | null;
  commonMistakes: string | null;
  beforeQcSteps: string | null;
};

type QcTemplateResponse = {
  taskId: string;
  qcChecklist?: string | null;
  qcTemplate: QcMissionTemplate | null;
  items: Array<{
    id: string;
    displayOrder: number;
    title: string;
    description: string | null;
    requirePhoto: boolean;
  }>;
};

type QcStoredPhoto = {
  id?: string;
  photoUrl: string;
  thumbnailUrl?: string;
};

type QcResultRow = {
  item: {
    id: string;
    displayOrder: number;
    title: string;
    description: string | null;
    requirePhoto: boolean;
  };
  result: {
    id: string;
    isPassed: boolean;
    photoUrl: string | null;
    photos: QcStoredPhoto[];
    note: string | null;
    checkedAt: string;
    updatedAt: string;
    checkedBy: { id: string; fullName: string; email: string };
  } | null;
};

type QcResultsResponse = {
  taskId: string;
  status: string;
  canUpdate: boolean;
  items: QcResultRow[];
  summary: {
    total: number;
    passed: number;
    remaining: number;
    completed: boolean;
  };
};

type QcSubTab = "missions" | "checklist";

function fmtDateTime(input: string | null | undefined) {
  if (!input) return "-";
  return new Date(input).toLocaleString("vi-VN");
}

function getRowPhotos(row: QcResultRow) {
  if (row.result?.photos?.length) return row.result.photos;
  return row.result?.photoUrl ? [{ photoUrl: row.result.photoUrl }] : [];
}

function mergePhotos(existing: QcStoredPhoto[], incoming: QcStoredPhoto[]) {
  const seen = new Set<string>();
  return [...existing, ...incoming].filter((photo) => {
    const key = photo.id || photo.photoUrl;
    if (!photo.photoUrl || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function QcSection({
  taskId,
  canUpdateQc,
}: {
  taskId: string;
  canUpdateQc: boolean;
  canManageItem?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<QcSubTab>("missions");
  const [loading, setLoading] = useState(false);
  const [savingByItem, setSavingByItem] = useState<Record<string, boolean>>({});
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [mission, setMission] = useState<QcTemplateResponse | null>(null);
  const [results, setResults] = useState<QcResultsResponse | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, QcStoredPhoto[]>>({});
  const [pendingPassedItems, setPendingPassedItems] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [uploadQueues, setUploadQueues] = useState<Record<string, TaskPhotoUploadItem[]>>({});
  const [photoPreview, setPhotoPreview] = useState<TaskPhotoAlbumState | null>(null);

  const locked = useMemo(() => {
    const status = results?.status || "";
    return ["done", "internal_approved", "completed"].includes(status);
  }, [results?.status]);

  const canEdit = canUpdateQc && Boolean(results?.canUpdate) && !locked;

  function updateUploadQueueItem(itemId: string, nextItem: TaskPhotoUploadItem) {
    setUploadQueues((current) => ({
      ...current,
      [itemId]: (current[itemId] || []).map((item) => (item.id === nextItem.id ? nextItem : item)),
    }));
  }

  function clearUploadQueue(itemId: string) {
    setUploadQueues((current) => ({ ...current, [itemId]: [] }));
  }

  async function loadData() {
    setLoading(true);
    try {
      const [templateRes, resultsRes] = await Promise.all([
        fetch(`/api/tasks/${taskId}/qc-template`, { cache: "no-store" }),
        fetch(`/api/tasks/${taskId}/qc-results`, { cache: "no-store" }),
      ]);

      const templateJson = await templateRes.json().catch(() => ({} as { message?: string }));
      const resultsJson = await resultsRes.json().catch(() => ({} as { message?: string }));

      if (!templateRes.ok) throw new Error(templateJson.message || "Không tải được nhiệm vụ QC");
      if (!resultsRes.ok) throw new Error(resultsJson.message || "Không tải được checklist QC");

      setMission(templateJson);
      setResults(resultsJson as QcResultsResponse);
      setPendingPassedItems({});
      setPendingPhotos({});
      setUploadQueues({});
      const nextNotes: Record<string, string> = {};
      ((resultsJson as QcResultsResponse).items || []).forEach((row: QcResultRow) => {
        nextNotes[row.item.id] = row.result?.note || "";
      });
      setNotes(nextNotes);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được dữ liệu QC");
    } finally {
      setLoading(false);
    }
  }

  async function saveItem(itemId: string, isPassed: boolean, photosOverride?: QcStoredPhoto[]) {
    const row = results?.items.find((x) => x.item.id === itemId);
    if (!row || !results) return;

    setSavingByItem((prev) => ({ ...prev, [itemId]: true }));

    try {
      const savedPhotos = getRowPhotos(row);
      const photos = photosOverride ?? mergePhotos(savedPhotos, pendingPhotos[itemId] || []);

      if (isPassed && row.item.requirePhoto && photos.length === 0) {
        throw new Error("Tiêu chí này bắt buộc ảnh minh chứng");
      }

      const res = await fetch(`/api/tasks/${taskId}/qc-results/${itemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPassed,
          photos,
          note: notes[itemId] || undefined,
        }),
      });

      const json = await res.json().catch(() => ({} as { message?: string }));
      if (!res.ok) {
        throw new Error(json.message || "Lưu checklist QC thất bại");
      }

      setPendingPhotos((prev) => ({ ...prev, [itemId]: [] }));
      toast.success("Đã auto-save checklist QC");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu checklist QC thất bại");
    } finally {
      setSavingByItem((prev) => ({ ...prev, [itemId]: false }));
    }
  }

  async function uploadItemPhotos(row: QcResultRow, files: File[]) {
    const selected = files.filter(Boolean);
    if (!selected.length) return;

    const queue = createTaskPhotoUploadQueue(selected);
    setUploadQueues((current) => ({ ...current, [row.item.id]: queue }));
    setSavingByItem((prev) => ({ ...prev, [row.item.id]: true }));

    try {
      const result = await uploadTaskPhotoBatch({
        taskId,
        files: selected,
        queue,
        onItemChange: (nextItem) => updateUploadQueueItem(row.item.id, nextItem),
      });

      if (result.uploaded.length) {
        const photos = mergePhotos(mergePhotos(getRowPhotos(row), pendingPhotos[row.item.id] || []), result.uploaded);
        setPendingPhotos((prev) => ({
          ...prev,
          [row.item.id]: photos.filter((photo) => !getRowPhotos(row).some((saved) => (saved.id || saved.photoUrl) === (photo.id || photo.photoUrl))),
        }));
        toast.success(`Đã upload ${result.uploaded.length} ảnh QC`);
        const checked = Boolean(row.result?.isPassed) || Boolean(pendingPassedItems[row.item.id]);
        if (checked) {
          await saveItem(row.item.id, true, photos);
        }
      }

      if (result.failed.length) {
        toast.error(`${result.failed.length} ảnh QC upload lỗi. Xem chi tiết bên dưới.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload ảnh thất bại");
    } finally {
      setSavingByItem((prev) => ({ ...prev, [row.item.id]: false }));
    }
  }

  async function deletePhoto(row: QcResultRow, photo: QcStoredPhoto) {
    if (!photo.id) {
      const nextPhotos = mergePhotos(getRowPhotos(row), pendingPhotos[row.item.id] || []).filter((item) => item.photoUrl !== photo.photoUrl);
      await saveItem(row.item.id, Boolean(row.result?.isPassed) || Boolean(pendingPassedItems[row.item.id]), nextPhotos);
      return;
    }

    setDeletingPhotoId(photo.id);
    try {
      const res = await fetch(`/api/tasks/${taskId}/photos/${photo.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({} as { message?: string }));
      if (!res.ok) throw new Error(json.message || "Xóa ảnh thất bại");
      const nextPhotos = mergePhotos(getRowPhotos(row), pendingPhotos[row.item.id] || []).filter((item) => item.id !== photo.id);
      await saveItem(row.item.id, Boolean(row.result?.isPassed) || Boolean(pendingPassedItems[row.item.id]), nextPhotos);
      setPhotoPreview((current) => {
        if (!current) return current;
        const nextPreviewPhotos = current.photos.filter((item) => (item.id || item.photoUrl) !== (photo.id || photo.photoUrl));
        if (!nextPreviewPhotos.length) return null;
        return { ...current, photos: nextPreviewPhotos, index: Math.min(current.index, nextPreviewPhotos.length - 1) };
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Xóa ảnh thất bại");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  function handlePassedChange(row: QcResultRow, isPassed: boolean) {
    setPendingPassedItems((prev) => ({ ...prev, [row.item.id]: isPassed }));
    setExpandedItems((prev) => ({ ...prev, [row.item.id]: isPassed }));

    const photos = mergePhotos(getRowPhotos(row), pendingPhotos[row.item.id] || []);
    if (isPassed && row.item.requirePhoto && photos.length === 0) {
      return;
    }

    void saveItem(row.item.id, isPassed, photos);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("missions")}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
            activeTab === "missions" ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"
          }`}
        >
          Nhiệm vụ
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
            activeTab === "checklist" ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-[#2e3347] text-[#8891aa]"
          }`}
        >
          Checklist QC
        </button>
      </div>

      {activeTab === "missions" ? (
        <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Hướng dẫn nhiệm vụ QC</div>
          {loading ? <div className="text-sm text-[#8891aa]">Đang tải...</div> : null}

          {!loading && !mission?.qcTemplate && !mission?.qcChecklist ? (
            <div className="text-sm text-[#8891aa]">Task này không có checklist QC mẫu.</div>
          ) : null}

          {mission?.qcTemplate?.preparationSteps ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Chuẩn bị trước khi làm</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.preparationSteps}</div>
            </div>
          ) : null}

          {mission?.qcTemplate?.executionSteps ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Các bước thực hiện</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.executionSteps}</div>
            </div>
          ) : null}

          {mission?.qcTemplate?.commonMistakes ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Lỗi thường gặp</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.commonMistakes}</div>
            </div>
          ) : null}

          {mission?.qcTemplate?.beforeQcSteps ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Trước khi gọi QC</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcTemplate.beforeQcSteps}</div>
            </div>
          ) : null}

          {!mission?.qcTemplate && mission?.qcChecklist ? (
            <div className="rounded-xl border border-[#2e3347] bg-[#222637] p-3">
              <div className="text-xs font-semibold text-amber-300">Checklist tham chiếu</div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-[#c8d0e8]">{mission.qcChecklist}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "checklist" ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Checklist QC auto-save</div>
              <Button variant="outline" className="border-[#2e3347] bg-[#222637]" onClick={loadData} disabled={loading}>
                {loading ? "Đang tải..." : "Làm mới"}
              </Button>
            </div>
            <div className="mt-2 text-xs text-[#8891aa]">
              Đạt {results?.summary.passed || 0}/{results?.summary.total || 0} · Còn {results?.summary.remaining || 0}
            </div>
            {locked ? <div className="mt-2 text-xs text-amber-300">Task đã Done/Approved, checklist chỉ xem.</div> : null}
          </div>

          {(results?.items || []).length === 0 ? (
            <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 text-sm text-[#8891aa]">Chưa có tiêu chí checklist.</div>
          ) : (
            (results?.items || []).map((row) => {
              const saving = Boolean(savingByItem[row.item.id]);
              const checked = Boolean(row.result?.isPassed) || Boolean(pendingPassedItems[row.item.id]);
              const requirePhoto = row.item.requirePhoto;
              const expanded = Boolean(expandedItems[row.item.id]);
              const photos = mergePhotos(getRowPhotos(row), pendingPhotos[row.item.id] || []);
              const hasSavedPhoto = photos.length > 0;
              const uploadQueue = uploadQueues[row.item.id] || [];

              return (
                <div key={row.item.id} className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[#f0f2f8]">
                        {row.item.displayOrder}. {row.item.title}
                      </div>
                      {row.result?.checkedAt ? <div className="mt-1 text-[11px] text-[#8891aa]">Cập nhật: {fmtDateTime(row.result.checkedAt)}</div> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {hasSavedPhoto ? (
                        <button
                          type="button"
                          onClick={() => setPhotoPreview({ title: row.item.title, photos, index: 0 })}
                          className="rounded-full border border-amber-500/50 px-3 py-1 text-xs text-amber-300"
                        >
                          Album ({photos.length})
                        </button>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => setExpandedItems((prev) => ({ ...prev, [row.item.id]: !expanded }))}
                          className="rounded-full border border-[#2e3347] px-3 py-1 text-xs text-[#c8d0e8]"
                        >
                          {expanded ? "Ẩn" : "Sửa"}
                        </button>
                      ) : null}
                      <label className="inline-flex items-center gap-2 text-xs text-[#c8d0e8]">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canEdit || saving}
                          onChange={(e) => handlePassedChange(row, e.target.checked)}
                        />
                        Đạt
                      </label>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="space-y-3 rounded-xl border border-[#2e3347] bg-[#222637] p-3">
                      {row.item.description ? <div className="text-xs text-[#8891aa]">{row.item.description}</div> : null}
                      <div className="text-xs text-[#8891aa]">{requirePhoto ? "Bắt buộc ảnh minh chứng" : "Ảnh tùy chọn"}</div>

                      {canEdit ? (
                        <div>
                          <input
                            type="file"
                            multiple
                            accept="image/jpeg,image/png,image/webp"
                            className="block w-full text-xs"
                            disabled={saving}
                            onChange={async (e) => {
                              await uploadItemPhotos(row, Array.from(e.target.files || []));
                              e.currentTarget.value = "";
                            }}
                          />
                          <TaskPhotoUploadStatus items={uploadQueue} onClear={() => clearUploadQueue(row.item.id)} />
                        </div>
                      ) : null}

                      {photos.length > 0 ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold text-[#c8d0e8]">Ảnh checklist ({photos.length})</div>
                            <Button
                              variant="outline"
                              className="h-8 border-[#2e3347] bg-[#1a1d27] px-2 text-xs"
                              onClick={() => setPhotoPreview({ title: row.item.title, photos, index: 0 })}
                            >
                              Xem album
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            {photos.map((photo, index) => (
                              <div key={photo.id || photo.photoUrl} className="rounded-xl border border-[#2e3347] bg-[#1a1d27] p-2">
                                <button
                                  type="button"
                                  onClick={() => setPhotoPreview({ title: row.item.title, photos, index })}
                                  className="block h-20 w-full overflow-hidden rounded-lg bg-[#11131b]"
                                >
                                  <TaskPhotoImage src={photo.thumbnailUrl || photo.photoUrl} alt={row.item.title} className="h-full w-full object-cover" />
                                </button>
                                {canEdit ? (
                                  <Button
                                    variant="outline"
                                    className="mt-2 h-7 w-full border-red-500/40 bg-red-500/10 px-2 text-[11px] text-red-200"
                                    disabled={deletingPhotoId === photo.id || saving}
                                    onClick={() => deletePhoto(row, photo)}
                                  >
                                    Xóa ảnh
                                  </Button>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <textarea
                        value={notes[row.item.id] || ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [row.item.id]: e.target.value }))}
                        onBlur={() => {
                          if (!canEdit || saving) return;
                          void saveItem(row.item.id, checked || photos.length > 0, photos);
                        }}
                        disabled={!canEdit || saving}
                        rows={2}
                        placeholder="Ghi chú QC (auto-save khi rời ô)"
                        className="w-full rounded-xl border border-[#2e3347] bg-[#1a1d27] px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}

                  {saving ? <div className="text-xs text-[#8891aa]">Đang lưu...</div> : null}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      <TaskPhotoAlbumViewer album={photoPreview} onChange={setPhotoPreview} onClose={() => setPhotoPreview(null)} />
    </div>
  );
}
