"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("admin@congty.vn");
  const [password, setPassword] = useState("ChangeMe@2026");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const params = useSearchParams();
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const callbackUrl = params.get("callbackUrl") || "/";

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    setLoading(false);

    if (!res || res.error) {
      setError("Email hoặc mật khẩu không đúng");
      return;
    }

    router.push(res.url || callbackUrl);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <form onSubmit={onSubmit} className="w-full rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold text-[#1F4E79]">Đăng nhập ERP Huỳnh Gia</h1>

        <label className="mb-1 block text-sm">Email</label>
        <input
          className="mb-3 w-full rounded-md border px-3 py-2 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className="mb-1 block text-sm">Mật khẩu</label>
        <input
          type="password"
          className="mb-4 w-full rounded-md border px-3 py-2 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <div className="mb-3 text-sm text-red-600">{error}</div> : null}

        <Button type="submit" disabled={loading} className="w-full bg-[#1F4E79] hover:bg-[#163a5b]">
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>
      </form>
    </div>
  );
}
