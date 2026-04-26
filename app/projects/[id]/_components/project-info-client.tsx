"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ProjectData = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  customerPhone: string;
  customerIdNumber?: string | null;
  customerPortalToken?: string | null;
  customerPortalEnabled?: boolean;
  address: string;
  areaM2: number;
  unitPrice: number | null;
  contractValue: number | null;
  startDate: string;
  expectedEndDate: string;
  actualEndDate: string | null;
  goLiveDate: string | null;
  status: "planning" | "in_progress" | "completed" | "paused";
  notes: string | null;
  projectManager: { id: string; fullName: string; email: string };
  mainEngineer: { id: string; fullName: string; email: string };
};

type SiteRestData = {
  id: string;
  restDate: string;
  reason: "SUNDAY" | "HOLIDAY" | "STORM" | "OTHER";
  note: string | null;
  createdAt: string;
  declaredByUser: {
    id: string;
    fullName: string;
  };
};

type OptionUser = { id: string; fullName: string; email: string };

function formatDate(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatMoney(v: number) {
  return `${Math.round(v).toLocaleString("vi-VN")} đ`;
}

function reasonLabel(reason: SiteRestData["reason"]) {
  if (reason === "SUNDAY") return "Nghỉ Chủ nhật";
  if (reason === "HOLIDAY") return "Nghỉ lễ";
  if (reason === "STORM") return "Mưa bão";
  return "Khác";
}

export function ProjectInfoClient({
  project,
  isAdmin,
  isConstructionManager,
  canViewFinancial,
  currentUserRole,
  currentUserId,
  admins,
  engineers,
  todaySiteRest,
}: {
  project: ProjectData;
  isAdmin: boolean;
  isConstructionManager: boolean;
  canViewFinancial: boolean;
  currentUserRole: string;
  currentUserId: string;
  admins: OptionUser[];
  engineers: OptionUser[];
  todaySiteRest: SiteRestData | null;
}) {
  const [data, setData] = useState(project);
  const [todayRest, setTodayRest] = useState(todaySiteRest);

  const [showOwnerEdit, setShowOwnerEdit] = useState(false);
  const [showProjectEdit, setShowProjectEdit] = useState(false);
  const [showAssignmentEdit, setShowAssignmentEdit] = useState(false);
  const [showGoLiveEdit, setShowGoLiveEdit] = useState(false);
  const [showSiteRestModal, setShowSiteRestModal] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");

  const [ownerForm, setOwnerForm] = useState({
    customerName: project.customerName,
    customerPhone: project.customerPhone,
    customerIdNumber: project.customerIdNumber || "",
    address: project.address,
  });

  const [projectForm, setProjectForm] = useState({
    name: project.name,
    areaM2: String(project.areaM2),
    unitPrice: String(project.unitPrice ?? ""),
    startDate: project.startDate.slice(0, 10),
    actualEndDate: project.actualEndDate ? project.actualEndDate.slice(0, 10) : "",
    status: project.status,
    notes: project.notes || "",
  });

  const [assignmentForm, setAssignmentForm] = useState({
    projectManagerId: project.projectManager.id,
    mainEngineerId: project.mainEngineer.id,
  });

  const [goLiveDateInput, setGoLiveDateInput] = useState(project.goLiveDate ? project.goLiveDate.slice(0, 10) : "");
  const [siteRestForm, setSiteRestForm] = useState({
    reason: "SUNDAY" as SiteRestData["reason"],
    note: "",
  });

  const canManageSiteStatus = isAdmin || isConstructionManager;
  const canManageCustomerPortal = isAdmin || isConstructionManager;
  const canViewCommentInbox = ["admin", "construction_manager", "engineer"].includes(currentUserRole);
  const [commentItems, setCommentItems] = useState<Array<{
    id: string;
    content: string;
    createdAt: string;
    readByStaff: boolean;
    task: { id: string; code: string; name: string } | null;
    eveningReport: { id: string; reportDate: string } | null;
    replies: Array<{ id: string; content: string; createdAt: string; author: { id: string; fullName: string } }>;
  }>>([]);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  async function reloadProject() {
    const [projectRes, restRes] = await Promise.all([
      fetch(`/api/projects/${data.id}`, { cache: "no-store" }),
      fetch(`/api/projects/${data.id}/site-rest-today`, { cache: "no-store" }),
    ]);

    const projectJson = await projectRes.json().catch(() => ({}));
    if (projectRes.ok && projectJson.project) {
      setData(projectJson.project);
      setGoLiveDateInput(projectJson.project.goLiveDate ? projectJson.project.goLiveDate.slice(0, 10) : "");
    }

    const restJson = await restRes.json().catch(() => ({}));
    if (restRes.ok) {
      setTodayRest(restJson.siteRestDay || null);
    }
  }

  async function submitOwner() {
    const res = await fetch(`/api/projects/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "owner", payload: ownerForm }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.message || "Cập nhật thất bại");
      return;
    }
    toast.success(json.message || "Đã cập nhật");
    setShowOwnerEdit(false);
    await reloadProject();
  }

  async function submitProject() {
    if (projectForm.startDate !== data.startDate.slice(0, 10)) {
      const ok = window.confirm(
        "Việc đổi ngày khởi công sẽ tự cập nhật lại ngày dự kiến của 69 công tác và 6 đợt thanh toán. Các ngày THỰC TẾ đã nhập không bị ảnh hưởng.",
      );
      if (!ok) return;
    }

    const payload = {
      name: projectForm.name,
      areaM2: Number(projectForm.areaM2),
      unitPrice: Number(projectForm.unitPrice),
      startDate: projectForm.startDate,
      actualEndDate: projectForm.actualEndDate || null,
      status: projectForm.status,
      notes: projectForm.notes || null,
    };

    const res = await fetch(`/api/projects/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "project", payload }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.message || "Cập nhật thất bại");
      return;
    }
    toast.success(json.message || "Đã cập nhật");
    setShowProjectEdit(false);
    await reloadProject();
  }

  async function submitAssignment() {
    const res = await fetch(`/api/projects/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "assignment", payload: assignmentForm }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.message || "Cập nhật thất bại");
      return;
    }
    toast.success(json.message || "Đã cập nhật");
    setShowAssignmentEdit(false);
    await reloadProject();
  }

  async function submitGoLive() {
    const payloadDate = goLiveDateInput || null;
    const res = await fetch(`/api/projects/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "reporting", payload: { goLiveDate: payloadDate } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Cập nhật go-live thất bại");
      return;
    }

    if (payloadDate) {
      toast.success(`Hệ thống báo cáo đã kích hoạt cho dự án này từ ${formatDate(payloadDate)}`);
    } else {
      toast.success("Đã gỡ ngày go-live");
    }

    setShowGoLiveEdit(false);
    await reloadProject();
  }

  async function setGoLiveToday() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    setGoLiveDateInput(`${yyyy}-${mm}-${dd}`);
    setShowGoLiveEdit(true);
  }

  async function submitSiteRest() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");

    const res = await fetch(`/api/projects/${data.id}/site-rest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restDate: `${yyyy}-${mm}-${dd}`,
        reason: siteRestForm.reason,
        note: siteRestForm.note || null,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể đánh dấu nghỉ");
      return;
    }

    toast.success("Đã đánh dấu công trường nghỉ hôm nay");
    setShowSiteRestModal(false);
    setSiteRestForm({ reason: "SUNDAY", note: "" });
    await reloadProject();
  }

  async function removeSiteRest() {
    if (!todayRest) return;
    const ok = window.confirm("Xác nhận hủy đánh dấu công trường nghỉ hôm nay?");
    if (!ok) return;

    const res = await fetch(`/api/projects/${data.id}/site-rest/${todayRest.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Không thể hủy đánh dấu nghỉ");
      return;
    }

    toast.success("Đã hủy đánh dấu công trường nghỉ");
    await reloadProject();
  }

  async function loadComments() {
    if (!canViewCommentInbox) return;
    const res = await fetch(`/api/projects/${data.id}/customer-comments`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(json.comments)) {
      setCommentItems(json.comments);
    }
  }

  async function markCommentRead(commentId: string) {
    const res = await fetch(`/api/customer-comments/${commentId}/mark-read`, { method: "PATCH" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể đánh dấu đã đọc");
      return;
    }
    setCommentItems((prev) => prev.map((c) => (c.id === commentId ? { ...c, readByStaff: true } : c)));
  }

  async function replyComment(commentId: string) {
    const content = (replyDrafts[commentId] || "").trim();
    if (!content) return;

    const res = await fetch(`/api/customer-comments/${commentId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể phản hồi");
      return;
    }

    setReplyDrafts((prev) => ({ ...prev, [commentId]: "" }));
    await loadComments();
  }

  async function toggleCustomerPortalEnabled(enabled: boolean) {
    const res = await fetch(`/api/projects/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "customer_portal", payload: { customerPortalEnabled: enabled } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể cập nhật cổng chủ nhà");
      return;
    }

    toast.success("Đã cập nhật trạng thái cổng chủ nhà");
    await reloadProject();
  }

  async function savePortalPassword() {
    const res = await fetch(`/api/projects/${data.id}/customer-portal/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: portalPassword }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.message || "Không thể đổi mật khẩu");
      return;
    }

    toast.success("Đã đổi mật khẩu cổng chủ nhà");
    setPortalPassword("");
  }

  async function resetPortalLink() {
    const ok = window.confirm("Reset sẽ vô hiệu link cũ + sinh link mới. Tiếp tục?");
    if (!ok) return;

    const res = await fetch(`/api/projects/${data.id}/customer-portal/reset`, { method: "POST" });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Không thể reset link");
      return;
    }

    toast.success("Đã reset link chủ nhà");
    await reloadProject();
  }

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.id, canViewCommentInbox]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Thông tin chủ nhà</h2>
          {isAdmin ? (
            <Button variant="outline" onClick={() => setShowOwnerEdit(true)}>
              Sửa thông tin
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 text-sm">
          <div>Tên: {data.customerName}</div>
          <div>SĐT: {data.customerPhone}</div>
          <div>CCCD: {data.customerIdNumber || "-"}</div>
          <div>Địa chỉ: {data.address}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Cổng chủ nhà</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div>
            Link: {data.customerPortalToken ? (
              <a className="text-orange-300 underline" href={`/cn/${data.customerPortalToken}`} target="_blank" rel="noreferrer">
                /cn/{data.customerPortalToken}
              </a>
            ) : "-"}
          </div>
          <div className="flex items-center gap-2">
            <span>Trạng thái:</span>
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs ${data.customerPortalEnabled ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}
              onClick={() => toggleCustomerPortalEnabled(!data.customerPortalEnabled)}
              disabled={!canManageCustomerPortal}
            >
              {data.customerPortalEnabled ? "Đang bật" : "Đang tắt"}
            </button>
          </div>
          {canManageCustomerPortal ? (
            <>
              <div className="flex gap-2">
                <input
                  value={portalPassword}
                  onChange={(e) => setPortalPassword(e.target.value)}
                  placeholder="Đặt mật khẩu mới (4 số hoặc text)"
                  className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                />
                <Button variant="outline" onClick={savePortalPassword}>Đổi pass</Button>
              </div>
              <Button variant="outline" onClick={resetPortalLink}>Reset link mới</Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Thông tin dự án</h2>
          {isAdmin ? (
            <Button variant="outline" onClick={() => setShowProjectEdit(true)}>
              Sửa thông tin
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div>Tên dự án: {data.name}</div>
          <div>Diện tích: {data.areaM2} m²</div>
          {canViewFinancial ? <div>Đơn giá: {formatMoney(data.unitPrice ?? 0)}</div> : null}
          {canViewFinancial ? <div>Giá trị HĐ: {formatMoney(data.contractValue ?? 0)}</div> : null}
          <div>Khởi công: {formatDate(data.startDate)}</div>
          <div>Bàn giao dự kiến: {formatDate(data.expectedEndDate)}</div>
          <div>Bàn giao thực tế: {formatDate(data.actualEndDate)}</div>
          <div>Trạng thái: {data.status}</div>
          <div className="md:col-span-2">Ghi chú: {data.notes || "-"}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Phân công</h2>
          {isAdmin ? (
            <Button variant="outline" onClick={() => setShowAssignmentEdit(true)}>
              Sửa thông tin
            </Button>
          ) : null}
        </div>
        <div className="grid gap-2 text-sm">
          <div>
            GĐ quản lý: {data.projectManager.fullName} ({data.projectManager.email})
          </div>
          <div>
            KS chính: {data.mainEngineer.fullName} ({data.mainEngineer.email})
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Cấu hình hệ thống báo cáo</h2>
          {isAdmin ? (
            <div className="flex items-center gap-2">
              {!data.goLiveDate ? (
                <Button variant="outline" onClick={setGoLiveToday}>
                  Set Go-live hôm nay
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => setShowGoLiveEdit(true)}>
                Chỉnh sửa
              </Button>
            </div>
          ) : null}
        </div>
        <div className="space-y-2 text-sm">
          <div>
            Go-live: <span className="font-medium">{formatDate(data.goLiveDate)}</span>
          </div>
          {!data.goLiveDate ? (
            <div className="inline-flex rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
              Chưa go-live, báo cáo chưa kích hoạt
            </div>
          ) : (
            <div className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">
              Đang áp dụng từ {formatDate(data.goLiveDate)}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Trạng thái công trường hôm nay</h2>
          {canManageSiteStatus ? (
            todayRest ? (
              <Button variant="outline" onClick={removeSiteRest}>
                Hủy đánh dấu nghỉ
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setShowSiteRestModal(true)}>
                Đánh dấu công trường nghỉ hôm nay
              </Button>
            )
          ) : null}
        </div>
        <div className="text-sm">
          {todayRest ? (
            <div className="space-y-1">
              <div className="inline-flex rounded-full bg-blue-500/15 px-3 py-1 text-xs font-medium text-blue-300">
                Nghỉ - {reasonLabel(todayRest.reason)}
              </div>
              {todayRest.note ? <div>Ghi chú: {todayRest.note}</div> : null}
              <div className="text-xs text-[#8892b0]">Khai báo bởi {todayRest.declaredByUser.fullName}</div>
            </div>
          ) : (
            <div className="inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">Đang hoạt động</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
        <h2 className="mb-3 font-semibold">Ghi chú dự án</h2>
        <div className="text-sm text-[#d9def3]">{data.notes || "Chưa có ghi chú"}</div>
      </div>

      {canViewCommentInbox ? (
        <div className="rounded-2xl border border-[#252840] bg-[#1a1d2e] p-4">
          <h2 className="mb-3 font-semibold">Inbox Cổng chủ nhà</h2>
          <div className="space-y-3">
            {commentItems.length === 0 ? <div className="text-sm text-[#8892b0]">Chưa có bình luận nào</div> : null}
            {commentItems.map((comment) => (
              <div key={comment.id} className="rounded-xl border border-[#2d3249] bg-[#13151f] p-3">
                <div className="mb-1 flex items-center justify-between text-xs text-[#8892b0]">
                  <span>
                    {comment.task ? `${comment.task.code} · ${comment.task.name}` : comment.eveningReport ? `Nhật ký ${new Date(comment.eveningReport.reportDate).toLocaleDateString("vi-VN")}` : "Bình luận"}
                  </span>
                  <span>{new Date(comment.createdAt).toLocaleString("vi-VN")}</span>
                </div>
                <div className="text-sm">{comment.content}</div>

                <div className="mt-2 space-y-1">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="rounded border border-[#39405f] bg-[#1c2233] p-2 text-xs">
                      <span className="font-semibold">{reply.author.fullName}: </span>
                      {reply.content}
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex gap-2">
                  <input
                    value={replyDrafts[comment.id] || ""}
                    onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [comment.id]: e.target.value }))}
                    className="w-full rounded-lg border border-[#2d3249] bg-[#1a1d2e] px-3 py-2 text-xs"
                    placeholder="Phản hồi cho chủ nhà..."
                  />
                  <Button variant="outline" onClick={() => replyComment(comment.id)}>Gửi</Button>
                </div>

                {!comment.readByStaff ? (
                  <Button variant="outline" className="mt-2" onClick={() => markCommentRead(comment.id)}>
                    Đánh dấu đã đọc
                  </Button>
                ) : (
                  <div className="mt-2 text-xs text-emerald-300">Đã đọc</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {showOwnerEdit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-xl rounded-2xl bg-[#1a1d2e] p-4">
            <h3 className="mb-3 font-semibold">Sửa thông tin chủ nhà</h3>
            <div className="space-y-3">
              <input
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={ownerForm.customerName}
                onChange={(e) => setOwnerForm((p) => ({ ...p, customerName: e.target.value }))}
              />
              <input
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={ownerForm.customerPhone}
                onChange={(e) => setOwnerForm((p) => ({ ...p, customerPhone: e.target.value }))}
              />
              <input
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={ownerForm.customerIdNumber}
                placeholder="CCCD/CMND"
                onChange={(e) => setOwnerForm((p) => ({ ...p, customerIdNumber: e.target.value }))}
              />
              <textarea
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                rows={2}
                value={ownerForm.address}
                onChange={(e) => setOwnerForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowOwnerEdit(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitOwner}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectEdit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-2xl rounded-2xl bg-[#1a1d2e] p-4">
            <h3 className="mb-3 font-semibold">Sửa thông tin dự án</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={projectForm.name}
                onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))}
              />
              <input
                type="number"
                className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={projectForm.areaM2}
                onChange={(e) => setProjectForm((p) => ({ ...p, areaM2: e.target.value }))}
              />
              <input
                type="number"
                className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={projectForm.unitPrice}
                onChange={(e) => setProjectForm((p) => ({ ...p, unitPrice: e.target.value }))}
              />
              <input
                type="date"
                className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={projectForm.startDate}
                onChange={(e) => setProjectForm((p) => ({ ...p, startDate: e.target.value }))}
              />
              <input
                type="date"
                className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={projectForm.actualEndDate}
                onChange={(e) => setProjectForm((p) => ({ ...p, actualEndDate: e.target.value }))}
              />
              <select
                className="rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={projectForm.status}
                onChange={(e) => setProjectForm((p) => ({ ...p, status: e.target.value as ProjectData['status'] }))}
              >
                <option value="planning">planning</option>
                <option value="in_progress">in_progress</option>
                <option value="completed">completed</option>
                <option value="paused">paused</option>
              </select>
              <textarea
                className="md:col-span-2 rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                rows={2}
                value={projectForm.notes}
                onChange={(e) => setProjectForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProjectEdit(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitProject}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignmentEdit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-xl rounded-2xl bg-[#1a1d2e] p-4">
            <h3 className="mb-3 font-semibold">Sửa phân công</h3>
            <div className="space-y-3">
              <select
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={assignmentForm.projectManagerId}
                onChange={(e) => setAssignmentForm((p) => ({ ...p, projectManagerId: e.target.value }))}
              >
                {admins.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>

              <select
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={assignmentForm.mainEngineerId}
                onChange={(e) => setAssignmentForm((p) => ({ ...p, mainEngineerId: e.target.value }))}
              >
                {engineers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAssignmentEdit(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitAssignment}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showGoLiveEdit ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-md rounded-2xl bg-[#1a1d2e] p-4">
            <h3 className="mb-3 font-semibold">Cập nhật ngày go-live</h3>
            <input
              type="date"
              className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
              value={goLiveDateInput}
              onChange={(e) => setGoLiveDateInput(e.target.value)}
            />
            <p className="mt-2 text-xs text-[#8892b0]">Để trống nếu muốn gỡ go-live.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowGoLiveEdit(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitGoLive}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showSiteRestModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
          <div className="w-full max-w-md rounded-2xl bg-[#1a1d2e] p-4">
            <h3 className="mb-3 font-semibold">Đánh dấu công trường nghỉ hôm nay</h3>
            <div className="space-y-3">
              <select
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                value={siteRestForm.reason}
                onChange={(e) => setSiteRestForm((prev) => ({ ...prev, reason: e.target.value as SiteRestData["reason"] }))}
              >
                <option value="SUNDAY">Nghỉ Chủ nhật</option>
                <option value="HOLIDAY">Nghỉ lễ</option>
                <option value="STORM">Mưa bão</option>
                <option value="OTHER">Khác</option>
              </select>
              <textarea
                className="w-full rounded-xl border border-[#2d3249] bg-[#13151f] px-3 py-2 text-sm"
                rows={3}
                placeholder="Ghi chú (không bắt buộc)"
                value={siteRestForm.note}
                onChange={(e) => setSiteRestForm((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSiteRestModal(false)}>
                Hủy
              </Button>
              <Button className="bg-[#f97316] text-black hover:bg-[#fb923c]" onClick={submitSiteRest}>
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
