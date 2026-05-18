"use client";

import { useEffect, useState } from "react";

export type TaskPhotoItem = {
  id?: string;
  photoUrl: string;
  thumbnailUrl?: string;
};

export type TaskPhotoAlbumState = {
  title: string;
  photos: TaskPhotoItem[];
  index: number;
};

type UploadStatus = "queued" | "uploading" | "done" | "error";

export type TaskPhotoUploadItem = {
  id: string;
  name: string;
  size: number;
  status: UploadStatus;
  message?: string;
  photo?: TaskPhotoItem;
};

type UploadBatchOptions = {
  taskId: string;
  files: File[];
  queue: TaskPhotoUploadItem[];
  onItemChange?: (item: TaskPhotoUploadItem) => void;
};

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 25 * 1024 * 1024;
const RESIZE_TARGET_BYTES = 850 * 1024;
const RESIZE_DIMENSIONS = [1800, 1600, 1400, 1200, 1000, 800];
const RESIZE_QUALITIES = [0.82, 0.76, 0.7, 0.64, 0.58, 0.52];

function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))}KB`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Upload ảnh thất bại";
}

function validateFile(file: File) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`${file.name}: chỉ nhận ảnh JPG, PNG hoặc WEBP`);
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name}: vượt quá 25MB`);
  }
}

function compressedFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "photo";
  return `${baseName}.jpg`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name}: không đọc được ảnh để nén`));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Không nén được ảnh"));
    }, type, quality);
  });
}

async function resizeImageForUpload(file: File) {
  if (file.size <= RESIZE_TARGET_BYTES) return file;

  const image = await loadImage(file);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    throw new Error(`${file.name}: kích thước ảnh không hợp lệ`);
  }

  let bestBlob: Blob | null = null;
  for (const maxDimension of RESIZE_DIMENSIONS) {
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Trình duyệt không hỗ trợ nén ảnh trước khi upload");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    for (const quality of RESIZE_QUALITIES) {
      const blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob;
      if (blob.size <= RESIZE_TARGET_BYTES) {
        return new File([blob], compressedFileName(file.name), { type: "image/jpeg", lastModified: Date.now() });
      }
    }
  }

  if (!bestBlob) return file;
  return new File([bestBlob], compressedFileName(file.name), { type: "image/jpeg", lastModified: Date.now() });
}

function normalizePhoto(input: Partial<TaskPhotoItem>): TaskPhotoItem | null {
  if (typeof input.photoUrl !== "string" || !input.photoUrl) return null;
  return {
    id: typeof input.id === "string" ? input.id : undefined,
    photoUrl: input.photoUrl,
    thumbnailUrl: typeof input.thumbnailUrl === "string" && input.thumbnailUrl ? input.thumbnailUrl : input.photoUrl,
  };
}

async function readUploadBody(res: Response) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json().catch(() => ({}))) as { message?: string; photos?: Partial<TaskPhotoItem>[] };
  }
  const text = await res.text().catch(() => "");
  return { message: text ? text.slice(0, 180) : undefined, photos: [] };
}

async function uploadTaskPhotoFile(taskId: string, file: File) {
  validateFile(file);
  const originalLastModified = file.lastModified;
  const uploadFile = await resizeImageForUpload(file);
  validateFile(uploadFile);

  const form = new FormData();
  form.append("file", uploadFile);
  if (originalLastModified > 0) {
    form.append("originalLastModified", String(originalLastModified));
  }

  const res = await fetch(`/api/tasks/${taskId}/photos`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  const body = await readUploadBody(res);

  if (!res.ok) {
    throw new Error(body.message || `Upload ${file.name} thất bại (${res.status})`);
  }

  const photo = (body.photos || []).map(normalizePhoto).find(Boolean);
  if (!photo) {
    throw new Error(`Upload ${file.name} xong nhưng không lấy được URL ảnh`);
  }

  return photo;
}

export function createTaskPhotoUploadQueue(files: File[]) {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return files.map((file, index) => ({
    id: `${nonce}_${index}`,
    name: file.name,
    size: file.size,
    status: "queued" as const,
  }));
}

export async function uploadTaskPhotoBatch({ taskId, files, queue, onItemChange }: UploadBatchOptions) {
  const uploaded: TaskPhotoItem[] = [];
  const uploadedItems: Array<{ itemId: string; photo: TaskPhotoItem }> = [];
  const failed: Array<{ file: File; message: string }> = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const item = queue[index];
    if (!file || !item) continue;

    onItemChange?.({ ...item, status: "uploading", message: "Đang nén và tải..." });

    try {
      const photo = await uploadTaskPhotoFile(taskId, file);
      uploaded.push(photo);
      uploadedItems.push({ itemId: item.id, photo });
      onItemChange?.({ ...item, status: "done", message: "Đã tải xong", photo });
    } catch (error) {
      const message = errorMessage(error);
      failed.push({ file, message });
      onItemChange?.({ ...item, status: "error", message });
    }
  }

  return { uploaded, uploadedItems, failed };
}

export function useTaskPhotoUploader(taskId: string) {
  const [items, setItems] = useState<TaskPhotoUploadItem[]>([]);

  async function upload(files: File[]) {
    const selected = files.filter(Boolean);
    if (!selected.length) return { uploaded: [], uploadedItems: [], failed: [] };

    const queue = createTaskPhotoUploadQueue(selected);
    setItems((current) => [...queue, ...current].slice(0, 30));

    return uploadTaskPhotoBatch({
      taskId,
      files: selected,
      queue,
      onItemChange: (nextItem) => {
        setItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
      },
    });
  }

  function clear() {
    setItems([]);
  }

  function remove(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  return { items, upload, clear, remove };
}

export function TaskPhotoUploadStatus({
  items,
  onClear,
  onRemove,
}: {
  items: TaskPhotoUploadItem[];
  onClear?: () => void;
  onRemove?: (item: TaskPhotoUploadItem) => void;
}) {
  if (!items.length) return null;

  const statusText: Record<UploadStatus, string> = {
    queued: "Chờ tải",
    uploading: "Đang tải",
    done: "Xong",
    error: "Lỗi",
  };

  return (
    <div className="mt-2 rounded-xl border border-[#2e3347] bg-[#11131b] p-2 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="font-semibold text-[#c8d0e8]">Trạng thái upload</div>
        {onClear ? (
          <button type="button" onClick={onClear} className="rounded-full border border-[#2e3347] px-2 py-0.5 text-[11px] text-[#8891aa]">
            Dọn danh sách
          </button>
        ) : null}
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border border-[#2e3347] bg-[#1a1d27] p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[#c8d0e8]">{item.name}</div>
              <div className="flex shrink-0 items-center gap-2">
                <div className={item.status === "error" ? "text-rose-300" : item.status === "done" ? "text-emerald-300" : "text-amber-300"}>
                  {statusText[item.status]}
                </div>
                {onRemove ? (
                  <button type="button" onClick={() => onRemove(item)} className="flex h-6 w-6 items-center justify-center rounded-full border border-[#2e3347] text-sm font-bold text-[#8891aa]">
                    ×
                  </button>
                ) : null}
              </div>
            </div>
            <div className="mt-0.5 text-[11px] text-[#8891aa]">{fileSizeLabel(item.size)}</div>
            {item.message ? <div className={item.status === "error" ? "mt-1 text-rose-300" : "mt-1 text-[#8891aa]"}>{item.message}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TaskPhotoImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-[#0f1117] p-3 text-center text-xs text-[#8891aa] ${className || ""}`}>
        <div>
          <div>Không tải được ảnh</div>
          {src ? (
            <a href={src} target="_blank" rel="noreferrer" className="mt-1 inline-block text-amber-300 underline">
              Mở ảnh gốc
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
}

export function TaskPhotoAlbumViewer({
  album,
  onChange,
  onClose,
}: {
  album: TaskPhotoAlbumState | null;
  onChange: (album: TaskPhotoAlbumState | null) => void;
  onClose: () => void;
}) {
  if (!album || !album.photos.length) return null;

  const index = Math.min(Math.max(album.index, 0), album.photos.length - 1);
  const current = album.photos[index];

  function go(nextIndex: number) {
    if (!album) return;
    onChange({ ...album, index: (nextIndex + album.photos.length) % album.photos.length });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3" onClick={onClose}>
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col rounded-2xl border border-[#2e3347] bg-[#11131b] p-3 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-[#f0f2f8]">{album.title}</div>
            <div className="text-xs text-[#8891aa]">
              Ảnh {index + 1}/{album.photos.length}
            </div>
          </div>
          <button type="button" className="rounded-full border border-[#2e3347] bg-[#1a1d27] px-3 py-1 text-xs text-[#c8d0e8]" onClick={onClose}>
            Đóng
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center gap-2">
          {album.photos.length > 1 ? (
            <button type="button" className="rounded-full border border-[#2e3347] bg-[#1a1d27] px-3 py-2 text-lg text-[#c8d0e8]" onClick={() => go(index - 1)}>
              ‹
            </button>
          ) : null}
          <div className="flex h-[72vh] min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-[#2e3347] bg-black">
            <TaskPhotoImage src={current.photoUrl} alt={album.title} className="h-full w-full object-contain" />
          </div>
          {album.photos.length > 1 ? (
            <button type="button" className="rounded-full border border-[#2e3347] bg-[#1a1d27] px-3 py-2 text-lg text-[#c8d0e8]" onClick={() => go(index + 1)}>
              ›
            </button>
          ) : null}
        </div>

        {album.photos.length > 1 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {album.photos.map((photo, photoIndex) => (
              <button
                key={photo.id || photo.photoUrl}
                type="button"
                onClick={() => go(photoIndex)}
                className={`h-16 w-20 shrink-0 overflow-hidden rounded-lg border ${photoIndex === index ? "border-amber-500" : "border-[#2e3347]"}`}
              >
                <TaskPhotoImage src={photo.thumbnailUrl || photo.photoUrl} alt={album.title} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
