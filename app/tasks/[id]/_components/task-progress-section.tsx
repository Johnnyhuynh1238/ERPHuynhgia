"use client";

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

function fmtDateTime(input: string | null) {
  if (!input) return "-";
  return new Date(input).toLocaleString("vi-VN");
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
  const [percent, setPercent] = useState(0);
  const [savedPercent, setSavedPercent] = useState(0);
  const [photoUrl, setPhotoUrl] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<ProgressHistory[]>([]);

  const isRollback = percent < savedPercent;

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
      setReason("");
      setNote("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tải được tiến độ");
    } finally {
      setLoading(false);
    }
  }

  async function uploadPhoto(file: File) {
    const form = new FormData();
    form.append("files", file);
    setUploading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/photos`, {
        method: "POST",
        body: form,
      });
      const json = await res.json().catch(() => ({} as { message?: string; photos?: Array<{ photoUrl: string }> }));
      if (!res.ok) {
        throw new Error(json.message || "Upload ảnh thất bại");
      }
      const first = json.photos?.[0]?.photoUrl;
      if (!first) {
        throw new Error("Không lấy được URL ảnh vừa upload");
      }
      setPhotoUrl(first);
      toast.success("Đã tải ảnh tiến độ");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload ảnh thất bại");
    } finally {
      setUploading(false);
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
            <div className="text-lg font-bold text-amber-300">{percent}%</div>
          </div>
          <div className="text-right text-xs text-[#8891aa]">
            <div>Trạng thái: {status || "-"}</div>
            <div>Cập nhật: {fmtDateTime(updatedAt)}</div>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => setPercent(Number(e.target.value))}
          disabled={!canUpdate || saving || loading}
          className="w-full"
        />

        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-[#8891aa]">Ảnh minh chứng (bắt buộc)</div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={!canUpdate || saving || uploading}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  await uploadPhoto(file);
                }
                e.currentTarget.value = "";
              }}
              className="block w-full text-xs"
            />
            {photoUrl ? (
              <a href={photoUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-amber-300 underline">
                Xem ảnh đã chọn
              </a>
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-xs text-[#8891aa]">Lý do khi giảm tiến độ {isRollback ? "*" : "(không bắt buộc)"}</div>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!canUpdate || saving}
              placeholder="Nhập lý do"
              className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canUpdate || saving}
          rows={2}
          placeholder="Ghi chú cập nhật tiến độ"
          className="w-full rounded-xl border border-[#2e3347] bg-[#222637] px-3 py-2 text-sm"
        />

        <div className="flex items-center justify-between">
          <div className="text-xs text-[#8891aa]">
            {isRollback ? "Đang giảm tiến độ, bắt buộc lý do." : "Mỗi lần cập nhật đều phải có ảnh."}
          </div>
          <Button
            onClick={saveProgress}
            disabled={!canSave || saving || loading}
            className="bg-amber-500 text-[#0f1117] hover:bg-amber-600"
          >
            {saving ? "Đang lưu..." : "Lưu tiến độ"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-[#2e3347] bg-[#1a1d27] p-4">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[#8891aa]">Lịch sử tiến độ</div>
        {loading ? <div className="text-sm text-[#8891aa]">Đang tải...</div> : null}
        {!loading && history.length === 0 ? <div className="text-sm text-[#8891aa]">Chưa có lịch sử cập nhật</div> : null}
        <div className="space-y-2">
          {history.map((row) => (
            <div key={row.id} className="rounded-xl border border-[#2e3347] bg-[#222637] p-3 text-sm">
              <div className="font-semibold text-[#f0f2f8]">
                {row.fromPercent}% → {row.toPercent}%
              </div>
              <div className="text-xs text-[#8891aa]">{fmtDateTime(row.createdAt)} · {row.user.fullName}</div>
              {row.reason ? <div className="mt-1 text-xs text-rose-300">Lý do: {row.reason}</div> : null}
              {row.note ? <div className="mt-1 text-xs text-[#c8d0e8]">Ghi chú: {row.note}</div> : null}
              <a href={row.photoUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-amber-300 underline">Xem ảnh minh chứng</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
