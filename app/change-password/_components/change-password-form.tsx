"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const passwordRule = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const schema = z
  .object({
    newPassword: z
      .string()
      .regex(passwordRule, "Mật khẩu phải >=8 ký tự, có chữ hoa, số và ký tự đặc biệt"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

type ChangePasswordFormProps = {
  email: string;
};

export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);

    const res = await fetch("/api/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const data = (await res.json().catch(() => ({}))) as { message?: string };

    if (!res.ok) {
      setSubmitting(false);
      toast.error("Đổi mật khẩu thất bại", {
        description: data.message || "Không thể cập nhật mật khẩu.",
      });
      return;
    }

    const loginResult = await signIn("credentials", {
      email,
      password: values.newPassword,
      redirect: false,
      callbackUrl: "/",
    });

    setSubmitting(false);

    if (!loginResult || loginResult.error) {
      toast.info("Mật khẩu đã đổi. Anh vui lòng đăng nhập lại.");
      router.push("/login");
      return;
    }

    toast.success("Đổi mật khẩu thành công");
    router.push(loginResult.url || "/");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-1">
        <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700">
          Mật khẩu mới
        </label>
        <input
          id="newPassword"
          type="password"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-[#1F4E79] focus:ring-2"
          {...form.register("newPassword")}
        />
        {form.formState.errors.newPassword ? (
          <p className="text-xs text-red-600">{form.formState.errors.newPassword.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
          Xác nhận mật khẩu mới
        </label>
        <input
          id="confirmPassword"
          type="password"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-[#1F4E79] focus:ring-2"
          {...form.register("confirmPassword")}
        />
        {form.formState.errors.confirmPassword ? (
          <p className="text-xs text-red-600">{form.formState.errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-[#1F4E79] hover:bg-[#163a5b] disabled:cursor-not-allowed"
      >
        {submitting ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
      </Button>
    </form>
  );
}
