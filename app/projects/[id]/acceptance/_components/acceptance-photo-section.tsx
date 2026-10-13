"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";

export type AcceptancePhotoItem = {
  key: string;
  contentType: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
};

type Props = {
  projectId: string;
  milestoneId: string;
  kind: "bien_ban" | "site" | "mau";
  title: string;
  photos: AcceptancePhotoItem[];
  userId: string;
  canDeleteAll: boolean;
  canUpload?: boolean;
  onChanged: () => void;
};

// Ảnh BB giấy đã ký / ảnh công trình của 1 mốc: xem (mở tab mới), thêm, xoá ảnh mình tải.
export function AcceptancePhotoSection({
  projectId,
  milestoneId,
  kind,
  title,
  photos,
  userId,
  canDeleteAll,
  canUpload = true,
  onChanged,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/projects/${projectId}/acceptance/${milestoneId}/photos`;
  const fileUrl = (p: AcceptancePhotoItem) => `${base}/file?key=${encodeURIComponent(p.key)}`;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const r = await fetch(`${base}?kind=${kind}`, {
        method: "POST",
        body: fd,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message || "Tải lên thất bại");
      toast.success(j.message || "Đã tải lên");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Tải lên thất bại");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(p: AcceptancePhotoItem) {
    if (!window.confirm(`Xoá file "${p.name}"?`)) return;
    const r = await fetch(`${base}?kind=${kind}&key=${encodeURIComponent(p.key)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(j.message || "Không xoá được");
      return;
    }
    toast.success(j.message || "Đã xoá");
    onChanged();
  }

  return (
    <div className="rounded-lg border border-[#2d3249] bg-[#0b0d16] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#cfd4e8]">
          {title} ({photos.length})
        </span>
        {canUpload && (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-xs font-semibold text-[#0b0d16] disabled:opacity-50"
          >
            <ImagePlus className="h-3.5 w-3.5" /> {busy ? "Đang tải…" : "Thêm"}
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={kind === "site" ? "image/*" : "image/*,application/pdf"}
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {photos.length === 0 ? (
        <div className="mt-2 text-center text-[11px] text-[#5d6688]">Chưa có</div>
      ) : (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {photos.map((p) => (
            <div key={p.key} className="relative">
              <a
                href={fileUrl(p)}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-md bg-[#22263a]"
              >
                {p.contentType === "application/pdf" ? (
                  <div className="flex h-16 items-center justify-center break-all px-1 text-center text-[10px] text-[#cfd4e8]">
                    📄 {kind === "mau" ? p.name : "PDF"}
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(p)} alt={p.name} loading="lazy" className="h-16 w-full object-cover" />
                )}
              </a>
              {canUpload && (canDeleteAll || p.uploadedBy === userId) && (
                <button
                  type="button"
                  onClick={() => void remove(p)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-red-300"
                  title="Xoá"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
