"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";

const loginSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type LoginFormProps = {
  callbackUrl: string;
  hasCredentialError: boolean;
};

export function LoginForm({ callbackUrl, hasCredentialError }: LoginFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitting(true);

    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
      callbackUrl,
    });

    setSubmitting(false);

    if (!result || result.error) {
      toast.error("Đăng nhập thất bại", {
        description: "Email hoặc mật khẩu không đúng.",
      });
      return;
    }

    toast.success("Đăng nhập thành công");
    const target = result.url && result.url.startsWith("/") ? result.url : callbackUrl;
    router.push(target);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      {hasCredentialError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Email hoặc mật khẩu không đúng.
        </div>
      ) : null}

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-orange-400/50 focus:ring-2"
          {...form.register("email")}
        />
        {form.formState.errors.email ? (
          <p className="text-xs text-red-600">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Mật khẩu
        </label>
        <input
          id="password"
          type="password"
          className="w-full rounded-md border px-3 py-2 text-sm outline-none ring-orange-400/50 focus:ring-2"
          {...form.register("password")}
        />
        {form.formState.errors.password ? (
          <p className="text-xs text-red-600">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange-500 hover:bg-orange-600 disabled:cursor-not-allowed"
      >
        {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
    </form>
  );
}
