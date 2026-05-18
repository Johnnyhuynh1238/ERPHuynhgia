"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  TaskPhotoAlbumViewer,
  TaskPhotoImage,
  useTaskPhotoUploader,
  type TaskPhotoAlbumState,
  type TaskPhotoItem,
  type TaskPhotoUploadItem,
} from "./task-photo-tools";

type ProgressHistory = {
  id: string;
  fromPercent: number;
  toPercent: number;
  photoUrl: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
};

type ProgressPayload = {
  progress: {
    percent: number;
    updatedAt: string | null;
    status: string | null;
  };
  history: ProgressHistory[];
};

function fmtDateTime(input: string | null) {
  if (!input) return "-";
  return new Date(input).toLocaleString("vi-VN");
}

function statusLabel(status: string | null) {
  const labels: Record<string, string> = {
    not_started: "Chưa bắt đầu",
    in_progress: "Đang làm",
    done: "KS hoàn thành",
    internal_approved: "Đã duyệt nội bộ",
    completed: "Hoàn tất",
    inspected: "Đã nghiệm thu",
    delayed: "Trễ",
    na: "Không áp dụng",
  };

  return status ? labels[status] || status : "-";
}

function parseProgressPhotos(value: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { photos?: Partial<TaskPhotoItem>[] };
    if (Array.isArray(parsed.photos)) {
      return parsed.photos
        .map((photo) => ({
          id: typeof photo.id === "string" ? photo.id : undefined,
          photoUrl: typeof photo.photoUrl === "string" ? photo.photoUrl : "",
          thumbnailUrl: typeof photo.thumbnailUrl === "string" ? photo.thumbnailUrl : undefined,
        }))
        .filter((photo) => Boolean(photo.photoUrl));
    }
  } catch {}
  return [{ photoUrl: value }];
}

export function TaskProgressSection({
  taskId,
  canUpdate,
}: {
  taskId: string;
  canUpdate: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [percent, setPercent] = useState(0);
  const [savedPercent, setSavedPercent] = useState(0);
  const [photoAlbum, setPhotoAlbum] = useState<TaskPhotoAlbumState | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<ProgressHistory[]>([]);
  const [hasInteractedWithProgress, setHasInteractedWithProgress] = useState(false);
  const photoUploader = useTaskPhotoUploader(taskId);

  const uploadedPhotos = useMemo<TaskPhotoItem[]>(
    () =>
      photoUploader.items
        .filter((item) => item.status === "done" && item.photo)
        .map((item) => item.photo as TaskPhotoItem),
    [photoUploader.items],
  );
  const photoUrl = uploadedPhotos[0]?.photoUrl || "";

  const isRollback = percent < savedPercent;
  const showUpdateFields = canUpdate && hasInteractedWithProgress && percent !== savedPercent;

  const canSave = useMemo(() => {
    if (!canUpdate) return false;
    if (!photoUrl) return false;
    if (isRollback && !reason.trim()) return false;
    if (percent === savedPercent) return false;
    return true;
  }, [canUpdate, photoUrl, isRollback, percent, reason, savedPercent]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/progress`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Partial<ProgressPayload> & { message?: string };
      if (!res.ok) {
        throw new Error(json.message || "Không tải được tiến độ");
      }
      const current = json.progress?.percent ?? 0;
      setPercent(current);
      setSavedPercent(current);
      setStatus(json.progress?.status || null);
      setUpdatedAt(json.progress?.updatedAt || null);
      setHistory(json.history || []);
      setPhotoAlbum(null);
      setShowHistoryModal(false);
      setReason("");
      setNote("");
      setHasInteractedWithProgress(false);
      setExpandedErrors(new Set());
      photoUploader.clear();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được tiến độ");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPhotos(files: File[]) {
    if (!files.length) return;
    setUploading(true);
    try {
      const result = await photoUploader.upload(files);
      if (result.uploaded.length) {
        toast.success(`Đã tải ${result.uploaded.length} ảnh tiến độ`);
      }
      if (result.failed.length) {
        toast.error(`${result.failed.length} ảnh tiến độ upload lỗi. Xem chi tiết bên dưới.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }

  function toggleErrorDetail(itemId: string) {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function removeUploadItem(item: TaskPhotoUploadItem) {
    const serverPhotoId = item.status === "done" ? item.photo?.id : null;
    if (serverPhotoId) {
      setDeletingItemId(item.id);
      try {
        const res = await fetch(`/api/tasks/${taskId}/photos/${serverPhotoId}`, { method: "DELETE" });
        const json = await res.json().catch(() => ({} as { message?: string }));
        if (!res.ok) {
          throw new Error(json.message || "Xóa ảnh thất bại");
        }
        toast.success(json.message || "Đã xóa ảnh");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Xóa ảnh thất bại");
        setDeletingItemId(null);
        return;
      } finally {
        setDeletingItemId(null);
      }
      setPhotoAlbum((current) => {
        if (!current) return current;
        const nextPhotos = current.photos.filter((entry) => entry.id !== serverPhotoId);
        if (!nextPhotos.length) return null;
        return { ...current, photos: nextPhotos, index: Math.min(current.index, nextPhotos.length - 1) };
      });
    }
    photoUploader.remove(item.id);
    setExpandedErrors((prev) => {
      if (!prev.has(item.id)) return prev;
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  }

  async function saveProgress() {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progressPercent: percent,
          photoUrl,
          photos: uploadedPhotos,
          reason: reason.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({} as { message?: string }));
      if (!res.ok) {
        throw new Error(json.message || "Lưu tiến độ thất bại");
      }
      toast.success(json.message || "Đã cập nhật tiến độ");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lưu tiến độ thất bại");
    } finally {
      setSaving(false);
    }
  }

  function renderHistoryRow(row: ProgressHistory, compact = false) {
    const photos = parseProgressPhotos(row.photoUrl);

    if (compact) {
      return (
        <div key={row.id} className="relative rounded-lg bg-[#1a1d27]/60 px-2.5 py-2 text-xs">
          <span className="absolute -left-[19px] top-3 h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)]" />
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold text-[#f0f2f8]">
                {row.fromPercent}% → {row.toPercent}%
              </div>
              <div className="truncate text-[11px] text-[#8891aa]">
                {fmtDateTime(row.createdAt)} · {row.user.fullName}
              </div>
            </div>
            {photos.length ? (
              <button
                type="button"
                onClick={() => setPhotoAlbum({ title: `Ảnh minh chứng ${row.fromPercent}% → ${row.toPercent}%`, photos, index: 0 })}
                className="shrink-0 text-[11px] text-amber-300 underline"
              >
                Ảnh{photos.length > 1 ? ` (${photos.length})` : ""}
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div key={row.id} className="relative rounded-xl bg-[#1a1d27]/70 p-3 text-sm">
        <span className="absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)]" />
        <div className="font-semibold text-[#f0f2f8]">
          {row.fromPercent}% → {row.toPercent}%
        </div>
        <div className="text-xs text-[#8891aa]">
          {fmtDateTime(row.createdAt)} · {row.user.fullName}
        </div>
        {row.reason ? <div className="mt-1 text-xs text-rose-300">Lý do: {row.reason}</div> : null}
        {row.note ? <div className="mt-1 text-xs text-[#c8d0e8]">Ghi chú: {row.note}</div> : null}
        {photos.length ? (
          <button
            type="button"
            onClick={() => setPhotoAlbum({ title: `Ảnh minh chứng ${row.fromPercent}% → ${row.toPercent}%`, photos, index: 0 })}
            className="mt-1 inline-block text-xs text-amber-300 underline"
          >
            Xem ảnh minh chứng{photos.length > 1 ? ` (${photos.length} ảnh)` : ""}
          </button>
        ) : null}
      </div>
    );
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-3 rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Tiến độ hiện tại</div>
            <div className="text-2xl font-bold text-amber-300 transition-all duration-200 ease-out">{percent}%</div>
          </div>
          <div className="text-right text-xs text-[#8891aa]">
            <div>Trạng thái: {statusLabel(status)}</div>
            <div>Cập nhật: {fmtDateTime(updatedAt)}</div>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          onPointerDown={() => setHasInteractedWithProgress(true)}
          onChange={(e) => {
            setHasInteractedWithProgress(true);
            setPercent(Number(e.target.value));
          }}
          disabled={!canUpdate || saving || loading}
          style={{ background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${percent}%, #2e3347 ${percent}%, #2e3347 100%)` }}
          className="h-4 w-full cursor-pointer appearance-none rounded-full transition-[background] duration-300 ease-out accent-amber-500 disabled:cursor-not-allowed disabled:opacity-60 [&::-moz-range-thumb]:h-8 [&::-moz-range-thumb]:w-8 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-[#11131b] [&::-moz-range-thumb]:bg-amber-500 [&::-moz-range-thumb]:shadow-lg [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-[#11131b] [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:shadow-lg"
        />

        {showUpdateFields ? (
          <div className="space-y-3 overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 transition-all duration-300 ease-out">
            <div className={`grid gap-2 ${isRollback ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
              <div>
                <div className="mb-1 text-xs text-[#8891aa]">Ảnh minh chứng (bắt buộc)</div>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!canUpdate || saving || uploading}
                  onChange={async (e) => {
                    await uploadPhotos(Array.from(e.target.files || []));
                    e.currentTarget.value = "";
                  }}
                  className="block w-full text-xs"
                />
                <div className="mt-1 text-[11px] text-amber-300/80">
                  Bắt buộc chụp trực tiếp tại hiện trường. Ảnh cũ &gt; 30 phút hoặc ảnh đã upload trước đó sẽ bị từ chối.
                </div>
                {photoUploader.items.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-[#c8d0e8]">Ảnh tiến độ ({photoUploader.items.length})</div>
                      {uploadedPhotos.length > 0 ? (
                        <Button
                          variant="outline"
                          className="h-8 border-[#2e3347] bg-[#1a1d27] px-2 text-xs"
                          onClick={() => setPhotoAlbum({ title: "Ảnh tiến độ đã upload", photos: uploadedPhotos, index: 0 })}
                        >
                          Xem album
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {photoUploader.items.map((item) => {
                        const isDone = item.status === "done" && item.photo;
                        const isError = item.status === "error";
                        const isLoading = item.status === "queued" || item.status === "uploading";
                        const isErrorExpanded = expandedErrors.has(item.id);
                        const doneIndex = isDone ? uploadedPhotos.findIndex((p) => p.photoUrl === item.photo?.photoUrl) : -1;
                        return (
                          <div key={item.id} className="rounded-xl border border-[#2e3347] bg-[#1a1d27] p-2">
                            <div className="relative h-20 w-full overflow-hidden rounded-lg bg-[#11131b]">
                              {isDone && item.photo ? (
                                <button
                                  type="button"
                                  onClick={() => setPhotoAlbum({ title: "Ảnh tiến độ đã upload", photos: uploadedPhotos, index: doneIndex >= 0 ? doneIndex : 0 })}
                                  className="block h-full w-full"
                                >
                                  <TaskPhotoImage src={item.photo.thumbnailUrl || item.photo.photoUrl} alt="Ảnh tiến độ" className="h-full w-full object-cover" />
                                </button>
                              ) : isError ? (
                                <div className="flex h-full w-full items-center justify-center bg-rose-500/10">
                                  <button
                                    type="button"
                                    onClick={() => toggleErrorDetail(item.id)}
                                    title={isErrorExpanded ? "Ẩn chi tiết lỗi" : "Xem chi tiết lỗi"}
                                    aria-label="Xem chi tiết lỗi"
                                    className="flex h-9 w-9 items-center justify-center rounded-full border border-rose-500/50 bg-rose-500/20 text-lg font-bold text-rose-300"
                                  >
                                    !
                                  </button>
                                </div>
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[11px] text-[#8891aa]">
                                  <div className="text-center">
                                    <div className="mx-auto h-5 w-5 animate-spin rounded-full border-2 border-amber-500/40 border-t-amber-500" />
                                    <div className="mt-1">{item.status === "queued" ? "Chờ tải" : "Đang tải"}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="mt-1 truncate text-[11px] text-[#c8d0e8]">{item.name}</div>
                            {isError && isErrorExpanded && item.message ? (
                              <div className="mt-1 text-[11px] text-rose-300">{item.message}</div>
                            ) : null}
                            <div className="mt-2">
                              <Button
                                variant="outline"
                                className="h-7 w-full border-red-500/40 bg-red-500/10 px-2 text-[11px] text-red-200"
                                disabled={deletingItemId === item.id || isLoading || saving}
                                onClick={() => removeUploadItem(item)}
                              >
                                {deletingItemId === item.id ? "Đang xóa..." : "Xóa"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : uploading ? (
                  <div className="mt-2 text-xs text-[#8891aa]">Đang tải ảnh...</div>
                ) : null}
              </div>

              {isRollback ? (
                <div>
                  <div className="mb-1 text-xs text-[#8891aa]">Lý do khi giảm tiến độ *</div>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={!canUpdate || saving}
                    placeholder="Nhập lý do"
                    className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-sm transition-colors duration-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              ) : null}
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={!canUpdate || saving}
              rows={2}
              placeholder="Ghi chú cập nhật tiến độ"
              className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-sm transition-colors duration-200 focus:border-amber-500 focus:outline-none"
            />

            <div className="flex items-center justify-between">
              <div className="text-xs text-[#8891aa]">
                {isRollback ? "Đang giảm tiến độ, bắt buộc lý do." : "Mỗi lần cập nhật đều phải có ảnh."}
              </div>
              <Button
                onClick={saveProgress}
                disabled={!canSave || saving || loading}
                className="bg-amber-500 text-[#0f1117] transition-colors duration-200 hover:bg-amber-600"
              >
                {saving ? "Đang lưu..." : "Lưu tiến độ"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-auto shrink-0 pt-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử tiến độ</div>
            <div className="mt-0.5 text-xs text-[#8891aa]">Hiển thị 3 nhật ký gần nhất</div>
          </div>
          {history.length > 3 ? (
            <Button variant="outline" className="h-8 border-[#2e3347] bg-[#1a1d27] px-3 text-xs" onClick={() => setShowHistoryModal(true)}>
              Xem thêm
            </Button>
          ) : null}
        </div>
        {loading ? <div className="text-sm text-[#8891aa]">Đang tải...</div> : null}
        {!loading && history.length === 0 ? <div className="text-sm text-[#8891aa]">Chưa có lịch sử cập nhật</div> : null}
        <div className="space-y-2 border-l border-[#2e3347] pl-4">
          {history.slice(0, 3).map((row) => renderHistoryRow(row, true))}
        </div>
      </div>

      {showHistoryModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-3" onClick={() => setShowHistoryModal(false)}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-[#2e3347] bg-[#11131b] p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#f0f2f8]">Toàn bộ lịch sử tiến độ</div>
                <div className="text-xs text-[#8891aa]">{history.length} nhật ký</div>
              </div>
              <button type="button" className="rounded-full border border-[#2e3347] bg-[#1a1d27] px-3 py-1 text-xs text-[#c8d0e8]" onClick={() => setShowHistoryModal(false)}>
                Đóng
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {history.length === 0 ? <div className="text-sm text-[#8891aa]">Chưa có lịch sử cập nhật</div> : null}
              <div className="space-y-3 border-l border-[#2e3347] pl-4">
                {history.map((row) => renderHistoryRow(row))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <TaskPhotoAlbumViewer album={photoAlbum} onChange={setPhotoAlbum} onClose={() => setPhotoAlbum(null)} />
    </div>
  );
}
