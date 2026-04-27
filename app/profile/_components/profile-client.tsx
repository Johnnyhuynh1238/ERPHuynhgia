"use client";

import Image from "next/image";
import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";

type ProfileData = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  avatarUrl: string | null;
  createdAt: string;
};

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự"),
  phone: z.string().trim().min(8, "Số điện thoại không hợp lệ").max(20, "Số điện thoại không hợp lệ"),
  avatar: z.any().optional(),
});

const passwordRule = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu cũ"),
    newPassword: z.string().regex(passwordRule, "Mật khẩu mới phải đủ mạnh"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Xác nhận mật khẩu không khớp",
  });

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

function formatDate(dateIso: string) {
  const date = new Date(dateIso);
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function ProfileClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: "", phone: "" },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/profile", { cache: "no-store" });
      const data = (await res.json()) as { user?: ProfileData; message?: string };

      if (!res.ok || !data.user) {
        toast.error("Không tải được hồ sơ", { description: data.message || "Vui lòng thử lại" });
        setLoading(false);
        return;
      }

      setProfile(data.user);
      profileForm.reset({
        fullName: data.user.fullName,
        phone: data.user.phone || "",
      });
      setLoading(false);
    }

    load();
  }, [profileForm]);

  const avatarPreview = useMemo(() => {
    if (!profile?.avatarUrl) return null;
    return profile.avatarUrl;
  }, [profile]);

  async function onSaveProfile(values: ProfileFormValues) {
    setSaving(true);

    const formData = new FormData();
    formData.append("fullName", values.fullName);
    formData.append("phone", values.phone);

    const avatarFile = (values.avatar as FileList | undefined)?.[0];
    if (avatarFile) {
      formData.append("avatar", avatarFile);
    }

    const res = await fetch("/api/profile", {
      method: "PATCH",
      body: formData,
    });

    setSaving(false);

    const data = (await res.json()) as { user?: ProfileData; message?: string };

    if (!res.ok || !data.user) {
      toast.error("Lưu hồ sơ thất bại", {
        description: data.message || "Vui lòng kiểm tra lại dữ liệu.",
      });
      return;
    }

    setProfile(data.user);
    profileForm.reset({
      fullName: data.user.fullName,
      phone: data.user.phone || "",
    });
    toast.success("Cập nhật hồ sơ thành công");
  }

  async function onChangePassword(values: PasswordFormValues) {
    setChangingPassword(true);

    const res = await fetch("/api/profile/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    setChangingPassword(false);

    const data = (await res.json()) as { message?: string };

    if (!res.ok) {
      toast.error("Đổi mật khẩu thất bại", {
        description: data.message || "Vui lòng thử lại.",
      });
      return;
    }

    toast.success("Đổi mật khẩu thành công, vui lòng đăng nhập lại");
    await signOut({ callbackUrl: "/login" });
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
        <div className="h-48 animate-pulse rounded-xl bg-slate-200" />
      </div>
    );
  }

  if (!profile) {
    return <div className="rounded-lg border bg-white p-4 text-sm text-red-600">Không tải được hồ sơ.</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-orange-300">Hồ sơ cá nhân</h1>

      <div className="rounded-xl border bg-white p-5">
        <h2 className="mb-4 text-base font-semibold">Thông tin tài khoản</h2>

        <div className="mb-4 flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-full border bg-slate-100">
            {avatarPreview ? (
              <Image src={avatarPreview} alt="avatar" width={64} height={64} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">No avatar</div>
            )}
          </div>
          <div className="text-sm text-slate-600">
            <div>Email: {profile.email}</div>
            <div>Vai trò: {profile.role}</div>
            <div>Ngày tạo: {formatDate(profile.createdAt)}</div>
          </div>
        </div>

        <form className="space-y-4" onSubmit={profileForm.handleSubmit(onSaveProfile)}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Họ và tên</label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-orange-400/50 focus:ring-2"
                {...profileForm.register("fullName")}
              />
              {profileForm.formState.errors.fullName ? (
                <p className="mt-1 text-xs text-red-600">{profileForm.formState.errors.fullName.message}</p>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Số điện thoại</label>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-orange-400/50 focus:ring-2"
                {...profileForm.register("phone")}
              />
              {profileForm.formState.errors.phone ? (
                <p className="mt-1 text-xs text-red-600">{profileForm.formState.errors.phone.message}</p>
              ) : null}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Avatar (JPG/PNG/WEBP, tối đa 5MB)</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" {...profileForm.register("avatar")} />
          </div>

          <Button type="submit" disabled={saving} className="bg-orange-500 hover:bg-orange-600">
            {saving ? "Đang lưu..." : "Lưu thông tin"}
          </Button>
        </form>
      </div>

      <div className="rounded-xl border bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Đổi mật khẩu</h2>
          <Button type="button" variant="outline" onClick={() => setShowChangePassword((v) => !v)}>
            {showChangePassword ? "Đóng" : "Mở"}
          </Button>
        </div>

        {showChangePassword ? (
          <form className="space-y-4" onSubmit={passwordForm.handleSubmit(onChangePassword)}>
            <div>
              <label className="mb-1 block text-sm font-medium">Mật khẩu cũ</label>
              <input
                type="password"
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-orange-400/50 focus:ring-2"
                {...passwordForm.register("currentPassword")}
              />
              {passwordForm.formState.errors.currentPassword ? (
                <p className="mt-1 text-xs text-red-600">{passwordForm.formState.errors.currentPassword.message}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Mật khẩu mới</label>
              <input
                type="password"
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-orange-400/50 focus:ring-2"
                {...passwordForm.register("newPassword")}
              />
              {passwordForm.formState.errors.newPassword ? (
                <p className="mt-1 text-xs text-red-600">{passwordForm.formState.errors.newPassword.message}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Xác nhận mật khẩu mới</label>
              <input
                type="password"
                className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-orange-400/50 focus:ring-2"
                {...passwordForm.register("confirmPassword")}
              />
              {passwordForm.formState.errors.confirmPassword ? (
                <p className="mt-1 text-xs text-red-600">{passwordForm.formState.errors.confirmPassword.message}</p>
              ) : null}
            </div>

            <Button type="submit" disabled={changingPassword} className="bg-orange-500 hover:bg-orange-600">
              {changingPassword ? "Đang cập nhật..." : "Đổi mật khẩu"}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-slate-600">Bấm “Mở” để thay đổi mật khẩu.</p>
        )}
      </div>
    </div>
  );
}
