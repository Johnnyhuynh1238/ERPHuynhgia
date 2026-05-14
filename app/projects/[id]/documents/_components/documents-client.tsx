"use client";

import { useRef, useState } from "react";
import { ProjectDocumentCategory, UserRole } from "@prisma/client";
import { toast } from "sonner";

const CATEGORY_LABEL: Record<ProjectDocumentCategory, string> = {
  contract: "Hợp đồng",
  estimate: "Báo giá / Dự toán",
  drawing: "Bản vẽ",
  legal: "Pháp lý",
  other: "Khác",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  engineer: "Kỹ sư",
  foreman: "Tổ trưởng",
  accountant: "Kế toán",
  construction_manager: "GĐ Thi công",
};

export type DocumentDto = {
  id: string;
  title: string;
  category: ProjectDocumentCategory;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploader: { id: string; fullName: string };
  uploadedAt: string;
  viewUrl: string;
  grantedUsers?: Array<{ id: string; fullName: string; role: string }>;
};

type UserOption = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function DocumentsClient({
  projectId,
  isAdmin,
  initialDocuments,
  userOptions,
}: {
  projectId: string;
  isAdmin: boolean;
  initialDocuments: DocumentDto[];
  userOptions: UserOption[];
}) {
  const [documents, setDocuments] = useState<DocumentDto[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<ProjectDocumentCategory>(ProjectDocumentCategory.contract);
  const [uploadTitle, setUploadTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accessDialog, setAccessDialog] = useState<{ doc: DocumentDto; selected: Set<string> } | null>(null);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessSearch, setAccessSearch] = useState("");

  async function refreshList() {
    const res = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { documents: DocumentDto[] };
    setDocuments(data.documents);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      toast.error("Chọn 1 file để upload");
      return;
    }
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", uploadCategory);
    if (uploadTitle.trim()) fd.append("title", uploadTitle.trim());
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { document?: DocumentDto; message?: string };
      if (!res.ok || !data.document) {
        toast.error(data.message || "Upload thất bại");
        return;
      }
      toast.success(data.message || "Đã upload");
      setDocuments((prev) => [data.document!, ...prev]);
      setUploadTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: DocumentDto) {
    if (!confirm(`Xóa hồ sơ "${doc.title}"? Hành động không thể hoàn tác.`)) return;
    const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}`, { method: "DELETE" });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      toast.error(data.message || "Xóa thất bại");
      return;
    }
    toast.success(data.message || "Đã xóa hồ sơ");
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  }

  function openAccessDialog(doc: DocumentDto) {
    const selected = new Set((doc.grantedUsers || []).map((u) => u.id));
    setAccessDialog({ doc, selected });
    setAccessSearch("");
  }

  async function saveAccess() {
    if (!accessDialog) return;
    setSavingAccess(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents/${accessDialog.doc.id}/access`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(accessDialog.selected) }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        toast.error(data.message || "Lưu phân quyền thất bại");
        return;
      }
      toast.success(data.message || "Đã cập nhật quyền");
      setAccessDialog(null);
      await refreshList();
    } finally {
      setSavingAccess(false);
    }
  }

  const filteredUsers = accessSearch.trim()
    ? userOptions.filter((u) => {
        const q = accessSearch.trim().toLowerCase();
        return u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      })
    : userOptions;

  return (
    <div className="space-y-4">
      {isAdmin ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#f0f2ff]">Upload hồ sơ mới</h3>
          <div className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
            <div>
              <label className="mb-1 block text-xs text-[#8892b0]">Loại</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as ProjectDocumentCategory)}
                className="w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              >
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#8892b0]">Tiêu đề (mặc định = tên file)</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="VD: HĐ thi công nhà chú Anh"
                className="w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
              />
            </div>
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                className="text-xs text-[#8892b0]"
              />
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {uploading ? "Đang upload..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[#f0f2ff]">Hồ sơ dự án ({documents.length})</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-[#8892b0]">Chưa có hồ sơ nào{isAdmin ? "" : " được chia sẻ với bạn"}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#8892b0]">
                  <th className="py-2 pr-2">Tiêu đề</th>
                  <th className="py-2 pr-2">Loại</th>
                  <th className="py-2 pr-2">Người upload</th>
                  <th className="py-2 pr-2">Ngày</th>
                  <th className="py-2 pr-2">Size</th>
                  <th className="py-2 pr-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-[#2d3249] text-[#d1d5e0]">
                    <td className="py-2 pr-2">
                      <div className="font-medium text-[#f0f2ff]">{doc.title}</div>
                      <div className="text-xs text-[#8892b0]">{doc.fileName}</div>
                      {isAdmin && doc.grantedUsers && doc.grantedUsers.length > 0 ? (
                        <div className="mt-1 text-xs text-[#94a3b8]">
                          Được xem bởi: {doc.grantedUsers.map((u) => u.fullName).join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-xs">{CATEGORY_LABEL[doc.category]}</td>
                    <td className="py-2 pr-2 text-xs">{doc.uploader.fullName}</td>
                    <td className="py-2 pr-2 text-xs">{formatDate(doc.uploadedAt)}</td>
                    <td className="py-2 pr-2 text-xs">{formatBytes(doc.fileSize)}</td>
                    <td className="py-2 pr-2 text-right">
                      <div className="flex justify-end gap-2">
                        <a
                          href={doc.viewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-[#2d3249] px-2 py-1 text-xs text-[#fb923c] hover:bg-[#13151f]"
                        >
                          Xem
                        </a>
                        {isAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openAccessDialog(doc)}
                              className="rounded border border-[#2d3249] px-2 py-1 text-xs text-[#7dd3fc] hover:bg-[#13151f]"
                            >
                              Phân quyền
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc)}
                              className="rounded border border-red-700 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30"
                            >
                              Xóa
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {accessDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#2d3249] bg-[#1a1d2e] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-[#f0f2ff]">Phân quyền xem: {accessDialog.doc.title}</h4>
              <button type="button" onClick={() => setAccessDialog(null)} className="text-sm text-[#8892b0] hover:text-[#f0f2ff]">
                Đóng
              </button>
            </div>
            <p className="mb-3 text-xs text-[#8892b0]">
              Mặc định chỉ admin xem được. Tick chọn user dưới đây để cho phép họ xem hồ sơ này.
            </p>
            <input
              type="text"
              value={accessSearch}
              onChange={(e) => setAccessSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc email..."
              className="mb-3 w-full rounded-lg border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm text-[#f0f2ff]"
            />
            <div className="max-h-72 overflow-y-auto rounded-lg border border-[#2d3249] bg-[#13151f]">
              {filteredUsers.length === 0 ? (
                <p className="p-3 text-sm text-[#8892b0]">Không tìm thấy user nào</p>
              ) : (
                filteredUsers.map((u) => {
                  const checked = accessDialog.selected.has(u.id);
                  return (
                    <label key={u.id} className="flex cursor-pointer items-center gap-3 border-b border-[#2d3249] px-3 py-2 last:border-b-0 hover:bg-[#1a1d2e]">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = new Set(accessDialog.selected);
                          if (e.target.checked) next.add(u.id);
                          else next.delete(u.id);
                          setAccessDialog({ ...accessDialog, selected: next });
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
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccessDialog(null)}
                className="rounded-lg border border-[#2d3249] px-3 py-2 text-sm text-[#8892b0] hover:bg-[#13151f]"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveAccess}
                disabled={savingAccess}
                className="rounded-lg bg-[#f97316] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingAccess ? "Đang lưu..." : "Lưu phân quyền"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
