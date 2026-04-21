"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type UserItem = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: "admin" | "engineer" | "foreman" | "accountant" | "construction_manager";
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

type UsersResponse = {
  users: UserItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const roleLabel: Record<UserItem["role"], string> = {
  admin: "Admin",
  engineer: "KS",
  foreman: "Đội trưởng",
  accountant: "Kế toán",
  construction_manager: "Trưởng phòng thi công",
};

const roleBadgeClass: Record<UserItem["role"], string> = {
  admin: "bg-rose-100 text-rose-700",
  engineer: "bg-blue-100 text-blue-700",
  foreman: "bg-amber-100 text-amber-700",
  accountant: "bg-emerald-100 text-emerald-700",
  construction_manager: "bg-purple-100 text-purple-700",
};

function formatDate(dateIso: string) {
  const date = new Date(dateIso);
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function generateStrongPassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => {
    toast.success("Đã copy");
  });
}

export function AdminUsersClient({ currentUserId }: { currentUserId: string }) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  const [latestTempPassword, setLatestTempPassword] = useState<{ email: string; password: string } | null>(null);

  const [addForm, setAddForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "engineer",
    tempPassword: generateStrongPassword(),
  });

  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    role: "engineer",
    isActive: true,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [role, status]);

  async function loadUsers() {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      search,
      role,
      status,
    });

    const res = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as UsersResponse & { message?: string };

    setLoading(false);

    if (!res.ok) {
      toast.error("Không tải được danh sách user", {
        description: data.message || "Vui lòng thử lại.",
      });
      return;
    }

    setUsers(data.users || []);
    setTotalPages(data.totalPages || 1);
    setTotal(data.total || 0);
  }

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, role, status]);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  const paginationLabel = useMemo(() => {
    if (!total) return "Không có dữ liệu";
    const from = (page - 1) * 10 + 1;
    const to = Math.min(page * 10, total);
    return `Hiển thị ${from}-${to} / ${total} user`;
  }, [page, total]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });

    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      user?: UserItem;
      tempPassword?: string;
    };

    setCreating(false);

    if (!res.ok) {
      toast.error("Tạo user thất bại", { description: data.message || "Vui lòng kiểm tra dữ liệu." });
      return;
    }

    setShowAddModal(false);
    setAddForm({
      fullName: "",
      email: "",
      phone: "",
      role: "engineer",
      tempPassword: generateStrongPassword(),
    });

    const password = data.tempPassword || addForm.tempPassword;
    setLatestTempPassword({
      email: data.user?.email || addForm.email,
      password,
    });

    toast.success(`Đã tạo user ${data.user?.email || addForm.email}. Password tạm: ${password}`);
    await loadUsers();
  }

  async function handleUpdateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;

    setUpdating(true);
    const res = await fetch(`/api/admin/users/${selectedUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string };
    setUpdating(false);

    if (!res.ok) {
      toast.error("Cập nhật thất bại", { description: data.message || "Vui lòng thử lại." });
      return;
    }

    toast.success("Đã cập nhật user");
    setShowEditModal(false);
    setSelectedUser(null);
    await loadUsers();
  }

  async function handleToggleActive(user: UserItem) {
    const actionText = user.isActive ? "vô hiệu hóa" : "kích hoạt lại";
    if (!window.confirm(`Xác nhận ${actionText} user ${user.email}?`)) return;

    const res = await fetch(`/api/admin/users/${user.id}/toggle-active`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string };

    if (!res.ok) {
      toast.error("Thao tác thất bại", { description: data.message || "Vui lòng thử lại." });
      return;
    }

    toast.success(data.message || "Đã cập nhật trạng thái");
    await loadUsers();
  }

  async function handleResetPassword(user: UserItem) {
    if (!window.confirm(`Xác nhận reset password cho ${user.email}?`)) return;

    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; tempPassword?: string };

    if (!res.ok) {
      toast.error("Reset password thất bại", { description: data.message || "Vui lòng thử lại." });
      return;
    }

    setLatestTempPassword({ email: user.email, password: data.tempPassword || "" });
    toast.success(`Đã reset. Password tạm: ${data.tempPassword || "(không có)"}`);
    await loadUsers();
  }

  function openEditModal(user: UserItem) {
    setSelectedUser(user);
    setEditForm({
      fullName: user.fullName,
      phone: user.phone || "",
      role: user.role,
      isActive: user.isActive,
    });
    setShowEditModal(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-[#1F4E79]">Quản lý user</h1>
        <Button type="button" className="bg-[#1F4E79] hover:bg-[#163a5b]" onClick={() => setShowAddModal(true)}>
          Thêm user
        </Button>
      </div>

      {latestTempPassword ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="font-medium">Password tạm mới tạo/reset</div>
          <div>Email: {latestTempPassword.email}</div>
          <div className="flex items-center gap-2">
            <span>Password: {latestTempPassword.password}</span>
            <Button type="button" variant="outline" className="h-7 px-2" onClick={() => copyText(latestTempPassword.password)}>
              Copy
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-white p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-4">
          <input
            placeholder="Tìm theo tên hoặc email"
            className="rounded-md border px-3 py-2 text-sm"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />

          <select className="rounded-md border px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">Tất cả role</option>
            <option value="admin">Admin</option>
            <option value="engineer">KS</option>
            <option value="foreman">Đội trưởng</option>
            <option value="accountant">Kế toán</option>
            <option value="construction_manager">Trưởng phòng thi công</option>
          </select>

          <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã vô hiệu</option>
          </select>

          <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">Sắp xếp: mới nhất trước</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-600">
                <th className="px-3 py-2">Họ tên</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">SĐT</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Ngày tạo</th>
                <th className="px-3 py-2">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={7}>
                    Không có user phù hợp.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{user.fullName}</td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.phone || "-"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${roleBadgeClass[user.role]}`}>
                        {roleLabel[user.role]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {user.isActive ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                          Đang hoạt động
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-700">
                          Đã vô hiệu
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatDate(user.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" className="h-8" onClick={() => openEditModal(user)}>
                          Sửa
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8"
                          onClick={() => handleResetPassword(user)}
                        >
                          Reset password
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8"
                          onClick={() => handleToggleActive(user)}
                          disabled={user.id === currentUserId}
                        >
                          {user.isActive ? "Vô hiệu hóa" : "Kích hoạt lại"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <div className="text-slate-600">{paginationLabel}</div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setPage((p) => p - 1)} disabled={!canPrev}>
              Trang trước
            </Button>
            <span>
              Trang {page}/{totalPages}
            </span>
            <Button type="button" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={!canNext}>
              Trang sau
            </Button>
          </div>
        </div>
      </div>

      {showAddModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <h2 className="mb-4 text-lg font-semibold">Thêm user</h2>
            <form className="space-y-3" onSubmit={handleCreateUser}>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Họ tên"
                value={addForm.fullName}
                onChange={(e) => setAddForm((prev) => ({ ...prev, fullName: e.target.value }))}
                required
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Email"
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                required
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Số điện thoại (tùy chọn)"
                value={addForm.phone}
                onChange={(e) => setAddForm((prev) => ({ ...prev, phone: e.target.value }))}
              />

              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={addForm.role}
                onChange={(e) => setAddForm((prev) => ({ ...prev, role: e.target.value }))}
              >
                <option value="admin">Admin</option>
                <option value="engineer">KS</option>
                <option value="foreman">Đội trưởng</option>
                <option value="accountant">Kế toán</option>
                <option value="construction_manager">Trưởng phòng thi công</option>
              </select>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Password tạm</label>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={addForm.tempPassword}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, tempPassword: e.target.value }))}
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddForm((prev) => ({ ...prev, tempPassword: generateStrongPassword() }))}
                  >
                    Generate
                  </Button>
                </div>
              </div>

              <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-600">
                <label className="flex items-center gap-2">
                  <input type="checkbox" disabled />
                  Gửi email thông báo (Tính năng email sẽ làm sau)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Hủy
                </Button>
                <Button type="submit" className="bg-[#1F4E79] hover:bg-[#163a5b]" disabled={creating}>
                  {creating ? "Đang tạo..." : "Tạo user"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showEditModal && selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <h2 className="mb-1 text-lg font-semibold">Sửa user</h2>
            <p className="mb-4 text-sm text-slate-500">Email: {selectedUser.email} (không cho sửa)</p>

            <form className="space-y-3" onSubmit={handleUpdateUser}>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Họ tên"
                value={editForm.fullName}
                onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                required
              />
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Số điện thoại"
                value={editForm.phone}
                onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
              />

              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={editForm.role}
                onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                disabled={selectedUser.id === currentUserId}
              >
                <option value="admin">Admin</option>
                <option value="engineer">KS</option>
                <option value="foreman">Đội trưởng</option>
                <option value="accountant">Kế toán</option>
                <option value="construction_manager">Trưởng phòng thi công</option>
              </select>

              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={editForm.isActive ? "active" : "inactive"}
                onChange={(e) => setEditForm((prev) => ({ ...prev, isActive: e.target.value === "active" }))}
                disabled={selectedUser.id === currentUserId}
              >
                <option value="active">Đang hoạt động</option>
                <option value="inactive">Đã vô hiệu</option>
              </select>

              <div className="flex justify-between gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => handleResetPassword(selectedUser)}>
                  Reset password
                </Button>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                    Hủy
                  </Button>
                  <Button type="submit" className="bg-[#1F4E79] hover:bg-[#163a5b]" disabled={updating}>
                    {updating ? "Đang lưu..." : "Lưu thay đổi"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
