"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserRole } from "@prisma/client";
import { toast } from "sonner";

type DesignPhotoDto = {
  id: string;
  caption: string | null;
  displayOrder: number;
  uploadedAt: string;
  photoUrl: string;
  thumbnailUrl: string;
};

export type DesignGroupDto = {
  id: string;
  title: string;
  description: string | null;
  visibleToCustomer: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; fullName: string } | null;
  grantedUsers: Array<{ id: string; fullName: string; role: string }>;
  photos: DesignPhotoDto[];
  photoCount: number;
};

type UserOption = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  engineer: "Kỹ sư",
  foreman: "Tổ trưởng",
  accountant: "Kế toán",
  construction_manager: "GĐ Thi công",
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function DesignPhotosClient({
  projectId,
  isAdmin,
  initialGroups,
  userOptions,
}: {
  projectId: string;
  isAdmin: boolean;
  initialGroups: DesignGroupDto[];
  userOptions: UserOption[];
}) {
  const [groups, setGroups] = useState<DesignGroupDto[]>(initialGroups);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<DesignGroupDto | null>(null);
  const [lightbox, setLightbox] = useState<{ groupId: string; index: number } | null>(null);

  async function refresh() {
    const res = await fetch(`/api/projects/${projectId}/design-groups`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { groups: DesignGroupDto[] };
    setGroups(data.groups);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[#f0f2ff]">Ảnh thiết kế</h3>
          <p className="text-xs text-[#8892b0]">Nhóm theo phòng/khu vực để chủ nhà xem trên trang Tổng quan.</p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-[#f97316] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#fb923c]"
          >
            + Tạo nhóm ảnh
          </button>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2d3249] bg-[#13151f] p-6 text-center text-sm text-[#8892b0]">
          Chưa có nhóm ảnh thiết kế nào{isAdmin ? "" : " được chia sẻ với bạn"}.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isAdmin={isAdmin}
              onOpenLightbox={(index) => setLightbox({ groupId: group.id, index })}
              onEdit={() => setEditing(group)}
              onChanged={refresh}
              projectId={projectId}
            />
          ))}
        </div>
      )}

      {createOpen ? (
        <GroupFormDialog
          projectId={projectId}
          userOptions={userOptions}
          initialValues={null}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            setCreateOpen(false);
            await refresh();
          }}
        />
      ) : null}

      {editing ? (
        <GroupFormDialog
          projectId={projectId}
          userOptions={userOptions}
          initialValues={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      ) : null}

      {lightbox ? (
        <Lightbox
          group={groups.find((g) => g.id === lightbox.groupId)!}
          startIndex={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

function GroupCard({
  group,
  isAdmin,
  projectId,
  onOpenLightbox,
  onEdit,
  onChanged,
}: {
  group: DesignGroupDto;
  isAdmin: boolean;
  projectId: string;
  onOpenLightbox: (index: number) => void;
  onEdit: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleUpload() {
    const files = Array.from(fileRef.current?.files || []);
    if (files.length === 0) {
      toast.error("Chọn ít nhất 1 ảnh để upload");
      return;
    }
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let successCount = 0;
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const fd = new FormData();
        fd.append("files", file);
        const res = await fetch(`/api/projects/${projectId}/design-groups/${group.id}/photos`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          const detail = data.message || (res.status === 413 ? `File "${file.name}" quá lớn so với giới hạn proxy (25MB)` : `Upload thất bại (HTTP ${res.status})`);
          toast.error(`${file.name}: ${detail}`);
          break;
        }
        successCount += 1;
        setProgress({ done: i + 1, total: files.length });
      }
      if (successCount > 0) {
        toast.success(`Đã upload ${successCount}/${files.length} ảnh`);
        if (fileRef.current) fileRef.current.value = "";
        await onChanged();
      }
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function handleDeletePhoto(photoId: string) {
    if (!confirm("Xoá ảnh này?")) return;
    const res = await fetch(`/api/projects/${projectId}/design-groups/${group.id}/photos/${photoId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Xoá ảnh thất bại");
      return;
    }
    toast.success("Đã xoá ảnh");
    await onChanged();
  }

  async function handleDeleteGroup() {
    if (!confirm(`Xoá nhóm "${group.title}" và toàn bộ ảnh trong nhóm?`)) return;
    const res = await fetch(`/api/projects/${projectId}/design-groups/${group.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Xoá nhóm thất bại");
      return;
    }
    toast.success("Đã xoá nhóm");
    await onChanged();
  }

  async function toggleCustomerVisibility() {
    const next = !group.visibleToCustomer;
    const res = await fetch(`/api/projects/${projectId}/design-groups/${group.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibleToCustomer: next }),
    });
    if (!res.ok) {
      toast.error("Cập nhật thất bại");
      return;
    }
    toast.success(next ? "Chủ nhà sẽ thấy nhóm này" : "Đã ẩn khỏi chủ nhà");
    await onChanged();
  }

  return (
    <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-semibold text-[#f0f2ff]">{group.title}</h4>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                group.visibleToCustomer ? "bg-emerald-900/40 text-emerald-300" : "bg-[#13151f] text-[#8892b0]"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${group.visibleToCustomer ? "bg-emerald-400" : "bg-[#4b5563]"}`} />
              {group.visibleToCustomer ? "Chủ nhà thấy" : "Riêng tư"}
            </span>
            {group.grantedUsers.length > 0 ? (
              <span className="rounded-full bg-[#13151f] px-2 py-0.5 text-[11px] text-[#94a3b8]">
                {group.grantedUsers.length} nhân sự xem
              </span>
            ) : null}
          </div>
          {group.description ? <p className="mt-1 text-xs text-[#94a3b8]">{group.description}</p> : null}
          <div className="mt-1 text-[11px] text-[#64748b]">
            {group.photoCount} ảnh · Tạo {formatDate(group.createdAt)}
            {group.creator ? ` · ${group.creator.fullName}` : ""}
          </div>
        </div>
        {isAdmin ? (
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
            <button
              type="button"
              onClick={toggleCustomerVisibility}
              className="rounded-md border border-[#2d3249] px-2 py-1 text-[#7dd3fc] transition hover:bg-[#13151f]"
            >
              {group.visibleToCustomer ? "Ẩn chủ nhà" : "Cho chủ nhà"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md border border-[#2d3249] px-2 py-1 text-[#fb923c] transition hover:bg-[#13151f]"
            >
              Sửa nhóm
            </button>
            <button
              type="button"
              onClick={handleDeleteGroup}
              className="rounded-md border border-red-700 px-2 py-1 text-red-300 transition hover:bg-red-900/30"
            >
              Xoá nhóm
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {group.photos.length === 0 ? (
          <div className="col-span-full rounded-lg border border-dashed border-[#2d3249] bg-[#13151f] p-4 text-center text-xs text-[#8892b0]">
            Chưa có ảnh nào trong nhóm này.
          </div>
        ) : (
          group.photos.map((photo, index) => (
            <div key={photo.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpenLightbox(index)}
                className="block aspect-square w-full overflow-hidden rounded-lg bg-[#13151f] transition hover:opacity-90"
              >
                <img
                  src={photo.thumbnailUrl}
                  alt={photo.caption || group.title}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => handleDeletePhoto(photo.id)}
                  title="Xoá ảnh"
                  className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-red-300 transition hover:bg-red-900/80 group-hover:flex"
                >
                  ×
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      {isAdmin ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[#2d3249] bg-[#13151f] px-3 py-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="text-xs text-[#8892b0] file:mr-2 file:rounded-md file:border-0 file:bg-[#1a1d2e] file:px-2 file:py-1 file:text-xs file:text-[#fb923c]"
          />
          <button
            type="button"
            disabled={uploading}
            onClick={handleUpload}
            className="ml-auto rounded-md bg-[#f97316] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {uploading ? (progress ? `Đang upload ${progress.done}/${progress.total}...` : "Đang upload...") : "Upload ảnh"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function GroupFormDialog({
  projectId,
  userOptions,
  initialValues,
  onClose,
  onSaved,
}: {
  projectId: string;
  userOptions: UserOption[];
  initialValues: DesignGroupDto | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = !!initialValues;
  const [title, setTitle] = useState(initialValues?.title || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [visibleToCustomer, setVisibleToCustomer] = useState(initialValues?.visibleToCustomer || false);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(
    () => new Set((initialValues?.grantedUsers || []).map((u) => u.id)),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return userOptions;
    return userOptions.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [search, userOptions]);

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Nhập tiêu đề nhóm ảnh");
      return;
    }
    setSaving(true);
    try {
      const viewerIds = Array.from(selectedUsers);
      if (isEdit && initialValues) {
        const res = await fetch(`/api/projects/${projectId}/design-groups/${initialValues.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: title.trim(), description: description.trim() || null, visibleToCustomer }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          toast.error(data.message || "Lưu thất bại");
          return;
        }
        const accessRes = await fetch(`/api/projects/${projectId}/design-groups/${initialValues.id}/access`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userIds: viewerIds }),
        });
        if (!accessRes.ok) {
          const data = (await accessRes.json().catch(() => ({}))) as { message?: string };
          toast.error(data.message || "Lưu phân quyền thất bại");
          return;
        }
        toast.success("Đã cập nhật nhóm ảnh");
      } else {
        const res = await fetch(`/api/projects/${projectId}/design-groups`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            visibleToCustomer,
            viewerIds,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string };
          toast.error(data.message || "Tạo nhóm thất bại");
          return;
        }
        toast.success("Đã tạo nhóm ảnh");
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
      <div className="modal-panel-in w-full max-w-2xl rounded-t-2xl border border-[#2d3249] bg-[#1a1d2e] p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-base font-semibold text-[#f0f2ff]">{isEdit ? "Sửa nhóm ảnh" : "Tạo nhóm ảnh thiết kế"}</h4>
          <button type="button" onClick={onClose} className="text-sm text-[#8892b0] hover:text-[#f0f2ff]">
            Đóng
          </button>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs text-[#8892b0]">Tiêu đề nhóm *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Phòng khách, Phòng ngủ master..."
              className="w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[#8892b0]">Mô tả (tuỳ chọn)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú ngắn về nhóm ảnh"
              className="w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-[#d1d5e0]">
            <input type="checkbox" checked={visibleToCustomer} onChange={(e) => setVisibleToCustomer(e.target.checked)} />
            Chia sẻ nhóm này cho chủ nhà xem trên Cổng chủ nhà
          </label>
          <div>
            <label className="mb-1 block text-xs text-[#8892b0]">Nhân sự được phép xem trong ERP</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc email..."
              className="mb-2 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border border-[#2d3249] bg-[#13151f]">
              {filteredUsers.length === 0 ? (
                <p className="p-3 text-sm text-[#8892b0]">Không tìm thấy nhân sự nào</p>
              ) : (
                filteredUsers.map((u) => {
                  const checked = selectedUsers.has(u.id);
                  return (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b border-[#2d3249] px-3 py-2 last:border-b-0 hover:bg-[#1a1d2e]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(selectedUsers);
                          if (e.target.checked) next.add(u.id);
                          else next.delete(u.id);
                          setSelectedUsers(next);
                        }}
                      />
                      <div className="flex-1">
                        <div className="text-sm text-[#f0f2ff]">{u.fullName}</div>
                        <div className="text-xs text-[#8892b0]">{u.email} · {ROLE_LABEL[u.role] || u.role}</div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <p className="mt-1 text-[11px] text-[#64748b]">Admin luôn xem được; danh sách trên là nhân sự thường được thêm.</p>
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-[#2d3249] px-3 py-2 text-sm text-[#8892b0] hover:bg-[#13151f]">
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-[#f97316] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : isEdit ? "Lưu" : "Tạo nhóm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Lightbox({
  group,
  startIndex,
  onClose,
}: {
  group: DesignGroupDto;
  startIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const slide = scrollerRef.current?.children.item(index) as HTMLElement | null;
    slide?.scrollIntoView({ block: "nearest", inline: "start" });
  }, [index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, group.photos.length - 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group.photos.length, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <div className="min-w-0 truncate font-semibold">
          {group.title} · {index + 1}/{group.photos.length}
        </div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20">
          Đóng
        </button>
      </div>
      <div
        ref={scrollerRef}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain scroll-smooth"
        onScroll={(e) => {
          const target = e.currentTarget;
          const newIndex = Math.round(target.scrollLeft / target.clientWidth);
          if (newIndex !== index) setIndex(newIndex);
        }}
      >
        {group.photos.map((photo) => (
          <div key={`slide-${photo.id}`} className="flex min-w-full snap-center items-center justify-center px-4 py-4">
            <img
              src={photo.photoUrl}
              alt={photo.caption || group.title}
              className="max-h-full max-w-full rounded-xl object-contain"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-4 text-xs text-neutral-400">
        <button
          type="button"
          onClick={() => setIndex(Math.max(0, index - 1))}
          disabled={index === 0}
          className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30"
        >
          ← Trước
        </button>
        <span>Vuốt ngang hoặc dùng phím ← →</span>
        <button
          type="button"
          onClick={() => setIndex(Math.min(group.photos.length - 1, index + 1))}
          disabled={index === group.photos.length - 1}
          className="rounded-full bg-white/10 px-3 py-1 disabled:opacity-30"
        >
          Sau →
        </button>
      </div>
    </div>
  );
}
