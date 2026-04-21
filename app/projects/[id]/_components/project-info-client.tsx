"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ProjectData = {
  id: string;
  code: string;
  name: string;
  customerName: string;
  customerPhone: string;
  address: string;
  areaM2: number;
  unitPrice: number | null;
  contractValue: number | null;
  startDate: string;
  expectedEndDate: string;
  actualEndDate: string | null;
  status: "planning" | "in_progress" | "completed" | "paused";
  notes: string | null;
  projectManager: { id: string; fullName: string; email: string };
  mainEngineer: { id: string; fullName: string; email: string };
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

export function ProjectInfoClient({
  project,
  isAdmin,
  canViewFinancial,
  admins,
  engineers,
}: {
  project: ProjectData;
  isAdmin: boolean;
  canViewFinancial: boolean;
  admins: OptionUser[];
  engineers: OptionUser[];
}) {
  const [data, setData] = useState(project);

  const [showOwnerEdit, setShowOwnerEdit] = useState(false);
  const [showProjectEdit, setShowProjectEdit] = useState(false);
  const [showAssignmentEdit, setShowAssignmentEdit] = useState(false);

  const [ownerForm, setOwnerForm] = useState({
    customerName: project.customerName,
    customerPhone: project.customerPhone,
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

  async function reloadProject() {
    const res = await fetch(`/api/projects/${data.id}`, { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json.project) {
      setData(json.project);
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-4">
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
          <div>Địa chỉ: {data.address}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4">
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

      <div className="rounded-xl border bg-white p-4">
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

      <div className="rounded-xl border bg-white p-4">
        <h2 className="mb-3 font-semibold">Ghi chú dự án</h2>
        <div className="text-sm text-slate-700">{data.notes || "Chưa có ghi chú"}</div>
      </div>

      {showOwnerEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <h3 className="mb-3 font-semibold">Sửa thông tin chủ nhà</h3>
            <div className="space-y-3">
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={ownerForm.customerName}
                onChange={(e) => setOwnerForm((p) => ({ ...p, customerName: e.target.value }))}
              />
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={ownerForm.customerPhone}
                onChange={(e) => setOwnerForm((p) => ({ ...p, customerPhone: e.target.value }))}
              />
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                rows={2}
                value={ownerForm.address}
                onChange={(e) => setOwnerForm((p) => ({ ...p, address: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowOwnerEdit(false)}>
                Hủy
              </Button>
              <Button className="bg-[#1F4E79] hover:bg-[#163a5b]" onClick={submitOwner}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showProjectEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-4">
            <h3 className="mb-3 font-semibold">Sửa thông tin dự án</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <input
                className="rounded border px-3 py-2 text-sm"
                value={projectForm.name}
                onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))}
              />
              <input
                type="number"
                className="rounded border px-3 py-2 text-sm"
                value={projectForm.areaM2}
                onChange={(e) => setProjectForm((p) => ({ ...p, areaM2: e.target.value }))}
              />
              <input
                type="number"
                className="rounded border px-3 py-2 text-sm"
                value={projectForm.unitPrice}
                onChange={(e) => setProjectForm((p) => ({ ...p, unitPrice: e.target.value }))}
              />
              <input
                type="date"
                className="rounded border px-3 py-2 text-sm"
                value={projectForm.startDate}
                onChange={(e) => setProjectForm((p) => ({ ...p, startDate: e.target.value }))}
              />
              <input
                type="date"
                className="rounded border px-3 py-2 text-sm"
                value={projectForm.actualEndDate}
                onChange={(e) => setProjectForm((p) => ({ ...p, actualEndDate: e.target.value }))}
              />
              <select
                className="rounded border px-3 py-2 text-sm"
                value={projectForm.status}
                onChange={(e) => setProjectForm((p) => ({ ...p, status: e.target.value as ProjectData['status'] }))}
              >
                <option value="planning">planning</option>
                <option value="in_progress">in_progress</option>
                <option value="completed">completed</option>
                <option value="paused">paused</option>
              </select>
              <textarea
                className="md:col-span-2 rounded border px-3 py-2 text-sm"
                rows={2}
                value={projectForm.notes}
                onChange={(e) => setProjectForm((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProjectEdit(false)}>
                Hủy
              </Button>
              <Button className="bg-[#1F4E79] hover:bg-[#163a5b]" onClick={submitProject}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignmentEdit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4">
            <h3 className="mb-3 font-semibold">Sửa phân công</h3>
            <div className="space-y-3">
              <select
                className="w-full rounded border px-3 py-2 text-sm"
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
                className="w-full rounded border px-3 py-2 text-sm"
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
              <Button className="bg-[#1F4E79] hover:bg-[#163a5b]" onClick={submitAssignment}>
                Lưu
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
