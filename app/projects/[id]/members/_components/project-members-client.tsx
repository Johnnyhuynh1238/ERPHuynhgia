"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type MemberRow = {
  id: string;
  userId: string;
  roleInProject: "engineer" | "foreman" | "accountant" | "construction_manager";
  addedAt: string;
  user: {
    fullName: string;
    email: string;
  };
  addedByUser: {
    fullName: string;
    email: string;
  };
};

type OptionUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

function formatDate(dateIso: string) {
  const d = new Date(dateIso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function ProjectMembersClient({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [allUsers, setAllUsers] = useState<OptionUser[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"engineer" | "foreman" | "accountant" | "construction_manager">("engineer");

  async function loadData() {
    setLoading(true);
    const [membersRes, optionsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/members`, { cache: "no-store" }),
      fetch("/api/admin/users/options", { cache: "no-store" }),
    ]);

    setLoading(false);

    if (!membersRes.ok) {
      const json = await membersRes.json().catch(() => ({}));
      toast.error(json.message || "Không tải được member");
      return;
    }

    const membersJson = await membersRes.json();
    setMembers(membersJson.members || []);

    if (optionsRes.ok) {
      const optionsJson = await optionsRes.json();
      setAllUsers(optionsJson.members || []);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addMember() {
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: newUserId,
        roleInProject: newRole,
      }),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(json.message || "Thêm member thất bại");
      return;
    }

    toast.success(json.message || "Đã thêm member");
    setShowAdd(false);
    setNewUserId("");
    setNewRole("engineer");
    await loadData();
  }

  async function removeMember(member: MemberRow) {
    const confirmDelete = window.confirm(`Xóa member ${member.user.email} khỏi dự án?`);
    if (!confirmDelete) return;

    let res = await fetch(`/api/projects/${projectId}/members/${member.id}`, {
      method: "DELETE",
    });

    let json = await res.json().catch(() => ({}));

    if (res.status === 409 && json.requiresConfirm) {
      const confirmAssigned = window.confirm(json.message || "User đang phụ trách task, bạn có chắc chắn xóa?");
      if (!confirmAssigned) return;

      res = await fetch(`/api/projects/${projectId}/members/${member.id}?confirm=1`, {
        method: "DELETE",
      });
      json = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      toast.error(json.message || "Xóa member thất bại");
      return;
    }

    toast.success(json.message || "Đã xóa member");
    await loadData();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-orange-300">Thành viên dự án</h2>
        <Button onClick={() => setShowAdd(true)} className="bg-orange-500 hover:bg-orange-600">
          Thêm thành viên
        </Button>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-slate-600">
              <th className="py-2">Tên</th>
              <th className="py-2">Email</th>
              <th className="py-2">Role dự án</th>
              <th className="py-2">Ngày thêm</th>
              <th className="py-2">Ai thêm</th>
              <th className="py-2">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  Đang tải...
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  Chưa có member nào.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="border-b last:border-b-0">
                  <td className="py-2">{member.user.fullName}</td>
                  <td className="py-2">{member.user.email}</td>
                  <td className="py-2">{member.roleInProject}</td>
                  <td className="py-2">{formatDate(member.addedAt)}</td>
                  <td className="py-2">{member.addedByUser.fullName}</td>
                  <td className="py-2">
                    <Button variant="outline" onClick={() => removeMember(member)}>
                      Xóa
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAdd ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-4">
            <h3 className="mb-3 font-semibold">Thêm thành viên</h3>
            <div className="space-y-3">
              <select className="w-full rounded border px-3 py-2 text-sm" value={newUserId} onChange={(e) => setNewUserId(e.target.value)}>
                <option value="">Chọn user</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.email})
                  </option>
                ))}
              </select>

              <select className="w-full rounded border px-3 py-2 text-sm" value={newRole} onChange={(e) => setNewRole(e.target.value as any)}>
                <option value="engineer">engineer</option>
                <option value="foreman">foreman</option>
                <option value="accountant">accountant</option>
                <option value="construction_manager">construction_manager</option>
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAdd(false)}>
                Hủy
              </Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={addMember}>
                Thêm
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
