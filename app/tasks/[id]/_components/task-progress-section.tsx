"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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

type UploadedPhoto = {
  id: string;
  photoUrl: string;
  thumbnailUrl: string;
};

type PhotoAlbum = {
  title: string;
  photos: string[];
  index: number;
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
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);
  const [savedPercent, setSavedPercent] = useState(0);
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedPhoto[]>([]);
  const [photoAlbum, setPhotoAlbum] = useState<PhotoAlbum | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<ProgressHistory[]>([]);
  const [hasInteractedWithProgress, setHasInteractedWithProgress] = useState(false);

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
      setPhotoUrl("");
      setUploadedPhotos([]);
      setPhotoAlbum(null);
      setReason("");
      setNote("");
      setHasInteractedWithProgress(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được tiến độ");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPhotoFile(file: File) {
    const form = new FormData();
    form.append("files", file);
    const res = await fetch(`/api/tasks/${taskId}/photos`, {
      method: "POST",
      body: form,
    });
    const contentType = res.headers.get("content-type") || "";
    const json = contentType.includes("application/json")
      ? ((await res.json().catch(() => ({}))) as { message?: string; photos?: UploadedPhoto[] })
      : ({} as { message?: string; photos?: UploadedPhoto[] });
    const text = contentType.includes("application/json") ? "" : await res.text().catch(() => "");
    if (!res.ok) {
      throw new Error(json.message || `Upload ${file.name} thất bại (${res.status})${text ? `: ${text.slice(0, 120)}` : ""}`);
    }
    const photo = (json.photos || []).find((item) => item.photoUrl);
    if (!photo) {
      throw new Error(`Không lấy được URL ảnh ${file.name}`);
    }
    return photo;
  }

  async function uploadPhotos(files: File[]) {
    if (!files.length) return;
    const uploaded: UploadedPhoto[] = [];
    setUploading(true);
    try {
      for (const file of files) {
        uploaded.push(await uploadPhotoFile(file));
      }
      setUploadedPhotos((prev) => [...prev, ...uploaded]);
      setPhotoUrl((current) => current || uploaded[0]?.photoUrl || "");
      toast.success(`Đã tải ${uploaded.length} ảnh tiến độ`);
    } catch (error) {
      if (uploaded.length) {
        setUploadedPhotos((prev) => [...prev, ...uploaded]);
        setPhotoUrl((current) => current || uploaded[0]?.photoUrl || "");
      }
      toast.error(error instanceof Error ? error.message : "Upload ảnh thất bại");
    } finally {
      setUploading(false);
    }
  }

  async function deleteUploadedPhoto(photo: UploadedPhoto) {
    setDeletingPhotoId(photo.id);
    try {
      const res = await fetch(`/api/tasks/${taskId}/photos/${photo.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({} as { message?: string }));
      if (!res.ok) {
        throw new Error(json.message || "Xóa ảnh thất bại");
      }
      setUploadedPhotos((prev) => {
        const next = prev.filter((item) => item.id !== photo.id);
        if (photoUrl === photo.photoUrl) {
          setPhotoUrl(next[0]?.photoUrl || "");
        }
        return next;
      });
      setPhotoAlbum((current) => {
        if (!current) return current;
        const nextPhotos = current.photos.filter((url) => url !== photo.photoUrl);
        if (!nextPhotos.length) return null;
        return { ...current, photos: nextPhotos, index: Math.min(current.index, nextPhotos.length - 1) };
      });
      toast.success(json.message || "Đã xóa ảnh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Xóa ảnh thất bại");
    } finally {
      setDeletingPhotoId(null);
    }
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

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4 space-y-3">
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
                {uploading ? <div className="mt-1 text-xs text-[#8891aa]">Đang tải ảnh...</div> : null}
                {uploadedPhotos.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-semibold text-[#c8d0e8]">Ảnh đã upload ({uploadedPhotos.length})</div>
                      <Button
                        variant="outline"
                        className="h-8 border-[#2e3347] bg-[#1a1d27] px-2 text-xs"
                        onClick={() => setPhotoAlbum({ title: "Ảnh tiến độ đã upload", photos: uploadedPhotos.map((photo) => photo.photoUrl), index: 0 })}
                      >
                        Xem album
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {uploadedPhotos.map((photo, index) => (
                        <div key={photo.id} className={`rounded-xl border p-2 ${photoUrl === photo.photoUrl ? "border-amber-500 bg-amber-500/10" : "border-[#2e3347] bg-[#1a1d27]"}`}>
                          <button
                            type="button"
                            onClick={() => setPhotoAlbum({ title: "Ảnh tiến độ đã upload", photos: uploadedPhotos.map((item) => item.photoUrl), index })}
                            className="relative block h-20 w-full overflow-hidden rounded-lg bg-[#11131b]"
                          >
                            <Image src={photo.thumbnailUrl || photo.photoUrl} alt="Ảnh tiến độ" fill sizes="160px" className="object-cover" unoptimized />
                          </button>
                          <div className="mt-2 flex items-center gap-1">
                            <Button
                              variant="outline"
                              className="h-7 flex-1 border-[#2e3347] bg-[#222637] px-2 text-[11px]"
                              onClick={() => setPhotoUrl(photo.photoUrl)}
                            >
                              {photoUrl === photo.photoUrl ? "Đang chọn" : "Chọn"}
                            </Button>
                            <Button
                              variant="outline"
                              className="h-7 border-red-500/40 bg-red-500/10 px-2 text-[11px] text-red-200"
                              disabled={deletingPhotoId === photo.id || saving}
                              onClick={() => deleteUploadedPhoto(photo)}
                            >
                              Xóa
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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

      <div className="space-y-2 pl-1">
        <div className="text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử tiến độ</div>
        {loading ? <div className="text-sm text-[#8891aa]">Đang tải...</div> : null}
        {!loading && history.length === 0 ? <div className="text-sm text-[#8891aa]">Chưa có lịch sử cập nhật</div> : null}
        <div className="space-y-3 border-l border-[#2e3347] pl-4">
          {history.slice(0, 3).map((row) => (
            <div key={row.id} className="relative text-sm">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.12)]" />
              <div className="font-semibold text-[#f0f2f8]">
                {row.fromPercent}% → {row.toPercent}%
              </div>
              <div className="text-xs text-[#8891aa]">
                {fmtDateTime(row.createdAt)} · {row.user.fullName}
              </div>
              {row.reason ? <div className="mt-1 text-xs text-rose-300">Lý do: {row.reason}</div> : null}
              {row.note ? <div className="mt-1 text-xs text-[#c8d0e8]">Ghi chú: {row.note}</div> : null}
              <button
                type="button"
                onClick={() => setPhotoAlbum({ title: `Ảnh minh chứng ${row.fromPercent}% → ${row.toPercent}%`, photos: [row.photoUrl], index: 0 })}
                className="mt-1 inline-block text-xs text-amber-300 underline"
              >
                Xem ảnh minh chứng
              </button>
            </div>
          ))}
        </div>
      </div>

      {photoAlbum ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" onClick={() => setPhotoAlbum(null)}>
          <div className="w-full max-w-5xl rounded-2xl border border-[#2e3347] bg-[#11131b] p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-[#f0f2f8]">{photoAlbum.title}</div>
                <div className="text-xs text-[#8891aa]">Ảnh {photoAlbum.index + 1}/{photoAlbum.photos.length}</div>
              </div>
              <Button variant="outline" className="border-[#2e3347] bg-[#1a1d27]" onClick={() => setPhotoAlbum(null)}>
                Đóng
              </Button>
            </div>
            <div className="flex items-center gap-2">
              {photoAlbum.photos.length > 1 ? (
                <Button
                  variant="outline"
                  className="border-[#2e3347] bg-[#1a1d27]"
                  onClick={() => setPhotoAlbum((current) => (current ? { ...current, index: (current.index - 1 + current.photos.length) % current.photos.length } : current))}
                >
                  Trước
                </Button>
              ) : null}
              <div className="relative h-[70vh] min-h-[280px] flex-1 overflow-hidden rounded-xl bg-black">
                <Image src={photoAlbum.photos[photoAlbum.index]} alt={photoAlbum.title} fill sizes="90vw" className="object-contain" unoptimized />
              </div>
              {photoAlbum.photos.length > 1 ? (
                <Button
                  variant="outline"
                  className="border-[#2e3347] bg-[#1a1d27]"
                  onClick={() => setPhotoAlbum((current) => (current ? { ...current, index: (current.index + 1) % current.photos.length } : current))}
                >
                  Sau
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
