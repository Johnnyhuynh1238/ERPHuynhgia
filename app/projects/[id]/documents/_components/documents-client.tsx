"use client";

import { confirmDialog } from "@/components/confirm-dialog";
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
  visibleToCustomer: boolean;
  viewUrl: string;
  grantedUsers?: Array<{ id: string; fullName: string; role: string }>;
};

type UserOption = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
};

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
  const [viewingDoc, setViewingDoc] = useState<DocumentDto | null>(null);

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

  async function toggleCustomerVisibility(doc: DocumentDto) {
    const next = !doc.visibleToCustomer;
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, visibleToCustomer: next } : d)));
    const res = await fetch(`/api/projects/${projectId}/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visibleToCustomer: next }),
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) {
      toast.error(data.message || "Cập nhật thất bại");
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, visibleToCustomer: !next } : d)));
      return;
    }
    toast.success(next ? "Chủ nhà thấy được hồ sơ này" : "Đã ẩn khỏi chủ nhà");
  }

  async function handleDelete(doc: DocumentDto) {
    if (!await confirmDialog(`Xóa hồ sơ "${doc.title}"? Hành động không thể hoàn tác.`)) return;
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#8892b0]">
                  <th className="py-2 pr-2">Tiêu đề</th>
                  <th className="py-2 pr-2">Loại</th>
                  {isAdmin ? <th className="py-2 pr-2">Chủ nhà</th> : null}
                  {isAdmin ? <th className="py-2 pr-2 text-right">Thao tác</th> : null}
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} className="border-t border-[#2d3249] text-[#d1d5e0]">
                    <td className="py-2 pr-2">
                      <button
                        type="button"
                        onClick={() => setViewingDoc(doc)}
                        className="text-left font-medium text-[#fb923c] hover:underline"
                      >
                        {doc.title}
                      </button>
                      <a
                        href={`${doc.viewUrl}?download=1`}
                        download
                        className="ml-3 inline-flex items-center gap-1 text-xs text-[#7dd3fc] hover:underline"
                      >
                        ⤓ Tải về
                      </a>
                      {isAdmin && doc.grantedUsers && doc.grantedUsers.length > 0 ? (
                        <div className="mt-1 text-xs text-[#94a3b8]">
                          Được xem bởi: {doc.grantedUsers.map((u) => u.fullName).join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 text-xs">{CATEGORY_LABEL[doc.category]}</td>
                    {isAdmin ? (
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => toggleCustomerVisibility(doc)}
                          className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs ${
                            doc.visibleToCustomer
                              ? "bg-emerald-900/40 text-emerald-300"
                              : "bg-[#13151f] text-[#8892b0]"
                          }`}
                          title="Bật/tắt cho chủ nhà xem"
                        >
                          <span className={`inline-block h-2 w-2 rounded-full ${doc.visibleToCustomer ? "bg-emerald-400" : "bg-[#4b5563]"}`} />
                          {doc.visibleToCustomer ? "Đang chia sẻ" : "Riêng tư"}
                        </button>
                      </td>
                    ) : null}
                    {isAdmin ? (
                      <td className="py-2 pr-2 text-right">
                        <div className="flex justify-end gap-2">
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
                        </div>
                      </td>
                    ) : null}
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

      {viewingDoc ? (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/80 p-3 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="truncate text-sm font-semibold text-[#f0f2ff]">{viewingDoc.title}</h4>
            <div className="flex flex-none items-center gap-2">
              <a
                href={`${viewingDoc.viewUrl}?download=1`}
                download
                className="rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-1.5 text-xs text-[#7dd3fc] hover:bg-[#13151f]"
              >
                ⤓ Tải về
              </a>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="rounded-lg bg-[#f97316] px-3 py-1.5 text-xs font-medium text-white"
              >
                ✕ Đóng
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[#2d3249] bg-[#0f1119]">
            {viewingDoc.mimeType === "application/pdf" ? (
              <iframe src={viewingDoc.viewUrl} title={viewingDoc.title} className="h-full w-full" />
            ) : viewingDoc.mimeType.startsWith("image/") ? (
              <div className="flex h-full w-full items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewingDoc.viewUrl} alt={viewingDoc.title} className="max-h-full max-w-full object-contain" />
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[#8892b0]">
                <p>Không xem trước được định dạng này ({viewingDoc.fileName}).</p>
                <a
                  href={`${viewingDoc.viewUrl}?download=1`}
                  download
                  className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-medium text-white"
                >
                  ⤓ Tải về để mở
                </a>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
